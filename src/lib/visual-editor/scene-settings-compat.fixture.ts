import {
  DEFAULT_SCENE_SETTINGS,
  resolveSceneSettings,
  resolveScenePostEffectOrder,
  SCENE_POST_EFFECT_ORDER_IDS,
} from "./scene-settings";
import { SCENE_DOCUMENT_SCHEMA_VERSION } from "./scene-document";
import { sceneDocumentCodec, validateSceneDocument } from "./serialization";

/**
 * Scene settings grow a section at a time, so every project on disk was saved
 * against an older shape than the one the current build knows about. These
 * assertions hold the rule that keeps those projects opening: an absent section
 * or field is valid and resolveSceneSettings supplies the default, while a
 * value that is present and wrong is still reported.
 */
export function runSceneSettingsCompatFixtureAssertions(): void {
  assertProjectSavedBeforePhysicsOpens();
  assertPostEffectOrderIsRepaired();
  assertEverySectionIsOptional();
  assertEveryFieldIsOptional();
  assertPresentButWrongValuesStillFail();
}

/** The settings block of a real project saved before physics settings existed. */
const SETTINGS_BEFORE_PHYSICS = {
  ambient: { color: "#404040", intensity: 1 },
  camera: { far: 1000, fov: 60, near: 0.1 },
  editor: {
    backgroundColor: "#1a1a1a",
    gizmo: {
      gridDivisions: 40,
      gridSize: 40,
      gridVisible: true,
      rotateSnapDegrees: 15,
      scaleSnap: 0.1,
      size: 1,
      snapEnabled: false,
      translateSnap: 0.5,
    },
  },
  fog: { color: "#87ceeb", enabled: false, far: 200, near: 10 },
  skybox: {
    bottomColor: "#ffffff",
    enabled: true,
    exponent: 0.6,
    offset: 0,
    projection: "infinite",
    topColor: "#3b82f6",
  },
} as const;

function sceneWith(settings: unknown): Record<string, unknown> {
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "scene-compat-fixture",
    name: "Compat",
    entities: {},
    rootEntityIds: [],
    settings,
  };
}

function settingsIssues(settings: unknown): string[] {
  return validateSceneDocument(sceneWith(settings))
    .filter((entry) => entry.path.startsWith("$.settings"))
    .map((entry) => `${entry.path}: ${entry.message}`);
}

/**
 * The reported regression: adding the physics section made every project saved
 * before it fail to open with
 * "$.settings.physics: scene settings section must be an object".
 */
function assertProjectSavedBeforePhysicsOpens(): void {
  const issues = settingsIssues(SETTINGS_BEFORE_PHYSICS);
  assert(
    issues.length === 0,
    `A scene saved before physics settings existed must still open: ${issues.join("; ")}`,
  );

  const decoded = sceneDocumentCodec.parse(
    JSON.stringify(sceneWith(SETTINGS_BEFORE_PHYSICS)),
  );
  assert(
    decoded.ok,
    `The scene document codec rejected a pre-physics scene: ${
      decoded.ok ? "" : decoded.issues.map((entry) => entry.path).join(", ")
    }`,
  );
  const resolved = resolveSceneSettings(decoded.ok ? decoded.document.settings : {});
  assert(
    resolved.physics.gravity === DEFAULT_SCENE_SETTINGS.physics.gravity &&
      resolved.physics.allowInfiniteJump ===
        DEFAULT_SCENE_SETTINGS.physics.allowInfiniteJump,
    "A pre-physics scene must resolve to the default physics settings",
  );
  assert(
    resolved.fog.far === 200 && resolved.camera.fov === 60,
    "Resolving defaults must not overwrite the values the project did save",
  );
}

/**
 * The stored order decides what the frame looks like, so a project that names
 * a layer this build does not have, names one twice, or predates the order
 * entirely still has to resolve to a complete order rather than losing a pass.
 */
function assertPostEffectOrderIsRepaired(): void {
  const cases: Array<[string, unknown]> = [
    ["absent", undefined],
    ["stored as text", "bloom"],
    ["repeated", ["bloom", "bloom"]],
    ["carrying an unknown layer", ["grading", "toon"]],
  ];
  for (const [label, order] of cases) {
    const resolved = resolveScenePostEffectOrder(order);
    assert(
      resolved.length === SCENE_POST_EFFECT_ORDER_IDS.length &&
        SCENE_POST_EFFECT_ORDER_IDS.every((id) => resolved.includes(id)),
      `A post effect order ${label} must resolve to every layer exactly once`,
    );
  }
  assert(
    resolveScenePostEffectOrder(["grading", "bloom"]).join(",") === "grading,bloom",
    "A complete post effect order must be kept as the author saved it",
  );
  assert(
    resolveScenePostEffectOrder(["grading"])[0] === "grading",
    "Repairing a partial order must keep the layers the project did save first",
  );
}

/**
 * No section may be required. A section added tomorrow has to behave like the
 * ones added already, otherwise this regression returns under a new name.
 */
function assertEverySectionIsOptional(): void {
  const sections = [
    "skybox",
    "fog",
    "ambient",
    "camera",
    "postprocessing",
    "vegetation",
    "physics",
    "editor",
  ] as const;

  assert(
    settingsIssues({}).length === 0,
    "Empty scene settings must be valid, because every section has a default",
  );

  const full = resolveSceneSettings({}) as unknown as Record<string, unknown>;
  for (const section of sections) {
    const withoutSection = { ...full };
    delete withoutSection[section];
    const issues = settingsIssues(withoutSection);
    assert(
      issues.length === 0,
      `Scene settings without the ${section} section must stay valid: ${issues.join("; ")}`,
    );
  }
}

/** A section that exists but predates one of its fields must stay valid too. */
function assertEveryFieldIsOptional(): void {
  const cases: Array<[string, unknown]> = [
    ["physics", { physics: {} }],
    ["physics with only gravity", { physics: { gravity: 0 } }],
    ["skybox", { skybox: { enabled: true } }],
    ["fog", { fog: { enabled: false } }],
    ["ambient", { ambient: {} }],
    ["camera", { camera: {} }],
    ["editor gizmo", { editor: { gizmo: {} } }],
    ["vegetation", { vegetation: { enabled: true } }],
    ["postprocessing", { postprocessing: {} }],
    ["postprocessing hdr", { postprocessing: { hdr: {} } }],
    ["postprocessing ao", { postprocessing: { ao: {} } }],
    ["postprocessing bloom", { postprocessing: { bloom: {} } }],
    ["postprocessing grading", { postprocessing: { grading: {} } }],
    // A project saved before a layer existed cannot name it, so a short order
    // is valid and resolveScenePostEffectOrder appends what is missing.
    ["postprocessing order", { postprocessing: { order: ["grading"] } }],
  ];
  for (const [label, settings] of cases) {
    const issues = settingsIssues(settings);
    assert(
      issues.length === 0,
      `A partially filled ${label} section must stay valid: ${issues.join("; ")}`,
    );
  }
}

/**
 * Tolerating absent values must not turn into tolerating wrong ones. A value
 * that is present and invalid is a real defect and still has to be reported.
 */
function assertPresentButWrongValuesStillFail(): void {
  const cases: Array<[string, unknown]> = [
    ["physics stored as a number", { physics: 9.81 }],
    ["physics stored as null", { physics: null }],
    ["negative gravity", { physics: { gravity: -1 } }],
    ["gravity stored as text", { physics: { gravity: "9.81" } }],
    ["allowInfiniteJump stored as text", { physics: { allowInfiniteJump: "yes" } }],
    ["an unknown physics key", { physics: { bounciness: 1 } }],
    ["an unknown settings section", { gravity: {} }],
    ["a malformed fog color", { fog: { color: "red" } }],
    ["fog far behind near", { fog: { near: 50, far: 10 } }],
    ["camera far behind near", { camera: { near: 100, far: 1 } }],
    ["zero grid divisions", { editor: { gizmo: { gridDivisions: 0 } } }],
    ["fractional grid divisions", { editor: { gizmo: { gridDivisions: 2.5 } } }],
    ["an unknown skybox projection", { skybox: { projection: "cube" } }],
    ["an unknown tone mapping", { postprocessing: { hdr: { toneMapping: "filmic" } } }],
    [
      "AO maxDistance behind minDistance",
      { postprocessing: { ao: { minDistance: 5, maxDistance: 1 } } },
    ],
    ["a two element meshScale", { skybox: { meshScale: [1, 1] } }],
    ["an unknown post effect layer", { postprocessing: { order: ["bloom", "toon"] } }],
    ["a repeated post effect layer", { postprocessing: { order: ["bloom", "bloom"] } }],
    ["a post effect order stored as text", { postprocessing: { order: "bloom" } }],
    ["settings stored as text", "nope"],
  ];
  for (const [label, settings] of cases) {
    assert(
      settingsIssues(settings).length > 0,
      `Scene settings with ${label} must still be reported`,
    );
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
