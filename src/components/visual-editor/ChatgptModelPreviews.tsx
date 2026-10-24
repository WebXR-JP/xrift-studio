import type { PiModelPreview } from "../../../packages/studio-pi/src/protocol";

export function ChatgptModelPreviews({ previews }: { previews?: readonly PiModelPreview[] }) {
  if (!previews?.length) return null;
  return <section aria-label="Blenderの制作画像" className="space-y-2">
    <h4 className="text-[11px] font-medium text-slate-500">Blenderの制作画像</h4>
    <p className="text-[11px] leading-4 text-slate-500">実際のモデル形状を撮影しています。約10秒を目安に、パーツが完成したところで更新します。</p>
    <div className="grid grid-cols-2 gap-2">{previews.map(preview => <figure key={`${preview.operationId}:${preview.sequence}`} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <img src={`data:image/png;base64,${preview.image.data}`} alt={`${preview.name}の形状プレビュー（${preview.completed}/${preview.total}パーツ）`} width={480} height={320} className="aspect-[3/2] w-full object-contain" />
      <figcaption className="space-y-0.5 px-2 py-1.5 text-[11px] leading-4 text-slate-600"><p className="break-words">{preview.name} · {preview.completed === preview.total ? "全パーツの形状" : `${preview.completed}/${preview.total}パーツ`}</p><time dateTime={new Date(preview.capturedAt).toISOString()}>{new Date(preview.capturedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 撮影</time></figcaption>
    </figure>)}</div>
  </section>;
}
