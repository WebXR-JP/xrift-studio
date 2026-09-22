import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  JevWorldBuilderPanel,
  type JevWorldBuilderState,
} from "../src/components/visual-editor/JevWorldBuilderPanel";
import { tauri, type SystemDictationStatus } from "../src/lib/tauri";

export type JevWorldBuilderFixtureOptions = {
  configured?: boolean;
  manualDictation?: boolean;
  dictationError?: string;
};

let unmountFixture: (() => void) | undefined;
let finishGeneration: (() => void) | undefined;

/** UI-only fixture: native commands are mocked; no microphone or Jev request. */
export function mountJevWorldBuilderFixture(options: JevWorldBuilderFixtureOptions = {}) {
  unmountFixture?.();
  const host = document.createElement("section");
  host.id = "jev-world-builder-fixture";
  host.setAttribute("aria-label", "Jev world builder UI test fixture");
  host.style.cssText = "position:fixed;inset:0;z-index:100;background:white;padding:16px;overflow:auto";
  host.dataset.prompts = "[]";
  host.dataset.dictationStarts = "0";
  host.dataset.keyMutations = "0";
  host.dataset.connectionTests = "0";
  host.dataset.undoCount = "0";
  document.body.append(host);

  const originals = {
    getJevStatus: tauri.getJevStatus,
    setJevApiKey: tauri.setJevApiKey,
    clearJevApiKey: tauri.clearJevApiKey,
    testJevConnection: tauri.testJevConnection,
    jevSystemOne: tauri.jevSystemOne,
    getSystemDictationStatus: tauri.getSystemDictationStatus,
    startSystemDictation: tauri.startSystemDictation,
  };
  let configured = options.configured ?? true;
  const jevStatus = () => ({ configured, model: "jev-latest", baseUrl: "https://api.typesafe.ai" });
  const dictation: SystemDictationStatus = options.manualDictation
    ? {
        platform: "macos",
        canStart: false,
        shortcut: "キーボードのマイクキー、または設定した音声入力キー",
        instructions: "入力欄を選び、キーボードのマイクキーか音声入力のショートカットを押してください。",
      }
    : {
        platform: "windows",
        canStart: true,
        shortcut: "Win + H",
        instructions: "Windowsのオンライン音声認識で文字に変換します。マイクとインターネット接続が必要です。",
      };
  const increment = (key: "keyMutations" | "connectionTests" | "dictationStarts" | "undoCount") => {
    host.dataset[key] = String(Number(host.dataset[key]) + 1);
  };

  Object.assign(tauri, {
    getJevStatus: async () => jevStatus(),
    setJevApiKey: async () => {
      increment("keyMutations");
      configured = true;
      return jevStatus();
    },
    clearJevApiKey: async () => {
      increment("keyMutations");
      configured = false;
      return jevStatus();
    },
    testJevConnection: async () => {
      increment("connectionTests");
      return { ok: true, model: "jev-latest", message: "UI fixture" };
    },
    jevSystemOne: async () => {
      throw new Error("This standalone UI fixture must not request Jev inference.");
    },
    getSystemDictationStatus: async () => dictation,
    startSystemDictation: async () => {
      increment("dictationStarts");
      const active = document.activeElement;
      host.dataset.focusedAtDictationStart = String(
        active instanceof HTMLTextAreaElement && host.contains(active) && !active.disabled,
      );
      if (options.dictationError) throw new Error(options.dictationError);
      return {
        platform: dictation.platform,
        activation: "shortcutSent" as const,
        instructions: "Windowsの音声入力画面で聞き取りが始まってから話してください。終わったらマイクを停止し、文章を確認してください。",
      };
    },
  });

  const prompts: string[] = [];
  function FixturePanel() {
    const [prompt, setPrompt] = useState("");
    const [state, setState] = useState<JevWorldBuilderState>({ phase: "idle", message: "" });
    return (
      <>
        <h1 className="mb-3 text-sm font-semibold">UI検証用: ネイティブ操作とJev応答はテスト用の代替です</h1>
        <div data-testid="world-builder-surface" className="max-w-80 rounded-lg border border-slate-200">
          <h2 className="border-b border-slate-200 p-3 text-sm font-semibold">ワールドを作る</h2>
          <JevWorldBuilderPanel
            nativeAvailable
            prompt={prompt}
            onPromptChange={setPrompt}
            state={state}
            disabledReason={null}
            onGenerate={async (text) => {
              prompts.push(text);
              host.dataset.prompts = JSON.stringify(prompts);
              // Keep state idle until completion to test the panel's own guard
              // before a parent render changes the generation phase.
              await new Promise<void>((resolve) => {
                finishGeneration = () => {
                  setState({ phase: "done", message: "検証用の作成が完了しました。", summary: ["焚き火 1つ", "ベンチ 4つ"], elapsedMs: 1250 });
                  resolve();
                };
              });
            }}
            canUndo={state.phase === "done"}
            onUndo={() => increment("undoCount")}
          />
        </div>
      </>
    );
  }

  const root = createRoot(host);
  root.render(<FixturePanel />);
  unmountFixture = () => {
    finishGeneration?.();
    finishGeneration = undefined;
    root.unmount();
    Object.assign(tauri, originals);
    host.remove();
    unmountFixture = undefined;
  };
}

export function completeJevWorldBuilderFixture() {
  finishGeneration?.();
  finishGeneration = undefined;
}

export function unmountJevWorldBuilderFixture() {
  unmountFixture?.();
}
