import { memo } from "react";
import type { PiUsage } from "../../lib/visual-editor/pi-authoring";

const number = new Intl.NumberFormat("ja-JP");
export const PiRunDetails = memo(function PiRunDetails({ text, usage, running }: { text?: string; usage?: PiUsage; running: boolean }) {
  return <>
    {running && text ? <section aria-label="Piの応答" aria-busy="true" className="space-y-1">
      <p className="text-[11px] text-slate-500">Piの応答（作業中）</p>
      <p className="whitespace-pre-wrap break-words leading-5 text-slate-700">{text}</p>
    </section> : null}
    {usage ? <details className="text-[11px] text-slate-500">
      <summary className="cursor-pointer">この依頼の実行情報</summary>
      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        <dt>モデル応答</dt><dd>{number.format(usage.modelTurns)}回</dd>
        <dt>ツール実行</dt><dd>{number.format(usage.toolCalls)}回</dd>
        <dt>合計トークン</dt><dd>{number.format(usage.totalTokens)}</dd>
        <dt>入力 / 出力</dt><dd>{number.format(usage.inputTokens)} / {number.format(usage.outputTokens)}</dd>
        <dt>キャッシュ読取 / 書込</dt><dd>{number.format(usage.cacheReadTokens)} / {number.format(usage.cacheWriteTokens)}</dd>
      </dl>
    </details> : null}
  </>;
});
