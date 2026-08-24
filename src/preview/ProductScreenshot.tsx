import { Play } from "lucide-react";

/** Path of the editor capture shown in the hero and the workflow section. */
export const EDITOR_SCREENSHOT = "./visual-editor-screenshot.png";

export function ProductScreenshot({
  compact = false,
  interactive = false,
}: {
  compact?: boolean;
  interactive?: boolean;
}) {
  return (
    <figure
      className={`preview-product-frame relative overflow-hidden rounded-[1.6rem] border border-white/80 bg-white shadow-2xl shadow-violet-950/15 ${
        compact ? "preview-product-frame-compact" : ""
      } ${interactive ? "preview-product-frame-interactive" : ""}`}
    >
      <div className="flex h-9 items-center border-b border-zinc-200/80 bg-zinc-100/90 px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="ml-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="flex-1 text-center text-[10px] font-semibold text-zinc-500">
          XRift Studio
        </span>
        <span className="w-12" />
      </div>
      <img
        src={EDITOR_SCREENSHOT}
        alt="XRift Studioのビジュアルエディター。左にHierarchy、中央に湖畔のシーン、下にAssets、右にInspectorを表示している"
        className="block h-auto w-full"
      />
      {interactive ? (
        <span className="preview-screenshot-cta" aria-hidden="true">
          <Play size={14} fill="currentColor" />
          この画面をクリックして試す
        </span>
      ) : null}
    </figure>
  );
}
