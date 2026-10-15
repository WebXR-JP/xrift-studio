import { XriftMcpEditorToolError } from "./mcp-editor-tools";

/** A generated instruction lacks a prerequisite; fresh reasoning can repair it. */
export class ChatgptPlanInputError extends Error {}

export function isChatgptPlanInputError(error: unknown): error is Error {
  return error instanceof ChatgptPlanInputError || error instanceof XriftMcpEditorToolError && [
    "INVALID_ARGUMENT", "INVALID_ARGUMENTS", "ASSET_KIND_MISMATCH", "ASSET_NOT_FOUND",
    "ASSET_NOT_PLACEABLE", "ASSET_REFERENCE_NOT_FOUND", "COMPONENT_NOT_FOUND", "ENTITY_NOT_FOUND",
    "MATERIAL_NOT_FOUND", "MESH_NOT_FOUND", "MODEL_NOT_FOUND", "NO_MATERIAL_AVAILABLE",
    "NOT_MATERIAL", "DEPENDENCY_MISSING", "TRANSFORM_COMPONENT_REQUIRED", "COLLISION_EDIT_REJECTED", "COMPONENT_UPDATE_REJECTED", "DUPLICATE_COMPONENT",
  ].includes(error.code);
}
