/** Public file identity; the existing ZIP container and v1 manifest stay compatible. */
export const PROJECT_PACKAGE_EXTENSION = "xriftstudio";
export const PROJECT_PACKAGE_MIME_TYPE = "application/octet-stream";
export const PROJECT_PACKAGE_ACCEPT = ".xriftstudio,.zip,application/zip,application/x-zip-compressed,application/octet-stream";

/** Shared by desktop dialogs, MCP and the browser's download/share flow. */
export function projectPackageFileName(name: string): string {
  let sanitized = name.trim().replace(/\.(?:xriftstudio|zip)$/i, "")
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, "-")
    .replace(/^[. ]+|[. ]+$/g, "");
  // Windows reserves these names even with an extension. Keep downloads usable
  // after transfer from iPad, and leave room under common 255-byte name limits.
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(sanitized)) sanitized = `xrift-${sanitized}`;
  let stem = "";
  let byteLength = 0;
  const encoder = new TextEncoder();
  for (const character of sanitized) {
    const bytes = encoder.encode(character).length;
    if (stem.length + character.length > 96 || byteLength + bytes > 240) break;
    stem += character;
    byteLength += bytes;
  }
  stem = stem.replace(/[. ]+$/g, "");
  return `${stem || "xrift-project"}.${PROJECT_PACKAGE_EXTENSION}`;
}
