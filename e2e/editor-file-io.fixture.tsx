import { useState } from "react";
import { createRoot } from "react-dom/client";
import * as monaco from "monaco-editor";
import { EditorView } from "../src/components/EditorView";
import { ToastProvider } from "../src/components/Toast";
import { tauri, type Project } from "../src/lib/tauri";

const project: Project = { name: "File IO fixture", path: "/file-io-fixture", kind: "world",
  format: "classic", title: null, description: null, modifiedAtMs: null, uploadedAt: null, publicationId: null };
const reads: { rel: string; resolve: (text: string) => void; reject: (reason: Error) => void }[] = [];
const writes: { rel: string; content: string; resolve: () => void; reject: (reason: Error) => void }[] = [];
const readCalls: string[] = [];

export function mountEditorFileIoFixture(deferDefault = false): void {
  const originalRead = tauri.readTextFile;
  const originalWrite = tauri.writeTextFile;
  const originalList = tauri.listFiles;
  tauri.readTextFile = (projectPath, rel) => {
    if (projectPath !== project.path) return originalRead(projectPath, rel);
    readCalls.push(rel);
    if (rel === "src/Item.tsx" && !deferDefault) return Promise.resolve("initial file");
    return new Promise<string>((resolve, reject) => reads.push({ rel, resolve, reject }));
  };
  tauri.writeTextFile = (projectPath, rel, content) => {
    if (projectPath !== project.path) return originalWrite(projectPath, rel, content);
    return new Promise<void>((resolve, reject) => writes.push({ rel, content, resolve, reject }));
  };
  tauri.listFiles = (projectPath, rel) => projectPath !== project.path
    ? originalList(projectPath, rel)
    : Promise.resolve(["a.ts", "b.ts"].map(name => ({ name, rel: name, isDir: false, size: 10 })));
  document.getElementById("root")!.style.display = "none";
  const host = document.createElement("div");
  host.id = "editor-file-io-fixture";
  document.body.append(host);
  createRoot(host).render(<ToastProvider><Fixture /></ToastProvider>);
}

function Fixture() {
  const [busy, setBusy] = useState(false);
  return <EditorView project={project} user={null} busy={busy} setBusy={setBusy}
    appendLog={() => {}} logs={[]} clearLogs={() => {}} onBack={() => {}} onProjectChanged={() => {}} />;
}

export function settleRead(rel: string, text: string, fail = false): void {
  const index = reads.findIndex(read => read.rel === rel);
  if (index < 0) throw new Error(`No pending read for ${rel}`);
  const [read] = reads.splice(index, 1);
  if (fail) read.reject(new Error(text));
  else read.resolve(text);
}

export function settleWrite(index: number, fail = false): void {
  if (fail) writes[index].reject(new Error("fixture save failure"));
  else writes[index].resolve();
}

export function state() {
  return { reads: [...readCalls], pendingReads: reads.map(read => read.rel),
    writes: writes.map(({ rel, content }) => ({ rel, content })),
    contents: monaco.editor.getModels().map(model => model.getValue()) };
}

export function edit(text: string): void {
  const model = monaco.editor.getModels()[0];
  if (!model) throw new Error("Monaco editor is not ready");
  model.setValue(text);
}
