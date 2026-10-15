import { useEffect, useId, useState } from "react";
import { normalizeMaterialProperties, type MaterialAsset, type MaterialAssetPatch } from "../../lib/visual-editor/asset-manifest";
import { ScrubNumberInput } from "./ScrubNumberInput";
import { useValueScrubTransaction } from "./value-scrub-transaction";

function normalizedHex(value: string): string | null {
  const hex = value.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(hex)) return hex;
  if (/^#[\da-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map(channel => channel + channel).join("")}`;
  return null;
}

function MaterialScalarControl({ label, value, disabled, onChange }: {
  label: string; value: number; disabled: boolean; onChange: (value: number) => void;
}) {
  const transaction = useValueScrubTransaction();
  return <div className="min-w-0 space-y-1">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-600">{label}</span>
      <ScrubNumberInput ariaLabel={`${label}の数値`} scrubLabel={label} min={0} max={1} step={0.01}
        value={value} disabled={disabled} onChange={onChange} size="xs" wrapperClassName="w-20 shrink-0" />
    </div>
    <input type="range" aria-label={`${label}のスライダー`} min={0} max={1} step={0.01} value={value} disabled={disabled}
      onPointerDown={() => transaction?.begin()} onPointerUp={() => transaction?.end()} onPointerCancel={() => transaction?.cancel()}
      onChange={event => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) onChange(next); }}
      className="block w-full accent-brand-600 disabled:cursor-not-allowed disabled:opacity-50" />
  </div>;
}

/** Current Material values are separate from the saved record of the AI change. */
export function ChatgptMaterialControls({ material, onChange, disabled = false }: {
  material: MaterialAsset;
  onChange: (assetId: string, patch: MaterialAssetPatch) => void;
  disabled?: boolean;
}) {
  const colorId = useId();
  const pbr = normalizeMaterialProperties(material.properties).pbrMetallicRoughness;
  const color = `#${pbr.baseColorFactor.slice(0, 3).map(channel => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
  const editingDisabled = disabled || material.status !== "ready";
  const [hexText, setHexText] = useState(color);
  useEffect(() => { setHexText(color); }, [material.id, color, editingDisabled]);
  const changeColor = (value: string) => {
    if (editingDisabled) { setHexText(color); return; }
    const hex = normalizedHex(value);
    setHexText(hex ?? color);
    if (!hex || hex === color) return;
    // The common Material patch changes RGB while retaining alpha at commit time.
    onChange(material.id, { color: hex });
  };
  return <fieldset aria-label="現在のMaterialを調整" data-material-asset-id={material.id} disabled={editingDisabled}
    className="mt-2 min-w-0 space-y-2.5 rounded-md border border-slate-200 bg-white px-2.5 pb-2.5 pt-1">
    <legend className="px-1 text-[11px] font-medium text-slate-700">現在のMaterialを調整</legend>
    <p className="break-words text-[11px] text-slate-500">{material.name}</p>
    <p hidden data-chatgpt-copy-hidden className="whitespace-pre-line">{`Base Color ${color}\nRoughness ${pbr.roughnessFactor}\nMetallic ${pbr.metallicFactor}`}</p>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <label htmlFor={colorId} className="text-[11px] text-slate-600">Base Color</label>
      <div className="flex min-w-0 items-center gap-1.5">
        <input id={colorId} type="color" aria-label="Base Colorの色" value={color} disabled={editingDisabled}
          onChange={event => changeColor(event.currentTarget.value)}
          className="h-7 w-9 shrink-0 rounded border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50" />
        <input type="text" aria-label="Base ColorのHEX" value={hexText} disabled={editingDisabled} maxLength={7}
          spellCheck={false} autoComplete="off" onChange={event => setHexText(event.currentTarget.value)}
          onBlur={() => changeColor(hexText)} onKeyDown={event => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setHexText(color); }
          }}
          className="h-7 w-20 min-w-0 rounded border border-slate-300 bg-white px-1.5 text-right font-mono text-[11px] text-slate-700 outline-none focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-400" />
      </div>
    </div>
    <MaterialScalarControl label="Roughness" value={pbr.roughnessFactor} disabled={editingDisabled}
      onChange={roughnessFactor => { if (!editingDisabled) onChange(material.id, { pbrMetallicRoughness: { roughnessFactor } }); }} />
    <MaterialScalarControl label="Metallic" value={pbr.metallicFactor} disabled={editingDisabled}
      onChange={metallicFactor => { if (!editingDisabled) onChange(material.id, { pbrMetallicRoughness: { metallicFactor } }); }} />
  </fieldset>;
}
