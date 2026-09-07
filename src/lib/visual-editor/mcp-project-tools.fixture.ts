import type { Project } from "../tauri";
import { XriftMcpEditorToolError } from "./mcp-editor-tools";
import {
  buildPublishReadiness,
  inspectVisualPublishMetadata,
  isXriftMcpProjectTool,
  listStarterTemplates,
  parseCreateProjectArguments,
  parseProjectName,
  resolveProjectTarget,
  summarizeProject,
  editorSessionUnavailableError,
} from "./mcp-project-tools";
import { createStarterVisualProject } from "./starter-templates";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectToolError(run: () => unknown, code: string, label: string): void {
  try {
    run();
  } catch (error) {
    assert(
      error instanceof XriftMcpEditorToolError && error.code === code,
      `${label} should fail with ${code}, got ${String(error)}`,
    );
    return;
  }
  throw new Error(`${label} should have been rejected`);
}

const PROJECTS: Project[] = [
  {
    name: "plaza",
    path: "/projects/plaza",
    kind: "world",
    format: "visual",
    title: "Plaza",
    description: "A plaza",
    modifiedAtMs: 0,
    uploadedAt: null,
    publicationId: null,
  },
  {
    name: "legacy",
    path: "/projects/legacy",
    kind: "world",
    format: "classic",
    title: null,
    description: null,
    modifiedAtMs: null,
    uploadedAt: null,
    publicationId: null,
  },
];

export function runXriftMcpProjectToolFixtures(): void {
  assert(isXriftMcpProjectTool("create_project"), "create_project belongs to the project surface");
  assert(!isXriftMcpProjectTool("get_editor_context"), "document tools are not project tools");

  const templates = listStarterTemplates();
  assert(
    templates.some((template) => template.kind === "world" && template.default) &&
      templates.some((template) => template.kind === "item" && template.default),
    "each kind exposes a default starter template",
  );

  assert(parseProjectName("  My World ") === "My World", "names are trimmed");
  expectToolError(() => parseProjectName(""), "INVALID_ARGUMENT", "empty name");
  expectToolError(() => parseProjectName("a/b"), "INVALID_ARGUMENT", "path separator in name");
  expectToolError(() => parseProjectName(".."), "INVALID_ARGUMENT", "parent directory as name");

  const created = parseCreateProjectArguments({ name: "plaza" });
  assert(
    created.kind === "world" && created.templateId === "xrift-official",
    "create_project defaults to a world on the default starter",
  );
  assert(
    parseCreateProjectArguments({ name: "x", kind: "world", templateId: "blank" }).templateId === "blank",
    "an explicit world template is accepted",
  );
  expectToolError(
    () => parseCreateProjectArguments({ name: "x", kind: "item", templateId: "blank" }),
    "INVALID_ARGUMENT",
    "a world template on an item",
  );
  expectToolError(
    () => parseCreateProjectArguments({ name: "x", kind: "avatar" }),
    "INVALID_ARGUMENT",
    "an unknown kind",
  );

  const summary = summarizeProject(PROJECTS[0], "/projects/plaza");
  assert(summary.open && summary.editable && summary.modifiedAt !== null, "the open visual project is reported as open and editable");
  assert(!summarizeProject(PROJECTS[1], null).editable, "classic projects are not editable");

  assert(resolveProjectTarget(PROJECTS, { path: "/projects/plaza" }).name === "plaza", "open_project resolves by path");
  assert(resolveProjectTarget(PROJECTS, { name: "plaza" }).name === "plaza", "open_project resolves by name");
  expectToolError(() => resolveProjectTarget(PROJECTS, {}), "INVALID_ARGUMENT", "open_project without a target");
  expectToolError(() => resolveProjectTarget(PROJECTS, { name: "nope" }), "PROJECT_NOT_FOUND", "an unknown project");
  expectToolError(() => resolveProjectTarget(PROJECTS, { name: "legacy" }), "PROJECT_NOT_EDITABLE", "a classic project");

  const starter = createStarterVisualProject("world", "blank", "plaza");
  const untouched = inspectVisualPublishMetadata(starter);
  assert(untouched.state === "needs-attention" && untouched.reason, "starter metadata is not publishable");
  const edited = inspectVisualPublishMetadata({
    project: {
      ...starter.project,
      metadata: { ...starter.project.metadata, title: "Night Plaza", description: "A quiet plaza at night" },
    },
  });
  assert(edited.state === "ready", "edited metadata is publishable");

  const blocked = buildPublishReadiness({
    kind: "world",
    metadata: untouched,
    thumbnail: { state: "needs-attention", source: "template" },
    signedIn: false,
    diagnostics: [{ severity: "blocking", code: "x", message: "broken" }],
  });
  assert(!blocked.ready, "unmet requirements block publishing");
  assert(
    blocked.nextActions.join(",") === "update_project_metadata,set_project_thumbnail,login",
    `blocked readiness names the tools that clear it, got ${blocked.nextActions.join(",")}`,
  );
  assert(blocked.blockingDiagnostics.length === 1, "blocking diagnostics are listed");

  const ready = buildPublishReadiness({
    kind: "world",
    metadata: edited,
    thumbnail: { state: "ready", source: "project", sha256: "abc" },
    signedIn: true,
    displayName: "Ryu",
    diagnostics: [{ severity: "warning", code: "y", message: "large" }],
    remoteId: "world-1",
  });
  assert(ready.ready && ready.nextActions[0] === "publish_project", "met requirements lead to publish_project");
  assert(ready.warningDiagnostics.length === 1, "warnings do not block");
  assert(
    ready.requirements.find((requirement) => requirement.id === "target")?.detail.includes("world-1"),
    "an existing publication is reported as the update target",
  );

  const unavailable = editorSessionUnavailableError("get_editor_context");
  assert(unavailable.code === "EDITOR_UNAVAILABLE", "editor-less calls get EDITOR_UNAVAILABLE");
}
