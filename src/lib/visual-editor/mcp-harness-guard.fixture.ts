import {
  EMPTY_MCP_HARNESS_STATE,
  MCP_HARNESS_CONSECUTIVE_EDIT_LIMIT,
  mcpHarnessKeyForCall,
  recordMcpHarnessCall,
  type McpHarnessState,
} from "./mcp-harness-guard";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(
  calls: ReadonlyArray<readonly [string, Record<string, unknown>?]>,
): { state: McpHarnessState; warnings: number } {
  let state = EMPTY_MCP_HARNESS_STATE;
  let warnings = 0;
  for (const [tool, argumentsValue] of calls) {
    const next = recordMcpHarnessCall(state, tool, argumentsValue);
    state = next.state;
    if (next.warning) warnings += 1;
  }
  return { state, warnings };
}

export function runMcpHarnessGuardFixtureAssertions(): void {
  assert(
    MCP_HARNESS_CONSECUTIVE_EDIT_LIMIT === 3,
    "The guard warns on the third consecutive edit, which is what the skill and the docs promise",
  );

  const twoGrassEdits = run([
    ["apply_terrain_grass_preset", { entityId: "t1" }],
    ["update_terrain_grass_layer", { entityId: "t1" }],
  ]);
  assert(
    twoGrassEdits.warnings === 0 && twoGrassEdits.state.count === 2,
    "Two grass edits in a row are ordinary work and must not warn",
  );

  const threeGrassEdits = run([
    ["apply_terrain_grass_preset", { entityId: "t1" }],
    ["get_terrain", { entityId: "t1" }],
    ["update_terrain_grass_layer", { entityId: "t1" }],
    ["list_terrain_grass_types"],
    ["paint_terrain_grass", { entityId: "t1" }],
  ]);
  assert(
    threeGrassEdits.warnings === 1 && threeGrassEdits.state.category === "grass",
    "Three grass writes with only reads between them are a tuning loop and must warn once",
  );

  const fourGrassEdits = run([
    ["apply_terrain_grass_preset", { entityId: "t1" }],
    ["update_terrain_grass_layer", { entityId: "t1" }],
    ["update_terrain_grass_layer", { entityId: "t1" }],
    ["update_terrain_grass_layer", { entityId: "t1" }],
  ]);
  assert(
    fourGrassEdits.warnings === 2,
    "A client that ignores the warning keeps seeing it on every further edit of the streak",
  );

  const captureBreaksStreak = run([
    ["sculpt_terrain", { entityId: "t1" }],
    ["sculpt_terrain", { entityId: "t1" }],
    ["capture_scene_view"],
    ["sculpt_terrain", { entityId: "t1" }],
  ]);
  assert(
    captureBreaksStreak.warnings === 0 && captureBreaksStreak.state.count === 1,
    "Looking at the frame resets the streak, because that is exactly what the guard asks for",
  );

  const unrelatedWriteBreaksStreak = run([
    ["sculpt_terrain", { entityId: "t1" }],
    ["sculpt_terrain", { entityId: "t1" }],
    ["create_primitive", { shape: "box" }],
    ["sculpt_terrain", { entityId: "t1" }],
  ]);
  assert(
    unrelatedWriteBreaksStreak.warnings === 0 &&
      unrelatedWriteBreaksStreak.state.count === 1,
    "An unrelated write means the client moved on, so the streak starts over",
  );

  const differentEntities = run([
    ["update_transform", { entityId: "a" }],
    ["update_transform", { entityId: "b" }],
    ["update_transform", { entityId: "c" }],
  ]);
  assert(
    differentEntities.warnings === 0,
    "Moving three different Entities in a row is placement work, not a loop",
  );

  const sameEntity = run([
    ["update_transform", { entityId: "a" }],
    ["update_transform", { entityId: "a" }],
    ["update_transform", { entityId: "a" }],
  ]);
  assert(
    sameEntity.warnings === 1 && sameEntity.state.key === "transform:a",
    "Nudging the same Entity three times without a capture must warn",
  );

  const sameMaterial = run([
    ["update_material_asset", { materialAssetId: "m" }],
    ["set_material_texture_transform", { materialAssetId: "m" }],
    ["update_material_asset", { materialAssetId: "m" }],
  ]);
  assert(
    sameMaterial.warnings === 1 && sameMaterial.state.category === "material",
    "The two Material write tools share one streak per Material Asset",
  );

  assert(
    mcpHarnessKeyForCall("place_asset", { assetId: "x" }) === null &&
      mcpHarnessKeyForCall("get_editor_context") === null,
    "Placement and reads are never tracked as a streak",
  );

  const warning = recordMcpHarnessCall(
    { key: "grass", category: "grass", count: 2 },
    "update_terrain_grass_layer",
    { entityId: "t1" },
  ).warning;
  assert(
    warning !== null &&
      warning.rule === "CONSECUTIVE_EDITS" &&
      warning.requiredActions.includes("capture_scene_view") &&
      warning.message.includes("capture_scene_view"),
    "The warning names the capture tool so the client knows what unblocks it",
  );
}
