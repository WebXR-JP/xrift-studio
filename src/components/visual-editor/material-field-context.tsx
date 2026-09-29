import { createContext, useContext, useEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Color } from "three";
import type { Color3, MaterialTextureInfo, TextureAsset } from "../../lib/visual-editor/asset-manifest";
import { ScrubNumberInput } from "./ScrubNumberInput";
import { useValueScrubTransaction } from "./value-scrub-transaction";

type MaterialFieldContextValue = {
  mixedPropertyPaths: ReadonlySet<string>;
  onEditField: (path: string, value: unknown) => void;
};
const MaterialFieldContext = createContext<MaterialFieldContextValue | undefined>(undefined);

export function MaterialFieldScope({ mixedPropertyPaths, onEditField, children }: MaterialFieldContextValue & { children: ReactNode }) {
  return <MaterialFieldContext.Provider value={{ mixedPropertyPaths, onEditField }}>{children}</MaterialFieldContext.Provider>;
}

export function useMaterialField(path?: string) {
  const context = useContext(MaterialFieldContext);
  if (!context || !path) return undefined;
  return {
    mixed: context.mixedPropertyPaths.has(path),
    mixedAt: (suffix: string) => context.mixedPropertyPaths.has(`${path}${suffix}`),
    edit: (value: unknown) => context.onEditField(path, value),
    editAt: (suffix: string, value: unknown) => context.onEditField(`${path}${suffix}`, value),
  };
}

export function MaterialFieldText({ materialPath, children }: { materialPath: string; children: ReactNode }) {
  return <>{useMaterialField(materialPath)?.mixed ? "一部異なる" : children}</>;
}

function hexColor3(hex: string): Color3 | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return undefined;
  const color = new Color(hex);
  return [color.r, color.g, color.b];
}

export function MaterialInput({ materialPath, materialEncode, ...props }: InputHTMLAttributes<HTMLInputElement> & { materialPath?: string; materialEncode?: (value: unknown) => unknown }) {
  const field = useMaterialField(materialPath);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = props.type === "checkbox" && Boolean(field?.mixed); }, [field?.mixed, props.type]);
  if (!field) return <input {...props} />;
  if (props.type === "color") {
    const colorValue = field.mixed ? "#ffffff" : String(props.value);
    const change = (hex: string) => {
      if (materialPath === "color") field.edit(hex);
      else { const rgb = hexColor3(hex); if (rgb) field.edit(rgb); }
    };
    return <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {field.mixed ? <input type="text" aria-label={`${props["aria-label"] ?? "Color"}の色コード`} placeholder="#RRGGBB" disabled={props.disabled}
        className="h-7 w-20 rounded border border-slate-300 px-1 text-xs" onChange={event => { if (hexColor3(event.currentTarget.value)) change(event.currentTarget.value); }} /> : null}
      <span className={field.mixed ? "relative shrink-0 whitespace-nowrap rounded border border-slate-300 px-2 py-1 text-xs" : ""}>
        {field.mixed ? "色を選ぶ" : null}
        <input {...props} ref={ref} value={colorValue} onChange={event => change(event.currentTarget.value)}
          className={field.mixed ? "absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" : props.className} />
      </span>
    </span>;
  }
  return <span className="contents">
    <input {...props} ref={ref} checked={props.type === "checkbox" ? field.mixed ? false : props.checked : undefined}
      value={props.type === "checkbox" ? undefined : field.mixed ? "" : props.value} placeholder={field.mixed ? "一部異なる" : props.placeholder}
      onChange={event => {
        const value = props.type === "checkbox" ? event.currentTarget.checked : props.type === "number" || props.type === "range" ? event.currentTarget.valueAsNumber : event.currentTarget.value;
        field.edit(materialEncode ? materialEncode(value) : value);
      }} />
    {field.mixed && props.type === "checkbox" ? <span className="text-[11px] text-slate-500">一部異なる</span> : null}
  </span>;
}

export function MaterialSelect({ materialPath, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { materialPath?: string }) {
  const field = useMaterialField(materialPath);
  if (!field) return <select {...props} />;
  return <select {...props} value={field.mixed ? "__mixed__" : props.value} onChange={event => field.edit(event.currentTarget.value)}>
    {field.mixed ? <option value="__mixed__" disabled>一部異なる</option> : null}{props.children}
  </select>;
}

export function MaterialBulkNumberControl({ materialPath, label, value, min, max, step = .01, disabled, description, encode }: {
  materialPath: string; label: string; value: number; min?: number; max?: number; step?: number; disabled: boolean; description?: string; encode?: (value: number) => number;
}) {
  const field = useMaterialField(materialPath)!;
  return <label className="block text-xs text-slate-600"><span className="mb-1 block">{label}</span>
    <ScrubNumberInput ariaLabel={label} scrubLabel={label} value={field.mixed ? Number.NaN : value} placeholder={field.mixed ? "一部異なる" : undefined}
      min={min} max={max} step={step} size="sm" disabled={disabled} onChange={next => field.edit(encode ? encode(next) : next)} />
    {description ? <span className="mt-1 block text-[11px] leading-4 text-slate-500">{description}</span> : null}
  </label>;
}

export function MaterialBulkRangeControl(props: { materialPath: string; label: string; value: number; min?: number; max?: number; step?: number; disabled: boolean; description?: string }) {
  const field = useMaterialField(props.materialPath)!;
  const transaction = useValueScrubTransaction();
  return <div>
    <MaterialBulkNumberControl {...props} label={`${props.label}の数値`} />
    {field.mixed ? <p className="mt-1 text-[11px] text-slate-500">一部異なる値を、入力した値にまとめて変えます。</p> :
      <input type="range" aria-label={`${props.label}のスライダー`} min={props.min ?? 0} max={props.max ?? 1} step={props.step ?? .01}
        value={props.value} disabled={props.disabled}
        onPointerDown={() => transaction?.begin()} onPointerUp={() => transaction?.end()} onPointerCancel={() => transaction?.cancel()}
        onChange={event => { const next = event.currentTarget.valueAsNumber; if (Number.isFinite(next)) field.edit(next); }} className="w-full accent-violet-600 disabled:opacity-50" />}
  </div>;
}

export function MaterialBulkColor3Control({ materialPath, label, value, max, disabled, description }: { materialPath: string; label: string; value: Color3; max?: number; disabled: boolean; description: string }) {
  const field = useMaterialField(materialPath)!;
  const hex = `#${new Color(...value).getHexString()}`;
  return <fieldset className="min-w-0"><legend className="sr-only">{label}</legend>
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"><span>{label}</span>
      <span className="flex max-w-full flex-wrap items-center gap-1.5"><span className="whitespace-nowrap font-mono text-[11px] text-slate-500">{field.mixed ? "一部異なる" : hex}</span>
        <MaterialInput type="color" materialPath={materialPath} value={hex} disabled={disabled} aria-label={`${label}のカラーピッカー`} className="h-7 w-9 rounded border border-slate-300 bg-white p-0.5" />
      </span>
    </div>
    <div className="grid grid-cols-3 gap-1">{(["R", "G", "B"] as const).map((channel, index) =>
      <MaterialBulkNumberControl key={channel} materialPath={`${materialPath}.${index}`} label={`${label} ${channel}`} value={value[index]!} min={0} max={max} step={.01} disabled={disabled} />)}</div>
    <p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p>
  </fieldset>;
}

export function MaterialBulkTextureControl({ materialPath, label, description, value, textures, disabled, onOpenTexture }: {
  materialPath: string; label: string; description: string; value?: MaterialTextureInfo; textures: TextureAsset[]; disabled: boolean; onOpenTexture: (id: string) => void;
}) {
  const field = useMaterialField(materialPath)!;
  const idMixed = field.mixedAt(".textureAssetId");
  const transform = value?.transform ?? { offset: [0, 0] as [number, number], scale: [1, 1] as [number, number], rotation: 0 };
  return <fieldset className="rounded-md border border-slate-200 bg-slate-50/70 p-2">
    <legend className="px-1 text-xs font-semibold text-slate-800">{label}</legend>
    <p className="mb-2 text-[11px] text-slate-500">{description}</p>
    <label className="block text-[11px] text-slate-500">テクスチャ
      <select aria-label={`${label}のテクスチャ`} value={idMixed ? "__mixed__" : value?.textureAssetId ?? ""} disabled={disabled || textures.length === 0}
        className="mt-1 h-7 w-full rounded border border-slate-300 bg-white px-2 text-xs" onChange={event => field.editAt(".textureAssetId", event.currentTarget.value || null)}>
        {idMixed ? <option value="__mixed__" disabled>一部異なる</option> : null}<option value="">なし</option>
        {textures.map(texture => <option key={texture.id} value={texture.id}>{texture.name}</option>)}
      </select>
    </label>
    {value || field.mixed ? <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
      <p className="text-[11px] text-slate-500">画像の選択では各素材のUVを保ちます。UVの変更は、画像を割り当て済みの素材に反映します。</p>
      <MaterialBulkNumberControl materialPath={`${materialPath}.texCoord`} label={`${label} UVセット`} value={value?.texCoord ?? 0} min={0} step={1} disabled={disabled} />
      <div className="grid grid-cols-2 gap-2">{(["offset", "scale"] as const).map(key => (["X", "Y"] as const).map((axis, index) =>
        <MaterialBulkNumberControl key={`${key}.${index}`} materialPath={`${materialPath}.transform.${key}.${index}`} label={`${label} ${key === "offset" ? "ずらす量" : "繰り返し"} ${axis}`}
          value={transform[key][index]!} step={.01} disabled={disabled} />))}</div>
      <MaterialBulkNumberControl materialPath={`${materialPath}.transform.rotation`} label={`${label} 回転（度）`} value={transform.rotation * 180 / Math.PI} step={1} disabled={disabled} encode={degrees => degrees * Math.PI / 180} />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" disabled={disabled} onClick={() => field.editAt(".transform", null)} className="rounded border border-slate-300 px-2 py-1 text-[11px]">UVを初期値へ戻す</button>
        <button type="button" disabled={disabled || idMixed || !value} onClick={() => value && onOpenTexture(value.textureAssetId)} className="rounded border border-slate-300 px-2 py-1 text-[11px] disabled:opacity-40">テクスチャ設定を開く</button>
        <button type="button" disabled={disabled} onClick={() => field.editAt(".textureAssetId", null)} className="ml-auto rounded border border-slate-300 px-2 py-1 text-[11px]">解除</button>
      </div>
    </div> : null}
  </fieldset>;
}
