import { useState } from "react";
import { createRoot } from "react-dom/client";
import * as monaco from "monaco-editor";
import { EditorView } from "../src/components/EditorView";
import { ToastProvider } from "../src/components/Toast";
import { tauri, type Project } from "../src/lib/tauri";
import { xrift } from "../src/lib/xrift-cli";

const project: Project = { name: "File IO fixture", path: "/file-io-fixture", kind: "world",
  format: "classic", title: null, description: null, modifiedAtMs: null, uploadedAt: null, publicationId: null };
const reads: { rel: string; resolve: (text: string) => void; reject: (reason: Error) => void }[] = [];
const writes: { rel: string; content: string; resolve: () => void; reject: (reason: Error) => void }[] = [];
const readCalls: string[] = [];
const files = new Map<string, string>([["src/Item.tsx", "initial file"], ["xrift.json", JSON.stringify({
  world: { title: "Fixture world", description: "Saved fixture description", items: ["12345678-1234-1234-1234-123456789abc"], custom: { preserved: true } },
  item: { title: "Fixture item", description: "Saved fixture item description" },
  customRoot: true,
})]]);
const operations: { kind: "check" | "upload"; source: string; metadata: string }[] = [];
let backCalls = 0;
const treeNames = new Set(["a.ts", "b.ts", "xrift.json"]);
const pathChanges: { kind: "rename" | "delete"; rel: string; newRel?: string }[] = [];

export function mountEditorFileIoFixture(deferDefault = false, kind: "world" | "item" = "world"): void {
  project.kind = kind;
  const originalRead = tauri.readTextFile;
  const originalWrite = tauri.writeTextFile;
  const originalList = tauri.listFiles;
  tauri.readTextFile = (projectPath, rel) => {
    if (projectPath !== project.path) return originalRead(projectPath, rel);
    readCalls.push(rel);
    if ((rel === "src/Item.tsx" && !deferDefault) || rel === "xrift.json" || (files.has(rel) && !["a.ts", "b.ts", "src/Item.tsx"].includes(rel))) return Promise.resolve(files.get(rel)!);
    return new Promise<string>((resolve, reject) => reads.push({ rel, resolve, reject }));
  };
  tauri.writeTextFile = (projectPath, rel, content) => {
    if (projectPath !== project.path) return originalWrite(projectPath, rel, content);
    return new Promise<void>((resolve, reject) => writes.push({ rel, content, resolve, reject }));
  };
  tauri.listFiles = (projectPath, rel) => projectPath !== project.path
    ? originalList(projectPath, rel)
    : Promise.resolve([...treeNames].map(name => ({ name, rel: name, isDir: false, size: 10 })));
  const originalRename = tauri.renamePath;
  tauri.renamePath = async (path, rel, newRel) => {
    if (path !== project.path) return originalRename(path, rel, newRel);
    pathChanges.push({ kind: "rename", rel, newRel });
    files.set(newRel, files.get(rel)!); files.delete(rel);
    treeNames.delete(rel); treeNames.add(newRel);
  };
  const originalDelete = tauri.deletePath;
  tauri.deletePath = async (path, rel) => {
    if (path !== project.path) return originalDelete(path, rel);
    pathChanges.push({ kind: "delete", rel });
    files.delete(rel); treeNames.delete(rel);
  };
  const originalThumbnail = tauri.readThumbnail;
  tauri.readThumbnail = (path) => path !== project.path ? originalThumbnail(path) : Promise.resolve(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  );
  const originalCheck = xrift.checkItem;
  xrift.checkItem = async (path, ...args) => {
    if (path !== project.path) return originalCheck(path, ...args);
    operations.push({ kind: "check", source: files.get("src/Item.tsx")!, metadata: files.get("xrift.json")! });
    return { code: 0, stdout: "fixture check", stderr: "" };
  };
  const originalUpload = xrift.upload;
  xrift.upload = async (path, ...args) => {
    if (path !== project.path) return originalUpload(path, ...args);
    operations.push({ kind: "upload", source: files.get("src/Item.tsx")!, metadata: files.get("xrift.json")! });
    return { code: 0, stdout: "fixture upload", stderr: "" };
  };
  document.getElementById("root")!.style.display = "none";
  const host = document.createElement("div");
  host.id = "editor-file-io-fixture";
  document.body.append(host);
  createRoot(host).render(<ToastProvider><Fixture /></ToastProvider>);
}

function Fixture() {
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  if (closed) return <p>Fixture library</p>;
  return <EditorView project={project} user={{ raw: "fixture", displayName: "Fixture", id: "fixture" }} busy={busy} setBusy={setBusy}
    appendLog={() => {}} logs={[]} clearLogs={() => {}} onBack={() => { backCalls++; setClosed(true); }} onProjectChanged={() => {}} />;
}

export function settleRead(rel: string, text: string, fail = false): void {
  const index = reads.findIndex(read => read.rel === rel);
  if (index < 0) throw new Error(`No pending read for ${rel}`);
  const [read] = reads.splice(index, 1);
  if (fail) read.reject(new Error(text));
  else { files.set(rel, text); read.resolve(text); }
}

export function settleWrite(index: number, fail = false): void {
  if (fail) writes[index].reject(new Error("fixture save failure"));
  else { files.set(writes[index].rel, writes[index].content); writes[index].resolve(); }
}

export function state() {
  return { reads: [...readCalls], pendingReads: reads.map(read => read.rel),
    writes: writes.map(({ rel, content }) => ({ rel, content })),
    contents: monaco.editor.getModels().map(model => model.getValue()), files: Object.fromEntries(files), operations, backCalls, pathChanges };
}

export function edit(text: string): void {
  const model = monaco.editor.getModels()[0];
  if (!model) throw new Error("Monaco editor is not ready");
  model.setValue(text);
}
