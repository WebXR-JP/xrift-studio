import { memo } from "react";
import type { PiUsage } from "../../lib/visual-editor/pi-authoring";

const number = new Intl.NumberFormat("ja-JP");
export const PiRunDetails = memo(function PiRunDetails({ text, usage, running }: { text?: string; usage?: PiUsage; running: boolean }) {
  return <>
    {running && text ? <section aria-label="応答" aria-busy="true" className="space-y-1">
      <p className="text-[11px] text-slate-500">応答（作業中）</p>
      <p className="whitespace-pre-wrap break-words leading-5 text-slate-700">{text}</p>
    </section> : null}
    {usage ? <details className="text-[11px] text-slate-500">
      <summary className="cursor-pointer">この依頼の実行情報</summary>
      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        <dt>AIが応答した回数</dt><dd>{number.format(usage.modelTurns)}回</dd>
        <dt>操作を呼び出した回数</dt><dd>{number.format(usage.toolCalls)}回</dd>
        <dt>使用量の合計（トークン）</dt><dd>{number.format(usage.totalTokens)}</dd>
        <dt>入力 / 出力</dt><dd>{number.format(usage.inputTokens)} / {number.format(usage.outputTokens)}</dd>
        <dt>保存済みデータの再利用 / 保存</dt><dd>{number.format(usage.cacheReadTokens)} / {number.format(usage.cacheWriteTokens)}</dd>
      </dl>
      <p className="mt-2 leading-5">トークンはAIが文章や画像を扱うときの単位で、文字数とは異なります。再利用と保存の値もトークン数です。表示した回数は、制作を止める上限ではありません。</p>
    </details> : null}
  </>;
});
