/** Public file identity; the existing ZIP container and v1 manifest stay compatible. */
export const PROJECT_PACKAGE_EXTENSION = "xriftstudio";
export const PROJECT_PACKAGE_MIME_TYPE = "application/octet-stream";
export const PROJECT_PACKAGE_ACCEPT = ".xriftstudio,.zip,application/zip,application/x-zip-compressed,application/octet-stream";

/** Shared by desktop dialogs, MCP and the browser's download/share flow. */
export function projectPackageFileName(name: string): string {
  const stem = name.trim().replace(/\.(?:xriftstudio|zip)$/i, "")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .replace(/^[. ]+|[. ]+$/g, "").slice(0, 96).replace(/[. ]+$/g, "");
  return `${stem || "xrift-project"}.${PROJECT_PACKAGE_EXTENSION}`;
}
