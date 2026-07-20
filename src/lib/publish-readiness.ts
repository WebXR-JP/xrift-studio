import { tauri, type ProjectKind } from "./tauri";

export type PublishReadinessState = "ready" | "needs-attention" | "unavailable";

export type PublishThumbnailReadiness = {
  state: PublishReadinessState;
  source: "project" | "template" | "missing" | "unavailable";
  sha256?: string;
};

export type PublishReadiness = {
  metadata: {
    state: PublishReadinessState;
    title: string;
    description: string;
  };
  thumbnail: PublishThumbnailReadiness;
  ready: boolean;
};

const TEMPLATE_METADATA: Record<
  ProjectKind,
  { title: string; description: string }
> = {
  world: {
    title: "サンプルワールド",
    description: "React Three FiberとRapierで作られたサンプルワールドです",
  },
  item: {
    title: "Sample Item",
    description: "A sample item created with XRift item template",
  },
};

const TEMPLATE_THUMBNAIL_SHA256: Record<ProjectKind, string> = {
  world: "bd0e67abf075b0f0b8e5c41fcdc06289e4e8fc189babdf625556ad4c1b3596ea",
  item: "ab09c30d05ada23aa7e0af32f06e214dce853a05a7b9b346a29cfaa61401527c",
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readMetadata(
  raw: string,
  projectKind: ProjectKind,
): PublishReadiness["metadata"] {
  try {
    const parsed = JSON.parse(raw);
    const config = parsed && typeof parsed === "object" ? parsed[projectKind] : null;
    const title = stringValue(config?.title);
    const description = stringValue(config?.description);
    const template = TEMPLATE_METADATA[projectKind];
    const isTemplate =
      !title ||
      !description ||
      title === template.title ||
      description === template.description;

    return {
      state: isTemplate ? "needs-attention" : "ready",
      title,
      description,
    };
  } catch {
    return { state: "unavailable", title: "", description: "" };
  }
}

async function sha256DataUrl(dataUrl: string): Promise<string | null> {
  try {
    const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    return null;
  }
}

export async function inspectPublishThumbnail(
  projectPath: string,
  projectKind: ProjectKind,
): Promise<PublishThumbnailReadiness> {
  try {
    const thumbnail = await tauri.readThumbnail(projectPath);
    if (!thumbnail) return { state: "needs-attention", source: "missing" };

    const digest = await sha256DataUrl(thumbnail);
    if (!digest) return { state: "unavailable", source: "unavailable" };
    const template = digest === TEMPLATE_THUMBNAIL_SHA256[projectKind];
    return template
      ? { state: "needs-attention", source: "template", sha256: digest }
      : { state: "ready", source: "project", sha256: digest };
  } catch {
    return { state: "unavailable", source: "unavailable" };
  }
}

export async function inspectPublishReadiness(
  projectPath: string,
  projectKind: ProjectKind,
): Promise<PublishReadiness> {
  const [metadataResult, thumbnail] = await Promise.all([
    tauri
      .readTextFile(projectPath, "xrift.json")
      .then((raw) => readMetadata(raw, projectKind))
      .catch(() => ({
        state: "unavailable" as const,
        title: "",
        description: "",
      })),
    inspectPublishThumbnail(projectPath, projectKind),
  ]);

  return {
    metadata: metadataResult,
    thumbnail,
    ready: metadataResult.state === "ready" && thumbnail.state === "ready",
  };
}
