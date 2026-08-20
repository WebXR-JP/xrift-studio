import {
  didXriftUploadStopBeforeRemoteTransfer,
  formatPublishCommandFailure,
  parseXriftUploadResult,
  sanitizePublishFailure,
  type XriftUploadResult,
} from "./publish";
import { VisualPublishCancellationController } from "./publish-cancellation";

/**
 * Lightweight, deterministic assertions for the XRift upload result boundary.
 * The fixture never invokes the CLI or performs a network request.
 */
export function runVisualPublishFixtureAssertions(): void {
  runCancellationAssertions();
  assertResult(
    parseXriftUploadResult(
      '{"worldId":"world-01","versionId":"version-02","versionNumber":3,"contentHash":"abc123"}',
    ),
    {
      worldId: "world-01",
      contentId: "world-01",
      versionId: "version-02",
      versionNumber: 3,
      contentHash: "abc123",
    },
    "compact World JSON",
  );

  assertResult(
    parseXriftUploadResult(`Upload complete
{
  "payload": {
    "upload": {
      "result": {
        "item_id": "item-11",
        "version_id": "version-12",
        "version_number": "4",
        "content_hash": "def456",
        "url": "https://xrift.net/items/item-11"
      }
    }
  }
}`),
    {
      itemId: "item-11",
      contentId: "item-11",
      versionId: "version-12",
      versionNumber: 4,
      contentHash: "def456",
      url: "https://xrift.net/items/item-11",
    },
    "pretty nested Item JSON",
  );

  assertResult(
    parseXriftUploadResult(
      "\u001b[32mWorld ID：world-labelled\u001b[0m\nVersion ID: version-labelled\nVersion Number = 9\nContent Hash: feedface\nURL: https://xrift.net/worlds/world-labelled",
    ),
    {
      worldId: "world-labelled",
      contentId: "world-labelled",
      versionId: "version-labelled",
      versionNumber: 9,
      contentHash: "feedface",
      url: "https://xrift.net/worlds/world-labelled",
    },
    "labelled CLI output",
  );

  assertResult(
    parseXriftUploadResult("Upload completed successfully."),
    {},
    "successful output without structured fields",
  );

  assertResult(
    parseXriftUploadResult("✅ World upload complete (version: 3)"),
    { versionNumber: 3 },
    "official CLI completion output",
  );
  assert(
    didXriftUploadStopBeforeRemoteTransfer("No files found to upload"),
    "Explicit pre-remote empty output was not recognized",
  );
  assert(
    didXriftUploadStopBeforeRemoteTransfer(
      "Build failed\nCommand failed: npm run build",
    ),
    "Explicit pre-remote build failure was not recognized",
  );
  assert(
    !didXriftUploadStopBeforeRemoteTransfer("📤 Uploading files..."),
    "Remote transfer output was mistaken for a safe pre-remote stop",
  );

  const jwt = "eyJhbGciOiJIUzI1NiJ9.c2VjcmV0LXBheWxvYWQ.c2VjcmV0LXNpZ25hdHVyZQ";
  const sanitized = sanitizePublishFailure(
    [
      "HTTP 401: authentication expired",
      "Authorization: Bearer very-secret-token",
      "access_token=another-secret",
      `session=${jwt}`,
      "source C:\\Users\\developer\\XRift Project\\scene.json",
      "temporary /Users/developer/Library/Caches/xrift/output.json",
      "request https://name:password@api.xrift.net/upload?token=query-secret",
    ].join("\n"),
    ["C:\\Users\\developer\\XRift Project"],
  );
  assert(sanitized.includes("HTTP 401"), "Sanitizer removed the actionable status");
  for (const secret of [
    "very-secret-token",
    "another-secret",
    jwt,
    "C:\\Users\\developer",
    "/Users/developer",
    "name:password",
    "query-secret",
  ]) {
    assert(!sanitized.includes(secret), `Sanitizer exposed ${secret}`);
  }

  const templateFailure = formatPublishCommandFailure(
    "XRiftテンプレートの作成",
    {
      stderr: "- Downloading template...",
      stdout: "Error: GitHub returned 403 for the requested template",
    },
  );
  assert(
    templateFailure.detail.includes("GitHub returned 403"),
    "Command diagnostics discarded actionable stdout after stderr output",
  );
  assert(
    templateFailure.summary.includes("GitHubへのアクセス"),
    "Template download failure did not offer a recovery action",
  );

  // `xrift check` prints its verdict and then closes with an example config.
  // Reporting only the tail of the output dropped the verdict entirely, so the
  // author saw the closing braces of the hint and nothing about the rejection.
  const checkFailure = formatPublishCommandFailure("Worldの検査", {
    stderr: "- Loading config...\n- Scanning files...\n✔ Found 28 JS files",
    stdout: [
      "🔒 Starting security check",
      "━━━ __federation_expose_World-BxGL9Aml.js ━━━",
      "  Score: 100  Verdict: REJECT",
      "  ✗ [no-obfuscation] 疑わしい変数名が検出されました: $a0PbU$FileLoader",
      "Results: 28 files  APPROVE: 27  REJECT: 1",
      "❌ Security check failed",
      "💡 Hint: Some rules can be allowed via world.permissions in xrift.json:",
      '  - "no-obfuscation" → Add to allowedCodeRules to allow',
      "  Example:",
      "  {",
      '      "world": {',
      '          "permissions": {',
      '              "allowedCodeRules": [',
      '                  "no-obfuscation"',
      "              ]",
      "          }",
      "      }",
      "  }",
    ].join("\n"),
  });
  for (const evidence of [
    "no-obfuscation",
    "REJECT",
    "__federation_expose_World-BxGL9Aml.js",
    "Loading config",
  ]) {
    assert(
      checkFailure.detail.includes(evidence),
      `Check failure output lost "${evidence}"`,
    );
  }
  assert(
    checkFailure.summary.includes("Worldの検査に失敗しました"),
    "Check failure summary did not name the failed step",
  );
  // The summary has to say what went wrong, not merely that something did.
  assert(
    checkFailure.summary.includes("no-obfuscation"),
    `Check failure summary did not name the reason: ${checkFailure.summary}`,
  );
  assert(
    !checkFailure.summary.includes("✗"),
    "Check failure summary kept the CLI's marker character",
  );
  // Output with no marked verdict must not have a line promoted by position.
  const unmarkedFailure = formatPublishCommandFailure("Worldの検査", {
    stderr: "",
    stdout: "step one\nstep two\nstep three",
  });
  assert(
    unmarkedFailure.summary.includes("下のCLI出力"),
    "Unmarked output should point at the full log instead of guessing a reason",
  );
}

function runCancellationAssertions(): void {
  const cancellation = new VisualPublishCancellationController();
  const progressController = cancellation.begin();
  cancellation.update(progressController, true);
  cancellation.update(progressController, false);
  cancellation.update(progressController, true);
  assert(
    !progressController.signal.aborted,
    "Progress changes must never abort an upload attempt",
  );
  assert(cancellation.requestCancel(), "Safe cancellation request was ignored");
  assert(
    progressController.signal.aborted,
    "Explicit safe cancellation did not abort the attempt",
  );
  cancellation.finish(progressController);

  const remoteController = cancellation.begin();
  cancellation.update(remoteController, false);
  assert(
    !cancellation.abortOnUnmount(),
    "Remote commit stage must not promise cancellation on unmount",
  );
  assert(
    !remoteController.signal.aborted,
    "Remote commit stage was aborted on unmount",
  );
  cancellation.finish(remoteController);
}

function assertResult(
  actual: XriftUploadResult,
  expected: XriftUploadResult,
  label: string,
): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} fixture failed: ${JSON.stringify(actual)}`,
  );
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
