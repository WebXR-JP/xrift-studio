/**
 * Built XRift modules and their assets are served together at the world/item
 * root. Pin them to that module's version: the host's context can already point
 * at the next version while an earlier component is still mounted.
 * Source modules in Vite development and non-HTTP module URLs use the host base.
 */
export function publishedAssetBaseUrl(moduleUrl: string): string | null {
  try {
    const url = new URL(moduleUrl);
    if (!/^https?:$/.test(url.protocol) || !url.pathname.endsWith(".js")) return null;
    return new URL(".", url).href;
  } catch {
    return null;
  }
}
