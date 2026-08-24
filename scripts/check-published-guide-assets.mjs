// Fails when the published usage guide cannot load its own assets.
//
// The guide is served one directory below the site root, at /wiki/, and Vite
// writes relative "./assets/..." references into it. Get the entry's depth
// wrong and every script and stylesheet answers 404: the page still loads, so
// the build passes and the guide serves a blank white page, with the landing
// page's nav, footer and "使い方ガイドを開く" button all leading to it.
//
// This check resolves each local reference against the directory the file is
// actually served from, so that failure cannot ship unnoticed.

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
