import {
  xriftShaderSourceKey,
  type XriftShaderLogLine,
  type XriftShaderStage,
} from "../../../packages/xrift-studio-runtime/src/shader-compile-errors";
import type { AssetManifest, MaterialAsset } from "./asset-manifest";
import {
  validateClassicR3fMaterialShader,
  type ClassicR3fMaterialShader,
} from "./custom-shader-contract";

/**
 * Whether a Material's Custom Shader compiles, as the Scene View found it.
 *
 * The GLSL an author or an AI client writes is only compiled by the renderer,
 * and a program that fails draws nothing. The Scene View compiles each Custom
 * Shader it is asked about and records the outcome here; the Inspector, the
 * GLSL editor and the MCP tools read it from here. Nothing in this module
 * touches WebGL, so the tools and their fixtures can use it without a renderer.
 *
 * A result belongs to the GLSL it was compiled from. As soon as the Material's
 * shader changes the result no longer applies and reads as unknown, which is
 * how a message clears without anything having to notice the fix.
 */

/** One program that failed to compile or link. JSON-safe. */
export type CustomShaderCompileIssue = {
  /**
   * `check`: the Material compiled on a plain mesh when asked.
   * `scene`: a program a mesh in the Scene View is drawn with.
   */
  origin: "check" | "scene";
  /** Names of the variants whose defines the program was built with. */
  variants: string[];
  /** The mesh is instanced, so its program differs from a plain mesh's. */
  instanced?: true;
  /** The mesh is skinned, so its program differs from a plain mesh's. */
  skinned?: true;
  /** The GLSL compiler's own text. */
  programLog: string;
  vertexLog: string;
  fragmentLog: string;
  lines: XriftShaderLogLine[];
};

export type CustomShaderCompileSnapshot = {
  /** Identifies the GLSL and variants the result was compiled from. */
  sourceKey: string;
  /**
   * `pending`: the driver had not finished when the wait ended.
   * `unavailable`: nothing could compile it.
   */
  status: "ok" | "error" | "pending" | "unavailable";
  issues: CustomShaderCompileIssue[];
  /** Why there is no result, for `unavailable`. */
  reason?: "no-scene-view" | "context-lost" | "invalid-shader";
};

/** What a reader sees: a snapshot that still applies, or `unknown`. */
export type CustomShaderCompileState = {
  status: "ok" | "error" | "pending" | "unknown";
  issues: CustomShaderCompileIssue[];
  reason?: CustomShaderCompileSnapshot["reason"] | "not-checked";
};

export type CustomShaderCompileSnapshots = Readonly<
  Record<string, CustomShaderCompileSnapshot>
>;

/** Compiles one Material's Custom Shader and resolves once the outcome is known. */
export type CustomShaderCompileChecker = (
  material: MaterialAsset,
) => Promise<CustomShaderCompileSnapshot>;

export const MAX_CUSTOM_SHADER_COMPILE_ISSUES = 8;

/**
 * How long an MCP tool waits for the driver before it answers `pending`.
 *
 * A shader normally compiles in well under a second. The wait only has to be
 * long enough that a client rarely needs a second call, and short enough that a
 * pathological shader never looks like a tool that hung.
 */
export const MCP_CUSTOM_SHADER_COMPILE_WAIT_MS = 5_000;

/**
 * How long an MCP tool waits for a Scene View to appear at all.
 *
 * A client often writes a shader straight after opening a project, while the
 * Editor is still mounting its Scene View. Waiting this long turns that race
 * into a result; an Editor that never shows a Scene View costs the tool no more
 * than this.
 */
export const MCP_SCENE_VIEW_WAIT_MS = 3_000;

const NO_SNAPSHOTS: CustomShaderCompileSnapshots = Object.freeze({});
const NO_ISSUES: CustomShaderCompileIssue[] = [];

/**
 * Identifies what a compile result depends on: both GLSL sources and the
 * variants. Uniform values are left out, so dragging a slider keeps the result.
 */
export function customShaderSourceKey(shader: ClassicR3fMaterialShader): string {
  // A shader that is still being typed in may not be well formed yet.
  const text = (value: unknown): string => (typeof value === "string" ? value : "");
  return `${xriftShaderSourceKey(text(shader.vertexShader), text(shader.fragmentShader))}-${xriftShaderSourceKey(JSON.stringify(shader.variants ?? null), "")}`;
}

/** The Custom Shader of a Material, when it has one the renderer can be given. */
export function compilableCustomShader(
  material: MaterialAsset | undefined,
): ClassicR3fMaterialShader | undefined {
  const shader = material?.shader;
  if (shader?.kind !== "classic-r3f") return undefined;
  return validateClassicR3fMaterialShader(shader).length === 0 ? shader : undefined;
}

/**
 * The Materials whose Custom Shader has the same GLSL as one of `sources`.
 *
 * This is how a program the Scene View failed to draw with is tied to the
 * Material Assets it belongs to: the renderer keeps one program per distinct
 * source, so every Material with that source has failed, not only the one whose
 * mesh happened to be drawn first.
 */
export function findCustomShaderMaterialsBySource(
  assets: AssetManifest,
  sources: ReadonlyArray<{ vertexShader?: unknown; fragmentShader?: unknown }>,
): MaterialAsset[] {
  if (sources.length === 0) return [];
  const found: MaterialAsset[] = [];
  for (const asset of Object.values(assets.assets)) {
    if (asset.kind !== "material" || asset.shader?.kind !== "classic-r3f") continue;
    const shader = asset.shader;
    if (
      sources.some(
        (source) =>
          source.vertexShader === shader.vertexShader &&
          source.fragmentShader === shader.fragmentShader,
      )
    ) {
      found.push(asset);
    }
  }
  return found;
}

/** Applies a stored result to the shader a Material has now. */
export function resolveCustomShaderCompile(
  snapshot: CustomShaderCompileSnapshot | undefined,
  shader: ClassicR3fMaterialShader,
  /** The shader's key, when the caller already has it and need not hash the GLSL again. */
  sourceKey: string = snapshot ? customShaderSourceKey(shader) : "",
): CustomShaderCompileState {
  if (!snapshot || snapshot.sourceKey !== sourceKey) {
    return { status: "unknown", issues: NO_ISSUES, reason: "not-checked" };
  }
  if (snapshot.status === "unavailable") {
    return { status: "unknown", issues: NO_ISSUES, reason: snapshot.reason };
  }
  return { status: snapshot.status, issues: snapshot.issues };
}

/** The compile result an MCP tool returns, with what to do about it. */
export function describeCustomShaderCompileForMcp(
  state: CustomShaderCompileState,
): Record<string, unknown> {
  const base = { status: state.status, renderer: "scene-view" as const };
  if (state.status === "ok") {
    return {
      ...base,
      issues: [],
      nextStep:
        "Every variant compiled and linked on a plain mesh in the Scene View. A mesh that needs its own program (instanced, skinned) is compiled when it is drawn; get_editor_context.customShaderErrors lists a failure there.",
    };
  }
  if (state.status === "error") {
    return {
      ...base,
      issues: state.issues,
      nextStep:
        "The Material is saved but draws nothing until this is fixed. Correct the GLSL at lines[].line (your own source; reportedLine is the number in the raw log) and send it with update_custom_shader, whose result reports the new outcome.",
    };
  }
  if (state.status === "pending") {
    return {
      ...base,
      issues: [],
      nextStep:
        "The graphics driver was still compiling when the wait ended. Call get_custom_shader again for the outcome.",
    };
  }
  return {
    ...base,
    issues: [],
    reason: state.reason ?? "not-checked",
    nextStep:
      state.reason === "context-lost"
        ? "The Scene View lost its WebGL context, so nothing was compiled. Call get_custom_shader again once the Scene View draws."
        : state.reason === "invalid-shader"
          ? "The shader does not pass validation, so it was not compiled. Read the validation message and send a corrected shader."
          : "No Scene View was available to compile it. Call get_custom_shader while the Editor shows the Scene View.",
  };
}

export type CustomShaderCompileErrorSummary = {
  materialAssetId: string;
  materialName: string;
  issueCount: number;
  /** The first compiler message, enough to recognise the problem. */
  message: string;
};

/** The first message a person would act on. */
export function firstCustomShaderCompileMessage(
  issues: readonly CustomShaderCompileIssue[],
): string {
  for (const issue of issues) {
    const line = issue.lines.find((entry) => entry.severity === "error");
    if (line) {
      const stage = line.stage === "vertex" ? "vertex" : "fragment";
      return line.line === undefined
        ? `${stage}: ${line.message}`
        : `${stage}:${line.line}: ${line.message}`;
    }
  }
  for (const issue of issues) {
    const log = [issue.programLog, issue.vertexLog, issue.fragmentLog].find(
      (entry) => entry.trim().length > 0,
    );
    if (log) return log.trim().split(/\r\n|\r|\n/)[0] ?? "";
  }
  return "";
}

/** Materials whose current Custom Shader is known not to compile. */
export function listCustomShaderCompileErrors(
  assets: AssetManifest,
  snapshots: CustomShaderCompileSnapshots | undefined,
  limit = 20,
): CustomShaderCompileErrorSummary[] {
  const errors: CustomShaderCompileErrorSummary[] = [];
  if (!snapshots) return errors;
  for (const [assetId, snapshot] of Object.entries(snapshots)) {
    if (errors.length >= limit) break;
    if (snapshot.status !== "error") continue;
    const asset = assets.assets[assetId];
    if (asset?.kind !== "material" || asset.shader?.kind !== "classic-r3f") continue;
    if (snapshot.sourceKey !== customShaderSourceKey(asset.shader)) continue;
    errors.push({
      materialAssetId: asset.id,
      materialName: asset.name,
      issueCount: snapshot.issues.length,
      message: firstCustomShaderCompileMessage(snapshot.issues),
    });
  }
  return errors.sort((left, right) => left.materialName.localeCompare(right.materialName));
}

export type CustomShaderCompileLine = XriftShaderLogLine & {
  /** Variant names, present when the shader has more than one variant. */
  variants?: string[];
  origin: CustomShaderCompileIssue["origin"];
};

/**
 * The distinct messages of a result, in the order a reader fixes them.
 *
 * Several programs of one Material usually fail on the same line, and repeating
 * it once per program tells the author nothing.
 */
export function collectCustomShaderCompileLines(
  issues: readonly CustomShaderCompileIssue[],
  options: { stage?: XriftShaderStage; nameVariants?: boolean } = {},
): CustomShaderCompileLine[] {
  const seen = new Set<string>();
  const lines: CustomShaderCompileLine[] = [];
  for (const issue of issues) {
    for (const line of issue.lines) {
      if (line.severity !== "error") continue;
      if (options.stage && line.stage !== options.stage) continue;
      const variants = options.nameVariants ? issue.variants : undefined;
      const key = `${line.stage}\n${line.line ?? `r${line.reportedLine}`}\n${line.message}\n${variants?.join(",") ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push({ ...line, origin: issue.origin, ...(variants ? { variants } : {}) });
    }
  }
  return lines;
}

/** Program logs of failures that name no line: the two stages do not fit together. */
export function collectCustomShaderLinkMessages(
  issues: readonly CustomShaderCompileIssue[],
): string[] {
  const messages = new Set<string>();
  for (const issue of issues) {
    if (issue.lines.some((line) => line.severity === "error")) continue;
    const log = [issue.programLog, issue.vertexLog, issue.fragmentLog]
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    if (log) messages.add(log);
  }
  return [...messages];
}

export type CustomShaderCompileStore = ReturnType<typeof createCustomShaderCompileStore>;

/**
 * Holds the latest result per Material and hands compile requests to whichever
 * Scene View is showing.
 */
export function createCustomShaderCompileStore() {
  let snapshots: CustomShaderCompileSnapshots = NO_SNAPSHOTS;
  let checker: CustomShaderCompileChecker | null = null;
  const listeners = new Set<() => void>();
  /** One compile per Material and source at a time; later callers join it. */
  const flights = new Map<string, Promise<CustomShaderCompileSnapshot>>();
  /** The newest request per Material; an older one finishing late is dropped. */
  const newest = new Map<string, string>();

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const record = (assetId: string, snapshot: CustomShaderCompileSnapshot) => {
    snapshots = { ...snapshots, [assetId]: snapshot };
    notify();
  };

  const unavailable = (
    sourceKey: string,
    reason: NonNullable<CustomShaderCompileSnapshot["reason"]>,
  ): CustomShaderCompileSnapshot => ({ sourceKey, status: "unavailable", issues: [], reason });

  const check = (
    material: MaterialAsset,
    options: { waitMs?: number } = {},
  ): Promise<CustomShaderCompileSnapshot> => {
    if (material.shader?.kind !== "classic-r3f") {
      return Promise.resolve(unavailable("", "invalid-shader"));
    }
    const sourceKey = customShaderSourceKey(material.shader);
    if (!compilableCustomShader(material)) {
      return Promise.resolve(unavailable(sourceKey, "invalid-shader"));
    }
    const active = checker;
    if (!active) return Promise.resolve(unavailable(sourceKey, "no-scene-view"));
    const flightKey = `${material.id}\n${sourceKey}`;
    // The Material's shader is this one now, whichever compile started last.
    newest.set(material.id, flightKey);
    const joined = flights.get(flightKey);
    const flight: Promise<CustomShaderCompileSnapshot> =
      joined ??
      active(material)
        .catch(() => unavailable(sourceKey, "no-scene-view"))
        .then((snapshot) => {
          if (flights.get(flightKey) === flight) flights.delete(flightKey);
          // A result from a Scene View that has gone, or for GLSL that was
          // replaced while it compiled, describes nothing a reader can see.
          if (checker === active && newest.get(material.id) === flightKey) {
            newest.delete(material.id);
            if (snapshot.status !== "unavailable") record(material.id, snapshot);
          }
          return snapshot;
        });
    if (!joined) flights.set(flightKey, flight);
    const waitMs = options.waitMs;
    if (waitMs === undefined) return flight;
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => resolve({ sourceKey, status: "pending", issues: [] }),
        waitMs,
      );
      void flight.then((snapshot) => {
        clearTimeout(timer);
        resolve(snapshot);
      });
    });
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The same object until a result changes, so it can back a React store. */
    getSnapshots: (): CustomShaderCompileSnapshots => snapshots,
    get: (assetId: string): CustomShaderCompileSnapshot | undefined => snapshots[assetId],
    hasChecker: (): boolean => checker !== null,
    /** Resolves true once a Scene View can compile, or false after `timeoutMs`. */
    whenCheckerReady(timeoutMs: number): Promise<boolean> {
      if (checker) return Promise.resolve(true);
      return new Promise((resolve) => {
        const finish = (ready: boolean) => {
          clearTimeout(timer);
          listeners.delete(listener);
          resolve(ready);
        };
        const listener = () => {
          if (checker) finish(true);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        listeners.add(listener);
      });
    },
    record,
    /**
     * Makes `next` the Scene View that compiles. Returns a release that also
     * drops every result, because they described that renderer.
     */
    setChecker(next: CustomShaderCompileChecker): () => void {
      const reset = () => {
        flights.clear();
        newest.clear();
        snapshots = NO_SNAPSHOTS;
      };
      if (checker && checker !== next) reset();
      checker = next;
      notify();
      return () => {
        if (checker !== next) return;
        checker = null;
        reset();
        notify();
      };
    },
    /**
     * Compiles a Material now. With `waitMs` the caller gets `pending` when the
     * driver is slower than that; the compile carries on and its result is
     * recorded when it arrives.
     */
    check,
    /** Asks for a result to exist, without waiting for it. */
    request(material: MaterialAsset): void {
      const shader = compilableCustomShader(material);
      if (!shader || !checker) return;
      const known = snapshots[material.id];
      // A shader that compiled keeps compiling. A failure is looked at again,
      // since the author may have changed what it depended on in the Scene.
      if (known?.status === "ok" && known.sourceKey === customShaderSourceKey(shader)) return;
      void check(material);
    },
  };
}

/** The results of the Scene View of the open Editor. */
export const customShaderCompileStore = createCustomShaderCompileStore();

export type CheckedCustomShader = {
  materialAssetId: string;
  snapshot: CustomShaderCompileSnapshot;
  /** The `compile` field of an MCP tool result. */
  compile: Record<string, unknown>;
};

/**
 * Compiles a Material's Custom Shader for an MCP tool and describes the outcome.
 *
 * Returns null when the id does not name a Material with a Custom Shader; the
 * tool itself reports that. It never rejects, and it waits no longer than
 * `sceneViewWaitMs` for a Scene View plus `waitMs` for the driver, so a tool
 * that calls it cannot hang on a Material nothing draws.
 */
export async function checkCustomShaderForMcp(
  assets: AssetManifest,
  materialAssetId: unknown,
  options: { store?: CustomShaderCompileStore; waitMs?: number; sceneViewWaitMs?: number } = {},
): Promise<CheckedCustomShader | null> {
  if (typeof materialAssetId !== "string") return null;
  const material = assets.assets[materialAssetId];
  if (material?.kind !== "material" || material.shader?.kind !== "classic-r3f") return null;
  const store = options.store ?? customShaderCompileStore;
  if (!store.hasChecker() && compilableCustomShader(material)) {
    await store.whenCheckerReady(options.sceneViewWaitMs ?? MCP_SCENE_VIEW_WAIT_MS);
  }
  const snapshot = await store.check(material, {
    waitMs: options.waitMs ?? MCP_CUSTOM_SHADER_COMPILE_WAIT_MS,
  });
  return {
    materialAssetId,
    snapshot,
    compile: describeCustomShaderCompileForMcp(
      resolveCustomShaderCompile(snapshot, material.shader),
    ),
  };
}
