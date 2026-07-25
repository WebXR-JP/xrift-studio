import {
  Code2,
  EyeOff,
  Play,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { ScriptAssetLanguage } from "../../lib/visual-editor/asset-manifest";

export type ScriptTrustPendingScript = Readonly<{
  id: string;
  name: string;
  path: string;
  hash: string;
  language: ScriptAssetLanguage;
  /** User-facing origin, such as "取り込んだProject" or "MCP". */
  provenance: string;
  source: string;
}>;

export type ScriptTrustDecision =
  | "allow-and-play"
  | "skip-and-play"
  | "cancel";

export type ScriptTrustDialogResult = Readonly<{
  decision: ScriptTrustDecision;
  /**
   * Identifies the exact id/hash sequence shown by this dialog. The caller
   * must compare it with a freshly generated key before starting Play.
   */
  snapshotKey: string;
}>;

export type ScriptTrustDialogProps = {
  pendingScripts: readonly ScriptTrustPendingScript[];
  sameRealmWarning?: string;
  onResolve: (result: ScriptTrustDialogResult) => void;
};

export const DEFAULT_SCRIPT_SAME_REALM_WARNING =
  "ScriptはXRift Studioと同じ実行領域で動き、完全には分離されません。アプリと同じ権限へ到達できる可能性があるため、信頼できる内容だけを許可してください。";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Creates a deterministic comparison key for the approval target.
 *
 * This is a stale-detection key, not a cryptographic signature. It includes
 * list order so replacing, adding, removing, or reordering a Script requires
 * the caller to show a fresh approval prompt.
 */
export function createScriptTrustSnapshotKey(
  scripts: readonly Pick<ScriptTrustPendingScript, "id" | "hash">[],
): string {
  return `script-trust-v1:${JSON.stringify(
    scripts.map((script) => [script.id, script.hash]),
  )}`;
}

function createSnapshot(
  scripts: readonly ScriptTrustPendingScript[],
): {
  scripts: readonly ScriptTrustPendingScript[];
  snapshotKey: string;
} {
  const frozenScripts = scripts.map((script) => ({ ...script }));
  return {
    scripts: frozenScripts,
    snapshotKey: createScriptTrustSnapshotKey(frozenScripts),
  };
}

/**
 * First-Play trust prompt for Script sources that were not authored locally.
 *
 * Mount one dialog per prompt. Its Script list is snapshotted at mount so the
 * result always refers to the exact source hashes the user reviewed.
 */
export function ScriptTrustDialog({
  pendingScripts,
  sameRealmWarning = DEFAULT_SCRIPT_SAME_REALM_WARNING,
  onResolve,
}: ScriptTrustDialogProps) {
  const [snapshot] = useState(() => createSnapshot(pendingScripts));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const scriptButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resolvedRef = useRef(false);
  const onResolveRef = useRef(onResolve);
  const titleId = useId();
  const descriptionId = useId();
  const warningId = useId();
  const sourcePanelId = useId();
  const snapshotHintId = useId();

  useEffect(() => {
    onResolveRef.current = onResolve;
  }, [onResolve]);

  const resolve = useCallback(
    (decision: ScriptTrustDecision) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      onResolveRef.current({
        decision,
        snapshotKey: snapshot.snapshotKey,
      });
    },
    [snapshot.snapshotKey],
  );

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelButtonRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        resolve("cancel");
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          !element.hasAttribute("disabled"),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [resolve]);

  const scripts = snapshot.scripts;
  const selectedScript = scripts[selectedIndex];

  const moveScriptFocus = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex = (index + 1) % scripts.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex = (index - 1 + scripts.length) % scripts.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = scripts.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    setSelectedIndex(nextIndex);
    scriptButtonRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolve("cancel");
      }}
    >
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${warningId} ${snapshotHintId}`}
        tabIndex={-1}
        className="flex max-h-[min(800px,calc(100vh-32px))] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-amber-300 bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-amber-200 bg-amber-50 px-5 py-4">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-700">
            <ShieldAlert size={19} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-amber-950">
              Scriptの実行を確認
            </h2>
            <p
              id={descriptionId}
              className="mt-1 text-xs leading-5 text-amber-900"
            >
              自分で作成していない可能性があるScript
              {scripts.length}件を初めて実行しようとしています。内容と来歴を確認してください。
            </p>
          </div>
          <button
            type="button"
            onClick={() => resolve("cancel")}
            aria-label="Scriptの実行確認をキャンセル"
            title="キャンセル"
            className="rounded-md p-1.5 text-amber-700 hover:bg-white hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div
          id={warningId}
          className="mx-5 mt-4 flex shrink-0 items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-900"
        >
          <ShieldAlert
            size={16}
            className="mt-0.5 shrink-0 text-rose-700"
            aria-hidden="true"
          />
          <div>
            <span className="font-semibold">完全なSandboxではありません。</span>{" "}
            {sameRealmWarning}
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 p-5 pt-4 md:grid-cols-[280px_minmax(0,1fr)] md:gap-4">
          <aside className="flex min-h-0 flex-col border-b border-slate-200 pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-slate-800">実行対象</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {scripts.length}件
              </span>
            </div>

            {scripts.length > 0 ? (
              <div
                role="tablist"
                aria-label="確認するScript"
                aria-orientation="vertical"
                className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-1 md:max-h-none md:min-h-0 md:flex-1"
              >
                {scripts.map((script, index) => {
                  const selected = index === selectedIndex;
                  const tabId = `${sourcePanelId}-tab-${index}`;
                  return (
                    <button
                      key={`${script.id}:${script.hash}:${index}`}
                      ref={(element) => {
                        scriptButtonRefs.current[index] = element;
                      }}
                      id={tabId}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={sourcePanelId}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setSelectedIndex(index)}
                      onKeyDown={(event) =>
                        moveScriptFocus(event, index)
                      }
                      className={`w-full rounded-lg border px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                        selected
                          ? "border-amber-400 bg-amber-50 text-amber-950"
                          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        <Code2
                          size={15}
                          className={`mt-0.5 shrink-0 ${
                            selected ? "text-amber-700" : "text-slate-500"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold">
                            {script.name}
                          </span>
                          <span
                            className="mt-0.5 block truncate font-mono text-[10px] text-slate-500"
                            title={script.path}
                          >
                            {script.path}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-1">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              {languageLabel(script.language)}
                            </span>
                            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                              {script.provenance}
                            </span>
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-xs leading-5 text-slate-600"
                role="status"
              >
                確認対象のScriptがありません。キャンセルしてPlay対象を再取得してください。
              </div>
            )}
          </aside>

          <main className="flex min-h-0 flex-col pt-4 md:pt-0">
            {selectedScript ? (
              <>
                <div className="grid shrink-0 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] sm:grid-cols-2">
                  <Metadata label="Script" value={selectedScript.name} />
                  <Metadata label="来歴" value={selectedScript.provenance} />
                  <Metadata
                    label="ファイル"
                    value={selectedScript.path}
                    monospace
                  />
                  <Metadata
                    label="言語"
                    value={languageLabel(selectedScript.language)}
                  />
                  <div className="sm:col-span-2">
                    <div className="font-semibold text-slate-500">
                      内容ハッシュ
                    </div>
                    <code className="mt-0.5 block break-all text-[10px] leading-4 text-slate-700">
                      {selectedScript.hash}
                    </code>
                  </div>
                </div>

                <div
                  id={sourcePanelId}
                  role="tabpanel"
                  aria-labelledby={`${sourcePanelId}-tab-${selectedIndex}`}
                  className="mt-3 flex min-h-0 flex-1 flex-col"
                >
                  <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold text-slate-800">
                      読み取り専用ソース
                    </h3>
                    <span className="text-[10px] text-slate-500">
                      選択とコピーのみ可能です
                    </span>
                  </div>
                  <pre
                    tabIndex={0}
                    aria-label={`${selectedScript.name}の読み取り専用ソース`}
                    className="scrollbar-thin min-h-44 flex-1 overflow-auto whitespace-pre rounded-lg border border-slate-800 bg-slate-950 p-4 font-mono text-[12px] leading-5 text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <code>
                      {selectedScript.source || "（空のScriptです）"}
                    </code>
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex min-h-44 flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-xs leading-5 text-slate-600">
                Script一覧を再取得してから、もう一度Playしてください。
              </div>
            )}
          </main>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            id={snapshotHintId}
            className="max-w-xl text-[11px] leading-4 text-slate-600"
          >
            許可は表示した内容ハッシュに対して行います。Play開始前に内容が変わった場合は、最新のソースを再確認してください。
          </p>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={() => resolve("cancel")}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => resolve("skip-and-play")}
              className="flex h-9 items-center gap-1.5 rounded-md border border-slate-400 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              <EyeOff size={14} aria-hidden="true" />
              Scriptを無効にしてPlay
            </button>
            <button
              type="button"
              onClick={() => resolve("allow-and-play")}
              disabled={scripts.length === 0}
              className="flex h-9 items-center gap-1.5 rounded-md bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play size={14} fill="currentColor" aria-hidden="true" />
              許可してPlay
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function Metadata({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="font-semibold text-slate-500">{label}</div>
      <div
        className={`mt-0.5 truncate text-slate-800 ${
          monospace ? "font-mono text-[10px]" : ""
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function languageLabel(language: ScriptAssetLanguage): string {
  return language === "tsx" ? "TypeScript JSX" : "TypeScript";
}
