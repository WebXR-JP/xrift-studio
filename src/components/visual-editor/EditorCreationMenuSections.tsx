import { Import, Mountain, Store } from "lucide-react";
import type { EntityCreationMenuEntry } from "../../lib/visual-editor/entity-creation-menu";
import { TERRAIN_PRESETS } from "../../lib/visual-editor/terrain-presets";
import { EntityCreationMenuContent } from "./EntityCreationMenuContent";
import { EditorMenuItem, EditorMenuSection } from "./EditorMenu";
import { EDITOR_ICONS } from "./editor-icons";

/** Shared by the Hierarchy context menu and the standalone creation menu. */
export function EditorCreationMenuSections({ entries, disabled, onSelect, onCreateTerrain,
  terrainOverlapCount = 0, onArrangeTerrains, onOpenExternalStore, onImportFile, importDisabledReason,
}: {
  entries: readonly EntityCreationMenuEntry[];
  disabled: boolean;
  onSelect: (entry: EntityCreationMenuEntry) => void;
  onCreateTerrain?: (presetId?: string) => void;
  terrainOverlapCount?: number;
  onArrangeTerrains?: () => void;
  onOpenExternalStore?: () => void;
  onImportFile?: () => void;
  importDisabledReason?: string | null;
}) {
  return <>
    <EditorMenuSection label="Entityを作成" icon={EDITOR_ICONS.sceneEntity}>
      <EntityCreationMenuContent entries={entries} disabled={disabled} onSelect={onSelect}
        worldContent={onCreateTerrain ? <EditorMenuSection label="Terrain" icon={Mountain}>
          <EditorMenuItem icon={Mountain} label="平らなTerrain" disabled={disabled} onClick={() => onCreateTerrain()} />
          {TERRAIN_PRESETS.map((preset) => <EditorMenuItem key={preset.id} icon={Mountain} label={preset.label}
            disabled={disabled} onClick={() => onCreateTerrain(preset.id)} />)}
          {terrainOverlapCount > 0 && onArrangeTerrains ? <>
            <div className="my-1 border-t border-slate-200" />
            <EditorMenuItem label="重なったTerrainを横へ並べ直す" disabled={disabled} onClick={onArrangeTerrains} />
          </> : null}
        </EditorMenuSection> : null}
      />
    </EditorMenuSection>
    {onOpenExternalStore || onImportFile ? <EditorMenuSection label="素材を追加" icon={Import}>
      {onImportFile ? <EditorMenuItem icon={Import} label="ファイルから素材を追加"
        disabled={disabled || Boolean(importDisabledReason)} title={importDisabledReason ?? undefined}
        onClick={onImportFile} /> : null}
      {onOpenExternalStore ? <EditorMenuItem icon={Store} label="外部から追加" disabled={disabled} onClick={onOpenExternalStore} /> : null}
    </EditorMenuSection> : null}
  </>;
}
