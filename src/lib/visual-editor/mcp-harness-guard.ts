/**
 * Consecutive-edit guard for the MCP editor tools.
 *
 * An AI client that keeps retuning the same thing (grass density, one
 * Entity's Transform, one Material) without ever looking at the result is the
 * single most common way a world turns into a grass-tuning session. The guard
 * counts consecutive writes that share a category and, once the streak reaches
 * the limit, attaches a warning to the tool result that asks for a
 * capture_scene_view before the next edit. It never rejects a write, keeps no
 * state outside the running editor session, and stores nothing in the project.
 */

export type McpHarnessCategory =
  | "terrain"
  | "grass"
  | "transform"
  | "material"
  | "scene-settings";

export type McpHarnessState = {
  /** Category key of the current streak, such as `grass` or `transform:<entityId>`. */
  readonly key: string | null;
  readonly category: McpHarnessCategory | null;
  /** Consecutive writes that share `key` since the last capture or unrelated write. */
  readonly count: number;
};

export type McpHarnessWarning = {
  rule: "CONSECUTIVE_EDITS";
  category: McpHarnessCategory;
  count: number;
  limit: number;
  message: string;
  requiredActions: readonly string[];
};

export const MCP_HARNESS_CONSECUTIVE_EDIT_LIMIT = 3;

export const EMPTY_MCP_HARNESS_STATE: McpHarnessState = {
  key: null,
  category: null,
  count: 0,
};

const CATEGORY_BY_TOOL: Readonly<Record<string, McpHarnessCategory>> = {
  create_terrain: "terrain",
  create_terrain_from_preset: "terrain",
  sculpt_terrain: "terrain",
  update_terrain: "terrain",
  apply_terrain_surface: "terrain",
  apply_terrain_grass_preset: "grass",
  add_terrain_grass_layer: "grass",
  update_terrain_grass_layer: "grass",
  delete_terrain_grass_layer: "grass",
  paint_terrain_grass: "grass",
  update_transform: "transform",
  update_material_asset: "material",
  set_material_texture_transform: "material",
  update_scene_settings: "scene-settings",
};

/** Tools that look at the scene. A capture ends every streak. */
const CAPTURE_TOOLS: ReadonlySet<string> = new Set(["capture_scene_view"]);

/** Read-only tool name prefixes. Reads neither extend nor break a streak. */
const READ_ONLY_PREFIXES = [
  "get_",
  "list_",
  "sample_",
  "inspect_",
  "validate_",
  "simulate_",
  "analyze_",
  "search_",
] as const;

const CATEGORY_LABEL: Readonly<Record<McpHarnessCategory, string>> = {
  terrain: "Terrain",
  grass: "Terrain grass",
  transform: "the same Entity's Transform",
  material: "the same Material",
  "scene-settings": "Scene settings",
};

function isReadOnlyTool(tool: string): boolean {
  return READ_ONLY_PREFIXES.some((prefix) => tool.startsWith(prefix));
}

function stringArgument(
  argumentsValue: Record<string, unknown> | undefined,
  name: string,
): string | null {
  const value = argumentsValue?.[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The streak key for one call, or null when the call is not a tracked write.
 * Transform and Material streaks are per target, so moving two different
 * Entities in a row is placement work, not a loop.
 */
export function mcpHarnessKeyForCall(
  tool: string,
  argumentsValue?: Record<string, unknown>,
): { key: string; category: McpHarnessCategory } | null {
  const category = CATEGORY_BY_TOOL[tool];
  if (!category) return null;
  if (category === "transform") {
    const entityId = stringArgument(argumentsValue, "entityId") ?? "?";
    return { key: `transform:${entityId}`, category };
  }
  if (category === "material") {
    const assetId =
      stringArgument(argumentsValue, "materialAssetId") ??
      stringArgument(argumentsValue, "assetId") ??
      "?";
    return { key: `material:${assetId}`, category };
  }
  return { key: category, category };
}

/** Attach the warning to a tool result without touching results that earned none. */
export function withMcpHarnessWarning(
  result: Record<string, unknown>,
  warning: McpHarnessWarning | null,
): Record<string, unknown> {
  return warning ? { ...result, harness: warning } : result;
}

/**
 * Record one tool call and return the next state plus the warning, if the
 * streak has reached the limit. The warning repeats on every further call in
 * the same streak so a client that ignored it once still sees it.
 */
export function recordMcpHarnessCall(
  state: McpHarnessState,
  tool: string,
  argumentsValue?: Record<string, unknown>,
): { state: McpHarnessState; warning: McpHarnessWarning | null } {
  if (CAPTURE_TOOLS.has(tool)) {
    return { state: EMPTY_MCP_HARNESS_STATE, warning: null };
  }
  if (isReadOnlyTool(tool)) {
    return { state, warning: null };
  }
  const tracked = mcpHarnessKeyForCall(tool, argumentsValue);
  if (!tracked) {
    return { state: EMPTY_MCP_HARNESS_STATE, warning: null };
  }
  const count = state.key === tracked.key ? state.count + 1 : 1;
  const nextState: McpHarnessState = {
    key: tracked.key,
    category: tracked.category,
    count,
  };
  if (count < MCP_HARNESS_CONSECUTIVE_EDIT_LIMIT) {
    return { state: nextState, warning: null };
  }
  return {
    state: nextState,
    warning: {
      rule: "CONSECUTIVE_EDITS",
      category: tracked.category,
      count,
      limit: MCP_HARNESS_CONSECUTIVE_EDIT_LIMIT,
      message:
        `This is edit ${count} in a row to ${CATEGORY_LABEL[tracked.category]} without looking at the result. ` +
        "Point the camera with set_scene_view_camera, take a capture_scene_view, and change the next value only for a defect the frame shows. " +
        "If the frame looks fine, this element is settled: move on to the signature element, lighting, props or verification.",
      requiredActions: ["set_scene_view_camera", "capture_scene_view"],
    },
  };
}
