import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as monaco from "monaco-editor";
import { ScriptEditorWorkspace } from "../src/components/visual-editor/ScriptEditorWorkspace";
import { useScriptEditor } from "../src/components/visual-editor/useScriptEditor";
import { createScriptAsset } from "../src/lib/visual-editor/scripting/script-files";
import type { AssetManifest } from "../src/lib/visual-editor/asset-manifest";
import { tauri } from "../src/lib/tauri";

const assets: AssetManifest = { schemaVersion: "0.1.0", assets: {
  a: createScriptAsset("a", "Door", "scripts/door.ts"),
  b: createScriptAsset("b", "Light", "scripts/light.ts"),
} };
const reads: { path: string; resolve: (value: string) => void; reject: (error: Error) => void }[] = [];
const writes: { source: string; resolve: () => void; reject: (error: Error) => void }[] = [];
let editorState: ReturnType<typeof useScriptEditor>["state"];
export function mount() {
  tauri.readTextFile = (_project, path) => new Promise((resolve, reject) => reads.push({ path, resolve, reject }));
  tauri.writeTextFile = (_project, _path, source) => new Promise((resolve, reject) => writes.push({ source, resolve, reject }));
  document.getElementById("root")!.style.display = "none";
  const host = document.createElement("div"); document.body.append(host);
  createRoot(host).render(<Fixture />);
}
function Fixture() {
  const [active, setActive] = useState(true);
  const dirty = useRef(false);
  const saving = useRef(false);
  const editor = useScriptEditor({ assets, projectPath: "/script-workspace-fixture" });
  editorState = editor.state;
  const asset = editor.state.openAssetId ? assets.assets[editor.state.openAssetId] : null;
  function open(id: string) {
    if (saving.current) return;
    if (editor.state.openAssetId === id) { setActive(true); return; }
    if (dirty.current && !window.confirm("未保存の変更を破棄しますか")) return;
    void editor.open(id); setActive(true);
  }
  return <main className="relative h-screen bg-slate-100">
    <header className="flex h-9 items-center gap-4 px-3">
      <span>サンプル</span>
      <button onClick={() => setActive(false)}>Scene View</button>
      <button onClick={() => setActive(true)}>Script</button>
      <button onClick={() => open("a")}>Open Door</button>
      <button onClick={() => open("b")}>Open Light</button>
    </header>
    {asset?.kind === "script" ? <ScriptEditorWorkspace assets={assets} asset={asset} active={active}
      source={editor.state.source} loading={editor.state.loading} error={editor.state.error}
      playing={false} runtime={{ status: "idle", failureRevision: 0, compileErrors: [], failures: [], logs: [], trust: { status: "not-required", pending: [], disabled: [], running: [] } }}
      onSave={editor.save} onOpen={open} onCreate={() => {}} onRetry={() => void editor.open(asset.id)}
      onDirtyChange={(value) => { dirty.current = value; }} onSavingChange={(value) => { saving.current = value; }}
      onClose={() => { if (!saving.current && (!dirty.current || window.confirm("未保存の変更を破棄しますか"))) editor.close(); }} /> : null}
  </main>;
}
export function settleRead(path: string, value: string, fail = false) {
  // Contract discovery also reads the files. Resolve all requests for the path.
  for (let index = reads.length - 1; index >= 0; index--) {
    if (reads[index].path !== path) continue;
    const [read] = reads.splice(index, 1);
    if (fail) read.reject(new Error(value)); else read.resolve(value);
  }
}
export function settleWrite(fail = false) {
  const write = writes.at(-1)!;
  if (fail) write.reject(new Error("Save failed; retry")); else write.resolve();
}
export function edit(value: string) {
  const model = monaco.editor.getModels().find((model) => model.uri.path.endsWith(editorState.openAssetId === "a" ? "door.ts" : "light.ts"))!;
  model.pushStackElement();
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null);
  model.pushStackElement();
}
export function undo() { const model = monaco.editor.getModels()[0]!; const canUndo = model.canUndo(); model.undo(); return canUndo; }
export function state() { return { editor: editorState, writes: writes.map((entry) => entry.source), models: monaco.editor.getModels().map((model) => model.getValue()) }; }
