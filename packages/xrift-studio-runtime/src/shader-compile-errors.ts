import {
  ShaderChunk,
  type Material,
  type Object3D,
  type WebGLRenderer,
} from "three";

/**
 * Reads why a shader program failed to compile or link.
 *
 * three.js compiles a Material's program the first time it draws with it. When
 * the GLSL is wrong the program is unusable, the mesh is not drawn, and the only
 * trace is a console message. three.js does keep what the compiler said on the
 * program it created (`diagnostics`), together with the source it put in front
 * of the author's own, so nothing has to be intercepted to read it back: the
 * editor asks for it to show the author, and a published world asks for it to
 * name the Material in the console. Both go through this module.
 *
 * Line numbers in a GLSL log count that prefix and every expanded `#include`.
 * `locateXriftShaderLogLines` maps them back to the author's own source and
 * leaves the line out whenever the mapping is not certain.
 */

export type XriftShaderStage = "vertex" | "fragment";

/** One message of a GLSL info log. */
export type XriftShaderLogLine = {
  stage: XriftShaderStage;
  severity: "error" | "warning";
  /** The line as the compiler printed it: the three.js prefix is counted. */
  reportedLine: number;
  /** 1-based line of the author's own GLSL. Absent when it is not certain. */
  line?: number;
  /** The author's line is this `#include`, and the message is about its expansion. */
  include?: string;
  message: string;
  /** The source line the message is about, trimmed. */
  source?: string;
};

/** What the GLSL compiler said about one program. JSON-safe. */
export type XriftShaderProgramError = {
  programLog: string;
  vertexLog: string;
  fragmentLog: string;
  lines: XriftShaderLogLine[];
};

/** The parts of three.js's program wrapper (`WebGLProgram`) read here. */
export type XriftThreeProgram = {
  name?: string;
  /** The GL program. three.js clears it when it destroys the program. */
  program?: unknown;
  vertexShader?: unknown;
  fragmentShader?: unknown;
  isReady?: () => unknown;
  getUniforms?: () => unknown;
  diagnostics?: {
    runnable?: boolean;
    programLog?: string;
    vertexShader?: { log?: string; prefix?: string };
    fragmentShader?: { log?: string; prefix?: string };
  };
};

export type XriftShaderMaterial = Material & {
  isShaderMaterial?: boolean;
  isRawShaderMaterial?: boolean;
  vertexShader?: unknown;
  fragmentShader?: unknown;
  glslVersion?: unknown;
  defines?: Record<string, unknown>;
};

type ShaderChunks = Readonly<Record<string, string | undefined>>;

const NEWLINE = /\r\n|\r|\n/;
const NEWLINES = /\r\n|\r|\n/g;
const INCLUDE = /^[ \t]*#include +<([\w\d./]+)>/;
const INCLUDES = /^[ \t]*#include +<([\w\d./]+)>/gm;
const LOG_LINE = /^(ERROR|WARNING): \d+:(\d+): ?(.*)$/gm;
const MAX_LOG_LINES = 20;
const MAX_LOG_LENGTH = 4_000;
const MAX_SOURCE_LINE_LENGTH = 200;

/**
 * Identifies a vertex and fragment source pair.
 *
 * Two Materials with the same GLSL share one program in three.js, so this is
 * also how a failed program is matched back to the Materials it belongs to
 * without keeping their sources around.
 */
export function xriftShaderSourceKey(
  vertexShader: string,
  fragmentShader: string,
): string {
  return `${hashText(vertexShader)}-${hashText(fragmentShader)}`;
}

/** Length plus two FNV-1a passes: enough that two different shaders never meet in practice. */
function hashText(text: string): string {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b) + index;
  }
  return `${text.length.toString(36)}.${(first >>> 0).toString(36)}.${(second >>> 0).toString(36)}`;
}

/** Lines three.js writes before its own prefix: the `#version` line. */
export function xriftShaderHeaderLineCount(material: XriftShaderMaterial): number {
  if (material.isRawShaderMaterial) return material.glslVersion ? 1 : 0;
  return 1;
}

/** `#include <name>` lines three.js cannot resolve; it throws instead of compiling. */
export function findUnresolvedXriftShaderIncludes(
  source: string,
  chunks: ShaderChunks = ShaderChunk,
): Array<{ line: number; include: string }> {
  const unresolved: Array<{ line: number; include: string }> = [];
  source.split(NEWLINE).forEach((text, index) => {
    const name = INCLUDE.exec(text)?.[1];
    if (name && expandChunk(name, chunks, 0) === undefined) {
      unresolved.push({ line: index + 1, include: name });
    }
  });
  return unresolved;
}

function expandChunk(
  name: string,
  chunks: ShaderChunks,
  depth: number,
): string | undefined {
  const chunk = chunks[name];
  if (typeof chunk !== "string" || depth > 16) return undefined;
  let resolved = true;
  const expanded = chunk.replace(INCLUDES, (_match, inner: string) => {
    const text = expandChunk(inner, chunks, depth + 1);
    if (text === undefined) resolved = false;
    return text ?? "";
  });
  return resolved ? expanded : undefined;
}

type LineOrigin = { line: number; include?: string };

/**
 * Which author line each line of the source three.js compiles came from.
 *
 * three.js replaces every `#include` with the chunk's text, so the lines after
 * one move down by the chunk's length. Past the first thing whose length cannot
 * be known from the source alone, the origins stop: a `#line` directive, a loop
 * three.js unrolls, or an include it cannot resolve.
 */
function expandedLineOrigins(source: string, chunks: ShaderChunks): LineOrigin[] {
  const origins: LineOrigin[] = [];
  const lines = source.split(NEWLINE);
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] ?? "";
    if (/^\s*#\s*line\b/.test(text) || text.includes("#pragma unroll_loop_start")) break;
    const name = INCLUDE.exec(text)?.[1];
    if (!name) {
      origins.push({ line: index + 1 });
      continue;
    }
    const expanded = expandChunk(name, chunks, 0);
    if (expanded === undefined || expanded.includes("#pragma unroll_loop_start")) break;
    const count = expanded.split(NEWLINE).length;
    for (let line = 0; line < count; line += 1) {
      origins.push({ line: index + 1, include: name });
    }
  }
  return origins;
}

function countNewlines(text: string): number {
  return text.match(NEWLINES)?.length ?? 0;
}

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * Parses a GLSL info log and maps each message to the author's source.
 *
 * `finalSource` is the text the compiler actually received. When it is given, a
 * line is only reported if that text agrees with the author's line, so a wrong
 * number is never shown as a certain one.
 */
export function locateXriftShaderLogLines(input: {
  stage: XriftShaderStage;
  log: string;
  /** The source three.js put in front, as recorded on the program. */
  prefix?: string;
  /** The author's own GLSL for this stage. */
  source: string;
  headerLineCount: number;
  finalSource?: string;
  chunks?: ShaderChunks;
}): XriftShaderLogLine[] {
  const result: XriftShaderLogLine[] = [];
  const sourceLines = input.source.split(NEWLINE);
  const finalLines = input.finalSource?.split(NEWLINE);
  const origins =
    input.prefix === undefined
      ? []
      : expandedLineOrigins(input.source, input.chunks ?? ShaderChunk);
  const offset = input.headerLineCount + countNewlines(input.prefix ?? "");
  for (const match of input.log.matchAll(LOG_LINE)) {
    if (result.length >= MAX_LOG_LINES) break;
    const reportedLine = Number(match[2]);
    const entry: XriftShaderLogLine = {
      stage: input.stage,
      severity: match[1] === "WARNING" ? "warning" : "error",
      reportedLine,
      message: (match[3] ?? "").trim(),
    };
    const finalText = finalLines?.[reportedLine - 1];
    const origin = origins[reportedLine - offset - 1];
    if (origin) {
      const authorText = sourceLines[origin.line - 1] ?? "";
      if (origin.include) {
        entry.line = origin.line;
        entry.include = origin.include;
        entry.source = clip((finalText ?? authorText).trim(), MAX_SOURCE_LINE_LENGTH);
      } else if (finalText === undefined || finalText.trim() === authorText.trim()) {
        entry.line = origin.line;
        entry.source = clip(authorText.trim(), MAX_SOURCE_LINE_LENGTH);
      }
    }
    if (entry.source === undefined && finalText !== undefined) {
      entry.source = clip(finalText.trim(), MAX_SOURCE_LINE_LENGTH);
    }
    result.push(entry);
  }
  return result;
}

type MaterialPrograms = {
  programs?: Map<string, XriftThreeProgram>;
  currentProgram?: XriftThreeProgram;
};

/** What three.js keeps for a Material it has drawn, without creating it for one it has not. */
function materialPrograms(
  renderer: WebGLRenderer,
  material: Material,
): MaterialPrograms | undefined {
  const properties = renderer.properties;
  if (!properties.has(material)) return undefined;
  return properties.get(material) as MaterialPrograms;
}

/** Every program three.js holds for a Material. */
export function xriftMaterialPrograms(
  renderer: WebGLRenderer,
  material: Material,
): XriftThreeProgram[] {
  const held = materialPrograms(renderer, material);
  if (!held) return [];
  const programs = [...(held.programs?.values() ?? [])];
  if (held.currentProgram && !programs.includes(held.currentProgram)) {
    programs.push(held.currentProgram);
  }
  return programs;
}

/** The program a Material is drawn with now. */
export function xriftCurrentMaterialProgram(
  renderer: WebGLRenderer,
  material: Material,
): XriftThreeProgram | undefined {
  return materialPrograms(renderer, material)?.currentProgram;
}

/** True once three.js has recorded that the program cannot run. */
export function isFailedXriftShaderProgram(program: XriftThreeProgram): boolean {
  return program.diagnostics?.runnable === false;
}

/**
 * The text the compiler received for both stages, when the browser still has it.
 *
 * three.js deletes the shader objects after linking. A browser keeps them while
 * the program lives, but that is not promised, so nothing depends on this.
 */
export function readXriftShaderFinalSources(
  renderer: WebGLRenderer,
  program: XriftThreeProgram,
): { vertexShader?: string; fragmentShader?: string } {
  const gl = renderer.getContext();
  const read = (shader: unknown): string | undefined => {
    try {
      if (!shader || !gl.isShader(shader as WebGLShader)) return undefined;
      return gl.getShaderSource(shader as WebGLShader) ?? undefined;
    } catch {
      return undefined;
    }
  };
  return {
    vertexShader: read(program.vertexShader),
    fragmentShader: read(program.fragmentShader),
  };
}

/**
 * What the compiler said about a program that failed, or null for one that runs.
 *
 * `material` supplies the author's GLSL; it is the Material the program was
 * built for.
 */
export function readXriftShaderProgramError(
  program: XriftThreeProgram,
  material: XriftShaderMaterial,
  finalSources: { vertexShader?: string; fragmentShader?: string } = {},
  chunks: ShaderChunks = ShaderChunk,
): XriftShaderProgramError | null {
  const diagnostics = program.diagnostics;
  if (!diagnostics || diagnostics.runnable !== false) return null;
  const headerLineCount = xriftShaderHeaderLineCount(material);
  const vertexLog = diagnostics.vertexShader?.log ?? "";
  const fragmentLog = diagnostics.fragmentShader?.log ?? "";
  const lines = [
    ...locateXriftShaderLogLines({
      stage: "vertex",
      log: vertexLog,
      prefix: diagnostics.vertexShader?.prefix,
      source: typeof material.vertexShader === "string" ? material.vertexShader : "",
      headerLineCount,
      finalSource: finalSources.vertexShader,
      chunks,
    }),
    ...locateXriftShaderLogLines({
      stage: "fragment",
      log: fragmentLog,
      prefix: diagnostics.fragmentShader?.prefix,
      source: typeof material.fragmentShader === "string" ? material.fragmentShader : "",
      headerLineCount,
      finalSource: finalSources.fragmentShader,
      chunks,
    }),
  ];
  return {
    programLog: clip(diagnostics.programLog ?? "", MAX_LOG_LENGTH),
    vertexLog: clip(vertexLog, MAX_LOG_LENGTH),
    fragmentLog: clip(fragmentLog, MAX_LOG_LENGTH),
    lines,
  };
}

/**
 * Failed programs that have not been returned before.
 *
 * `seen` remembers them, so calling this on a timer reports each failure once.
 * The list three.js keeps is short, so the scan costs nothing a frame notices.
 */
export function takeNewFailedXriftShaderPrograms(
  renderer: WebGLRenderer,
  seen: WeakSet<object>,
): XriftThreeProgram[] {
  const programs = renderer.info.programs as unknown as XriftThreeProgram[] | null;
  if (!programs) return [];
  const failed: XriftThreeProgram[] = [];
  for (const program of programs) {
    if (!isFailedXriftShaderProgram(program) || seen.has(program)) continue;
    seen.add(program);
    failed.push(program);
  }
  return failed;
}

export type XriftShaderMaterialUse = {
  object: Object3D;
  material: XriftShaderMaterial;
  program: XriftThreeProgram;
};

/** Shader Materials under `root` that three.js holds one of `programs` for. */
export function findXriftShaderMaterialsUsing(
  renderer: WebGLRenderer,
  root: Object3D,
  programs: readonly XriftThreeProgram[],
): XriftShaderMaterialUse[] {
  const wanted = new Set(programs);
  const uses: XriftShaderMaterialUse[] = [];
  if (wanted.size === 0) return uses;
  const visited = new Set<Material>();
  root.traverse((object) => {
    const assigned = (object as { material?: Material | Material[] }).material;
    if (!assigned) return;
    for (const material of Array.isArray(assigned) ? assigned : [assigned]) {
      if (!(material as XriftShaderMaterial).isShaderMaterial || visited.has(material)) {
        continue;
      }
      visited.add(material);
      const program = xriftMaterialPrograms(renderer, material).find((candidate) =>
        wanted.has(candidate),
      );
      if (program) uses.push({ object, material, program });
    }
  });
  return uses;
}

/** A compact, readable form of one failure, for a console message. */
export function describeXriftShaderProgramError(error: XriftShaderProgramError): string {
  const lines = error.lines
    .filter((entry) => entry.severity === "error")
    .map((entry) => {
      const where =
        entry.line === undefined
          ? entry.stage
          : entry.include
            ? `${entry.stage}:${entry.line} (#include <${entry.include}>)`
            : `${entry.stage}:${entry.line}`;
      return `${where}: ${entry.message}`;
    });
  if (lines.length > 0) return lines.join("\n");
  return [error.programLog, error.vertexLog, error.fragmentLog]
    .filter((log) => log.trim().length > 0)
    .join("\n");
}
