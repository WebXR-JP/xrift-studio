import { useMemo } from "react";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import {
  collectXriftInteractionPrograms,
  describeInteractionTriggerAction,
  XRIFT_COMPONENT_SCHEMA_IDS,
  type InteractionTriggerTargetEntity,
} from "../../lib/visual-editor";
import type {
  InteractionTriggerComponent,
  SceneEntity,
} from "../../lib/visual-editor/scene-document";

/**
 * Inspector fields for an Interaction Trigger Component.
 *
 * The graph lives in an Asset and the interaction comes from the official
 * Interactable, so the two things an author gets wrong here are invisible from
 * the node editor: a trigger on an Entity nobody can interact with, and a graph
 * whose actions are still unfinished. Both are answered on this card, next to
 * the button that opens the graph.
 */

export type InteractionTriggerPatch = {
  interactivityAssetId?: string;
};

export function InteractionTriggerInspector({
  component,
  entity,
  assets,
  targets,
  readOnly,
  onPatch,
  onOpenGraph,
  onAddInteractable,
}: {
  component: InteractionTriggerComponent;
  entity: SceneEntity;
  assets: AssetManifest;
  targets: readonly InteractionTriggerTargetEntity[];
  readOnly: boolean;
  onPatch: (patch: InteractionTriggerPatch) => void;
  onOpenGraph: (interactivityAssetId: string) => void;
  onAddInteractable: () => void;
}) {
  const graphs = useMemo(
    () =>
      Object.values(assets.assets)
        .filter((asset) => asset.kind === "interactivity")
        .sort((left, right) => left.name.localeCompare(right.name)),
    [assets],
  );
  const asset = assets.assets[component.interactivityAssetId];
  const graph = asset?.kind === "interactivity" ? asset : undefined;
  const programs = useMemo(
    () => (graph ? collectXriftInteractionPrograms(graph.extension) : []),
    [graph],
  );
  const actions = programs.flatMap((program) => program.actions);
  const hasInteractable = entity.components.some(
    (candidate) =>
      candidate.type === "xrift-component" &&
      candidate.schemaId === XRIFT_COMPONENT_SCHEMA_IDS.interactable &&
      candidate.enabled,
  );
  const disabled = readOnly || !component.enabled;

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-slate-600">
          Interactivity Graph
        </span>
        <div className="flex items-center gap-1.5">
          <select
            value={component.interactivityAssetId}
            disabled={disabled}
            onChange={(event) =>
              onPatch({ interactivityAssetId: event.target.value })
            }
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-45"
          >
            {graph ? null : <option value={component.interactivityAssetId}>未設定</option>}
            {graphs.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onOpenGraph(component.interactivityAssetId)}
            disabled={!graph}
            className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            開く
          </button>
        </div>
      </label>

      {hasInteractable ? null : (
        <div className="rounded border border-amber-200 bg-amber-50 p-2">
          <p className="text-[11px] font-medium text-amber-800">
            Interactableがありません
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-amber-700">
            このEntityにXRift公式のInteractableを付けると、ボタンとして押せるようになります。
          </p>
          <button
            type="button"
            onClick={onAddInteractable}
            disabled={readOnly}
            className="mt-1.5 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40"
          >
            Interactableを追加
          </button>
        </div>
      )}

      <div className="border-t border-slate-200 pt-2">
        <p className="text-[11px] font-medium text-slate-600">押したときの動き</p>
        {!graph ? (
          <p className="mt-1 text-[11px] text-slate-500">
            Interactivity Graphを選ぶと、押したときの動きを設定できます。
          </p>
        ) : programs.length === 0 ? (
          <p className="mt-1 text-[11px] text-slate-500">
            このGraphに「インタラクトされたとき」がありません。開いて追加してください。
          </p>
        ) : actions.length === 0 ? (
          <p className="mt-1 text-[11px] text-slate-500">
            トリガーの先に動きがありません。開いて「プロパティを変える」をつないでください。
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {actions.map((action) => (
              <li
                key={action.nodeIndex}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] leading-4 text-slate-700"
              >
                {describeInteractionTriggerAction(targets, {
                  entityId: action.entityId,
                  componentId: action.componentId ?? "",
                  targetKind: action.target,
                  property: action.property,
                  mode: action.mode,
                  value:
                    action.value === null
                      ? null
                      : action.value.kind === "color"
                        ? action.value.value
                        : action.value.kind === "enum"
                          ? [action.value.value]
                          : [action.value.value],
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
