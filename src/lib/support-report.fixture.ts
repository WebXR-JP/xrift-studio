import {
  sanitizeSupportErrorDetail,
  sanitizeSupportErrorMessage,
} from "./support-report";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runSupportReportFixtureAssertions(): void {
  // A failure summary tells a reader that something broke; the tool output
  // tells them what. A report carrying only the first is not actionable, so
  // the detail has to survive sanitizing with its verdict lines intact.
  const cliOutput = [
    "🔒 Starting security check",
    "━━━ __federation_expose_World-BxGL9Aml.js ━━━",
    "  Score: 100  Verdict: REJECT",
    "  ✗ [no-obfuscation] 疑わしい変数名が検出されました: $a0PbU$FileLoader",
    "Results: 28 files  APPROVE: 27  REJECT: 1",
  ].join("\n");
  const detail = sanitizeSupportErrorDetail(cliOutput);
  assert(detail !== null, "Support report dropped the CLI output entirely");
  for (const evidence of ["no-obfuscation", "REJECT", "APPROVE: 27"]) {
    assert(
      detail.includes(evidence),
      `Support report lost "${evidence}" from the CLI output`,
    );
  }

  // Tool output is longer than a message, so it must not be cut to the message
  // budget — a report truncated before the verdict is the problem this guards.
  const long = `${"filler line\n".repeat(400)}  ✗ [no-obfuscation] final verdict`;
  const longDetail = sanitizeSupportErrorDetail(long);
  assert(longDetail !== null, "Long CLI output was dropped");
  assert(
    longDetail.length > (sanitizeSupportErrorMessage(long)?.length ?? 0),
    "CLI output was cut to the shorter message budget",
  );

  // Redaction still applies to the larger budget.
  const secrets = [
    "Authorization: Bearer very-secret-token",
    "access_token=another-secret",
    "source C:\\Users\\developer\\XRift Project\\scene.json",
    "temporary /Users/developer/Library/Caches/xrift/output.json",
  ].join("\n");
  const sanitized = sanitizeSupportErrorDetail(secrets) ?? "";
  for (const secret of [
    "very-secret-token",
    "another-secret",
    "C:\\Users\\developer",
    "/Users/developer",
  ]) {
    assert(
      !sanitized.includes(secret),
      `Support report detail exposed ${secret}`,
    );
  }

  assert(
    sanitizeSupportErrorDetail(undefined) === null,
    "Missing CLI output should stay absent rather than become an empty section",
  );
}
