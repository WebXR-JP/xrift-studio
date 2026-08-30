import { formatFileSize } from "./editor-utils";

/**
 * 変換・最適化は原本を書き換えず、参照先を差し替えるだけにしてある。
 * 作者にとって大事なのは「いま何が使われているか」と「戻せるか」の2つなので、
 * 変換結果と控えてある原本を並べ、その場に解除操作を置く。
 */
export function AssetOptimizationOriginCard({
  currentLabel,
  currentBytes,
  originalLabel,
  originalBytes,
  revertLabel,
  disabled,
  onRevert,
}: {
  currentLabel: string;
  currentBytes: number;
  originalLabel: string;
  originalBytes: number | null;
  revertLabel: string;
  disabled: boolean;
  onRevert?: () => void;
}) {
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50 p-2">
      <p className="text-[11px] font-semibold text-violet-900">
        変換後のファイルを使用中
      </p>
      <dl className="mt-1.5 grid grid-cols-[52px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        <dt className="text-violet-700">使用中</dt>
        <dd className="text-right tabular-nums font-semibold text-violet-900">
          {currentLabel}・{formatFileSize(currentBytes)}
        </dd>
        <dt className="text-violet-700">原本</dt>
        <dd className="text-right tabular-nums text-violet-800">
          {originalLabel}
          {originalBytes !== null ? `・${formatFileSize(originalBytes)}` : ""}
        </dd>
      </dl>
      <p className="mt-1 text-[11px] leading-4 text-violet-800">
        原本は消していません。戻すと変換前の設定もそのまま復元します。
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={onRevert}
        className="mt-1.5 h-7 w-full rounded-md border border-violet-300 bg-white px-3 text-[11px] font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {revertLabel}
      </button>
    </div>
  );
}
