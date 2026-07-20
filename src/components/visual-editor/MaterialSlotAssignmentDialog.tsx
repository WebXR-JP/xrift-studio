import { useEffect, useId, useState } from "react";
import type { MaterialSlotDefinition } from "../../lib/visual-editor";
import { EDITOR_ICONS } from "./editor-icons";

export const ALL_MATERIAL_SLOTS = "__all_material_slots__" as const;

export type MaterialSlotAssignmentChoice =
  | string
  | typeof ALL_MATERIAL_SLOTS;

export type MaterialSlotAssignmentOption = MaterialSlotDefinition & {
  currentMaterialName?: string;
};

export function MaterialSlotAssignmentDialog({
  entityName,
  materialName,
  slots,
  onCancel,
  onConfirm,
}: {
  entityName: string;
  materialName: string;
  slots: readonly MaterialSlotAssignmentOption[];
  onCancel: () => void;
  onConfirm: (choice: MaterialSlotAssignmentChoice) => void;
}) {
  const titleId = useId();
  const [choice, setChoice] = useState<MaterialSlotAssignmentChoice>(
    slots[0]?.slot ?? ALL_MATERIAL_SLOTS,
  );

  useEffect(() => {
    setChoice(slots[0]?.slot ?? ALL_MATERIAL_SLOTS);
  }, [entityName, materialName, slots]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const MaterialIcon = EDITOR_ICONS.material;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/25 p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl"
      >
        <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700">
              <MaterialIcon size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                適用するMaterial Slot
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                「{materialName}」を「{entityName}」のどの面へ適用するか選びます。
              </p>
            </div>
          </div>
        </header>

        <div className="max-h-[min(420px,60vh)] space-y-2 overflow-y-auto p-3">
          {slots.map((slot) => (
            <label
              key={slot.slot}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                choice === slot.slot
                  ? "border-violet-400 bg-violet-50"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="material-slot"
                value={slot.slot}
                checked={choice === slot.slot}
                onChange={() => setChoice(slot.slot)}
                className="mt-0.5 h-4 w-4 accent-violet-600"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-slate-800">
                    {slot.name}
                  </span>
                  {slot.sourceMaterialIndex !== undefined ? (
                    <span className="shrink-0 text-[11px] text-slate-400">
                      glTF #{slot.sourceMaterialIndex}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block truncate text-[11px] text-slate-500">
                  現在: {slot.currentMaterialName ?? "未設定"}
                </span>
              </span>
            </label>
          ))}

          {slots.length > 1 ? (
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                choice === ALL_MATERIAL_SLOTS
                  ? "border-violet-400 bg-violet-50"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="material-slot"
                value={ALL_MATERIAL_SLOTS}
                checked={choice === ALL_MATERIAL_SLOTS}
                onChange={() => setChoice(ALL_MATERIAL_SLOTS)}
                className="mt-0.5 h-4 w-4 accent-violet-600"
              />
              <span>
                <span className="block text-xs font-semibold text-slate-800">
                  すべてのSlot
                </span>
                <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                  このMeshの{slots.length}個のMaterial Slotをまとめて置き換えます。
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[11px] leading-4 text-slate-500">
            適用は1回のUndoで元へ戻せます。
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={slots.length === 0}
              onClick={() => onConfirm(choice)}
              className="h-8 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Materialを適用
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
