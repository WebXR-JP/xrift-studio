import type { ChatgptAssetOptions } from "../../lib/tauri";
import { useEffect, useRef, useState } from "react";
import { tauri, type ChatgptConnection, type ChatgptModel } from "../../lib/tauri";

export function ChatgptWorldPanel({ onGenerate, disabledReason }: { onGenerate: (model: string, prompt: string, options: ChatgptAssetOptions) => Promise<void>; disabledReason?: string }) {
  const [connection, setConnection] = useState<ChatgptConnection | null>(null);
  const [models, setModels] = useState<ChatgptModel[]>([]);
  const [model, setModel] = useState("");
  const [assetOptions, setAssetOptions] = useState({ models: true, materials: true, audio: true });
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"loading" | "login" | "logout" | "generate" | null>("loading");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const sync = async (next: ChatgptConnection) => {
    if (mounted.current) { setConnection(next); setModels([]); setModel(""); }
    const list = next.planUsageEnabled ? await tauri.chatgptModels() : [];
    if (!mounted.current) return;
    setConnection(next); setModels(list); setModel(current => list.some(m => m.slug === current) ? current : list[0]?.slug ?? "");
  };
  useEffect(() => {
    mounted.current = true;
    void tauri.chatgptStatus().then(sync).catch(e => { if (mounted.current) setError(String(e)); })
      .finally(() => { if (mounted.current) setBusy(null); });
    return () => { mounted.current = false; };
  }, []);
  const run = async (action: "login" | "logout" | "generate", task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(action); setError(null);
    try { await task(); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { running.current = false; if (mounted.current) setBusy(null); }
  };
  return <section aria-labelledby="chatgpt-world-heading" className="space-y-2.5 rounded-md border border-slate-200 p-3">
    <h3 id="chatgpt-world-heading" className="font-semibold text-slate-900">ChatGPTでワールドを作る</h3>
    <p className="leading-5">作りたい場所を入力すると、新しいワールドを保存して開きます。選んだ種類の外部素材も取り込みます。</p>
    {connection?.signedIn ? <p className="break-words text-slate-700">接続中：{connection.email ?? "ChatGPTアカウント"}</p> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy !== null} onClick={() => void run("login", async () => sync(await tauri.chatgptLogin()))}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-800 disabled:opacity-50">
        {busy === "login" ? "ブラウザでログインを完了してください…" : connection?.signedIn ? "ChatGPTに再接続" : "ChatGPTに接続"}
      </button>
      {connection?.signedIn ? <button type="button" disabled={busy !== null} onClick={() => void run("logout", async () => sync(await tauri.chatgptLogout()))}
        className="rounded-md px-2 py-2 underline underline-offset-2 disabled:opacity-50">接続を解除</button> : null}
    </div>
    {connection?.signedIn && !connection.planUsageEnabled ? <p className="text-amber-800">ChatGPTプランの利用許可がありません。再接続して許可してください。</p> : null}
    <p className="text-[11px] leading-4 text-slate-500">生成にはChatGPTプランの利用許可が必要です。接続はStudio終了時に解除されます。XRiftへのログインとは別です。</p>
    <label className="block space-y-1">モデル
      <select aria-label="ワールド生成のモデル" disabled={busy !== null || !models.length} value={model} onChange={e => setModel(e.target.value)} className="w-full rounded border border-slate-300 bg-white p-2">
        {!models.length ? <option value="">{busy === "loading" ? "接続を確認中…" : "ChatGPTへの接続後に選択できます"}</option> : models.map(m => <option key={m.slug} value={m.slug}>{m.displayName}</option>)}
      </select>
    </label>
    <fieldset disabled={busy !== null} className="space-y-1">
      <legend className="font-medium">生成に使う外部素材</legend>
      <div className="flex flex-wrap gap-x-3 gap-y-2">{([['models','3Dモデル'],['materials','マテリアル'],['audio','音声']] as const).map(([key,label]) => <label key={key} className="flex items-center gap-1.5"><input type="checkbox" checked={assetOptions[key]} onChange={e => setAssetOptions(v => ({...v,[key]:e.target.checked}))}/>{label}</label>)}</div>
      <p className="text-[11px] leading-4 text-slate-500">モデル・マテリアルはPoly Haven、音声は音蔵から選びます。マテリアルだけを選ぶと基本形状に適用します。</p>
    </fieldset>
    <label className="block space-y-1">作りたいワールド
      <textarea value={prompt} maxLength={2000} disabled={busy !== null} onChange={e => setPrompt(e.target.value)} rows={4}
        placeholder="秋の公園。木とベンチのある静かな広場" className="w-full resize-y rounded border border-slate-300 bg-white p-2 leading-5" />
    </label>
    <p className="text-[11px] leading-4 text-slate-500">生成には選択したChatGPTアカウントの利用枠を使います。現在の作品を保存し、別のワールドを作成します。</p>
    <button type="button" disabled={busy !== null || !connection?.planUsageEnabled || !model || !prompt.trim() || Boolean(disabledReason)}
      onClick={() => void run("generate", () => onGenerate(model, prompt.trim(), assetOptions))}
      className="w-full rounded-md bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500">
      {busy === "generate" ? "ワールドの生成・素材の取り込み中…" : "新しいワールドを作る"}
    </button>
    {disabledReason ? <p className="text-amber-800">{disabledReason}</p> : null}
    {error ? <p role="alert" className="rounded bg-rose-50 p-2 leading-5 text-rose-700">{error}</p> : null}
  </section>;
}
