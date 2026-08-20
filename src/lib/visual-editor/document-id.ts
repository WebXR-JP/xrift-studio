/**
 * Reduces arbitrary text to characters that are safe inside an Asset id or a
 * project-relative path segment.
 *
 * This intentionally preserves dots. An Asset id such as
 * `model-chair.v2-9f13c0a8b2d1` carries both a name and the source hash that
 * makes it unique, and an id-safe segment must not shorten either. A separate
 * helper strips a file extension, and that one takes a file name — never an id.
 */
export function safeIdSegment(value: string, fallback = "asset"): string {
  return (
    value
      .normalize("NFKC")
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 80) || fallback
  );
}

let fallbackIdSequence = 0;

/** Browser-only document ID generator with a monotonic WebView fallback. */
export function createDocumentId(prefix = "document"): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  fallbackIdSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}`;
}
