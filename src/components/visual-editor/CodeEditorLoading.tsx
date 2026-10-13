import { LoaderCircle, X } from "lucide-react";
import { BrandMark } from "../Brand";

/** Keep the Scene and its panels mounted while a code workspace loads. */
export function CodeEditorLoading({ kind, active = true, onClose }: {
  kind: "script" | "shader";
  active?: boolean;
  onClose: () => void | Promise<void>;
}) {
  const script = kind === "script";
  const title = script ? "スクリプトエディター" : "GLSLエディター";
  return <section aria-label={`${title}の準備`} aria-busy="true"
    className={`absolute z-[75] min-h-0 flex-col overflow-hidden border border-slate-200 bg-white text-slate-700 ${active ? "flex" : "hidden"} ${script ? "" : "bottom-6 left-[clamp(260px,26vw,440px)] right-6 top-20 rounded-xl shadow-2xl"}`}
    style={script ? { top: "2.25rem", left: "var(--xrift-hierarchy-track, 0px)", right: "var(--xrift-inspector-track, 0px)", bottom: "var(--xrift-assets-track, 0px)" } : undefined}>
    <header className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3">
      <BrandMark size={20} />
      <h2 className="min-w-0 flex-1 truncate text-xs font-medium">{title}</h2>
      <button type="button" aria-label={`${title}を閉じる`} onClick={() => { void onClose(); }} className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-slate-100">
        <X size={16} aria-hidden="true" />
      </button>
    </header>
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <LoaderCircle size={20} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
      <p role="status" aria-live="polite" className="text-xs">{title}を準備しています…</p>
    </div>
  </section>;
}
