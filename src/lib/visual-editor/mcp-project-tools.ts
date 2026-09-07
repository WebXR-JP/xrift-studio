/**
 * Pure helpers behind the `project` MCP surface: creating, opening and
 * publishing a project, and reading the signed-in account.
 *
 * The desktop shell (`App.tsx`) owns the side effects because the Editor only
 * exists once a project is open. Everything that can be decided without the
 * shell lives here so the CLI fixture can exercise the same rules.
 */

import type { Project, ProjectKind } from "../tauri";
import type { PublishThumbnailReadiness } from "../publish-readiness";
import type { CompilerDiagnostic } from "./compiler/types";
import type { PrototypeVisualProject } from "./prototype-project";
import { XriftMcpEditorToolError } from "./mcp-editor-tools";
import {
  STARTER_ITEM_TEMPLATES,
  STARTER_WORLD_TEMPLATES,
  defaultVisualStarterTemplateId,
  isStarterTemplateForKind,
  type VisualStarterTemplateId,
} from "./starter-templates";
import { XRIFT_MCP_PROJECT_TOOLS, type XriftMcpProjectToolName } from "./mcp-tool-registry";

export function isXriftMcpProjectTool(name: string): name is XriftMcpProjectToolName {
  return (XRIFT_MCP_PROJECT_TOOLS as readonly string[]).includes(name);
}

export type StarterTemplateSummary = {
  id: VisualStarterTemplateId;
  kind: ProjectKind;
  name: string;
  description: string;
  default: boolean;
};

export function listStarterTemplates(): StarterTemplateSummary[] {
  return [
    ...STARTER_WORLD_TEMPLATES.map((template) => ({
      id: template.id,
      kind: "world" as const,
      name: template.name,
      description: template.description,
      default: template.id === defaultVisualStarterTemplateId("world"),
    })),
    ...STARTER_ITEM_TEMPLATES.map((template) => ({
      id: template.id,
      kind: "item" as const,
      name: template.name,
      description: template.description,
      default: template.id === defaultVisualStarterTemplateId("item"),
    })),
  ];
}

const PROJECT_NAME_MAX_LENGTH = 80;

/**
 * The name becomes the project directory, so it must be a single path segment.
 * Everything else the file system accepts is fine; the check exists to keep
 * `..`, separators and control characters away from the Rust path validation.
 */
export function parseProjectName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new XriftMcpEditorToolError("INVALID_ARGUMENT", "nameは空でない文字列で指定してください");
  }
  const name = value.trim();
  if (
    name.length > PROJECT_NAME_MAX_LENGTH ||
    name === "." ||
    name === ".." ||
    /[\\/\0-\x1f<>:"|?*]/.test(name) ||
    name.endsWith(".")
  ) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `nameはフォルダー名として使える${PROJECT_NAME_MAX_LENGTH}文字以内の文字列で指定してください。パス区切りは使えません`,
      { name },
    );
  }
  return name;
}

export type CreateProjectArguments = {
  kind: ProjectKind;
  name: string;
  templateId: VisualStarterTemplateId;
};

export function parseCreateProjectArguments(
  args: Record<string, unknown>,
): CreateProjectArguments {
  const kind = args.kind ?? "world";
  if (kind !== "world" && kind !== "item") {
    throw new XriftMcpEditorToolError("INVALID_ARGUMENT", "kindはworldまたはitemで指定してください");
  }
  const name = parseProjectName(args.name);
  const templateId = args.templateId ?? defaultVisualStarterTemplateId(kind);
  if (
    typeof templateId !== "string" ||
    !isStarterTemplateForKind(kind, templateId as VisualStarterTemplateId)
  ) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `templateIdは${kind}用のスターターから選んでください。list_starter_templatesで一覧を取得できます`,
      { kind, templateId },
    );
  }
  return { kind, name, templateId: templateId as VisualStarterTemplateId };
}

export type ProjectSummary = {
  name: string;
  path: string;
  kind: ProjectKind;
  format: Project["format"];
  title: string | null;
  description: string | null;
  modifiedAt: string | null;
  uploadedAt: string | null;
  publicationId: string | null;
  /** Only Visual projects can be opened and edited through MCP. */
  editable: boolean;
  open: boolean;
};

export function summarizeProject(project: Project, openPath: string | null): ProjectSummary {
  return {
    name: project.name,
    path: project.path,
    kind: project.kind,
    format: project.format,
    title: project.title,
    description: project.description,
    modifiedAt:
      project.modifiedAtMs === null ? null : new Date(project.modifiedAtMs).toISOString(),
    uploadedAt: project.uploadedAt,
    publicationId: project.publicationId,
    editable: project.format === "visual",
    open: openPath !== null && project.path === openPath,
  };
}

/** Finds the project `open_project` names by path or, failing that, by name. */
export function resolveProjectTarget(
  projects: readonly Project[],
  args: Record<string, unknown>,
): Project {
  const path = typeof args.path === "string" ? args.path.trim() : "";
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!path && !name) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "pathまたはnameでプロジェクトを指定してください。list_projectsで一覧を取得できます",
    );
  }
  const found =
    (path && projects.find((project) => project.path === path)) ||
    (name && projects.find((project) => project.name === name));
  if (!found) {
    throw new XriftMcpEditorToolError(
      "PROJECT_NOT_FOUND",
      "指定したプロジェクトが見つかりません。list_projectsで一覧を確認してください",
      { path: path || undefined, name: name || undefined },
    );
  }
  if (found.format !== "visual") {
    throw new XriftMcpEditorToolError(
      "PROJECT_NOT_EDITABLE",
      "ClassicプロジェクトはMCPから開けません。Visualプロジェクトを選ぶか、create_projectで新しく作ってください",
      { path: found.path, format: found.format },
    );
  }
  return found;
}

/**
 * Finds a Library project for tools that copy it whole: duplicate_project and
 * export_project. Unlike resolveProjectTarget, a Classic project is a valid
 * target because the copy never opens it in the Editor.
 */
export function resolveTransferableProject(
  projects: readonly Project[],
  args: Record<string, unknown>,
): Project {
  const path = typeof args.path === "string" ? args.path.trim() : "";
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!path && !name) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      "pathまたはnameでプロジェクトを指定してください。list_projectsで一覧を取得できます",
    );
  }
  const found =
    (path && projects.find((project) => project.path === path)) ||
    (name && projects.find((project) => project.name === name));
  if (!found) {
    throw new XriftMcpEditorToolError(
      "PROJECT_NOT_FOUND",
      "指定したプロジェクトが見つかりません。list_projectsで一覧を確認してください",
      { path: path || undefined, name: name || undefined },
    );
  }
  return found;
}

/** The folder name a duplicate or an import lands in; refuses one already taken. */
export function parseNewProjectDirectoryName(
  args: Record<string, unknown>,
  key: string,
  projects: readonly Project[],
): string {
  const name = parseProjectName(args[key]);
  const existing = projects.find((project) => project.name === name);
  if (existing) {
    throw new XriftMcpEditorToolError(
      "PROJECT_EXISTS",
      `同じ名前のプロジェクトがすでにあります。${key}に別の名前を指定してください`,
      { path: existing.path, name },
    );
  }
  return name;
}

export function parseOptionalProjectTitle(args: Record<string, unknown>): string | undefined {
  if (args.title === undefined || args.title === null) return undefined;
  if (typeof args.title !== "string" || !args.title.trim()) {
    throw new XriftMcpEditorToolError("INVALID_ARGUMENT", "titleは空でない文字列で指定してください");
  }
  return args.title.trim();
}

export function parseRequiredPath(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new XriftMcpEditorToolError(
      "INVALID_ARGUMENT",
      `${key}は絶対パスの文字列で指定してください`,
    );
  }
  return value.trim();
}

export type PublishMetadataReadiness = {
  state: "ready" | "needs-attention";
  title: string;
  description: string;
  /** Present when the metadata still reads as the starter template's. */
  reason?: string;
};

/**
 * A starter project is born with the template's name and description. Those
 * must be replaced before publishing, so the check compares against every
 * starter definition rather than against emptiness alone.
 */
export function inspectVisualPublishMetadata(
  bundle: Pick<PrototypeVisualProject, "project">,
): PublishMetadataReadiness {
  const title = bundle.project.metadata.title?.trim() ?? "";
  const description = bundle.project.metadata.description?.trim() ?? "";
  const templates = [...STARTER_WORLD_TEMPLATES, ...STARTER_ITEM_TEMPLATES];
  let reason: string | undefined;
  if (!title) reason = "タイトルが空です";
  else if (!description) reason = "説明が空です";
  else if (templates.some((template) => template.description === description)) {
    reason = "説明がスターターのままです";
  } else if (templates.some((template) => template.name === title)) {
    reason = "タイトルがスターターのままです";
  }
  return {
    state: reason ? "needs-attention" : "ready",
    title,
    description,
    ...(reason ? { reason } : {}),
  };
}

export type PublishRequirement = {
  id: "metadata" | "thumbnail" | "account" | "diagnostics" | "target";
  ready: boolean;
  detail: string;
  /** The tool that clears this requirement, when one exists. */
  nextAction?: string;
};

export type PublishReadinessInput = {
  kind: ProjectKind;
  metadata: PublishMetadataReadiness;
  thumbnail: PublishThumbnailReadiness;
  signedIn: boolean;
  displayName?: string | null;
  diagnostics: readonly CompilerDiagnostic[];
  remoteId?: string | null;
};

export type PublishReadinessReport = {
  ready: boolean;
  requirements: PublishRequirement[];
  blockingDiagnostics: CompilerDiagnostic[];
  warningDiagnostics: CompilerDiagnostic[];
  nextActions: string[];
};

export function buildPublishReadiness(input: PublishReadinessInput): PublishReadinessReport {
  const blocking = input.diagnostics.filter((diagnostic) => diagnostic.severity === "blocking");
  const warnings = input.diagnostics.filter((diagnostic) => diagnostic.severity !== "blocking");
  const label = input.kind === "world" ? "ワールド" : "アイテム";
  const requirements: PublishRequirement[] = [
    {
      id: "metadata",
      ready: input.metadata.state === "ready",
      detail:
        input.metadata.state === "ready"
          ? `${input.metadata.title} / 説明設定済み`
          : `${input.metadata.reason ?? "タイトルと説明を設定してください"}。update_project_metadataで公開用のタイトルと説明を書いてください`,
      nextAction: "update_project_metadata",
    },
    {
      id: "thumbnail",
      ready: input.thumbnail.state === "ready",
      detail:
        input.thumbnail.state === "ready"
          ? "public/thumbnail.pngを確認済み"
          : input.thumbnail.source === "template"
            ? "サムネイルがスターターのままです。set_scene_view_cameraで見せたい構図にしてからset_project_thumbnailで撮影してください"
            : input.thumbnail.source === "missing"
              ? "サムネイルがありません。set_project_thumbnailで撮影してください"
              : "サムネイルを読み取れません。プロジェクトを保存してから再試行してください",
      nextAction: "set_project_thumbnail",
    },
    {
      id: "account",
      ready: input.signedIn,
      detail: input.signedIn
        ? input.displayName || "ログイン済み"
        : "XRiftにログインしていません。loginを呼ぶとブラウザで認証が始まります。完了はget_accountで確認します",
      nextAction: "login",
    },
    {
      id: "diagnostics",
      ready: blocking.length === 0,
      detail:
        blocking.length === 0
          ? "公開を止める問題はありません"
          : `公開を止める問題が${blocking.length}件あります。blockingDiagnosticsのentityIdとassetIdを直してください`,
    },
    {
      id: "target",
      ready: true,
      detail: input.remoteId
        ? `既存の${label}を更新します: ${input.remoteId}`
        : `新しい${label}として公開します`,
    },
  ];
  const nextActions = requirements
    .filter((requirement) => !requirement.ready && requirement.nextAction)
    .map((requirement) => requirement.nextAction as string);
  const ready = requirements.every((requirement) => requirement.ready);
  return {
    ready,
    requirements,
    blockingDiagnostics: blocking,
    warningDiagnostics: warnings,
    nextActions: ready ? ["publish_project"] : nextActions,
  };
}

/** The error a non-project tool gets while no Editor session is open. */
export function editorSessionUnavailableError(tool: string): XriftMcpEditorToolError {
  return new XriftMcpEditorToolError(
    "EDITOR_UNAVAILABLE",
    `${tool}は開いているプロジェクトが必要です。list_projectsとopen_projectで開くか、create_projectで新しく作ってください`,
    { tool, nextActions: ["list_projects", "open_project", "create_project"] },
  );
}
