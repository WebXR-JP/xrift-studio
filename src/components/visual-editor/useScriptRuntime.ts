import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CompiledScript,
  ScriptRenderProps,
} from "../../../packages/xrift-studio-runtime/src/script/api";
import { isCompiledScript } from "../../../packages/xrift-studio-runtime/src/script/api";
import type { ScriptFailure, ScriptLogEntry } from "../../../packages/xrift-studio-runtime/src/script/host";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import type { SceneDocument } from "../../lib/visual-editor/scene-document";
import { filterScriptTrustRunningByAssetIds } from "../../lib/visual-editor/scripting/runtime-report";
import {
  readScriptSourceSnapshot,
  type ScriptProvenanceDto,
  type ScriptSourceSnapshot,
} from "../../lib/visual-editor/scripting/script-trust";
import {
  collectRequiredScriptAssetIds,
  collectScriptReferencedAssetIds,
  collectScheduledScripts,
} from "../../lib/visual-editor/scripting/script-schedule";
import {
  loadScriptModule,
  releaseAllScriptModules,
  releaseScriptModuleUrl,
} from "../../lib/script-modules";
import { tauri } from "../../lib/tauri";

/**
 * Compiles the Script Assets a scene needs, before Play starts.
 *
 * Compilation is deliberately a precondition of entering Play: MI-70 requires
 * that a scene with a broken script does not start rather than starting and
 * failing per frame.
 */

export type CompiledScriptEntry = {
  assetId: string;
  script: CompiledScript;
  render?: React.ComponentType<ScriptRenderProps>;
  objectUrl: string;
  /** Reuses the same module identity when another Script was the only edit. */
  cacheKey: string;
  /**
   * Fingerprint of the exact module represented by this entry. It may differ
   * from the latest skipped source while Play keeps a last-good module alive.
   */
  trustSnapshot: ScriptRunningTrustSnapshot;
};

export type ScriptCompileError = {
  assetId: string;
  assetName: string;
  relativePath: string;
  message: string;
  code?: "SCRIPT_APPROVAL_REQUIRED";
  /** Exact read-once source that was rejected before module evaluation. */
  trustSnapshot?: ScriptSourceSnapshot;
};

export type ScriptTrustCheckResult = Readonly<{
  /** Snapshot keys whose exact fingerprints are approved for this project. */
  approvedSnapshotKeys: ReadonlySet<string>;
}>;

export type ScriptRunningTrustSnapshot = Readonly<
  Pick<
    ScriptSourceSnapshot,
    "assetId" | "name" | "path" | "language" | "fingerprint" | "provenance"
  >
>;

export type ScriptTrustRuntimeState = Readonly<{
  status: "not-required" | "approved" | "approval-required" | "skipped";
  pending: readonly ScriptSourceSnapshot[];
  skipped: readonly ScriptSourceSnapshot[];
  running: readonly ScriptRunningTrustSnapshot[];
}>;

export type ScriptRuntimeState = {
  status: "idle" | "compiling" | "ready" | "error" | "approval-required";
  scripts: ReadonlyMap<string, CompiledScriptEntry>;
  /** Pre-resolved so `ctx.getAssetUrl` can be synchronous. */
  assetUrls: ReadonlyMap<string, string>;
  /** Short per-Asset revisions used to restart only affected Script hosts. */
  assetUrlVersions: ReadonlyMap<string, number>;
  errors: readonly ScriptCompileError[];
  failures: readonly ScriptFailure[];
  /** Monotonic within one compiled runtime, even after the bounded list fills. */
  failureRevision: number;
  logs: readonly ScriptLogEntry[];
  trust: ScriptTrustRuntimeState;
};

const EMPTY_SCRIPTS = new Map<string, CompiledScriptEntry>();
const EMPTY_ASSET_URLS = new Map<string, string>();
const EMPTY_ASSET_URL_VERSIONS = new Map<string, number>();
const EMPTY_SCRIPT_TRUST: ScriptTrustRuntimeState = {
  status: "not-required",
  pending: [],
  skipped: [],
  running: [],
};
/** Keeps the console from growing without bound during a long Play run. */
const MAX_LOG_ENTRIES = 200;

export type UseScriptRuntimeOptions = {
  scene: SceneDocument;
  assets: AssetManifest;
  projectPath?: string;
  allowRemoteModules?: boolean;
  /**
   * Native app-data approval lookup. Omission fails closed: a caller may only
   * proceed by explicitly compiling with unapprovedPolicy="skip".
   */
  checkScriptTrust?: (
    snapshots: readonly ScriptSourceSnapshot[],
  ) => Promise<ScriptTrustCheckResult>;
  /** Display-only provenance. It can never affect approval lookup. */
  resolveScriptProvenance?: (
    assetId: string,
  ) => Partial<ScriptProvenanceDto> | null | undefined;
};

export function useScriptRuntime({
  scene,
  assets,
  projectPath,
  allowRemoteModules,
  checkScriptTrust,
  resolveScriptProvenance,
}: UseScriptRuntimeOptions) {
  const [state, setState] = useState<ScriptRuntimeState>({
    status: "idle",
    scripts: EMPTY_SCRIPTS,
    assetUrls: EMPTY_ASSET_URLS,
    assetUrlVersions: EMPTY_ASSET_URL_VERSIONS,
    errors: [],
    failures: [],
    failureRevision: 0,
    logs: [],
    trust: EMPTY_SCRIPT_TRUST,
  });
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const stateRef = useRef(state);
  stateRef.current = state;
  const compileGenerationRef = useRef(0);
  const componentRuntimeKeysRef = useRef(new Map<string, string>());

  const reset = useCallback(() => {
    compileGenerationRef.current += 1;
    componentRuntimeKeysRef.current.clear();
    releaseAllScriptModules();
    setState({
      status: "idle",
      scripts: EMPTY_SCRIPTS,
      assetUrls: EMPTY_ASSET_URLS,
      assetUrlVersions: EMPTY_ASSET_URL_VERSIONS,
      errors: [],
      failures: [],
      failureRevision: 0,
      logs: [],
      trust: EMPTY_SCRIPT_TRUST,
    });
  }, []);

  /**
   * Reads every referenced Script exactly once, checks the native app-data
   * approval store, and only then evaluates the approved snapshots.
   */
  const compile = useCallback(async (
    input: {
      scene?: SceneDocument;
      assets?: AssetManifest;
      unapprovedPolicy?: "block" | "skip";
    } = {},
  ): Promise<ScriptCompileError[]> => {
    const generation = compileGenerationRef.current + 1;
    compileGenerationRef.current = generation;
    const currentScene = input.scene ?? sceneRef.current;
    const currentAssets = input.assets ?? assetsRef.current;
    const previousState = stateRef.current;
    const previousScripts = previousState.scripts;
    const assetIds = collectRequiredScriptAssetIds(currentScene);
    if (assetIds.length === 0) {
      if (compileGenerationRef.current !== generation) return [];
      for (const entry of previousScripts.values()) {
        releaseScriptModuleUrl(entry.objectUrl);
      }
      componentRuntimeKeysRef.current.clear();
      setState({
        status: "ready",
        scripts: EMPTY_SCRIPTS,
        assetUrls: EMPTY_ASSET_URLS,
        assetUrlVersions: EMPTY_ASSET_URL_VERSIONS,
        errors: [],
        failures: [],
        failureRevision: 0,
        logs: [],
        trust: EMPTY_SCRIPT_TRUST,
      });
      return [];
    }
    if (!projectPath) {
      const errors = assetIds.map((assetId) => ({
        assetId,
        assetName: currentAssets.assets[assetId]?.name ?? assetId,
        relativePath: "",
        message: "プロジェクトのpathが未確定のためScriptを読み込めません",
      }));
      if (compileGenerationRef.current === generation) {
        setState((previous) => ({ ...previous, status: "error", errors }));
      }
      return errors;
    }

    setState((previous) => ({ ...previous, status: "compiling", errors: [] }));
    const errors: ScriptCompileError[] = [];
    const snapshots: ScriptSourceSnapshot[] = [];

    // Source is read only here. Hashing, approval lookup, transpilation, and
    // evaluation all use this immutable value, closing the read/check/read
    // race that would otherwise permit a filesystem swap.
    for (const assetId of assetIds) {
      const asset = currentAssets.assets[assetId];
      if (!asset || asset.kind !== "script") {
        errors.push({
          assetId,
          assetName: asset?.name ?? assetId,
          relativePath: "",
          message: "参照しているScript Assetが見つかりません",
        });
        continue;
      }
      try {
        snapshots.push(
          await readScriptSourceSnapshot({
            assetId: asset.id,
            name: asset.name,
            path: asset.source.relativePath,
            language: asset.language,
            contractVersion: asset.contractVersion,
            provenance: resolveScriptProvenance?.(asset.id),
            allowRemoteModules: Boolean(allowRemoteModules),
            readSource: () =>
              tauri.readScriptSource(projectPath, asset.source.relativePath),
          }),
        );
      } catch (error) {
        errors.push({
          assetId,
          assetName: asset.name,
          relativePath: asset.source.relativePath,
          message:
            error instanceof Error
              ? error.message
              : "Script fileを読み込めませんでした",
        });
      }
    }

    let approvedSnapshotKeys = new Set<string>();
    if (snapshots.length > 0 && checkScriptTrust) {
      try {
        const trust = await checkScriptTrust(snapshots);
        approvedSnapshotKeys = new Set(trust.approvedSnapshotKeys);
      } catch {
        // Corrupt or inaccessible app data fails closed. The caller can still
        // explicitly choose skip, but the source is never evaluated.
      }
    }
    const pendingTrust = snapshots.filter(
      (snapshot) => !approvedSnapshotKeys.has(snapshot.snapshotKey),
    );
    const trustErrors: ScriptCompileError[] = pendingTrust.map((snapshot) => ({
      assetId: snapshot.assetId,
      assetName: snapshot.name,
      relativePath: snapshot.path,
      code: "SCRIPT_APPROVAL_REQUIRED",
      message:
        "内容がまだ承認されていないため実行しません。Studioでソースを確認して許可してください",
      trustSnapshot: snapshot,
    }));
    if (
      pendingTrust.length > 0 &&
      (input.unapprovedPolicy ?? "block") === "block"
    ) {
      const blockedErrors = [...trustErrors, ...errors];
      const running = runningSnapshotsFor(previousScripts, assetIds);
      if (compileGenerationRef.current === generation) {
        setState((previous) => ({
          ...previous,
          status: "approval-required",
          errors: blockedErrors,
          trust: {
            status: "approval-required",
            pending: pendingTrust,
            skipped: [],
            running,
          },
        }));
      }
      return blockedErrors;
    }

    const skippedTrust =
      input.unapprovedPolicy === "skip" ? pendingTrust : [];
    const executableSnapshots = snapshots.filter((snapshot) =>
      approvedSnapshotKeys.has(snapshot.snapshotKey),
    );
    const compiled = new Map<string, CompiledScriptEntry>();

    // An explicitly skipped replacement must not tear down an Entity that is
    // already running an approved version. Preserve that exact module as
    // last-good; a newly introduced unapproved Script has no previous entry
    // and therefore remains disabled.
    for (const snapshot of skippedTrust) {
      const previousEntry = previousScripts.get(snapshot.assetId);
      if (previousEntry) {
        compiled.set(snapshot.assetId, previousEntry);
      }
    }

    for (const snapshot of executableSnapshots) {
      const cacheKey = JSON.stringify([
        snapshot.path,
        snapshot.fingerprint,
        snapshot.source,
      ]);
      const previousEntry = previousScripts.get(snapshot.assetId);
      if (previousEntry?.cacheKey === cacheKey) {
        compiled.set(snapshot.assetId, previousEntry);
        continue;
      }
      const result = await loadScriptModule(snapshot.source, snapshot.path, {
        allowRemoteModules: false,
      });
      if (!result.ok) {
        errors.push({
          assetId: snapshot.assetId,
          assetName: snapshot.name,
          relativePath: snapshot.path,
          message: result.message,
        });
        continue;
      }
      const exported = result.module.default;
      if (!isCompiledScript(exported)) {
        releaseScriptModuleUrl(result.objectUrl);
        errors.push({
          assetId: snapshot.assetId,
          assetName: snapshot.name,
          relativePath: snapshot.path,
          message: "default export が defineScript(...) ではありません",
        });
        continue;
      }
      const render = result.module.Render;
      compiled.set(snapshot.assetId, {
        assetId: snapshot.assetId,
        script: exported,
        ...(typeof render === "function"
          ? {
              render: render as React.ComponentType<ScriptRenderProps>,
            }
          : {}),
        objectUrl: result.objectUrl,
        cacheKey,
        trustSnapshot: toRunningTrustSnapshot(snapshot),
      });
    }

    // Asset props are resolved up front: the read is asynchronous IPC but
    // ctx.getAssetUrl must answer synchronously inside a frame.
    const assetUrls = new Map<string, string>();
    const assetUrlVersions = new Map<string, number>();
    for (const assetId of collectScriptReferencedAssetIds(currentScene)) {
      const asset = currentAssets.assets[assetId];
      if (!asset || asset.source.kind !== "project") continue;
      try {
        const url = await tauri.readProjectFileDataUrl(
          projectPath,
          asset.source.relativePath,
        );
        assetUrls.set(assetId, url);
        const previousVersion =
          previousState.assetUrlVersions.get(assetId) ?? 0;
        assetUrlVersions.set(
          assetId,
          previousState.assetUrls.get(assetId) === url
            ? Math.max(1, previousVersion)
            : previousVersion + 1,
        );
      } catch {
        // A missing Asset URL is reported by the script when it reads null,
        // not by refusing to start the whole scene.
      }
    }

    if (compileGenerationRef.current !== generation) {
      for (const entry of compiled.values()) {
        if (previousScripts.get(entry.assetId) !== entry) {
          releaseScriptModuleUrl(entry.objectUrl);
        }
      }
      return errors;
    }

    if (errors.length > 0) {
      for (const entry of compiled.values()) {
        if (previousScripts.get(entry.assetId) !== entry) {
          releaseScriptModuleUrl(entry.objectUrl);
        }
      }
      const running = runningSnapshotsFor(previousScripts, assetIds);
      setState((previous) => ({
        ...previous,
        status: "error",
        errors,
        trust: {
          status: skippedTrust.length > 0 ? "skipped" : "approved",
          pending: [],
          skipped: skippedTrust,
          running,
        },
      }));
    } else {
      const nextComponentRuntimeKeys = createComponentRuntimeKeys(
        currentScene,
        compiled,
        assetUrlVersions,
      );
      const unchangedComponentIds = new Set(
        [...nextComponentRuntimeKeys].flatMap(([componentId, key]) =>
          componentRuntimeKeysRef.current.get(componentId) === key
            ? [componentId]
            : [],
        ),
      );
      componentRuntimeKeysRef.current = nextComponentRuntimeKeys;
      for (const entry of previousScripts.values()) {
        if (compiled.get(entry.assetId) !== entry) {
          releaseScriptModuleUrl(entry.objectUrl);
        }
      }
      setState((previous) => ({
        status: "ready",
        scripts: compiled,
        assetUrls,
        assetUrlVersions,
        errors: [],
        failures: previous.failures.filter((entry) =>
          unchangedComponentIds.has(entry.componentId),
        ),
        failureRevision: previous.failureRevision,
        logs: previous.logs.filter((entry) =>
          unchangedComponentIds.has(entry.componentId),
        ),
        trust: {
          status: skippedTrust.length > 0 ? "skipped" : "approved",
          pending: [],
          skipped: skippedTrust,
          running: runningSnapshotsFor(compiled),
        },
      }));
    }
    return input.unapprovedPolicy === "skip"
      ? [...trustErrors, ...errors]
      : errors;
  }, [
    allowRemoteModules,
    checkScriptTrust,
    projectPath,
    resolveScriptProvenance,
  ]);

  const handleFailure = useCallback((failure: ScriptFailure) => {
    setState((previous) => ({
      ...previous,
      failures: [...previous.failures, failure].slice(-MAX_LOG_ENTRIES),
      failureRevision: previous.failureRevision + 1,
    }));
  }, []);

  const handleLog = useCallback((entry: ScriptLogEntry) => {
    setState((previous) => ({
      ...previous,
      logs: [...previous.logs, entry].slice(-MAX_LOG_ENTRIES),
    }));
  }, []);

  useEffect(
    () => () => {
      compileGenerationRef.current += 1;
      componentRuntimeKeysRef.current.clear();
      releaseAllScriptModules();
    },
    [],
  );

  return useMemo(
    () => ({ state, compile, reset, handleFailure, handleLog }),
    [state, compile, reset, handleFailure, handleLog],
  );
}

export type ScriptRuntime = ReturnType<typeof useScriptRuntime>;

function toRunningTrustSnapshot(
  snapshot: ScriptSourceSnapshot,
): ScriptRunningTrustSnapshot {
  const {
    assetId,
    name,
    path,
    language,
    fingerprint,
    provenance,
  } = snapshot;
  return {
    assetId,
    name,
    path,
    language,
    fingerprint,
    provenance,
  };
}

function runningSnapshotsFor(
  scripts: ReadonlyMap<string, CompiledScriptEntry>,
  requiredAssetIds?: readonly string[],
): ScriptRunningTrustSnapshot[] {
  const running = [...scripts.values()].map((entry) => entry.trustSnapshot);
  return requiredAssetIds
    ? filterScriptTrustRunningByAssetIds(running, requiredAssetIds)
    : running;
}

function createComponentRuntimeKeys(
  scene: SceneDocument,
  scripts: ReadonlyMap<string, CompiledScriptEntry>,
  assetUrlVersions: ReadonlyMap<string, number>,
): Map<string, string> {
  const keys = new Map<string, string>();
  for (const scheduled of collectScheduledScripts(scene)) {
    const entity = scene.entities[scheduled.entityId];
    const component = entity?.components.find(
      (candidate) =>
        candidate.id === scheduled.componentId &&
        candidate.type === "script",
    );
    const entry = scripts.get(scheduled.scriptAssetId);
    if (!entity || !component || component.type !== "script" || !entry) {
      continue;
    }
    keys.set(
      component.id,
      JSON.stringify([
        entity.id,
        entity.name,
        scheduled.order,
        entry.cacheKey,
        component.assetReferences,
        component.entityReferences,
        [...component.assetReferences]
          .sort()
          .map((assetId) => [
            assetId,
            assetUrlVersions.get(assetId) ?? null,
          ]),
      ]),
    );
  }
  return keys;
}
