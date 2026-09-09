/** Resolve bundled catalog files both at the app root and under a preview subpath. */
export function catalogPublicAssetUrl(
  publicPath: string,
  baseUrl: string = import.meta.env?.BASE_URL ?? "/",
): string {
  return `${baseUrl.replace(/\/?$/, "/")}${publicPath.replace(/^\/+/, "")}`;
}
