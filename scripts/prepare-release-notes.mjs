import { appendFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function readReleaseNotes(tag, root = process.cwd()) {
  const { version } = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
  if (tag !== `v${version}`) throw new Error(`Release tag must match app version: v${version}`);
  const path = resolve(root, "docs/releases", `${version}.md`);
  const notes = readFileSync(path, "utf8").replace(/\r\n/g, "\n").trim();
  if (!notes.startsWith(`# XRift Studio ${tag}\n`) || !/^[-*] .+/m.test(notes)) {
    throw new Error(`Write a version heading and user-facing changes in ${path}`);
  }
  return notes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const notes = readReleaseNotes(process.env.RELEASE_TAG);
  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `release_notes_${randomUUID()}`;
    appendFileSync(process.env.GITHUB_OUTPUT, `body<<${delimiter}\n${notes}\n${delimiter}\n`);
  }
  console.log(notes);
}
