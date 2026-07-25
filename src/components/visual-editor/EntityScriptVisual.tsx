import { createContext, useCallback, useContext, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import type { Object3D } from "three";

import { XriftScriptHost } from "../../../packages/xrift-studio-runtime/src/script/host";
import type {
  ScriptFailure,
  ScriptLogEntry,
} from "../../../packages/xrift-studio-runtime/src/script/host";
import type { ScriptComponent } from "../../lib/visual-editor/scene-document";
import type { CompiledScriptEntry } from "./useScriptRuntime";

/**
 * Mounts Script Components inside the Scene View.
 *
 * The host itself lives in xrift-studio-runtime and is shared with generated
 * worlds, so this file only supplies what is Studio-specific: which module was
 * compiled, the scheduling order taken from the document, and how to resolve
 * Asset and Entity references. See docs/SCRIPTING.md.
 */

export type ScriptViewportRuntime = {
  scripts: ReadonlyMap<string, CompiledScriptEntry>;
  assetUrls: ReadonlyMap<string, string>;
  assetUrlVersions: ReadonlyMap<string, number>;
  /** Component id to scheduling order, precomputed from the scene. */
  orderByComponentId: ReadonlyMap<string, number>;
  resolveAssetUrl: (assetId: string) => string | null;
  onLog: (entry: ScriptLogEntry) => void;
  onFailure: (failure: ScriptFailure) => void;
};

const ScriptViewportContext = createContext<ScriptViewportRuntime | null>(null);

export const ScriptViewportProvider = ScriptViewportContext.Provider;

export function EntityScriptVisual({
  component,
  entityId,
  entityName,
}: {
  component: ScriptComponent;
  entityId: string;
  entityName: string;
}) {
  const runtime = useContext(ScriptViewportContext);
  const scene = useThree((state) => state.scene);
  const entry = runtime?.scripts.get(component.scriptAssetId);
  const properties = useMemo(
    () => ({ ...component.properties }),
    [component.properties],
  );
  const assetResolutionKey = JSON.stringify(
    [...component.assetReferences]
      .sort()
      .map((assetId) => [
        assetId,
        runtime?.assetUrlVersions.get(assetId) ?? null,
      ]),
  );
  // Entity groups are tagged with `authoringEntityId` in their userData; there
  // is no id-to-Object3D index in the viewport, so this walks the graph.
  const resolveEntity = useCallback(
    (targetId: string): Object3D | null => {
      if (!component.entityReferences.includes(targetId)) return null;
      let found: Object3D | null = null;
      scene.traverse((object) => {
        if (found) return;
        const data = object.userData as {
          renderedEntityId?: string;
        };
        if (data.renderedEntityId === targetId) {
          found = object;
        }
      });
      return found;
    },
    [component.entityReferences, scene],
  );
  if (!runtime || !entry) return null;
  return (
    <XriftScriptHost
      script={entry.script}
      {...(entry.render ? { render: entry.render } : {})}
      properties={properties}
      entityId={entityId}
      entityName={entityName}
      componentId={component.id}
      order={runtime.orderByComponentId.get(component.id) ?? 0}
      assetReferences={component.assetReferences}
      entityReferences={component.entityReferences}
      resolveAssetUrl={runtime.resolveAssetUrl}
      assetResolutionKey={assetResolutionKey}
      resolveEntity={resolveEntity}
      onLog={runtime.onLog}
      onFailure={runtime.onFailure}
    />
  );
}
