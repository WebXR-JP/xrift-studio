import { useEffect, useRef, useState } from "react";
import type { ChatgptQuestion, ChatgptQuestionAnswer, ChatgptChoicePreview } from "../../lib/visual-editor/chatgpt-questions";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import { ChatgptChoiceThumbnail } from "./ChatgptChoiceThumbnail";

export function ChatgptQuestionForm({ questions, previews, assets, projectPath, disabled, onAnswer }: { questions: readonly ChatgptQuestion[]; previews?: Record<string, ChatgptChoicePreview>; assets?: AssetManifest; projectPath?: string; disabled: boolean; onAnswer: (answers: ChatgptQuestionAnswer[]) => void }) {
  const [page, setPage] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current?.scrollIntoView({ block: "start", inline: "nearest" });
    form.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus({ preventScroll: true });
  }, [page]);
  const [answers, setAnswers] = useState<Record<number, { choice: number; text: string }>>({});
  const answerFor = (index: number) => {
    const value = answers[index];
    return value ? value.choice === -1 ? value.text.trim() : questions[index].choices[value.choice] : "";
  };
  const question = questions[page];
  if (!question) return null;
  const visualChoices = question.choiceCandidateIds?.some(Boolean);
  return <form ref={form} data-chatgpt-question-form aria-label="制作の確認事項" onSubmit={event => { event.preventDefault(); if (!disabled && page === questions.length - 1 && questions.every((_, index) => Boolean(answerFor(index)))) onAnswer(questions.map((_, index) => ({ questionIndex: index, answer: answerFor(index) }))); }} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <p className="text-[11px] text-slate-500" aria-live="polite">確認 {page + 1} / {questions.length}</p>
    <p className="text-[11px] text-slate-500">Tabで候補を移動、Spaceで選択できます。</p>
    <div hidden data-chatgpt-copy-hidden>{questions.map((item, index) => <div key={index}><p>確認{index + 1}: {item.question}</p>{item.choices.map((choice, i) => <p key={i}>{i + 1}. {choice}</p>)}<p>その他（自由入力）</p></div>)}</div>
    <fieldset data-chatgpt-copy-skip disabled={disabled} className="space-y-2" onKeyDown={event => {
      if (event.key !== "Tab" || !(event.target instanceof HTMLInputElement) || event.target.type !== "radio") return;
      const choices = [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
      const next = choices[choices.indexOf(event.target) + (event.shiftKey ? -1 : 1)];
      if (next) { event.preventDefault(); next.focus(); }
    }}>
      <legend className="mb-2 break-words font-medium leading-5 text-slate-800">{question.question}</legend>
      {question.choices.map((choice, index) => <label key={`${page}-${index}`} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 bg-white p-2 text-slate-700 focus-within:ring-2 focus-within:ring-brand-500">
        <input type="radio" tabIndex={0} name={`question-${page}`} checked={answers[page]?.choice === index} onChange={() => setAnswers(current => ({ ...current, [page]: { choice: index, text: current[page]?.text ?? "" } }))} className="mt-0.5 accent-brand-600" />
        <span className={`min-w-0 flex-1 ${visualChoices ? "flex items-center gap-2" : ""}`}>
          {visualChoices ? <span aria-hidden="true" className="block h-16 w-28 shrink-0 overflow-hidden rounded" data-chatgpt-choice-preview={question.choiceCandidateIds?.[index] ?? "none"}><ChatgptChoiceThumbnail preview={previews?.[question.choiceCandidateIds?.[index] ?? ""]} assets={assets} projectPath={projectPath} /></span> : null}
          <span className="block min-w-0 break-words">{index + 1}. {choice}</span>
        </span>
      </label>)}
      <label className="flex cursor-pointer items-center gap-2 rounded-md text-slate-700 focus-within:ring-2 focus-within:ring-brand-500"><input type="radio" tabIndex={0} name={`question-${page}`} checked={answers[page]?.choice === -1} onChange={() => setAnswers(current => ({ ...current, [page]: { choice: -1, text: current[page]?.text ?? "" } }))} className="accent-brand-600" /><span>その他（自由入力）</span></label>
      {answers[page]?.choice === -1 ? <textarea aria-label="その他の回答" value={answers[page].text} maxLength={500} rows={2} onChange={event => setAnswers(current => ({ ...current, [page]: { choice: -1, text: event.target.value } }))} className="w-full resize-y rounded-md border border-slate-300 bg-white p-2 text-slate-800" /> : null}
    </fieldset>
    <div className="flex items-center justify-between gap-2">
      <button type="button" disabled={disabled || page === 0} onClick={() => setPage(current => current - 1)} className="rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40">前へ</button>
      {page < questions.length - 1 ? <button key="next" type="button" disabled={disabled || !answerFor(page)} onClick={event => { event.preventDefault(); setPage(current => current + 1); }} className="rounded-md bg-slate-800 px-3 py-1.5 text-white disabled:opacity-40">次へ</button>
        : <button key="submit" type="submit" disabled={disabled || !questions.every((_, index) => Boolean(answerFor(index)))} className="rounded-md bg-brand-600 px-3 py-1.5 text-white disabled:opacity-40">回答して進める</button>}
    </div>
  </form>;
}
