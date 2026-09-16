import { DEFAULT_SCALE_LINKED, MIN_SCALE_MAGNITUDE, updateVectorAxis } from "./inspector-transform";
import { getDefaultSceneViewportDisplayMode, getEntityMeshMaterialStyle, getSceneViewportDisplayProfile } from "./scene-viewport-display";
import type { Vec3 } from "../../lib/visual-editor/scene-document";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal(actual: Vec3, expected: Vec3, label: string) {
  assert(actual.every((value, axis) => Math.abs(value - expected[axis]) < 1e-10), label);
}

export function runEditorUiDefaultsFixtureAssertions(): void {
  assert(DEFAULT_SCALE_LINKED === false, "Scale edits must start with independent axes");
  const original: Vec3 = [0.7, 1.4, -2.1];
  for (const axis of [0, 1, 2]) {
    const expected: Vec3 = [...original];
    expected[axis] = -0.5;
    equal(updateVectorAxis(original, axis, -0.5, "scale", DEFAULT_SCALE_LINKED), expected, `Independent scale axis ${axis}`);
  }
  equal(original, [0.7, 1.4, -2.1], "Axis edits must not mutate the original transform");
  equal(updateVectorAxis(original, 0, 1.4, "scale", true), [1.4, 2.8, -4.2], "Opt-in linking keeps the existing ratio");
  equal(updateVectorAxis(original, 0, -0.7, "scale", true), [-0.7, -1.4, 2.1], "Opt-in linking preserves the signed scale contract");
  equal(updateVectorAxis(original, 2, 0, "scale", false), [0.7, 1.4, -MIN_SCALE_MAGNITUDE], "Prevent zero scale without changing untouched axes");
  equal(updateVectorAxis(original, 0, 0, "position", true), [0, 1.4, -2.1], "Position is never ratio-linked");
  equal(updateVectorAxis(original, 1, 0, "rotation", true), [0.7, 0, -2.1], "Rotation is never ratio-linked");

  assert(getDefaultSceneViewportDisplayMode("world") === "scene", "Worlds retain authored lighting by default");
  assert(getDefaultSceneViewportDisplayMode("item") === "unlit", "Items default to Unlit in the editor");
  const item = getSceneViewportDisplayProfile(getDefaultSceneViewportDisplayMode("item"));
  assert(!item.showSceneLighting && !item.showSkybox && !item.showFog && item.showHelpers, "Item editing shows geometry without scene lighting");
  const world = getSceneViewportDisplayProfile("scene");
  assert(world.showSceneLighting && world.showSkybox && world.showFog, "Scene mode must still display the real scene");
  assert(getEntityMeshMaterialStyle("unlit", false, false) === "unlit", "Unlit uses the existing display-only override");
  assert(getEntityMeshMaterialStyle("scene", false, false) === "scene", "Scene rendering retains material properties");
  assert(getEntityMeshMaterialStyle("colliders", false, false) === null, "Other display modes retain their behavior");
}
