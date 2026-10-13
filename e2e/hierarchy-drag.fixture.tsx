import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AssetsPanel } from "../src/components/visual-editor/AssetsPanel";
import { HierarchyPanel } from "../src/components/visual-editor/HierarchyPanel";
import { createPrototypeProject } from "../src/lib/visual-editor/prototype-project";
import type { AudioAsset } from "../src/lib/visual-editor/asset-manifest";

// Production drag sources and drop handlers; only persistence callbacks stop
// at the fixture boundary. This does not open or modify a saved project.
export function mountHierarchyDragFixture(readOnly: boolean) {
  const host = document.createElement("div");
  host.id = "hierarchy-drag-fixture";
  host.dataset.drops = "[]";
  host.style.cssText = "position:fixed;inset:0;z-index:20;background:white;padding:24px;display:flex;gap:24px";
  document.body.append(host);
  const bundle = createPrototypeProject("world", "hierarchy-drag");
  const audio: AudioAsset = {
    id: "drag-audio", kind: "audio", name: "Drag Sound", status: "ready",
    source: { kind: "project", relativePath: "assets/drag.wav" },
    importMetadata: { sourceFormat: "wav", mimeType: "audio/wav", byteLength: 44 },
  };
  const assets = { ...bundle.assets, folders: {}, assets: { [audio.id]: audio } };
  const noop = () => {};
  function Fixture() {
    const [selected, setSelected] = useState<string[]>(["entity-world-object"]);
    return <>
      <div style={{ width: 320, height: 480, display: "flex" }}>
        <HierarchyPanel
          scene={bundle.scene} projectKind="world" readOnly={readOnly}
          selection={{ kind: "entity", id: selected[0] }} selectedEntityIds={selected}
          builtinPrefabRecipes={[]} renameRequest={null}
          onSelectionChange={ids => setSelected(ids)} onAssignMaterial={noop}
          onDropSceneAsset={(assetId, parentEntityId) => {
            const drops = JSON.parse(host.dataset.drops!);
            drops.push({ assetId, parentEntityId });
            host.dataset.drops = JSON.stringify(drops);
          }}
          onDropBuiltinPrefab={noop} onEntityEnabledChange={noop}
          onCreateXriftObject={noop} onCreateComponentObject={noop}
          onRename={noop} onCommand={() => true}
        />
      </div>
      <div style={{ width: 760, height: 400 }}>
        <AssetsPanel assets={assets} projectKind="world" editorMode="edit"
          selectedAssetId={audio.id} selectedAssetIds={[audio.id]} pendingImports={[]}
          importError={null} statusMessage={null} projectSaving={false}
          activeFolderId={null} renameRequest={null} canOpenAssetLocation={false}
          onSelectAsset={noop} onAssetSelectionChange={noop} onQueueFiles={noop}
          onRemovePending={noop} onClearImportError={noop} onSaveBeforeImport={noop}
          onActiveFolderChange={noop} onRename={noop} onRequestDeleteAsset={noop}
          onSetProjectThumbnail={noop} onRequestDeleteFolder={noop}
          onMoveAsset={noop} onMoveFolder={noop} onPlaceBuiltinPrefab={noop}
          onPlaceSceneAsset={noop} onOpenExternalStore={noop}
          onOpenInteractivity={noop} onOpenAssetLocation={noop}
          onPhaseNotice={noop} onCommand={() => true}
        />
      </div>
    </>;
  }
  createRoot(host).render(<Fixture />);
}
