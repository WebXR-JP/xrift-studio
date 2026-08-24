// Fails when the published usage guide cannot load its own assets.
//
// The guide is served one directory below the site root, at /wiki/. It used to
// be built as wiki.html at the root and moved into wiki/ afterwards, which left
// the relative "./assets/..." references Vite had written pointing one level
// too deep. Every script and stylesheet answered 404 and the guide served a
// blank page — for long enough that the landing page's nav, footer and
// "使い方ガイドを開く" button all led to nothing.
//
// The build now emits wiki/index.html at its published depth, and this check
// resolves each local reference against the directory the file is served from
// so the same class of breakage cannot ship again unnoticed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "preview-dist");

/**
 * Pages to check. The landing page is built as preview.html and published as
 * index.html, so whichever name the build left behind is the one to read.
 */
const PAGES = [
  { file: ["index.html", "preview.html"], label: "landing page" },
  { file: ["wiki/index.html"], label: "usage guide" },
];

const REFERENCE_PATTERN = /(?:src|href)="([^"]+)"/g;

const isExternal = (reference) =>
  /^(?:https?:)?\/\//.test(reference) ||
  reference.startsWith("data:") ||
  reference.startsWith("#") ||
  reference.startsWith("mailto:");

let checked = 0;
const failures = [];

for (const page of PAGES) {
  const pagePath = page.file
    .map((candidate) => path.join(distRoot, candidate))
    .find((candidate) => fs.existsSync(candidate));
  if (!pagePath) {
    failures.push(`${page.label}: ${page.file.join(" / ")} was not built`);
    continue;
  }
  const html = fs.readFileSync(pagePath, "utf8");
  const servedFrom = path.dirname(pagePath);
  for (const match of html.matchAll(REFERENCE_PATTERN)) {
    const reference = match[1];
    if (isExternal(reference)) continue;
    checked += 1;
    const resolved = path.resolve(servedFrom, reference.replace(/[?#].*$/, ""));
    if (!fs.existsSync(resolved)) {
      failures.push(`${page.label}: ${reference} does not exist under preview-dist`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(
    `Published pages reference files that are not published:\n  ${failures.join("\n  ")}`,
  );
}

process.stdout.write(
  `published page assets resolved: ${checked} references across ${PAGES.length} pages\n`,
);
