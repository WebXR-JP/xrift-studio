import { useState } from "react";
import { loadPiSettings, parsePiPackages, savePiSettings, type PiSettings } from "../../lib/visual-editor/pi-settings";

export function usePiFeatureSettings() {
  const [loaded] = useState(() => {
    try { return { settings: loadPiSettings(window.localStorage), error: "" }; }
    catch (error) { return { settings: { extensions: [] } as PiSettings, error: error instanceof Error ? error.message : "Piの設定を読み取れませんでした。" }; }
  });
  const [settings, setSettings] = useState(loaded.settings);
  const [error, setError] = useState(loaded.error);
  const save = (next: PiSettings) => {
    try { savePiSettings(next, window.localStorage); setSettings(next); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Piの設定を保存できませんでした。"); }
  };
  return { settings, save, error };
}
export function PiFeatureSettings({ settings, onSave, error, disabled }: { settings: PiSettings; onSave: (settings: PiSettings) => void; error: string; disabled: boolean }) {
  const [draft, setDraft] = useState(settings.extensions.join("\n"));
  const [validation, setValidation] = useState("");
  return <details className="shrink-0 rounded-lg border border-slate-200 px-3 py-2">
    <summary className="cursor-pointer text-[11px] text-slate-600">Pi拡張設定</summary>
    <div className="mt-3 space-y-3">
      <label className="block space-y-1"><span>外部Pi拡張（固定バージョン）</span><textarea aria-label="外部Pi拡張" value={draft} onChange={event => setDraft(event.target.value)} disabled={disabled} rows={3} placeholder="npm:package-name@1.2.3" className="w-full rounded border border-slate-300 p-2 text-xs" /></label>
      <p className="text-[11px] leading-5 text-slate-500">登録した拡張は次の制作時に自動導入します。導入スクリプトは実行しません。拡張コードはStudioと同じOS権限で動くため、信頼する提供元だけを登録してください。Planでは読み込みません。</p>
      <button type="button" disabled={disabled} onClick={() => { try { const extensions = parsePiPackages(draft); onSave({ ...settings, extensions }); setValidation(""); } catch (error) { setValidation(error instanceof Error ? error.message : String(error)); } }} className="min-h-8 rounded border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">拡張設定を保存</button>
      {validation || error ? <p role="alert" className="text-rose-700">{validation || error}</p> : <p role="status" className="text-[11px] text-slate-500">登録済み：{settings.extensions.length}件</p>}
    </div>
  </details>;
}
