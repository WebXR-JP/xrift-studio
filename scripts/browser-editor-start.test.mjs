import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript-test-api";

const source = await readFile(new URL("../src/preview/browser-editor-start.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { resolveBrowserEditorStart } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const projects = [
  { path: "recent-world", kind: "world" },
  { path: "last-item", kind: "item" },
  { path: "older-world", kind: "world" },
];

test("a bookmarked editor resumes the last opened project, including an item", () => {
  assert.deepEqual(resolveBrowserEditorStart(undefined, "last-item", projects), { path: "last-item" });
});

test("a first visit starts a world without requiring a landing-page action", () => {
  assert.deepEqual(resolveBrowserEditorStart(undefined, null, []), { kind: "world" });
});

test("a missing last-project pointer still resumes existing work", () => {
  assert.deepEqual(resolveBrowserEditorStart(undefined, "deleted-project", projects), { path: "recent-world" });
  assert.deepEqual(resolveBrowserEditorStart(undefined, null, projects), { path: "recent-world" });
});

test("an explicit kind does not acquire the previous project's lease if it is another kind", () => {
  assert.deepEqual(resolveBrowserEditorStart("world", "last-item", projects), { path: "recent-world" });
  assert.deepEqual(resolveBrowserEditorStart("item", "recent-world", projects), { path: "last-item" });
});

test("an explicit kind resumes the matching last project even if it is not the newest", () => {
  assert.deepEqual(resolveBrowserEditorStart("world", "older-world", projects), { path: "older-world" });
});

test("an explicit kind creates a project only when none of that kind exists", () => {
  assert.deepEqual(resolveBrowserEditorStart("item", "recent-world", projects.filter((p) => p.kind === "world")), { kind: "item" });
  assert.deepEqual(resolveBrowserEditorStart("item", null, []), { kind: "item" });
});
