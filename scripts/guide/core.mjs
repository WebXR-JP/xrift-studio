import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownHeadings, resolveGuideLink, makeSearchEntries } from "../../src/lib/guide-utils.mjs";
export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export const sourceRoot = path.join(projectRoot, "docs/guide");
export async function readGuide() {
  const manifest = JSON.parse(await fs.readFile(path.join(sourceRoot, "manifest.json"), "utf8"));
  const sources = {};
  for (const page of manifest.pages) {
    if (!/^[a-z0-9-]+$/.test(page.slug) || page.file !== `${page.slug}.md`) throw new Error(`Unsafe guide slug: ${page.slug}`);
    sources[page.slug] = await fs.readFile(path.join(sourceRoot, page.file), "utf8");
  }
  return { manifest, sources };
}
export async function validateGuide({ manifest, sources }) {
  const errors = [], slugs = new Set(manifest.pages.map((p) => p.slug));
  if (slugs.size !== manifest.pages.length) errors.push("Duplicate page slug");
  if (!slugs.has("index")) errors.push("Missing index");
  const allHeads = Object.fromEntries(Object.entries(sources).map(([slug, text]) => [slug, markdownHeadings(text)]));
  for (const page of manifest.pages) {
    const heads = allHeads[page.slug];
    if (heads.filter((h) => h.depth === 1).length !== 1 || heads[0]?.text !== page.title) errors.push(`${page.slug}: heading/title mismatch`);
    if (!manifest.groups.some((group) => group.id === page.group)) errors.push(`${page.slug}: unknown group`);
    for (const target of [...page.related, ...(page.next ? [page.next] : [])]) if (!slugs.has(target)) errors.push(`${page.slug}: missing related page ${target}`);
    const body = sources[page.slug].replace(/```[\s\S]*?```/g, "");
    for (const match of body.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const raw = match[1], link = resolveGuideLink(raw, page.slug, manifest);
      if (link.kind === "invalid") errors.push(`${page.slug}: invalid link ${raw}`);
      if (link.kind === "media") {
        try { await fs.access(path.join(sourceRoot, link.href)); } catch { errors.push(`${page.slug}: missing image ${raw}`); }
      }
      if (link.kind === "page" || link.kind === "heading") {
        const fragment = link.kind === "heading" ? raw.slice(1) : link.fragment;
        if (fragment && !allHeads[link.slug].some((h) => h.id === decodeURIComponent(fragment))) errors.push(`${page.slug}: missing heading ${raw}`);
      }
    }
  }
  for (const target of [...manifest.firstSteps, ...manifest.homeTopics]) if (!slugs.has(target)) errors.push(`Missing landing target ${target}`);
  if (errors.length) throw new Error(errors.join("\n"));
  return { ...manifest, headings: allHeads, search: makeSearchEntries(manifest, sources) };
}
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
