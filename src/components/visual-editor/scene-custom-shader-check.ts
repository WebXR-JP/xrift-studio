import {
  BackSide,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";
import {
  findUnresolvedXriftShaderIncludes,
  locateXriftShaderLogLines,
  readXriftShaderFinalSources,
  readXriftShaderProgramError,
  xriftCurrentMaterialProgram,
  xriftMaterialPrograms,
  xriftShaderHeaderLineCount,
  type XriftShaderMaterial,
  type XriftShaderProgramError,
  type XriftThreeProgram,
} from "../../../packages/xrift-studio-runtime/src/shader-compile-errors";
import {
  bindCustomShaderGeometryAttributes,
  type ClassicR3fMaterialShader,
  type ClassicR3fShaderVariant,
  type MaterialAsset,
} from "../../lib/visual-editor";
import {
  MAX_CUSTOM_SHADER_COMPILE_ISSUES,
  compilableCustomShader,
  customShaderSourceKey,
  type CustomShaderCompileIssue,
  type CustomShaderCompileSnapshot,
} from "../../lib/visual-editor/custom-shader-compile";

/**
 * Compiles one Material's Custom Shader in the Scene View's own renderer and
 * reports what the GLSL compiler said.
 *
 * three.js only compiles a program when a mesh is drawn with it, so a Material
 * that is not on screen - or not assigned to anything yet - has no outcome to
 * read. This builds the Material exactly as the Scene View would, compiles it
 * on a plain mesh without drawing, and reads the result back. Nothing is added
 * to the scene and nothing the scene draws is touched. The Material's own
 * meshes are then looked at too, because an instanced or skinned mesh compiles
 * a program of its own that can fail where the plain one does not.
 *
 * A variant the Scene already draws with a linked program is not compiled a
 * second time: selecting a Material that is in use costs no shader compile.
 */
export type SceneCustomShaderCheckInput = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  material: MaterialAsset;
  /** Builds the Material the Scene View draws with, for a shader of one variant. */
  createMaterial: (shader: ClassicR3fMaterialShader) => ShaderMaterial;
  /** True once the Scene View that owns the renderer has gone. */
  isCancelled: () => boolean;
  /** How long the driver may take before the result is `pending`. */
  maxWaitMs?: number;
};

const POLL_MS = 16;
const DEFAULT_MAX_WAIT_MS = 20_000;

type Probe = {
  names: string[];
  material: ShaderMaterial;
  geometry: PlaneGeometry;
  programs: XriftThreeProgram[];
  thrown?: string;
};

export async function checkCustomShaderInScene(
  input: SceneCustomShaderCheckInput,
): Promise<CustomShaderCompileSnapshot> {
  const { renderer, scene, camera, isCancelled } = input;
  const shader = compilableCustomShader(input.material);
  if (!shader) {
    return { sourceKey: "", status: "unavailable", issues: [], reason: "invalid-shader" };
  }
  const sourceKey = customShaderSourceKey(shader);
  const unavailable = (
    reason: NonNullable<CustomShaderCompileSnapshot["reason"]>,
  ): CustomShaderCompileSnapshot => ({ sourceKey, status: "unavailable", issues: [], reason });
  // Never compile from inside a frame: the caller may be a frame callback, and
  // three.js prepares a program against the render state of the moment.
  await Promise.resolve();
  if (isCancelled()) return unavailable("no-scene-view");
  const gl = renderer.getContext();
  if (gl.isContextLost()) return unavailable("context-lost");

  const unresolved = unresolvedIncludeIssue(shader);
  if (unresolved) return { sourceKey, status: "error", issues: [unresolved] };

  const drawn = findSceneUses(renderer, scene, shader);
  const probes: Probe[] = [];
  try {
    for (const group of groupVariantsByProgram(shader)) {
      if (
        drawn.some(
          (use) => drawsVariant(use.material, group.variant) && isProgramLinked(gl, use.program),
        )
      ) {
        continue;
      }
      const material = input.createMaterial({ ...shader, variants: [group.variant] });
      const geometry = new PlaneGeometry(1, 1);
      bindCustomShaderGeometryAttributes(geometry, material);
      let thrown: string | undefined;
      try {
        renderer.compile(new Mesh(geometry, material), camera, scene);
      } catch (error) {
        thrown = error instanceof Error ? error.message : String(error);
      }
      probes.push({
        names: group.names,
        material,
        geometry,
        programs: xriftMaterialPrograms(renderer, material),
        ...(thrown === undefined ? {} : { thrown }),
      });
    }

    // With KHR_parallel_shader_compile the driver compiles in the background
    // and this waits without holding a frame. Without it `isReady` is true at
    // once and the first use below blocks, exactly as the first draw would.
    const deadline = Date.now() + (input.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);
    while (probes.some((probe) => probe.programs.some((program) => !isProgramReady(program)))) {
      if (isCancelled()) return unavailable("no-scene-view");
      if (gl.isContextLost()) return unavailable("context-lost");
      if (Date.now() >= deadline) return { sourceKey, status: "pending", issues: [] };
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    if (isCancelled()) return unavailable("no-scene-view");
    if (gl.isContextLost()) return unavailable("context-lost");

    const issues = new Map<object, CustomShaderCompileIssue>();
    for (const probe of probes) {
      if (probe.thrown !== undefined) {
        issues.set(probe, {
          origin: "check",
          variants: probe.names,
          programLog: probe.thrown,
          vertexLog: "",
          fragmentLog: "",
          lines: [],
        });
        continue;
      }
      for (const program of probe.programs) {
        const error = readProbeError(renderer, program, probe.material);
        if (error && !issues.has(program)) {
          issues.set(program, { origin: "check", variants: probe.names, ...error });
        }
      }
    }
    collectSceneIssues(renderer, shader, drawn, issues);
    const list = [...issues.values()].slice(0, MAX_CUSTOM_SHADER_COMPILE_ISSUES);
    return { sourceKey, status: list.length > 0 ? "error" : "ok", issues: list };
  } finally {
    for (const probe of probes) {
      probe.material.dispose();
      probe.geometry.dispose();
    }
  }
}

/** three.js throws on an `#include` it does not know, so that is found before compiling. */
function unresolvedIncludeIssue(
  shader: ClassicR3fMaterialShader,
): CustomShaderCompileIssue | undefined {
  const lines = (["vertex", "fragment"] as const).flatMap((stage) =>
    findUnresolvedXriftShaderIncludes(
      stage === "vertex" ? shader.vertexShader : shader.fragmentShader,
    ).map((entry) => ({
      stage,
      severity: "error" as const,
      reportedLine: entry.line,
      line: entry.line,
      message: `Can not resolve #include <${entry.include}>`,
      source: `#include <${entry.include}>`,
    })),
  );
  if (lines.length === 0) return undefined;
  return {
    origin: "check",
    variants: shader.variants.map((variant) => variant.name),
    programLog: lines[0]!.message,
    vertexLog: "",
    fragmentLog: "",
    lines,
  };
}

/** Variants that lead to the same program are compiled once. */
function groupVariantsByProgram(
  shader: ClassicR3fMaterialShader,
): Array<{ variant: ClassicR3fShaderVariant; names: string[] }> {
  const groups = new Map<string, { variant: ClassicR3fShaderVariant; names: string[] }>();
  for (const variant of shader.variants) {
    const key = `${definesKey(variant.defines)}\n${variant.side}\n${variant.transparent}`;
    const group = groups.get(key);
    if (group) group.names.push(variant.name);
    else groups.set(key, { variant, names: [variant.name] });
  }
  return [...groups.values()];
}

function definesKey(defines: Readonly<Record<string, unknown>> | undefined): string {
  return JSON.stringify(
    Object.entries(defines ?? {})
      .map(([name, value]) => [name, String(value)] as const)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
}

function isProgramReady(program: XriftThreeProgram): boolean {
  return typeof program.isReady !== "function" || Boolean(program.isReady());
}

/**
 * Lets three.js check a compiled program, the way its first draw would, and
 * reads what it found.
 */
function readProbeError(
  renderer: WebGLRenderer,
  program: XriftThreeProgram,
  material: ShaderMaterial,
): XriftShaderProgramError | null {
  const finalSources = readXriftShaderFinalSources(renderer, program);
  const debug = renderer.debug;
  const report = debug.onShaderError;
  // three.js prints a failure to the console unless something takes the
  // report. The outcome is read from the program instead, so this compile,
  // which nothing is drawn with, stays out of the console.
  debug.onShaderError = () => {};
  try {
    program.getUniforms?.();
  } finally {
    debug.onShaderError = report;
  }
  const recorded = readXriftShaderProgramError(program, material, finalSources);
  if (recorded || program.diagnostics) return recorded;
  // Nothing recorded: either the program linked, or the renderer was told not
  // to check. Ask the driver itself, so "no record" is never read as success.
  const gl = renderer.getContext();
  const handle = program.program as WebGLProgram | undefined;
  if (!handle || gl.getProgramParameter(handle, gl.LINK_STATUS) !== false) return null;
  const log = (shader: unknown): string => {
    try {
      return shader && gl.isShader(shader as WebGLShader)
        ? (gl.getShaderInfoLog(shader as WebGLShader) ?? "").trim()
        : "";
    } catch {
      return "";
    }
  };
  const vertexLog = log(program.vertexShader);
  const fragmentLog = log(program.fragmentShader);
  const headerLineCount = xriftShaderHeaderLineCount(material);
  return {
    programLog: (gl.getProgramInfoLog(handle) ?? "").trim(),
    vertexLog,
    fragmentLog,
    lines: [
      ...locateXriftShaderLogLines({
        stage: "vertex",
        log: vertexLog,
        source: material.vertexShader,
        headerLineCount,
        finalSource: finalSources.vertexShader,
      }),
      ...locateXriftShaderLogLines({
        stage: "fragment",
        log: fragmentLog,
        source: material.fragmentShader,
        headerLineCount,
        finalSource: finalSources.fragmentShader,
      }),
    ],
  };
}

type SceneUse = {
  object: Object3D;
  material: XriftShaderMaterial;
  program: XriftThreeProgram;
};

/**
 * The meshes the Scene View draws with this GLSL, with the program each uses.
 *
 * A mesh is matched by its GLSL rather than by a tag on its Material: every way
 * the Scene View builds a Custom Shader Material hands it the author's source
 * unchanged, and two Materials with the same source fail the same way.
 */
function findSceneUses(
  renderer: WebGLRenderer,
  scene: Object3D,
  shader: ClassicR3fMaterialShader,
): SceneUse[] {
  const uses: SceneUse[] = [];
  const visited = new Set<Material>();
  scene.traverse((object) => {
    const assigned = (object as { material?: Material | Material[] }).material;
    if (!assigned) return;
    for (const material of Array.isArray(assigned) ? assigned : [assigned]) {
      const candidate = material as XriftShaderMaterial;
      if (
        !candidate.isShaderMaterial ||
        candidate.vertexShader !== shader.vertexShader ||
        candidate.fragmentShader !== shader.fragmentShader ||
        visited.has(material)
      ) {
        continue;
      }
      visited.add(material);
      const program = xriftCurrentMaterialProgram(renderer, material);
      if (program) uses.push({ object, material: candidate, program });
    }
  });
  return uses;
}

function drawsVariant(material: XriftShaderMaterial, variant: ClassicR3fShaderVariant): boolean {
  const side =
    material.side === BackSide ? "back" : material.side === DoubleSide ? "double" : "front";
  return (
    side === variant.side &&
    material.transparent === variant.transparent &&
    definesKey(material.defines) === definesKey(variant.defines)
  );
}

/** True when the driver has finished the program and it can draw. */
function isProgramLinked(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  program: XriftThreeProgram,
): boolean {
  const handle = program.program as WebGLProgram | undefined;
  return (
    handle !== undefined &&
    isProgramReady(program) &&
    program.diagnostics?.runnable !== false &&
    gl.getProgramParameter(handle, gl.LINK_STATUS) === true
  );
}

/**
 * Identifies the programs the Scene draws this GLSL with, when every one of
 * them links; null when no mesh uses it or one of them has failed.
 *
 * A recorded failure can stop being true without the GLSL changing: turning the
 * Scene's Fog off, for one, makes three.js build a different program for the
 * same Material. When this returns a value the record no longer matches what
 * is on screen, and the value changes whenever the Scene moves to other
 * programs, so one stale record is looked at again once and not on every frame.
 */
export function linkedSceneProgramsFor(
  renderer: WebGLRenderer,
  scene: Object3D,
  shader: ClassicR3fMaterialShader,
): string | null {
  const uses = findSceneUses(renderer, scene, shader);
  if (uses.length === 0) return null;
  const gl = renderer.getContext();
  const ids: number[] = [];
  for (const use of uses) {
    if (!isProgramLinked(gl, use.program)) return null;
    ids.push((use.program as { id?: number }).id ?? -1);
  }
  return ids.sort((left, right) => left - right).join(",");
}

/** Adds the failed programs of the meshes the Scene View draws with this GLSL. */
function collectSceneIssues(
  renderer: WebGLRenderer,
  shader: ClassicR3fMaterialShader,
  drawn: readonly SceneUse[],
  issues: Map<object, CustomShaderCompileIssue>,
): void {
  for (const use of drawn) {
    const mesh = use.object as { isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
    const known = issues.get(use.program);
    if (known) {
      // The program compiled above is the one this mesh is drawn with.
      known.origin = "scene";
      if (mesh.isInstancedMesh) known.instanced = true;
      if (mesh.isSkinnedMesh) known.skinned = true;
      continue;
    }
    const error = readXriftShaderProgramError(
      use.program,
      use.material,
      readXriftShaderFinalSources(renderer, use.program),
    );
    if (!error) continue;
    const defines = definesKey(use.material.defines);
    issues.set(use.program, {
      origin: "scene",
      variants: shader.variants
        .filter((variant) => definesKey(variant.defines) === defines)
        .map((variant) => variant.name),
      ...(mesh.isInstancedMesh ? { instanced: true as const } : {}),
      ...(mesh.isSkinnedMesh ? { skinned: true as const } : {}),
      ...error,
    });
  }
}
