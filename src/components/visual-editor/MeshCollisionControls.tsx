import { memo, useMemo, useRef } from "react";
import { collisionAncestors, collisionSources, type MeshCollisionAction } from "../../lib/visual-editor/mesh-collision-actions";
import type { SceneDocument, SceneEntity } from "../../lib/visual-editor/scene-document";

const CollisionRow = memo(function CollisionRow({ row, select }: {
  row: ReturnType<typeof collisionSources>[number]; select: { current: ((id: string) => void) | undefined };
}) {
  return <button type="button" className="block w-full truncate py-1 text-left text-xs text-slate-600 hover:text-violet-700"
    title={`${row.entityName}: ${row.label}`} onClick={() => select.current?.(row.entityId)}>
    {row.entityName} · {row.label}{row.active ? "" : "（親または自身が無効）"}
  </button>;
}, (before, after) => before.select === after.select &&
  before.row.entityId === after.row.entityId && before.row.componentId === after.row.componentId &&
  before.row.entityName === after.row.entityName && before.row.label === after.row.label && before.row.active === after.row.active);

export function MeshCollisionControls({ scene, entity, readOnly, onAction, onSelect }: {
  scene: SceneDocument; entity: SceneEntity; readOnly: boolean;
  onAction?: (entityId: string, action: MeshCollisionAction) => void;
  onSelect?: (entityId: string) => void;
}) {
  const rows = useMemo(() => collisionSources(scene), [scene]);
  const select = useRef(onSelect); select.current = onSelect;
  const chain = collisionAncestors(scene, entity.id);
  const inherited = rows.filter((r) => r.entityId !== entity.id && chain.some((e) => e.id === r.entityId));
  const local = rows.filter((r) => r.entityId === entity.id);
  const enabled = chain.every((e) => e.enabled);
  return <div className="space-y-2 border-t border-slate-100 pt-2">
    <div className="flex justify-between gap-2 text-xs"><span className="font-medium text-slate-700">歩行・当たり判定</span>
      <span className="text-slate-500">{!enabled ? "オブジェクトが無効" : local.length ? "このオブジェクトに設定あり" : inherited.length ? "親に設定あり" : "設定なし"}</span>
    </div>
    {inherited.map((r) => <button key={r.componentId} type="button" onClick={() => onSelect?.(r.entityId)} className="block text-left text-[11px] text-slate-500 hover:text-violet-700">親: {r.entityName} · {r.label}</button>)}
    <div className="flex flex-wrap gap-1">
      {([["add", "当たり判定に追加"], ["remove", "これを外す"], ["exclusive", "これだけを歩けるようにする"]] as const).map(([action, label]) =>
        <button key={action} type="button" disabled={readOnly || !enabled || !onAction}
          title={action === "exclusive" ? "シーン全体のほかのCollider（Triggerを含む）と自動生成を解除します。Undoで戻せます。" : action === "add" ? "このメッシュを固定のMesh Colliderとして追加します。" : "このメッシュのColliderを無効にします。親のBox Colliderなど独立した形状は一覧から編集できます。"}
          onClick={() => onAction?.(entity.id, action)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-45">{label}</button>)}
    </div>
    <p className="text-[11px] leading-4 text-slate-500">「これだけ」はシーン全体を置き換えます。Undoで戻せます。</p>
    <details><summary className="cursor-pointer text-xs text-slate-600">当たり判定の設定一覧（{rows.length}）</summary>
      <div className="max-h-40 overflow-y-auto">{rows.length ? rows.map((row) => <CollisionRow key={`${row.entityId}:${row.componentId}`} row={row} select={select} />) : <p className="py-1 text-xs text-slate-500">Colliderと自動生成の設定はありません。</p>}</div>
    </details>
  </div>;
}
