import { useEffect, useId, useRef, useState } from "react";
import { Mic, Undo2 } from "lucide-react";
import {
  tauri,
  type JevStatus,
  type SystemDictationStatus,
} from "../../lib/tauri";
import type { JevWorldBuilderState } from "./useJevWorldBuilder";
export type { JevWorldBuilderState } from "./useJevWorldBuilder";

export type JevWorldBuilderPanelProps = {
  nativeAvailable: boolean;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  state: JevWorldBuilderState;
  disabledReason: string | null;
  onGenerate: (prompt: string) => Promise<void>;
  canUndo: boolean;
  onUndo: () => void;
};

const WORLD_EXAMPLES = [
  {
    label: "森の焚き火",
    prompt: "夜の森に、焚き火とベンチのある小さな休憩所を作って。",
  },
  {
    label: "明るい草原",
    prompt: "明るい草原に木と岩を置いて、中央は広く空けて。",
  },
  {
    label: "竹の庭園",
    prompt: "竹と石灯籠のある小さな庭園を作って。",
  },
] as const;

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function JevWorldBuilderPanel({
  nativeAvailable,
  prompt,
  onPromptChange,
  state,
  disabledReason,
  onGenerate,
  canUndo,
  onUndo,
}: JevWorldBuilderPanelProps) {
  const [jevStatus, setJevStatus] = useState<JevStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(nativeAvailable);
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [keyAction, setKeyAction] = useState<"save" | "test" | "clear" | null>(null);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [dictation, setDictation] = useState<SystemDictationStatus | null>(null);
  const [dictationStarting, setDictationStarting] = useState(false);
  const [dictationMessage, setDictationMessage] = useState<string | null>(null);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const actionRef = useRef<"key" | "dictation" | "generate" | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptId = useId();
  const dictationHelpId = useId();
  const generationBusy = submitting || state.phase === "planning" || state.phase === "building";
  const actionsDisabled = statusLoading || generationBusy || keyAction !== null || dictationStarting;

  useEffect(() => {
    if (!nativeAvailable) return;
    let active = true;
    setStatusLoading(true);
    void tauri.getJevStatus()
      .then((status) => {
        if (!active) return;
        setJevStatus(status);
        setSettingsOpen(!status.configured);
      })
      .catch((cause) => {
        if (active) setKeyError(`Jevの設定を読み込めませんでした。${errorMessage(cause)}`);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    void tauri.getSystemDictationStatus()
      .then((status) => {
        if (active) setDictation(status);
      })
      .catch(() => {
        if (active) {
          setDictationError("音声入力の設定を確認できませんでした。OSの音声入力を使うか、文字で入力してください。");
        }
      });
    return () => {
      active = false;
    };
  }, [nativeAvailable]);

  const updatePrompt = (value: string) => {
    onPromptChange(value);
    setSubmissionError(null);
  };

  const manageKey = async (action: "save" | "test" | "clear") => {
    if (!nativeAvailable || actionRef.current || actionsDisabled) return;
    if (action === "save" ? !apiKey.trim() : !jevStatus?.configured) return;
    actionRef.current = "key";
    setKeyAction(action);
    setKeyError(null);
    setKeyMessage(null);
    setConnectionVerified(false);
    let saved = false;
    try {
      if (action === "clear") {
        setJevStatus(await tauri.clearJevApiKey());
        setApiKey("");
        setKeyMessage("APIキーを削除しました。");
        return;
      }
      if (action === "save") {
        setJevStatus(await tauri.setJevApiKey(apiKey.trim()));
        setApiKey("");
        saved = true;
      }
      const result = await tauri.testJevConnection();
      setConnectionVerified(result.ok);
      if (result.ok) {
        setKeyMessage(saved ? "APIキーを保存し、Jevへの接続を確認しました。" : "Jevへの接続を確認しました。");
      } else {
        setKeyError(`${saved ? "APIキーは保存しました。" : ""}${result.message}`);
      }
    } catch (cause) {
      const context = saved
        ? "APIキーは保存しました。接続を確認できませんでした。"
        : action === "save"
          ? "APIキーを保存できませんでした。"
          : action === "clear"
            ? "APIキーを削除できませんでした。"
            : "Jevへの接続を確認できませんでした。";
      setKeyError(`${context}${errorMessage(cause)}`);
    } finally {
      actionRef.current = null;
      setKeyAction(null);
    }
  };

  const startDictation = async () => {
    if (!nativeAvailable || !dictation || actionRef.current || actionsDisabled) return;
    const input = inputRef.current;
    if (!input) return;
    actionRef.current = "dictation";
    setDictationStarting(true);
    setDictationError(null);
    // OS dictation enters text in the existing focused field. This textarea
    // remains editable during activation; shortcut delivery is not recording.
    input.focus({ preventScroll: true });
    try {
      if (dictation.canStart) {
        const result = await tauri.startSystemDictation();
        setDictationMessage(result.instructions);
      } else {
        setDictationMessage(dictation.instructions);
      }
    } catch (cause) {
      setDictationError(`音声入力を開けませんでした。${errorMessage(cause)} 文字でも入力できます。`);
    } finally {
      actionRef.current = null;
      setDictationStarting(false);
    }
  };

  const generate = async () => {
    const value = prompt.trim();
    if (!nativeAvailable || !value || !jevStatus?.configured || disabledReason || actionsDisabled || actionRef.current) return;
    actionRef.current = "generate";
    setSubmitting(true);
    setSubmissionError(null);
    try {
      await onGenerate(value);
    } catch (cause) {
      setSubmissionError(`作成を完了できませんでした。${errorMessage(cause)}`);
    } finally {
      actionRef.current = null;
      setSubmitting(false);
    }
  };

  if (!nativeAvailable) {
    return (
      <p className="p-3.5 text-xs leading-5 text-slate-600">
        ワールドの作成はデスクトップ版で利用できます。JevのAPIキーを設定してから、音声や文章で指示してください。
      </p>
    );
  }

  const resultError = submissionError ?? (state.phase === "error" ? state.message : null);
  const resultMessage = resultError ?? state.message;

  return (
    <div className="scrollbar-thin max-h-[min(36rem,calc(100dvh-10rem))] space-y-3.5 overflow-y-auto p-3.5 text-xs text-slate-600">
      <div className="flex items-center justify-between gap-2">
        <p className="leading-5">場所の雰囲気と、置きたいものを教えてください。</p>
        <span className={`shrink-0 text-[11px] ${connectionVerified ? "text-emerald-700" : "text-slate-500"}`}>
          {statusLoading ? "設定を確認中" : connectionVerified ? "Jev接続済み" : jevStatus?.configured ? "キー設定済み" : "キー未設定"}
        </span>
      </div>

      <div className="space-y-2">
        <label htmlFor={promptId} className="block font-semibold text-slate-800">
          作りたいワールド
        </label>
        <textarea
          ref={inputRef}
          id={promptId}
          value={prompt}
          disabled={generationBusy}
          onChange={(event) => updatePrompt(event.target.value)}
          placeholder="例: 夜の森に、焚き火とベンチのある休憩所を作って"
          rows={4}
          className="w-full resize-y rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs leading-5 text-slate-800 focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500">例</span>
          {WORLD_EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              disabled={actionsDisabled}
              onClick={() => {
                if (actionsDisabled || actionRef.current) return;
                updatePrompt(example.prompt);
                inputRef.current?.focus({ preventScroll: true });
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50 disabled:opacity-50"
            >
              {example.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-describedby={dictationHelpId}
            disabled={!dictation || actionsDisabled}
            onClick={() => void startDictation()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Mic size={14} aria-hidden="true" />
            {dictationStarting ? "音声入力を準備中" : !dictation ? "音声入力を確認中" : dictation.canStart ? "音声で入力" : "音声入力の使い方"}
          </button>
          {dictation?.canStart && dictation.shortcut ? (
            <span className="text-[11px] text-slate-500">{dictation.shortcut}</span>
          ) : null}
        </div>
        <p id={dictationHelpId} role="status" className="text-[11px] leading-4 text-slate-500">
          {dictationMessage ?? dictation?.instructions ?? (dictationError ? "文字入力はそのまま使えます。" : "OSの音声入力を確認しています。")}
        </p>
        {dictationError ? (
          <p role="alert" className="text-[11px] leading-5 text-rose-700">{dictationError}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] leading-4">入力した文章は直せます。内容を確認してから作成してください。</p>
        <button
          type="button"
          disabled={!jevStatus?.configured || !prompt.trim() || Boolean(disabledReason) || actionsDisabled}
          onClick={() => void generate()}
          className="w-full rounded-md bg-brand-600 px-3 py-2 font-semibold text-white hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-500"
        >
          {state.phase === "planning" ? "構成を決めています" : state.phase === "building" ? "ワールドを作成中" : submitting ? "作成を準備中" : "ワールドを作る"}
        </button>
        {disabledReason ? <p className="text-[11px] leading-4 text-amber-700">{disabledReason}</p> : null}
        {!statusLoading && !jevStatus?.configured ? (
          <p className="text-[11px] leading-4">下の「Jev接続設定」に、ご自身のTypeSafe APIキーを入力してください。</p>
        ) : null}
      </div>

      {state.phase !== "idle" || submissionError ? (
        <div
          role={resultError ? "alert" : "status"}
          className={`space-y-2 rounded-md border p-3 ${resultError ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-700"}`}
        >
          <p className="font-semibold leading-5">{resultMessage}</p>
          {resultError ? (
            <p className="text-[11px] leading-4">入力内容を確認して、もう一度お試しください。</p>
          ) : state.phase === "done" ? (
            <>
              {state.summary?.length ? (
                <ul className="list-inside list-disc space-y-1 text-[11px] leading-4">
                  {state.summary.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                </ul>
              ) : null}
              <p className="text-[11px] leading-4">
                シーンに反映しました。Playで歩いて確認できます。
                {state.elapsedMs !== undefined && Number.isFinite(state.elapsedMs) ? `（${(Math.max(0, state.elapsedMs) / 1000).toFixed(1)}秒）` : ""}
              </p>
              <button
                type="button"
                disabled={!canUndo || actionsDisabled}
                onClick={onUndo}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                <Undo2 size={13} aria-hidden="true" />
                元に戻す
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <details
        open={settingsOpen}
        onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
        className="border-t border-slate-200 pt-3"
      >
        <summary className="cursor-pointer select-none font-semibold text-slate-700">Jev接続設定</summary>
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold">TypeSafe APIキー</span>
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={actionsDisabled}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={jevStatus?.configured ? "新しいキーに変更" : "APIキーを入力"}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
            />
          </label>
          <button
            type="button"
            disabled={actionsDisabled || !apiKey.trim()}
            onClick={() => void manageKey("save")}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {keyAction === "save" ? "保存・接続確認中" : "保存して接続確認"}
          </button>
          {jevStatus?.configured ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => void manageKey("test")}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                {keyAction === "test" ? "接続を確認中" : "接続確認"}
              </button>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => void manageKey("clear")}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                {keyAction === "clear" ? "削除中" : "キーを削除"}
              </button>
            </div>
          ) : null}
          <p className="text-[11px] leading-4 text-slate-500">APIキーはこの端末に保存します。入力した文章をJev公式APIに送信します。</p>
          {keyMessage ? <p role="status" className="text-[11px] leading-5 text-emerald-700">{keyMessage}</p> : null}
          {keyError ? <p role="alert" className="text-[11px] leading-5 text-rose-700">{keyError}</p> : null}
        </div>
      </details>
    </div>
  );
}
