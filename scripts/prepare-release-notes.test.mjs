import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReleaseNotes } from "./prepare-release-notes.mjs";

test("release notes require the matching version and nonempty changes", () => {
  const root = mkdtempSync(join(tmpdir(), "xrift-release-notes-"));
  try {
    mkdirSync(join(root, "src-tauri"));
    mkdirSync(join(root, "docs/releases"), { recursive: true });
    writeFileSync(join(root, "src-tauri/tauri.conf.json"), JSON.stringify({ version: "1.2.3" }));
    const path = join(root, "docs/releases/1.2.3.md");
    assert.throws(() => readReleaseNotes("v1.2.4", root), /must match/);
    assert.throws(() => readReleaseNotes("v1.2.3", root), /ENOENT/);
    for (const body of ["", "# XRift Studio v1.2.3", "# XRift Studio v1.2.2\n\n- 修正しました。"] ) {
      writeFileSync(path, body);
      assert.throws(() => readReleaseNotes("v1.2.3", root), /user-facing changes/);
    }
    writeFileSync(path, "# XRift Studio v1.2.3\r\n\r\n- 表示を修正しました。\r\n");
    assert.equal(readReleaseNotes("v1.2.3", root), "# XRift Studio v1.2.3\n\n- 表示を修正しました。");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
