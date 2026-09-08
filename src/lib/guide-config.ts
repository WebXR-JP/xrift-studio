import rawManifest from "../../docs/guide/manifest.json";
import type { GuideManifest } from "./guide-utils.mjs";
export const GUIDE_MANIFEST: GuideManifest = rawManifest;
export function guidePage(slug: string) {
  return GUIDE_MANIFEST.pages.find((page) => page.slug === slug)
    ?? GUIDE_MANIFEST.pages.find((page) => page.slug === "index")!;
}
export function guideUrl(slug: string) {
  const page = guidePage(slug);
  return `${GUIDE_MANIFEST.siteUrl}${page.slug === "index" ? "" : `${page.slug}.html`}`;
}
export const GUIDE_OPEN_EVENT = "xrift:open-user-guide";
export interface GuideRequest { page: string; returnFocus: HTMLElement | null; }
export function requestGuide(page: string, returnFocus: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent<GuideRequest>(GUIDE_OPEN_EVENT, {
    detail: { page: guidePage(page).slug, returnFocus },
  }));
}
