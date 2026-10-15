import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript-test-api";

const source = readFileSync(new URL("../src/components/visual-editor/ChatgptWorkLog.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const { formatChatgptWorkLogEvents: display, chatgptProgressIsRecorded: recorded } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const event = (sequence, message, saved = false) => ({ sequence, message, phase: saved ? "saving" : "planning", saved });

test("current unfinished activity appears once without mutating stored history", () => {
  const events = [event(1, "考えています…"), event(2, "考えています…")];
  const original = JSON.stringify(events);
  assert.deepEqual(display(events, "考えています…"), []);
  assert.equal(recorded("考えています…", events), false);
  assert.equal(JSON.stringify(events), original);
});

test("saved operations remain in the log and replace an identical progress line", () => {
  const events = [event(1, "Fogの色を保存しました", true)];
  assert.deepEqual(display(events, events[0].message), [{ sequence: 1, message: events[0].message }]);
  assert.equal(recorded(events[0].message, events), true);
  assert.equal(recorded("次の作業を考えています…", events), false);
});

test("earlier concrete work and legacy save counts survive current activity deduplication", () => {
  const events = [event(1, "Scene設定を調整しています"), event(2, "Scene設定を調整して保存しました", true), event(3, "Skyboxの明るさを変更", true), event(4, "考えています…")];
  assert.deepEqual(display(events, "考えています…"), [
    { sequence: 1, message: "以前の設定変更：保存1件（変更項目の詳細記録なし）" },
    { sequence: 3, message: "Skyboxの明るさを変更" },
  ]);
  assert.equal(display(events).length, 3);
});
