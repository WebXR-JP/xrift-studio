import { describeVisualUploadCapabilities } from "./upload";
import {
  WebUploadUnsupportedError,
  assertUploadableToken,
  describeSdkError,
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
  // A CLI token is the only thing that can publish.
  assertDoesNotThrow(
    () => assertUploadableToken("xrf_abcdef123456"),
    "a valid CLI token was rejected",
  );
  assertDoesNotThrow(
    () => assertUploadableToken("  xrf_abcdef123456  "),
    "a padded CLI token was rejected; pasted tokens commonly carry whitespace",
  );

  const apiKey = expectThrow(
    () => assertUploadableToken("xrift_sk_abcdef123456"),
    "an API key was accepted despite having no write scope",
  );
  assert(
    apiKey instanceof WebUploadUnsupportedError && apiKey.code === "token-invalid",
    "an API key must be refused with the token-invalid code",
  );
  assert(
    apiKey.message.includes("xrf_"),
    "refusing an API key must name the token that does work",
  );

  expectThrow(
    () => assertUploadableToken(""),
    "an empty token was accepted",
  );
  expectThrow(
    () => assertUploadableToken("ghp_abcdef123456"),
    "an unrelated token format was accepted",
  );
  expectThrow(
    () => assertUploadableToken("xrf_short"),
    "an implausibly short CLI token was accepted",
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
