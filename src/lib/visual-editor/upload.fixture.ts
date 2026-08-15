import { describeVisualUploadCapabilities } from "./upload";
import {
  SHELL_ENTRY_PATH,
  WebUploadUnsupportedError,
  assertUploadableToken,
  describeSdkError,
  parseShellManifest,
  redactToken,
} from "./web-upload";

/**
 * Assertions for the native/web upload branch. Performs no network request and
 * never touches Tauri IPC.
 *
 * The token rules are the load-bearing part: XRift's Public API v1 has no write
 * scope, so an `xrift_sk_` API key authenticates but cannot publish. Catching
 * that before a bundle is assembled is the difference between an immediate
 * explanation and a 401 after a long upload.
 */
export function runVisualUploadFixtureAssertions(): void {
  assertCapabilities();
  assertTokenRules();
  assertSecretRedaction();
  assertShellManifestRules();
}

function assertShellManifestRules(): void {
  const manifest = parseShellManifest({
    version: "4e10989ee355",
    entry: SHELL_ENTRY_PATH,
    files: [SHELL_ENTRY_PATH, "index-abc.js", "../escape.js", ""],
  });
  assert(
    manifest.files.join(",") === `${SHELL_ENTRY_PATH},index-abc.js`,
    "a shell listing must drop traversal and empty entries before fetching them",
  );
  assert(manifest.version === "4e10989ee355", "shell version was not read");

  // XRift loads the world as a Module Federation remote, so a listing without
  // remoteEntry.js would upload cleanly and then render nothing.
  assertThrows(
    () => parseShellManifest({ version: "1", files: ["index-abc.js"] }),
    `a shell listing without ${SHELL_ENTRY_PATH} was accepted`,
  );
  assertThrows(
    () => parseShellManifest(null),
    "a non-object shell listing was accepted",
  );
}

function assertThrows(run: () => unknown, message: string): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error(message);
}

function assertCapabilities(): void {
  const native = describeVisualUploadCapabilities("native");
  assert(
    native.supportsItems &&
      native.supportsScripts &&
      native.runsPrePublishCheck &&
      !native.requiresToken,
    "the native path must keep full CLI capabilities",
  );

  const web = describeVisualUploadCapabilities("web");
  assert(
    !web.supportsItems,
    "Items need the official CLI and must stay desktop-only",
  );
  assert(
    !web.supportsScripts,
    "runtime.json cannot represent Script source, so web must report no Script support",
  );
  assert(
    !web.runsPrePublishCheck,
    "there is no local build in a browser, so no pre-publish check can run",
  );
  assert(
    web.requiresToken,
    "the web path has no CLI session and must require a token",
  );
}

function assertTokenRules(): void {
  // Only the server can judge a token. Every shape XRift might issue — CLI
  // tokens, API keys, and whatever it adds later — has to pass through.
  for (const token of [
    "xrf_abcdef123456",
    "xrift_sk_abcdef123456",
    "  xrf_abcdef123456  ",
    "xrf_short",
    "sk-live-AbCd+/=123",
    "an-entirely-unfamiliar-token",
  ]) {
    assertDoesNotThrow(
      () => assertUploadableToken(token),
      `token "${token.trim()}" was rejected locally, but only XRift can decide that`,
    );
  }

  const empty = expectThrow(
    () => assertUploadableToken("   "),
    "a blank token was accepted",
  );
  assert(
    empty instanceof WebUploadUnsupportedError && empty.code === "token-invalid",
    "a blank token must be refused with the token-invalid code",
  );

  // A pasted newline would build a malformed Authorization header rather than
  // producing a clean 401.
  expectThrow(
    () => assertUploadableToken("xrf_abc\n123"),
    "a token containing a newline was accepted",
  );
}

function assertSecretRedaction(): void {
  assert(
    redactToken("failed for xrf_supersecretvalue here") ===
      "failed for xrf_[REDACTED] here",
    "a CLI token must never reach the UI",
  );
  assert(
    redactToken("Authorization: Bearer abc.def-ghi") ===
      "Authorization: Bearer [REDACTED]",
    "a bearer header must be redacted",
  );
  // A signed upload URL carries its signature in the query string.
  assert(
    redactToken("PUT https://storage.example/o?X-Goog-Signature=deadbeef&x=1") ===
      "PUT https://storage.example/o?X-Goog-Signature=[REDACTED]&x=1",
    "a signed URL signature must be redacted",
  );

  assert(
    describeSdkError(new Error("boom xrf_leakedtoken")).includes("xrf_[REDACTED]"),
    "describeSdkError must redact tokens it passes through",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(run: () => unknown, message: string): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error(message);
}

function assertDoesNotThrow(run: () => unknown, message: string): void {
  try {
    run();
  } catch (error) {
    throw new Error(`${message}: ${error}`);
  }
}
