import { tauri } from "../tauri";
import {
  publishVisualProject,
  type PublishVisualProjectRequest,
  type XriftUploadResult,
} from "./publish";
import {
  uploadVisualProjectFromWeb,
  type WebUploadRequest,
} from "./web-upload";

/**
 * Single entry point for publishing, branching on where Studio is running.
 *
 * The two paths reach XRift by genuinely different means and neither can
 * substitute for the other:
 *
 * - `native` (Tauri): stages an XRift template on disk, runs the project's
 *   `buildCommand`, and hands off to the official CLI. Full fidelity — Scripts,
 *   Items, and `xrift check --build` all work.
 * - `web`: no shell, no filesystem, no build. Publishes the compiler's
 *   `classic-runtime` output through `@xrift/sdk`, which is fetch-based and
 *   runs unchanged in a browser.
 *
 * Callers should branch their UI on `resolveVisualUploadEnvironment()` before
 * collecting input, because the web path needs a token and cannot accept
 * Scripts or Items at all.
 */

export type VisualUploadEnvironment = "native" | "web";

/**
 * Reports which upload path this build will take.
 *
 * `tauri.isAvailable()` is the same check the rest of the app uses to decide
 * whether IPC exists, so the editor cannot end up in a state where the UI
 * offers one path and the upload takes the other.
 */
export function resolveVisualUploadEnvironment(): VisualUploadEnvironment {
  return tauri.isAvailable() ? "native" : "web";
}

export type VisualUploadRequest =
  | ({ environment: "native" } & PublishVisualProjectRequest)
  | ({ environment: "web" } & WebUploadRequest);

/**
 * Publishes through whichever path the request declares.
 *
 * The environment is carried on the request rather than resolved here so that
 * the caller which gathered the inputs and the code which uses them cannot
 * disagree — a web request assembled without a token would otherwise silently
 * take the native path and fail much later.
 */
export async function uploadVisualProject(
  request: VisualUploadRequest,
): Promise<XriftUploadResult> {
  if (request.environment === "web") {
    return await uploadVisualProjectFromWeb(request);
  }
  return await publishVisualProject(request);
}

export type VisualUploadCapabilities = {
  environment: VisualUploadEnvironment;
  /** Items require the official CLI, so they are desktop-only. */
  supportsItems: boolean;
  /** `runtime.json` cannot represent executable Script source. */
  supportsScripts: boolean;
  /** The web path has no local build, so nothing to check first. */
  runsPrePublishCheck: boolean;
  /** The web path needs an `xrf_` token supplied by the user. */
  requiresToken: boolean;
};

/**
 * Describes what the current environment can publish.
 *
 * Exists so the dialog can explain a limitation up front instead of letting
 * someone assemble a Script-bearing world and fail at compile time.
 */
export function describeVisualUploadCapabilities(
  environment: VisualUploadEnvironment = resolveVisualUploadEnvironment(),
): VisualUploadCapabilities {
  const native = environment === "native";
  return {
    environment,
    supportsItems: native,
    supportsScripts: native,
    runsPrePublishCheck: native,
    requiresToken: !native,
  };
}
