import { useCallback, useEffect, useRef, useState } from "react";
import { tauri } from "../../lib/tauri";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import type { PrototypeVisualProject } from "../../lib/visual-editor/prototype-project";
import {
  buildJevWorldRequest,
  prepareJevWorld,
  resolveJevWorldPlan,
} from "../../lib/visual-editor/jev-world-builder";

export type JevWorldBuilderState = {
  phase: "idle" | "planning" | "building" | "done" | "error";
  message: string;
  summary?: string[];
  elapsedMs?: number;
};

type PreparedWorld = Awaited<ReturnType<typeof prepareJevWorld>>;
type Options = {
  projectId: string;
  disabledReason: string | null;
  getCurrent: () => {
    bundle: PrototypeVisualProject;
    projectPath: string | undefined;
    editable: boolean;
  };
  /** Acquire synchronously; release only this operation's existing import lock. */
  acquire: () => (() => void);
  onCommit: (source: PrototypeVisualProject, prepared: PreparedWorld) => void;
};

const IDLE: JevWorldBuilderState = { phase: "idle", message: "" };
const STALE_MESSAGE =
  "作成中にプロジェクトや素材が変更されました。現在の編集内容を確認して、もう一度作成してください。";

/** Thumbnail completion may replace assets without changing authored content. */
function onlyAssetThumbnailsChanged(before: AssetManifest, after: AssetManifest) {
  if (before === after) return true;
  if (
    before.schemaVersion !== after.schemaVersion ||
    JSON.stringify(before.folders ?? {}) !== JSON.stringify(after.folders ?? {}) ||
    Object.keys(before.assets).length !== Object.keys(after.assets).length
  ) return false;
  return Object.entries(before.assets).every(([id, asset]) => {
    const next = after.assets[id];
    if (!next) return false;
    if (next === asset) return true;
    const { thumbnail: _beforeThumbnail, ...beforeContent } = asset;
    const { thumbnail: _afterThumbnail, ...afterContent } = next;
    return JSON.stringify(beforeContent) === JSON.stringify(afterContent);
  });
}

/** One Jev request, isolated construction, then one editor history commit. */
export function useJevWorldBuilder(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(false);
  const run = useRef<symbol | null>(null);
  const projectEpoch = useRef(0);
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState<JevWorldBuilderState>(IDLE);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      projectEpoch.current++;
      // Pending file I/O still owns its lock until finally. A different editor
      // instance has its own refs; this run can never commit after unmount.
    };
  }, []);

  useEffect(() => {
    projectEpoch.current++;
    setPrompt("");
    setState(IDLE);
  }, [options.projectId]);

  const generate = useCallback(async (input: string) => {
    if (run.current !== null) return;
    const goal = input.trim();
    if (!goal) return;
    if (latest.current.disabledReason) {
      setState({ phase: "error", message: latest.current.disabledReason });
      return;
    }

    const token = Symbol("jev-world-builder");
    run.current = token;
    const epoch = projectEpoch.current;
    const projectId = latest.current.projectId;
    const startedAt = performance.now();
    let release: (() => void) | undefined;
    const ownsUi = () => mounted.current && projectEpoch.current === epoch &&
      latest.current.projectId === projectId && run.current === token;

    try {
      const initial = latest.current.getCurrent();
      if (!initial.editable || initial.bundle.project.projectId !== projectId) {
        throw new Error("動作確認を停止して、現在のワールドで作成してください。");
      }
      if (!initial.projectPath) {
        throw new Error("初回の自動保存が終わってから作成してください。");
      }
      const source = initial.bundle;
      const path = initial.projectPath;
      let validatedAssets = source.assets;
      const assertCurrent = () => {
        const current = latest.current.getCurrent();
        if (
          !ownsUi() || !current.editable || current.projectPath !== path ||
          current.bundle.project !== source.project ||
          current.bundle.scene !== source.scene ||
          current.bundle.prefabs !== source.prefabs
        ) throw new Error(STALE_MESSAGE);
        if (current.bundle.assets !== validatedAssets) {
          if (!onlyAssetThumbnailsChanged(source.assets, current.bundle.assets)) {
            throw new Error(STALE_MESSAGE);
          }
          validatedAssets = current.bundle.assets;
        }
      };

      // Build/validate before taking the import lock or making a billable call.
      const request = buildJevWorldRequest(goal, source);
      release = latest.current.acquire();
      assertCurrent();
      setState({ phase: "planning", message: "Jevでワールドの構成を決めています。" });
      const response = await tauri.jevSystemOne(request);
      assertCurrent();
      const plan = resolveJevWorldPlan(response);
      setState({ phase: "building", message: "地面と素材を組み立てています。" });
      const prepared = await prepareJevWorld(source, plan, path, {
        assertCurrent,
        onProgress: (message) => {
          if (ownsUi()) setState({ phase: "building", message });
        },
      });
      assertCurrent();
      latest.current.onCommit(source, prepared);
      setState({
        phase: "done",
        message: "ワールドを作成しました。選択したグループから配置や色を調整できます。",
        summary: prepared.summary,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      if (ownsUi()) {
        setState({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      release?.();
      if (run.current === token) run.current = null;
    }
  }, []);

  return { prompt, setPrompt, state, generate };
}
