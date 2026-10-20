//! Multiplex Pi host calls without imposing a run budget. Drain accepted calls
//! before releasing the generation lease, including when cancellation wins.
use futures_util::{stream::FuturesUnordered, StreamExt};
use serde_json::{Map, Value};
use std::future::Future;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};

const FRAME_BYTES: usize = 1024 * 1024;
pub(super) struct Input {
    pub message: Value,
    pub acknowledgement: tokio::sync::oneshot::Sender<Result<(), String>>,
}

async fn send<W: AsyncWrite + Unpin>(writer: &mut W, message: &Value) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(message).map_err(|_| "制作処理への入力を作成できませんでした")?;
    bytes.push(b'\n');
    writer
        .write_all(&bytes)
        .await
        .map_err(|_| "制作処理との接続が終了しました".into())
}

pub(super) async fn run<R, W, C, H, F, P>(
    stdout: R,
    mut stdin: W,
    initial: &Value,
    cancellation: C,
    host: H,
    mut progress: P,
    mut inputs: Option<tokio::sync::mpsc::UnboundedReceiver<Input>>,
) -> Result<Value, String>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
    C: Future<Output = ()>,
    H: Fn(String, Map<String, Value>) -> F,
    F: Future<Output = Result<Value, String>>,
    P: FnMut(Value) -> Result<(), String>,
{
    send(&mut stdin, initial).await?;
    let mut reader = BufReader::new(stdout);
    let mut pending = FuturesUnordered::new();
    let mut acknowledgements = std::collections::HashMap::new();
    let mut line = Vec::new();
    tokio::pin!(cancellation);
    let outcome = async {
        loop {
            let mut bounded = (&mut reader).take((FRAME_BYTES + 1 - line.len()) as u64);
            tokio::select! {
                biased;
                _ = &mut cancellation => return Err("制作を停止しました。保存済みの変更は残っています".into()),
                input = async { match inputs.as_mut() { Some(receiver) => receiver.recv().await, None => std::future::pending().await } } => {
                    if let Some(input) = input {
                        let id = input.message["id"].as_str().ok_or("追加指示のIDが不正です")?.to_owned();
                        if acknowledgements.contains_key(&id) {
                            let _ = input.acknowledgement.send(Err("この追加指示を送信中です".into()));
                            continue;
                        }
                        send(&mut stdin, &serde_json::json!({"type":"input", "id":id, "message":input.message})).await?;
                        acknowledgements.insert(id, input.acknowledgement);
                    } else { inputs = None; }
                }
                Some((id, response)) = pending.next(), if !pending.is_empty() => {
                    let mut response: Value = response?;
                    response["type"] = Value::from("tool_result");
                    response["id"] = id;
                    send(&mut stdin, &response).await?;
                }
                // read_until preserves partially consumed bytes if a completed
                // host call wins select. Keep the buffer across loop iterations.
                count = bounded.read_until(b'\n', &mut line) => {
                    let count = count.map_err(|_| "制作の出力を読み取れませんでした")?;
                    if count == 0 { return Err("応答の受信が途中で終了しました。Sceneと保存状態を確認してから、続きを依頼してください".into()); }
                    if line.len() > FRAME_BYTES { return Err("応答のデータ量が上限を超えました。Sceneを確認し、依頼を分けて続けてください".into()); }
                    if line.last() != Some(&b'\n') { continue; }
                    let message: Value = serde_json::from_slice(&line).map_err(|_| "制作の応答を読み取れませんでした")?;
                    line.clear();
                    match message["type"].as_str() {
                        Some("tool") => {
                            let id = message["id"].as_u64().ok_or("制作の呼び出しIDが不正です")?;
                            let name = message["tool"].as_str().ok_or("実行する操作の名前を読み取れませんでした")?.to_owned();
                            let args = message["arguments"].as_object().ok_or("操作に必要な情報を読み取れませんでした")?.clone();
                            let response = host(name, args);
                            pending.push(async move { (Value::from(id), response.await) });
                        }
                        Some("input_ack") => {
                            if let Some(reply) = message["id"].as_str().and_then(|id| acknowledgements.remove(id)) {
                                let result = if message["ok"] == true { Ok(()) } else { Err(message["message"].as_str().unwrap_or("追加指示を送信できませんでした").to_owned()) };
                                let _ = reply.send(result);
                            }
                        }
                        Some("progress" | "activity" | "assistant" | "usage" | "history" | "input") => progress(message)?,
                        Some("result") if pending.is_empty() => return Ok(message["result"].clone()),
                        Some("result") => return Err("操作の結果を受け取る前に応答が終了しました。Sceneと保存状態を確認してください".into()),
                        Some("error") => return Err(message["message"].as_str().unwrap_or("制作中にエラーが起きました").into()),
                        _ => return Err("応答の形式を読み取れませんでした。アプリを再起動してから、もう一度お試しください".into()),
                    }
                }
            }
        }
    }.await;
    while pending.next().await.is_some() {}
    for (_, reply) in acknowledgements { let _ = reply.send(Err("追加指示の受信を確認する前に応答が終了しました。入力を確認して再送してください".into())); }
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Arc;
    use tokio::io::{duplex, split};
    use tokio::sync::{oneshot, Barrier, Notify};

    async fn read(reader: &mut BufReader<impl AsyncRead + Unpin>) -> Value {
        let mut line = String::new();
        reader.read_line(&mut line).await.unwrap();
        serde_json::from_str(&line).unwrap()
    }

    #[tokio::test]
    async fn independent_calls_overlap_and_partial_frames_survive_completed_calls() {
        let (native, child) = duplex(8192);
        let (stdout, stdin) = split(native);
        let (child_out, mut child_in) = split(child);
        let barrier = Arc::new(Barrier::new(2));
        let initial = json!({"type":"start"});
        let runner = run(
            stdout,
            stdin,
            &initial,
            std::future::pending(),
            move |name, _| {
                let barrier = barrier.clone();
                async move {
                    barrier.wait().await;
                    Ok(json!({"ok":true,"result":{"name":name}}))
                }
            },
            |_| Ok(()),
            None,
        );
        let child = async {
            let mut reader = BufReader::new(child_out);
            assert_eq!(read(&mut reader).await["type"], "start");
            send(
                &mut child_in,
                &json!({"type":"tool","id":1,"tool":"first","arguments":{}}),
            )
            .await
            .unwrap();
            send(
                &mut child_in,
                &json!({"type":"tool","id":2,"tool":"second","arguments":{}}),
            )
            .await
            .unwrap();
            child_in.write_all(b"{\"type\":\"prog").await.unwrap();
            let first = read(&mut reader).await;
            let second = read(&mut reader).await;
            assert_ne!(first["id"], second["id"]);
            assert_eq!(first["type"], "tool_result");
            child_in
                .write_all(b"ress\",\"message\":\"done\"}\n")
                .await
                .unwrap();
            send(
                &mut child_in,
                &json!({"type":"result","result":{"done":true}}),
            )
            .await
            .unwrap();
        };
        let (result, ()) = tokio::time::timeout(std::time::Duration::from_secs(3), async {
            tokio::join!(runner, child)
        })
        .await
        .unwrap();
        assert_eq!(result.unwrap()["done"], true);
    }

    #[tokio::test]
    async fn cancellation_waits_for_an_admitted_write() {
        let (native, child) = duplex(8192);
        let (stdout, stdin) = split(native);
        let (child_out, mut child_in) = split(child);
        let started = Arc::new(Notify::new());
        let gate = Arc::new(Notify::new());
        let (cancel, cancellation) = oneshot::channel();
        let host_started = started.clone();
        let host_gate = gate.clone();
        let running = tokio::spawn(async move {
            run(
                stdout,
                stdin,
                &json!({"type":"start"}),
                async {
                    let _ = cancellation.await;
                },
                move |_, _| {
                    let started = host_started.clone();
                    let gate = host_gate.clone();
                    async move {
                        started.notify_one();
                        gate.notified().await;
                        Ok(json!({"ok":true}))
                    }
                },
                |_| Ok(()),
                None,
            )
            .await
        });
        let mut reader = BufReader::new(child_out);
        read(&mut reader).await;
        send(
            &mut child_in,
            &json!({"type":"tool","id":1,"tool":"write","arguments":{}}),
        )
        .await
        .unwrap();
        started.notified().await;
        cancel.send(()).unwrap();
        tokio::task::yield_now().await;
        assert!(!running.is_finished());
        gate.notify_one();
        assert!(running.await.unwrap().unwrap_err().contains("停止"));
    }

    #[tokio::test]
    async fn live_input_is_acknowledged_while_an_editor_write_is_in_flight() {
        let (native, child) = duplex(8192);
        let (stdout, stdin) = split(native);
        let (child_out, mut child_in) = split(child);
        let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        let started = Arc::new(Notify::new());
        let gate = Arc::new(Notify::new());
        let host_started = started.clone();
        let host_gate = gate.clone();
        let initial = json!({"type":"start"});
        let running = run(stdout, stdin, &initial, std::future::pending(), move |_, _| {
            let started = host_started.clone();
            let gate = host_gate.clone();
            async move { started.notify_one(); gate.notified().await; Ok(json!({"ok":true})) }
        }, |_| Ok(()), Some(receiver));
        let child = async {
            let mut reader = BufReader::new(child_out);
            read(&mut reader).await;
            send(&mut child_in, &json!({"type":"tool","id":1,"tool":"write","arguments":{}})).await.unwrap();
            started.notified().await;
            let (acknowledgement, reply) = oneshot::channel();
            sender.send(Input { message: json!({"id":"live-one","prompt":"入口を広く","delivery":"steer"}), acknowledgement }).unwrap();
            let input = read(&mut reader).await;
            assert_eq!(input["type"], "input");
            assert_eq!(input["message"]["prompt"], "入口を広く");
            send(&mut child_in, &json!({"type":"input_ack","id":"live-one","ok":true})).await.unwrap();
            reply.await.unwrap().unwrap();
            gate.notify_one();
            assert_eq!(read(&mut reader).await["type"], "tool_result");
            send(&mut child_in, &json!({"type":"result","result":{"done":true}})).await.unwrap();
        };
        let (result, ()) = tokio::time::timeout(std::time::Duration::from_secs(3), async { tokio::join!(running, child) }).await.unwrap();
        assert_eq!(result.unwrap()["done"], true);
    }

    #[tokio::test]
    async fn oversized_frames_are_rejected() {
        let frame = vec![b'x'; FRAME_BYTES + 1];
        let result = run(
            frame.as_slice(),
            tokio::io::sink(),
            &json!({}),
            std::future::pending(),
            |_, _| async { Ok(json!({})) },
            |_| Ok(()),
            None,
        )
        .await;
        assert!(result.unwrap_err().contains("データ量が上限を超えました"));
    }
}
