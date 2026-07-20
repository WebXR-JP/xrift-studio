import { tauri } from "./tauri";

export type PublishReadinessState = "ready" | "needs-attention" | "unavailable";

export type PublishReadiness = {
  metadata: {
    state: PublishReadinessState;
    title: string;
    description: string;
  };
  thumbnail: {
    state: PublishReadinessState;
  };
  ready: boolean;
};

const TEMPLATE_TITLE = "サンプルワールド";
const TEMPLATE_DESCRIPTION = "React Three FiberとRapierで作られたサンプルワールドです";
const TEMPLATE_THUMBNAIL_SHA256 =
  "bd0e67abf075b0f0b8e5c41fcdc06289e4e8fc189babdf625556ad4c1b3596ea";

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readMetadata(raw: string): PublishReadiness["metadata"] {
  try {
    const parsed = JSON.parse(raw);
    const world = parsed && typeof parsed === "object" ? parsed.world : null;
    const title = stringValue(world?.title);
    const description = stringValue(world?.description);
    const isTemplate =
      !title ||
      !description ||
      title === TEMPLATE_TITLE ||
      description === TEMPLATE_DESCRIPTION;

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

async function readThumbnail(projectPath: string): Promise<PublishReadiness["thumbnail"]> {
  try {
    const thumbnail = await tauri.readThumbnail(projectPath);
    if (!thumbnail) return { state: "needs-attention" };

    const digest = await sha256DataUrl(thumbnail);
    if (!digest) return { state: "unavailable" };
    return {
      state:
        digest === TEMPLATE_THUMBNAIL_SHA256 ? "needs-attention" : "ready",
    };
  } catch {
    return { state: "unavailable" };
  }
}

export async function inspectPublishReadiness(
  projectPath: string,
): Promise<PublishReadiness> {
  const [metadataResult, thumbnail] = await Promise.all([
    tauri
      .readTextFile(projectPath, "xrift.json")
      .then(readMetadata)
      .catch(() => ({
        state: "unavailable" as const,
        title: "",
        description: "",
      })),
    readThumbnail(projectPath),
  ]);

  return {
    metadata: metadataResult,
    thumbnail,
    ready: metadataResult.state === "ready" && thumbnail.state === "ready",
  };
}
