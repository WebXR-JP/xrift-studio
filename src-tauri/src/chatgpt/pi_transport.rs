//! Multiplex Pi host calls without imposing a run budget. Drain accepted calls
//! before releasing the generation lease, including when cancellation wins.
use futures_util::{stream::FuturesUnordered, StreamExt};
use serde_json::{Map, Value};
use std::future::Future;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};

const FRAME_BYTES: usize = 1024 * 1024;

async fn send<W: AsyncWrite + Unpin>(writer: &mut W, message: &Value) -> Result<(), String> {
    let mut bytes = serde_json::to_vec(message).map_err(|_| "Piへの入力を作成できませんでした")?;
    bytes.push(b'\n');
    writer
        .write_all(&bytes)
        .await
        .map_err(|_| "Piとの接続が終了しました".into())
}

pub(super) async fn run<R, W, C, H, F, P>(
    stdout: R,
    mut stdin: W,
    initial: &Value,
    cancellation: C,
    host: H,
    mut progress: P,
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
    let mut line = Vec::new();
    tokio::pin!(cancellation);
    let outcome = async {
        loop {
            let mut bounded = (&mut reader).take((FRAME_BYTES + 1 - line.len()) as u64);
            tokio::select! {
                biased;
                _ = &mut cancellation => return Err("制作を停止しました。保存済みの変更は残っています".into()),
                Some((id, response)) = pending.next(), if !pending.is_empty() => {
                    let mut response: Value = response?;
                    response["type"] = Value::from("tool_result");
                    response["id"] = id;
                    send(&mut stdin, &response).await?;
                }
                // read_until preserves partially consumed bytes if a completed
                // host call wins select. Keep the buffer across loop iterations.
                count = bounded.read_until(b'\n', &mut line) => {
                    let count = count.map_err(|_| "Piの出力を読み取れませんでした")?;
                    if count == 0 { return Err("Piが完了記録を返さずに終了しました".into()); }
                    if line.len() > FRAME_BYTES { return Err("Piの出力が大きすぎます".into()); }
                    if line.last() != Some(&b'\n') { continue; }
                    let message: Value = serde_json::from_slice(&line).map_err(|_| "Piの応答を読み取れませんでした")?;
                    line.clear();
                    match message["type"].as_str() {
                        Some("tool") => {
                            let id = message["id"].as_u64().ok_or("Piの呼び出しIDが不正です")?;
                            let name = message["tool"].as_str().ok_or("Piのツール名が不正です")?.to_owned();
                            let args = message["arguments"].as_object().ok_or("Piのツール引数が不正です")?.clone();
                            let response = host(name, args);
                            pending.push(async move { (Value::from(id), response.await) });
                        }
                        Some("progress" | "activity" | "assistant" | "usage" | "history") => progress(message)?,
                        Some("result") if pending.is_empty() => return Ok(message["result"].clone()),
                        Some("result") => return Err("Piが処理中の操作を残して終了しました".into()),
                        Some("error") => return Err(message["message"].as_str().unwrap_or("Piの制作を完了できませんでした").into()),
                        _ => return Err("Piから未対応の応答を受け取りました".into()),
                    }
                }
            }
        }
    }.await;
    while pending.next().await.is_some() {}
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
    async fn oversized_frames_are_rejected() {
        let frame = vec![b'x'; FRAME_BYTES + 1];
        let result = run(
            frame.as_slice(),
            tokio::io::sink(),
            &json!({}),
            std::future::pending(),
            |_, _| async { Ok(json!({})) },
            |_| Ok(()),
        )
        .await;
        assert!(result.unwrap_err().contains("大きすぎ"));
    }
}
