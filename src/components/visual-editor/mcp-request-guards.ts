/**
 * Argument checks and write gates the editor shell applies before it runs an
 * MCP request against the live EditorSession.
 *
 * These sit in front of the tool implementations in `mcp-editor-tools`: they
 * cover the tools the shell owns because they touch import or network work
 * rather than the document set alone.
 */
import {
  XriftMcpEditorToolError,
  type PrototypeVisualProject,
} from "../../lib/visual-editor";
import type { ScriptCompileError } from "./useScriptRuntime";
import type { EditorMode } from "./types";

/**
 * External store tools reach the network and the Import Queue, so the shell
 * runs them. The list itself belongs to mcp-tool-registry along with every
 * other tool; it is re-exported here so importers of this module keep working.
 */
export {
  XRIFT_MCP_EXTERNAL_STORE_TOOLS,
  type XriftMcpExternalStoreTool,
} from "../../lib/visual-editor";

export function mcpRequiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${name}は空でない文字列で指定してください`,
    );
  }
  return value.trim();
}

export function mcpOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function mcpOptionalScriptLanguage(
  value: unknown,
): "ts" | "tsx" | undefined {
  if (value === undefined) return undefined;
  if (value === "ts" || value === "tsx") return value;
  throw new XriftMcpEditorToolError(
    "INVALID_ARGUMENT",
    "languageはtsまたはtsxで指定してください",
  );
}

export function mcpOptionalInteger(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${name}は0以上の整数で指定してください`,
    );
  }
  return value;
}

export function mcpFiniteNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${name}は${minimum}〜${maximum}の数値で指定してください`,
    );
  }
  return value;
}

export function mcpOptionalVec3(
  value: unknown,
  name: string,
): [number, number, number] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${name}は有限な数値3つの配列で指定してください`,
    );
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

export type McpExternalStoreWriteContext = {
  bundle: PrototypeVisualProject;
  editorMode: EditorMode;
  importBusy: boolean;
  revision: number;
};

/**
 * Applies the same project, scene, and revision boundary the document tools
 * use, plus the Edit-only and import-idle rules an external asset install needs.
 */
export function assertMcpExternalStoreWrite(
  argumentsValue: Record<string, unknown>,
  context: McpExternalStoreWriteContext,
  options: { allowPlay?: boolean } = {},
): void {
  if (context.editorMode !== "edit" && !options.allowPlay) {
    throw new XriftMcpEditorToolError(
      "EDITOR_READ_ONLY",
      "Playを停止してから外部アセットを追加してください",
    );
  }
  if (context.importBusy) {
    throw new XriftMcpEditorToolError(
      "EDITOR_BUSY",
      "Asset Importの完了後に再試行してください",
    );
  }
  const projectId = mcpRequiredString(argumentsValue.projectId, "projectId");
  const sceneId = mcpRequiredString(argumentsValue.sceneId, "sceneId");
  const expectedRevision = mcpOptionalInteger(
    argumentsValue.expectedRevision,
    "expectedRevision",
  );
  if (expectedRevision === undefined) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "expectedRevisionを指定してください",
    );
  }
  if (projectId !== context.bundle.project.projectId) {
    throw new XriftMcpEditorToolError("PROJECT_MISMATCH", "現在のProjectと一致しません");
  }
  if (sceneId !== context.bundle.scene.sceneId) {
    throw new XriftMcpEditorToolError("SCENE_MISMATCH", "現在のSceneと一致しません");
  }
  if (expectedRevision !== context.revision) {
    throw new XriftMcpEditorToolError(
      "STALE_REVISION",
      "Sceneが更新されています。最新のEditor contextを取得してください",
      { expectedRevision, currentRevision: context.revision },
    );
  }
  if (
    argumentsValue.applySkybox !== undefined &&
    typeof argumentsValue.applySkybox !== "boolean"
  ) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "applySkyboxはbooleanで指定してください",
    );
  }
}

/**
 * Reports Script compile failures to MCP without leaking Script source: only
 * the identity, the message, and the approval hash cross the boundary.
 */
export function scriptCompileErrorsForMcp(
  errors: readonly ScriptCompileError[],
): Array<Record<string, unknown>> {
  return errors.map((error) => ({
    assetId: error.assetId,
    assetName: error.assetName,
    relativePath: error.relativePath,
    message: error.message,
    ...(error.code ? { code: error.code } : {}),
    ...(error.trustSnapshot
      ? {
          sourceSha256: error.trustSnapshot.fingerprint.sourceSha256,
        }
      : {}),
  }));
}

/** requestAnimationFrame pauses in a hidden Tauri webview, but MCP must reply. */
export function waitForEditorCommit(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      resolve();
    };
    const fallback = window.setTimeout(finish, 100);
    window.requestAnimationFrame(finish);
  });
}
