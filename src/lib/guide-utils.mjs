/** Shared by the static builder and the lazy in-app guide. No runtime routing. */
export const normalizeSearch = (value) => String(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
export function plainText(value) {
  return String(value).replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, "");
}
export function headingSlug(value) {
  return normalizeSearch(plainText(value)).replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-") || "section";
}
export function makeSlugger() {
  const counts = new Map();
  return (text) => {
    const base = headingSlug(text), count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}
export function astText(node) {
  return typeof node.value === "string" ? node.value : (node.children ?? []).map(astText).join("");
}
export function remarkGuideHeadings() {
  return (tree) => {
    const slug = makeSlugger();
    const visit = (node) => {
      if (node.type === "heading") {
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: slug(astText(node)) } };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
export function markdownHeadings(markdown) {
  const slug = makeSlugger(); let fence = null;
  return markdown.split(/\r?\n/).flatMap((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) { fence = fence ? null : marker[1][0]; return []; }
    if (fence) return [];
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    return match ? [{ depth: match[1].length, text: plainText(match[2]), id: slug(match[2]) }] : [];
  });
}
export function resolveGuideLink(href, page, manifest) {
  if (!href) return { kind: "empty", href: "" };
  if (/^(https?:|mailto:)/i.test(href)) return { kind: "external", href };
  if (href.startsWith("#")) return { kind: "heading", href, slug: page };
  const match = href.match(/^(?:\.\/)?([a-z0-9-]+)\.md(?:#(.*))?$/);
  if (match && manifest.pages.some((entry) => entry.slug === match[1])) {
    return { kind: "page", slug: match[1], fragment: match[2] || "", href: `./${match[1]}.html${match[2] ? `#${match[2]}` : ""}` };
  }
  if (/^(?:\.\/)?media\/[a-z0-9-]+\.(?:png|jpg|webp|svg)$/i.test(href)) return { kind: "media", href };
  return { kind: "invalid", href };
}
export function makeSearchEntries(manifest, sources) {
  return manifest.pages.flatMap((page) => {
    const markdown = sources[page.slug];
    const heads = markdownHeadings(markdown);
    const chunks = markdown.split(/^##\s+/m);
    const entries = [{ slug: page.slug, title: page.title, heading: "", url: `./${page.slug}.html`, text: plainText(chunks[0]).replace(/^#.*\n/, "").trim(), keywords: page.keywords }];
    let index = 0;
    for (const chunk of chunks.slice(1)) {
      const heading = heads.filter((h) => h.depth === 2)[index++];
      if (!heading) continue;
      entries.push({ slug: page.slug, title: page.title, heading: heading.text, url: `./${page.slug}.html#${heading.id}`, text: plainText(chunk.slice(chunk.indexOf("\n") + 1)).replace(/^#+ /gm, "").trim(), keywords: page.keywords });
    }
    return entries;
  });
}
export function searchGuide(entries, query, limit = 12) {
  const words = normalizeSearch(query).split(" ").filter(Boolean).slice(0, 10);
  if (!words.length) return [];
  return entries.flatMap((entry) => {
    const title = normalizeSearch(entry.title), heading = normalizeSearch(entry.heading), keywords = normalizeSearch(entry.keywords), text = normalizeSearch(entry.text);
    const fields = `${title} ${heading} ${keywords} ${text}`;
    if (!words.every((word) => fields.includes(word))) return [];
    const score = words.reduce((sum, word) => sum + (title.includes(word) ? 10 : 0) + (heading.includes(word) ? 14 : 0) + (keywords.includes(word) ? 2 : 0) + (text.includes(word) ? 3 : 0), 0);
    const firstHit = Math.max(0, ...words.map((word) => text.indexOf(word)));
    const from = Math.max(0, firstHit - 36);
    const snippet = `${from ? "…" : ""}${entry.text.replace(/\s+/g, " ").slice(from, from + 145)}${entry.text.length > from + 145 ? "…" : ""}`;
    return [{ ...entry, score, snippet }];
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ja")).slice(0, limit);
}
