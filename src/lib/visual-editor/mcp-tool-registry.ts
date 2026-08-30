/**
 * The single list of MCP tools XRift Studio exposes, and which part of the app
 * runs each one.
 *
 * This list had been written out by hand in six places — the Rust allow-list,
 * the Rust JSON schemas, four name arrays here, the dispatcher switch, the
 * shell's external-store list, and the shell's routing conditions — and they had
 * already drifted apart. A tool now exists exactly once, and everything else is
 * derived from this table.
 *
 * The module deliberately imports nothing: the Rust schema generator reads it
 * too, so it must stay free of editor and React dependencies.
 */

/** Where a tool runs, which decides who is allowed to execute it. */
export type XriftMcpToolSurface =
  /** Pure function over the document set. Runs in `mcp-editor-tools`. */
  | "document"
  /** Native file I/O, so the React shell owns it. */
  | "local-asset"
  /** Project file I/O or a Play-mode change, so the React shell owns it. */
  | "script"
  /** Network plus the Import Queue, so the React shell owns it. */
  | "external-store"
  /** Reads the live viewport rather than document history. */
  | "debug";

export type XriftMcpToolDefinition = {
  name: string;
  surface: XriftMcpToolSurface;
};

export const XRIFT_MCP_TOOLS = [
  { name: "get_editor_context", surface: "document" },
  { name: "get_scripting_capabilities", surface: "document" },
  { name: "analyze_component_code", surface: "document" },
  { name: "apply_component_code_import_plan", surface: "document" },
  { name: "list_assets", surface: "document" },
  { name: "update_project_metadata", surface: "document" },
  { name: "create_asset_folder", surface: "document" },
  { name: "rename_asset", surface: "document" },
  { name: "rename_asset_folder", surface: "document" },
  { name: "move_asset", surface: "document" },
  { name: "move_asset_folder", surface: "document" },
  { name: "delete_asset", surface: "document" },
  { name: "delete_asset_folder", surface: "document" },
  { name: "inspect_colliders", surface: "document" },
  { name: "optimize_colliders", surface: "document" },
  { name: "get_audio_asset", surface: "document" },
  { name: "get_model_asset", surface: "document" },
  { name: "get_texture_asset", surface: "document" },
  { name: "update_model_asset", surface: "document" },
  { name: "update_texture_asset", surface: "document" },
  { name: "create_document_asset", surface: "document" },
  { name: "get_particle_asset", surface: "document" },
  { name: "update_particle_asset", surface: "document" },
  { name: "update_scene_settings", surface: "document" },
  { name: "place_asset", surface: "document" },
  { name: "list_entities", surface: "document" },
  { name: "list_component_definitions", surface: "document" },
  { name: "get_entity_components", surface: "document" },
  { name: "get_entity_bounds", surface: "document" },
  { name: "create_primitive", surface: "document" },
  { name: "get_terrain", surface: "document" },
  { name: "sample_terrain_point", surface: "document" },
  { name: "list_terrain_presets", surface: "document" },
  { name: "create_terrain", surface: "document" },
  { name: "create_terrain_from_preset", surface: "document" },
  { name: "apply_terrain_surface", surface: "document" },
  { name: "sculpt_terrain", surface: "document" },
  { name: "update_terrain", surface: "document" },
  { name: "list_terrain_grass_types", surface: "document" },
  { name: "apply_terrain_grass_preset", surface: "document" },
  { name: "add_terrain_grass_layer", surface: "document" },
  { name: "update_terrain_grass_layer", surface: "document" },
  { name: "delete_terrain_grass_layer", surface: "document" },
  { name: "paint_terrain_grass", surface: "document" },
  { name: "place_builtin_prefab", surface: "document" },
  { name: "create_prefab", surface: "document" },
  { name: "add_component", surface: "document" },
  { name: "update_component", surface: "document" },
  { name: "remove_component", surface: "document" },
  { name: "set_entity_enabled", surface: "document" },
  { name: "update_script_component", surface: "document" },
  { name: "update_transform", surface: "document" },
  { name: "set_material", surface: "document" },
  { name: "get_material_asset", surface: "document" },
  { name: "update_material_asset", surface: "document" },
  { name: "create_custom_shader", surface: "document" },
  { name: "get_custom_shader", surface: "document" },
  { name: "update_custom_shader", surface: "document" },
  { name: "set_material_texture_transform", surface: "document" },
  { name: "rename_entity", surface: "document" },
  { name: "duplicate_entity", surface: "document" },
  { name: "reparent_entity", surface: "document" },
  { name: "delete_entity", surface: "document" },
  { name: "create_empty_entity", surface: "document" },
  { name: "list_interactivity_operations", surface: "document" },
  { name: "get_interactivity_asset", surface: "document" },
  { name: "create_interactivity_asset", surface: "document" },
  { name: "add_interactivity_node", surface: "document" },
  { name: "connect_interactivity_nodes", surface: "document" },
  { name: "set_interactivity_value", surface: "document" },
  { name: "set_interactivity_configuration", surface: "document" },
  { name: "configure_interactivity_material_pointer", surface: "document" },
  { name: "disconnect_interactivity_socket", surface: "document" },
  { name: "delete_interactivity_node", surface: "document" },
  { name: "validate_interactivity_asset", surface: "document" },
  { name: "list_interaction_trigger_targets", surface: "document" },

  { name: "import_audio_asset", surface: "local-asset" },
  { name: "import_texture_asset", surface: "local-asset" },
  { name: "import_model_asset", surface: "local-asset" },
  { name: "import_skybox_asset", surface: "local-asset" },
  { name: "import_shader_asset", surface: "local-asset" },
  { name: "reimport_model_asset", surface: "local-asset" },
  { name: "process_texture_asset", surface: "local-asset" },
  { name: "get_shader_asset", surface: "local-asset" },
  { name: "update_shader_asset", surface: "local-asset" },
  { name: "set_project_thumbnail", surface: "local-asset" },

  { name: "list_script_templates", surface: "script" },
  { name: "get_script_asset", surface: "script" },
  { name: "create_script_asset", surface: "script" },
  { name: "apply_script_template", surface: "script" },
  { name: "update_script_asset", surface: "script" },
  { name: "set_play_mode", surface: "script" },

  { name: "search_external_assets", surface: "external-store" },
  { name: "get_external_asset_options", surface: "external-store" },
  { name: "install_external_asset", surface: "external-store" },

  { name: "capture_scene_debug", surface: "debug" },
  { name: "capture_scene_view", surface: "debug" },
  { name: "set_scene_view_camera", surface: "debug" },
] as const satisfies readonly XriftMcpToolDefinition[];

export type XriftMcpToolName = (typeof XRIFT_MCP_TOOLS)[number]["name"];

type ToolNameForSurface<S extends XriftMcpToolSurface> = Extract<
  (typeof XRIFT_MCP_TOOLS)[number],
  { surface: S }
>["name"];

export type XriftMcpEditorToolName = ToolNameForSurface<"document">;
export type XriftMcpLocalAssetToolName = ToolNameForSurface<"local-asset">;
export type XriftMcpScriptToolName = ToolNameForSurface<"script">;
export type XriftMcpExternalStoreTool = ToolNameForSurface<"external-store">;
export type XriftMcpDebugToolName = ToolNameForSurface<"debug">;

const SURFACE_BY_TOOL_NAME = new Map<string, XriftMcpToolSurface>(
  XRIFT_MCP_TOOLS.map((tool) => [tool.name, tool.surface]),
);

/** Undefined for a name this build does not expose, which callers reject. */
export function xriftMcpToolSurface(
  name: string,
): XriftMcpToolSurface | undefined {
  return SURFACE_BY_TOOL_NAME.get(name);
}

function toolNamesForSurface<S extends XriftMcpToolSurface>(
  surface: S,
): readonly ToolNameForSurface<S>[] {
  return XRIFT_MCP_TOOLS.filter((tool) => tool.surface === surface).map(
    (tool) => tool.name,
  ) as ToolNameForSurface<S>[];
}

export const XRIFT_MCP_TOOL_NAMES: readonly XriftMcpToolName[] =
  XRIFT_MCP_TOOLS.map((tool) => tool.name);

export const XRIFT_MCP_EDITOR_TOOLS = toolNamesForSurface("document");
export const XRIFT_MCP_LOCAL_ASSET_TOOLS = toolNamesForSurface("local-asset");
export const XRIFT_MCP_SCRIPT_TOOLS = toolNamesForSurface("script");
export const XRIFT_MCP_EXTERNAL_STORE_TOOLS =
  toolNamesForSurface("external-store");
export const XRIFT_MCP_DEBUG_TOOLS = toolNamesForSurface("debug");
