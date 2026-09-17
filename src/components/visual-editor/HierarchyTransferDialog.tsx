import { useEffect, useMemo, useRef, useState } from "react";
import { tauri } from "../../lib/tauri";
import { matchesEditorSearch } from "../../lib/visual-editor/editor-menu-search";
import { readBrowserProjectArchive } from "../../lib/visual-editor/browser-project-transfer";
import { createHierarchyTransfer, withHierarchyProjectKind, planHierarchyImport, prepareHierarchyTransferFiles, readHierarchyTransferWarnings, type HierarchyImportPlan, type HierarchyPlacement, type PreparedHierarchyTransfer } from "../../lib/visual-editor/hierarchy-transfer";
import { applyHierarchyImportPlan } from "../../lib/visual-editor/hierarchy-transfer-commit";
import { createHierarchyArchive, hierarchyBlobDataUrl, prepareStoredHierarchy, validateHierarchyBundle, writeHierarchyFiles } from "../../lib/visual-editor/hierarchy-transfer-io";
import type { PrototypeVisualProject } from "../../lib/visual-editor/prototype-project";
import type { SceneDocument } from "../../lib/visual-editor/scene-document";

export type HierarchyTransferCurrent = { bundle: PrototypeVisualProject; projectPath?: string; selectedIds: string[]; editable: boolean };
export type HierarchyTransferSession = { mode: "import" | "export" | "paste"; current: HierarchyTransferCurrent; clipboard?: PreparedHierarchyTransfer; mirrorAxis?: "x" | "y" | "z" };
type Source = { bundles: PrototypeVisualProject[]; files?: ReadonlyMap<string, Uint8Array>; warnings: string[] };
type Ready =
  | { kind: "export"; prepared: PreparedHierarchyTransfer; blob: Blob; fileName: string; dataUrl?: string }
  | { kind: "import"; prepared: PreparedHierarchyTransfer; expected: HierarchyTransferCurrent; plan: HierarchyImportPlan };

function descendants(scene: SceneDocument, ids: readonly string[]): Set<string> {
  const result = new Set<string>();
  const pending = [...ids];
  while (pending.length) {
    const id = pending.pop()!;
    if (result.has(id) || !scene.entities[id]) continue;
    result.add(id);
    for (const child of scene.entities[id].children) pending.push(child);
  }
  return result;
}

/** A bounded DOM list, including on touch devices and in large project archives. */
function SelectionTree({ scene, selected, disabled, onChange }: {
  scene: SceneDocument; selected: ReadonlySet<string>; disabled: boolean; onChange: (ids: Set<string>) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const all: { id: string; depth: number }[] = [];
    const seen = new Set<string>();
    const pending = scene.rootEntityIds.map((id) => ({ id, depth: 0 })).reverse();
    while (pending.length) {
      const row = pending.pop()!;
      const entity = scene.entities[row.id];
      if (!entity || seen.has(row.id)) continue;
      seen.add(row.id); all.push(row);
      for (let i = entity.children.length - 1; i >= 0; i--) pending.push({ id: entity.children[i], depth: row.depth + 1 });
    }
    // Invalid orphaned data is still visible; export validation reports it.
    for (const id of Object.keys(scene.entities)) if (!seen.has(id)) all.push({ id, depth: 0 });
    return all.filter(({ id }) => matchesEditorSearch(query, scene.entities[id].name));
  }, [scene, query]);
  const start = Math.max(0, Math.min(Math.floor(scrollTop / 40) - 4, Math.max(0, rows.length - 16)));
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    for (const child of descendants(scene, [id])) checked ? next.add(child) : next.delete(child);
    if (!checked) {
      let parent = scene.entities[id].parentId;
      const seen = new Set<string>();
      // A checked parent means its entire subtree. Excluding one child also
      // unchecks ancestors, while the remaining siblings stay selected.
      while (parent && !seen.has(parent)) { seen.add(parent); next.delete(parent); parent = scene.entities[parent]?.parentId ?? null; }
    }
    onChange(next);
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <strong>Hierarchy</strong><span className="text-slate-500">{selected.size}件を選択</span>
      <button type="button" disabled={disabled} onClick={() => onChange(new Set(Object.keys(scene.entities)))} className="min-h-10 rounded border px-3 disabled:opacity-40">全て選択</button>
      <button type="button" disabled={disabled} onClick={() => onChange(new Set())} className="min-h-10 rounded border px-3 disabled:opacity-40">選択を解除</button>
    </div>
    <input aria-label="HierarchyのEntity名を検索" type="search" value={query} disabled={disabled} placeholder="Entity名で検索" onChange={(event) => { setQuery(event.target.value); setScrollTop(0); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} className="min-h-10 w-full rounded border px-3 text-sm" />
    <div ref={scrollRef} role="group" tabIndex={0} aria-label="受け渡すEntity" className="relative h-60 overflow-auto rounded border bg-slate-50" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: rows.length * 40, minHeight: 40 }}>
        {rows.slice(start, start + 24).map(({ id, depth }, index) => <label key={id} className="absolute left-0 flex h-10 w-full cursor-pointer items-center gap-2 pr-3 text-sm hover:bg-violet-50" style={{ top: (start + index) * 40, paddingLeft: 12 + Math.min(depth, 12) * 14 }}>
          <input type="checkbox" className="size-4 shrink-0" checked={selected.has(id)} disabled={disabled} onChange={(event) => toggle(id, event.target.checked)} />
          <span className="truncate" title={scene.entities[id].name}>{scene.entities[id].name}</span>
        </label>)}
        {!rows.length ? <p className="p-3 text-xs text-slate-500">該当するEntityはありません。</p> : null}
      </div>
    </div>
    <p className="text-xs leading-5 text-slate-500">親を選ぶと子Entityも含まれます。一部の子を外すと、残したEntityをそれぞれ追加します。</p>
  </div>;
}

export function HierarchyTransferDialog({ session, getCurrent, onCommit, onClose, onNotice }: {
  session: HierarchyTransferSession;
  getCurrent: () => HierarchyTransferCurrent;
  onCommit: (expected: PrototypeVisualProject, plan: HierarchyImportPlan) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const running = useRef(false);
  const initialBundle = session.clipboard?.bundle ?? session.current.bundle;
  const [source, setSource] = useState<Source | null>(session.mode === "import" ? null : { bundles: [initialBundle], files: session.clipboard?.files, warnings: session.clipboard?.warnings ?? [] });
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selected, setSelected] = useState(() => descendants(initialBundle.scene, session.mode === "export" ? session.current.selectedIds : initialBundle.scene.rootEntityIds));
  const [exportKind, setExportKind] = useState(initialBundle.project.projectKind);
  const [placement, setPlacement] = useState<HierarchyPlacement>(session.mode === "import" && session.current.bundle.project.projectKind === "item" ? "origin" : "world");
  const selectedEntity = session.current.bundle.scene.entities[session.current.selectedIds[0]];
  const siblingParent = selectedEntity?.parentId ?? null;
  const [parentId, setParentId] = useState<string | null>(session.mode === "paste" ? siblingParent : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const bundle = source?.bundles[sceneIndex];
  const title = session.mode === "export" ? "選択したEntityを.xriftstudioで書き出す" : session.mode === "paste" ? "コピーしたEntityをHierarchyへ追加" : ".xriftstudioからHierarchyへ追加";

  useEffect(() => {
    active.current = true;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { active.current = false; dialog?.close(); };
  }, []);
  useEffect(() => {
    if (ready?.kind !== "export") { setDownloadUrl(null); return; }
    const url = URL.createObjectURL(ready.blob);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [ready]);
  const invalidate = () => { setReady(null); setError(null); setStatus(null); };
  const run = async (operation: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null); setStatus(null);
    try { await operation(); }
    catch (failure) { if (active.current) { setReady(null); setError(failure instanceof Error ? failure.message : String(failure)); } }
    finally { running.current = false; if (active.current) setBusy(false); }
  };
  const loadFile = (file: File) => void run(async () => {
    setReady(null); setSource(null); setSelected(new Set());
    const archive = await readBrowserProjectArchive(file);
    const warnings = readHierarchyTransferWarnings(archive.files);
    const { project, assets, prefabs, scenes } = archive.documents;
    const sceneIds = [project.entrySceneId, ...Object.keys(scenes).filter((id) => id !== project.entrySceneId)];
    const bundles = sceneIds.map((id) => ({ project, assets, prefabs, scene: scenes[id] }));
    if (!active.current) return;
    setSource({ bundles, files: archive.files, warnings }); setSceneIndex(0);
    setSelected(descendants(bundles[0].scene, bundles[0].scene.rootEntityIds));
  });
  const prepare = () => void run(async () => {
    if (!bundle || !source) return;
    const current = getCurrent();
    if (!current.editable || current.bundle.project.projectId !== session.current.bundle.project.projectId) throw new Error("プロジェクトが切り替わりました。閉じてから操作し直してください。");
    const sourceBundle = session.mode === "export" ? current.bundle : bundle;
    const transfer = createHierarchyTransfer(sourceBundle, [...selected], placement);
    if (session.mirrorAxis) {
      const axis = { x: 0, y: 1, z: 2 }[session.mirrorAxis];
      for (const id of transfer.bundle.scene.rootEntityIds) {
        const transform = transfer.bundle.scene.entities[id].components.find((c) => c.type === "transform");
        if (transform?.type === "transform") transform.scale[axis] *= -1;
      }
    }
    transfer.warnings = [...new Set([...source.warnings, ...transfer.warnings])];
    let prepared = source.files
      ? await prepareHierarchyTransferFiles(transfer, async (path) => { const bytes = source.files!.get(path); if (!bytes) throw new Error(path); return bytes; })
      : await prepareStoredHierarchy(transfer, current.projectPath);
    if (!active.current) return;
    if (getCurrent().bundle !== current.bundle) throw new Error("編集中のシーンが更新されました。内容を確認し直してください。");
    if (session.mode === "export") {
      prepared = withHierarchyProjectKind(prepared, exportKind);
      const archive = await createHierarchyArchive(prepared);
      const dataUrl = tauri.isAvailable() ? await hierarchyBlobDataUrl(archive.blob) : undefined;
      if (active.current) setReady({ kind: "export", prepared, ...archive, dataUrl });
    } else {
      const plan = planHierarchyImport(current.bundle, prepared, { parentId, placement });
      validateHierarchyBundle(plan.bundle);
      if (active.current) setReady({ kind: "import", prepared, expected: current, plan });
    }
  });
  const add = () => void run(async () => {
    if (ready?.kind !== "import") return;
    await applyHierarchyImportPlan(ready.plan, {
      isCurrent: () => active.current && getCurrent().editable && getCurrent().bundle === ready.expected.bundle && getCurrent().projectPath === ready.expected.projectPath,
      writeFiles: (files) => writeHierarchyFiles(ready.expected.projectPath, files),
      commitDocuments: (plan) => onCommit(ready.expected.bundle, plan),
    });
    if (active.current) {
      onNotice(`${Object.keys(ready.prepared.bundle.scene.entities).length}件のEntityをHierarchyへ追加しました。元に戻す操作で取り消せます。`);
      onClose();
    }
  });
  const saveNative = () => void run(async () => {
    if (ready?.kind !== "export" || !ready.dataUrl) return;
    const path = await tauri.saveHierarchyPackage(ready.fileName, ready.dataUrl);
    if (active.current) {
      const message = path ? `.xriftstudioファイルを保存しました: ${path}` : "保存をキャンセルしました。保存先を選び直せます。";
      setStatus(message); if (path) onNotice(message);
    }
  });
  const warnings = ready?.kind === "import" ? ready.plan.warnings : ready?.prepared.warnings ?? [];
  const parentOptions = new Map<string, string>();
  if (selectedEntity) parentOptions.set(selectedEntity.id, `選択中のEntity: ${selectedEntity.name}`);
  if (siblingParent && session.current.bundle.scene.entities[siblingParent]) parentOptions.set(siblingParent, `選択中のEntityと同じ階層: ${session.current.bundle.scene.entities[siblingParent].name}`);

  return <dialog ref={dialogRef} aria-labelledby="hierarchy-transfer-title" aria-describedby="hierarchy-transfer-description" onCancel={(event) => { event.preventDefault(); if (!running.current) onClose(); }} onKeyDown={(event) => event.stopPropagation()} className="m-auto max-h-[92dvh] w-[min(44rem,96vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40">
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div><h2 id="hierarchy-transfer-title" className="text-base font-semibold">{title}</h2>
          <p id="hierarchy-transfer-description" className="mt-2 text-xs leading-5 text-slate-600">{session.mode === "export" ? "子Entityと必要な素材を含めます。別のワールド・アイテムで編集を続けられます。" : "プロジェクトは切り替えず、選んだEntityと素材だけを追加します。シーン設定・公開情報は変えません。"}</p>
        </div>
        <button type="button" aria-label="閉じる" disabled={busy} onClick={onClose} className="min-h-10 shrink-0 rounded border px-3 text-sm disabled:opacity-40">閉じる</button>
      </header>
      {session.mirrorAxis ? <p className="text-xs text-violet-700">{session.mirrorAxis.toUpperCase()}軸に反転したコピーを追加します。コピー元は変更しません。</p> : null}
      {session.mode === "import" ? <label className="block rounded-lg border border-dashed p-3 text-xs leading-6">.xriftstudio / .zipを選択
        <input type="file" accept=".xriftstudio,.zip" disabled={busy} className="block w-full min-w-0 text-xs file:mr-2 file:min-h-10 file:rounded file:border file:px-3" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) loadFile(file); }} />
      </label> : null}
      {bundle && source ? <>
        <div className="text-xs text-slate-600">{bundle.project.metadata.title}（{bundle.project.projectKind === "world" ? "ワールド" : "アイテム"}）{session.mode !== "export" ? ` → ${session.current.bundle.project.metadata.title}（${session.current.bundle.project.projectKind === "world" ? "ワールド" : "アイテム"}）` : ""}</div>
        {source.bundles.length > 1 ? <label className="block text-xs">シーン<select className="mt-1 min-h-10 w-full rounded border px-2 text-sm" value={sceneIndex} disabled={busy} onChange={(event) => { const index = Number(event.target.value); setSceneIndex(index); setSelected(descendants(source.bundles[index].scene, source.bundles[index].scene.rootEntityIds)); invalidate(); }}>{source.bundles.map((entry, index) => <option key={entry.scene.sceneId} value={index}>{entry.scene.name}</option>)}</select></label> : null}
        <SelectionTree key={bundle.scene.sceneId} scene={bundle.scene} selected={selected} disabled={busy} onChange={(ids) => { setSelected(ids); invalidate(); }} />
        <div className="grid gap-3 sm:grid-cols-2">
          {session.mode === "export" ? <label className="text-xs">書き出すプロジェクトの種類<select value={exportKind} disabled={busy} onChange={(event) => { setExportKind(event.target.value as "world" | "item"); invalidate(); }} className="mt-1 min-h-10 w-full rounded border px-2 text-sm"><option value="world">ワールド</option><option value="item">アイテム</option></select></label> : null}
          {session.mode !== "export" ? <label className="text-xs">追加先<select value={parentId ?? ""} disabled={busy} onChange={(event) => { setParentId(event.target.value || null); invalidate(); }} className="mt-1 min-h-10 w-full min-w-0 rounded border px-2 text-sm"><option value="">Scene直下</option>{[...parentOptions].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label> : null}
          <label className="text-xs">配置<select value={placement} disabled={busy} onChange={(event) => { setPlacement(event.target.value as HierarchyPlacement); invalidate(); }} className="mt-1 min-h-10 w-full rounded border px-2 text-sm"><option value="world">元のワールド座標を保つ</option><option value="origin">先頭のEntityを原点へ移す</option><option value="local">元のローカル座標を使う</option></select></label>
        </div>
        <p className="text-xs leading-5 text-slate-500">「原点へ移す」は、Scene直下ならシーンの原点、子として追加するなら親の原点に配置します。Entity同士の位置関係は保ちます。</p>
      </> : null}
      {ready ? <section className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs leading-5" aria-label="受け渡す内容">
        <p className="font-semibold">Entity {Object.keys(ready.prepared.bundle.scene.entities).length}件 / 素材 {Object.keys(ready.prepared.bundle.assets.assets).length}件 / ファイル {ready.prepared.files.size}件</p>
        {warnings.length ? <div><p className="font-semibold">追加前に確認してください</p><ul className="max-h-40 list-disc space-y-1 overflow-auto pl-5">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : <p>参照切れの警告はありません。</p>}
        <p>Scriptは自動実行しません。Playで実行する前に内容を確認してください。</p>
      </section> : null}
      {error ? <p role="alert" className="whitespace-pre-wrap rounded border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">{error}</p> : null}
      {status ? <p role="status" className="break-all text-xs leading-5 text-slate-600">{status}</p> : null}
      <footer className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded border px-4 text-sm disabled:opacity-40">{status ? "閉じる" : "キャンセル"}</button>
        {!ready ? <button type="button" disabled={busy || !bundle || !selected.size} onClick={prepare} className="min-h-11 rounded bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? "読み込み中…" : session.mode === "export" ? "書き出しを準備" : "追加する内容を確認"}</button> : ready.kind === "import" ? <button type="button" disabled={busy} onClick={add} className="min-h-11 rounded bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? "追加中…" : "Hierarchyへ追加"}</button> : tauri.isAvailable() ? <button type="button" disabled={busy} onClick={saveNative} className="min-h-11 rounded bg-violet-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? "保存中…" : ".xriftstudioを保存"}</button> : downloadUrl ? <a href={downloadUrl} download={ready.fileName} onClick={() => setStatus("ファイルの保存を開始しました。ブラウザの保存先を確認してください。")} className="flex min-h-11 items-center rounded bg-violet-700 px-4 text-sm font-semibold text-white">.xriftstudioを保存</a> : <span role="status" className="p-3 text-xs">保存の準備中…</span>}
      </footer>
      {busy ? <p role="status" className="text-xs text-slate-500">処理が終わるまで、この画面は閉じられません。</p> : null}
    </div>
  </dialog>;
}
