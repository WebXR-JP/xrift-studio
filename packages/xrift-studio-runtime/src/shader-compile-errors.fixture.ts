import {
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  ShaderChunk,
  ShaderMaterial,
  type Material,
  type WebGLRenderer,
} from "three";
import {
  describeXriftShaderProgramError,
  findUnresolvedXriftShaderIncludes,
  findXriftShaderMaterialsUsing,
  locateXriftShaderLogLines,
  readXriftShaderProgramError,
  takeNewFailedXriftShaderPrograms,
  xriftCurrentMaterialProgram,
  xriftMaterialPrograms,
  xriftShaderHeaderLineCount,
  xriftShaderSourceKey,
  type XriftThreeProgram,
} from "./shader-compile-errors.js";

const VERTEX = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `uniform vec3 uColor;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(uColor * missingValue, 1.0);
}`;

/** A prefix of `lines` lines, each ended by a newline, as three.js builds it. */
function prefixOf(lines: number): string {
  return Array.from({ length: lines }, (_, index) => `#define PREFIX_${index}\n`).join("");
}

/** Stands in for the two parts of a renderer this module reads. */
function fakeRenderer(
  programsByMaterial: Map<Material, { programs: XriftThreeProgram[]; current?: XriftThreeProgram }>,
  allPrograms: XriftThreeProgram[] | null,
): WebGLRenderer {
  return {
    properties: {
      has: (material: Material) => programsByMaterial.has(material),
      get: (material: Material) => {
        const entry = programsByMaterial.get(material);
        if (!entry) throw new Error("the reader created bookkeeping for a Material three.js never drew");
        return {
          programs: new Map(entry.programs.map((program, index) => [String(index), program])),
          currentProgram: entry.current,
        };
      },
    },
    info: { programs: allPrograms },
  } as unknown as WebGLRenderer;
}

function failedProgram(fragmentLog: string, prefixLines = 56): XriftThreeProgram {
  return {
    name: "failed",
    program: {},
    diagnostics: {
      runnable: false,
      programLog: "Fragment shader is not compiled.",
      vertexShader: { log: "", prefix: prefixOf(68) },
      fragmentShader: { log: fragmentLog, prefix: prefixOf(prefixLines) },
    },
  };
}

/** Assertions for reading GLSL compile failures back from three.js. */
export function runShaderCompileErrorsFixtureAssertions(): void {
  assertSourceKeys();
  assertLineMapping();
  assertIncludeMapping();
  assertUncertainLinesAreLeftOut();
  assertProgramReading();
  assertSceneLookup();
}

function assertSourceKeys(): void {
  assert(
    xriftShaderSourceKey(VERTEX, FRAGMENT) === xriftShaderSourceKey(VERTEX, FRAGMENT),
    "the same GLSL must always produce the same key",
  );
  assert(
    xriftShaderSourceKey(VERTEX, FRAGMENT) !== xriftShaderSourceKey(VERTEX, `${FRAGMENT} `),
    "one changed character must change the key",
  );
  assert(
    xriftShaderSourceKey(VERTEX, FRAGMENT) !== xriftShaderSourceKey(FRAGMENT, VERTEX),
    "the key must tell the vertex stage from the fragment stage",
  );
  assert(
    xriftShaderSourceKey("ab", "c") !== xriftShaderSourceKey("a", "bc"),
    "moving text between the stages must change the key",
  );
}

function assertLineMapping(): void {
  // The numbers are the ones a browser printed for this shader: three.js put
  // 56 lines of prefix after the #version line, and the compiler named line 61.
  const lines = locateXriftShaderLogLines({
    stage: "fragment",
    log: "ERROR: 0:61: 'missingValue' : undeclared identifier",
    prefix: prefixOf(56),
    source: FRAGMENT,
    headerLineCount: 1,
  });
  assert(lines.length === 1, "one log message must produce one line");
  const [entry] = lines;
  assert(
    entry?.line === 4 && entry.reportedLine === 61 && entry.severity === "error",
    `the author's line must exclude the prefix and the #version line, got ${entry?.line}`,
  );
  assert(
    entry?.message === "'missingValue' : undeclared identifier" &&
      entry.source === "gl_FragColor = vec4(uColor * missingValue, 1.0);",
    "the message and the author's source line must be returned as they are",
  );

  const crlf = locateXriftShaderLogLines({
    stage: "fragment",
    log: "ERROR: 0:61: 'missingValue' : undeclared identifier",
    prefix: prefixOf(56),
    source: FRAGMENT.replace(/\n/g, "\r\n"),
    headerLineCount: 1,
  });
  assert(crlf[0]?.line === 4, "a CRLF line ending must count as one line, as GLSL counts it");

  const inPrefix = locateXriftShaderLogLines({
    stage: "fragment",
    log: "ERROR: 0:12: 'x' : syntax error",
    prefix: prefixOf(56),
    source: FRAGMENT,
    headerLineCount: 1,
  });
  assert(
    inPrefix[0]?.line === undefined && inPrefix[0]?.reportedLine === 12,
    "a message about the three.js prefix has no line in the author's source",
  );

  const warning = locateXriftShaderLogLines({
    stage: "vertex",
    log: "WARNING: 0:70: 'x' : unused\nERROR: 0:71: 'y' : undeclared identifier\nnot a log line",
    prefix: prefixOf(68),
    source: VERTEX,
    headerLineCount: 1,
  });
  assert(
    warning.length === 2 &&
      warning[0]?.severity === "warning" &&
      warning[0].line === 1 &&
      warning[1]?.line === 2 &&
      warning[1].stage === "vertex",
    "warnings and errors are both kept, and other text is ignored",
  );

  const many = locateXriftShaderLogLines({
    stage: "fragment",
    log: Array.from({ length: 40 }, () => "ERROR: 0:61: 'x' : undeclared identifier").join("\n"),
    prefix: prefixOf(56),
    source: FRAGMENT,
    headerLineCount: 1,
  });
  assert(many.length === 20, "a long log must be bounded");

  assert(
    locateXriftShaderLogLines({
      stage: "fragment",
      log: "ERROR: 0:61: 'x' : undeclared identifier",
      source: FRAGMENT,
      headerLineCount: 1,
    })[0]?.line === undefined,
    "without the recorded prefix there is nothing to subtract, so no line is claimed",
  );
}

function assertIncludeMapping(): void {
  const chunks = {
    outer: "float outerA;\n#include <inner>\nfloat outerB;",
    inner: "float innerA;\nfloat innerB;",
  };
  const source = `uniform float a;
#include <outer>
void main() {
  gl_FragColor = vec4(missingValue);
}`;
  // outer expands to four lines, so main() moves from line 3 to line 6.
  const after = locateXriftShaderLogLines({
    stage: "fragment",
    log: "ERROR: 0:10: 'missingValue' : undeclared identifier",
    prefix: prefixOf(2),
    source,
    headerLineCount: 1,
    chunks,
  });
  assert(
    after[0]?.line === 4 && after[0].include === undefined,
    `a line after an #include must account for the expanded chunk, got ${after[0]?.line}`,
  );
  const inside = locateXriftShaderLogLines({
    stage: "fragment",
    log: "ERROR: 0:7: 'innerB' : redefinition",
    prefix: prefixOf(2),
    source,
    headerLineCount: 1,
    chunks,
  });
  assert(
    inside[0]?.line === 2 && inside[0].include === "outer",
    "a message inside an expanded chunk points at the author's #include line",
  );

  // The real chunk table, with the numbers a browser printed: `#include <common>`
  // on line 3 moved the faulty line 5 down by the length of the chunk.
  const commonLength = (ShaderChunk.common ?? "").split("\n").length;
  const real = locateXriftShaderLogLines({
    stage: "fragment",
    log: `ERROR: 0:${1 + 56 + 2 + commonLength + 2}: 'missingValue' : undeclared identifier`,
    prefix: prefixOf(56),
    source: `uniform vec3 uColor;
varying vec2 vUv;
#include <common>
void main() {
  gl_FragColor = vec4(uColor * missingValue, 1.0);
}`,
    headerLineCount: 1,
  });
  assert(
    commonLength > 10 && real[0]?.line === 5,
    `three.js's own chunks must be measured the way three.js expands them, got ${real[0]?.line}`,
  );

  assert(
    JSON.stringify(
      findUnresolvedXriftShaderIncludes("#include <outer>\nvoid main() {}\n  #include <nope>", chunks),
    ) === JSON.stringify([{ line: 3, include: "nope" }]),
    "an #include three.js cannot resolve must be found with its line",
  );
  assert(
    findUnresolvedXriftShaderIncludes("#include <broken>", { broken: "#include <nope>" }).length === 1,
    "a chunk that includes a missing chunk cannot be resolved either",
  );
  assert(
    findUnresolvedXriftShaderIncludes("#include <common>\n#include <fog_fragment>").length === 0,
    "three.js's own chunks resolve",
  );
}

function assertUncertainLinesAreLeftOut(): void {
  const base = {
    stage: "fragment" as const,
    log: "ERROR: 0:7: 'missingValue' : undeclared identifier",
    prefix: prefixOf(2),
    headerLineCount: 1,
  };
  assert(
    locateXriftShaderLogLines({
      ...base,
      source: "#line 100\nuniform float a;\nvoid main() {\n  gl_FragColor = vec4(missingValue);\n}",
    })[0]?.line === undefined,
    "a #line directive renumbers the log, so no line is claimed after it",
  );
  assert(
    locateXriftShaderLogLines({
      ...base,
      source:
        "#pragma unroll_loop_start\nfor ( int i = 0; i < 2; i ++ ) {\n}\n#pragma unroll_loop_end\n  gl_FragColor = vec4(missingValue);",
    })[0]?.line === undefined,
    "a loop three.js unrolls changes the line count, so no line is claimed after it",
  );
  assert(
    locateXriftShaderLogLines({
      ...base,
      source: "#include <nope>\nvoid main() {\n  gl_FragColor = vec4(missingValue);\n}",
      chunks: {},
    })[0]?.line === undefined,
    "an #include that cannot be measured stops the mapping",
  );

  const source = "uniform float a;\nvoid main() {\n  gl_FragColor = vec4(missingValue);\n}";
  const final = `#version 300 es\n${prefixOf(2)}${source}`;
  const agreed = locateXriftShaderLogLines({
    ...base,
    log: "ERROR: 0:6: 'missingValue' : undeclared identifier",
    source,
    finalSource: final,
  });
  assert(agreed[0]?.line === 3, "a line the compiled text agrees with is reported");
  const disagreed = locateXriftShaderLogLines({
    ...base,
    log: "ERROR: 0:6: 'missingValue' : undeclared identifier",
    source,
    // One more line in front than the prefix says: the arithmetic is off by one.
    finalSource: `#version 300 es\n#extension something\n${prefixOf(2)}${source}`,
  });
  assert(
    disagreed[0]?.line === undefined && disagreed[0]?.source === "void main() {",
    "a line the compiled text contradicts is left out, and the compiled line is shown instead",
  );
}

function assertProgramReading(): void {
  const material = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT });
  assert(xriftShaderHeaderLineCount(material) === 1, "a ShaderMaterial is compiled under one #version line");
  assert(
    xriftShaderHeaderLineCount({ isRawShaderMaterial: true } as never) === 0 &&
      xriftShaderHeaderLineCount({ isRawShaderMaterial: true, glslVersion: "300 es" } as never) === 1,
    "a RawShaderMaterial has a #version line only when it names a GLSL version",
  );

  const failed = failedProgram("ERROR: 0:61: 'missingValue' : undeclared identifier");
  const error = readXriftShaderProgramError(failed, material);
  assert(
    error?.programLog === "Fragment shader is not compiled." &&
      error.vertexLog === "" &&
      error.fragmentLog === "ERROR: 0:61: 'missingValue' : undeclared identifier" &&
      error.lines.length === 1 &&
      error.lines[0]?.stage === "fragment" &&
      error.lines[0].line === 4,
    "a failed program must return the three logs and the located lines",
  );
  assert(
    describeXriftShaderProgramError(error!) === "fragment:4: 'missingValue' : undeclared identifier",
    "the console form names the stage and the author's line",
  );

  const linkOnly: XriftThreeProgram = {
    diagnostics: {
      runnable: false,
      programLog: "FRAGMENT varying vMissing does not match any VERTEX varying",
      vertexShader: { log: "", prefix: "" },
      fragmentShader: { log: "", prefix: "" },
    },
  };
  const linkError = readXriftShaderProgramError(linkOnly, material);
  assert(
    linkError?.lines.length === 0 &&
      describeXriftShaderProgramError(linkError) ===
        "FRAGMENT varying vMissing does not match any VERTEX varying",
    "a link failure has no line, so the program log is what is shown",
  );

  assert(
    readXriftShaderProgramError({ diagnostics: { runnable: true, programLog: "note" } }, material) === null &&
      readXriftShaderProgramError({}, material) === null,
    "a program that runs has no error, with or without a log",
  );

  const long = readXriftShaderProgramError(
    {
      diagnostics: {
        runnable: false,
        programLog: "x".repeat(10_000),
        vertexShader: { log: "", prefix: "" },
        fragmentShader: { log: "", prefix: "" },
      },
    },
    material,
  );
  assert((long?.programLog.length ?? 0) < 4_100, "a runaway log must be bounded");
  material.dispose();
}

function assertSceneLookup(): void {
  const broken = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT });
  const sharing = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT });
  const fine = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: "void main() {}" });
  const neverDrawn = new ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT });
  const standard = new MeshBasicMaterial();
  const failed = failedProgram("ERROR: 0:61: 'missingValue' : undeclared identifier");
  const stale = failedProgram("ERROR: 0:60: 'old' : undeclared identifier");
  const running: XriftThreeProgram = { program: {} };
  const renderer = fakeRenderer(
    new Map<Material, { programs: XriftThreeProgram[]; current?: XriftThreeProgram }>([
      [broken, { programs: [stale, failed], current: failed }],
      [sharing, { programs: [failed], current: failed }],
      [fine, { programs: [running], current: running }],
      [standard, { programs: [failed], current: failed }],
    ]),
    [running, failed],
  );

  assert(
    xriftMaterialPrograms(renderer, broken).length === 2 &&
      xriftCurrentMaterialProgram(renderer, broken) === failed &&
      xriftMaterialPrograms(renderer, neverDrawn).length === 0 &&
      xriftCurrentMaterialProgram(renderer, neverDrawn) === undefined,
    "a Material three.js never drew has no program, and asking must not create one",
  );

  const seen = new WeakSet<object>();
  const first = takeNewFailedXriftShaderPrograms(renderer, seen);
  assert(first.length === 1 && first[0] === failed, "a failed program is reported");
  assert(
    takeNewFailedXriftShaderPrograms(renderer, seen).length === 0,
    "the same failed program is reported once",
  );
  assert(
    takeNewFailedXriftShaderPrograms(fakeRenderer(new Map(), null), new WeakSet()).length === 0,
    "a renderer without a program list reports nothing",
  );

  const scene = new Scene();
  const geometry = new PlaneGeometry(1, 1);
  const first1 = new Mesh(geometry, broken);
  const second = new Mesh(geometry, [fine, sharing]);
  const repeated = new Mesh(geometry, broken);
  scene.add(first1, second, repeated, new Mesh(geometry, standard), new Mesh(geometry, neverDrawn));
  const uses = findXriftShaderMaterialsUsing(renderer, scene, [failed]);
  assert(
    uses.length === 2 &&
      uses[0]?.material === broken &&
      uses[0].object === first1 &&
      uses[1]?.material === sharing &&
      uses[1].object === second &&
      uses.every((use) => use.program === failed),
    "every shader Material holding the failed program is found once, in a material array too",
  );
  assert(
    findXriftShaderMaterialsUsing(renderer, scene, []).length === 0,
    "no failed program means no search result",
  );
  for (const material of [broken, sharing, fine, neverDrawn, standard]) material.dispose();
  geometry.dispose();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`shader compile errors fixture: ${message}`);
}
