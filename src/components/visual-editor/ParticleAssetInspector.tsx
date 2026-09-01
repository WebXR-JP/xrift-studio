import {
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  DEFAULT_PARTICLE_PROPERTIES,
  PARTICLE_AUTHORING_PRESETS,
  isEnvironmentTextureAsset,
  scaleParticleEmission,
  type AssetManifest,
  type Color4,
  type ParticleAsset,
  type ParticlePropertiesPatch,
  type ParticleScalarRange,
  type TextureAsset,
  type Vec3Like,
} from "../../lib/visual-editor";
import {
  clearEditorDragData,
  hasEditorDragData,
  readEditorDragData,
} from "./editor-drag-data";
import { TEXTURE_DRAG_MIME } from "./types";
import { ScrubNumberInput } from "./ScrubNumberInput";

type Props = {
  asset: ParticleAsset;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: ParticlePropertiesPatch) => void;
  onOpenTexture: (assetId: string) => void;
};

const CONTROL =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export function ParticleAssetInspector({
  asset,
  assets,
  readOnly,
  onChange,
  onOpenTexture,
}: Props) {
  const properties = asset.properties;
  const materials = Object.values(assets.assets).filter(
    (candidate) => candidate.kind === "material",
  );
  const textures = Object.values(assets.assets).filter(
    (candidate): candidate is TextureAsset =>
      candidate.kind === "texture" && !isEnvironmentTextureAsset(candidate),
  );

  return (
    <div className="space-y-3">
      <section className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="text-[13px] font-semibold text-slate-900">{asset.name}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Particle Assetの変更は、参照するParticle Emitterへ即時反映されます。
        </p>
      </section>

      <ParticleQuickTools
        properties={properties}
        readOnly={readOnly}
        onChange={onChange}
      />

      <Section title="System">
        <NumberField label="Max Particles" value={properties.maxParticles} min={1} max={10000} step={1} disabled={readOnly} onChange={(maxParticles) => onChange({ maxParticles })} />
        <NumberField label="Duration" value={properties.duration} min={0.01} max={600} step={0.1} suffix="sec" disabled={readOnly} onChange={(duration) => onChange({ duration })} />
        <SelectField label="Simulation Space" value={properties.simulationSpace} values={["local", "world"]} disabled={readOnly} onChange={(simulationSpace) => onChange({ simulationSpace: simulationSpace as "local" | "world" })} />
        <Toggle label="Looping" checked={properties.looping} disabled={readOnly} onChange={(looping) => onChange({ looping })} />
        <Toggle label="Prewarm" checked={properties.prewarm} disabled={readOnly || !properties.looping} onChange={(prewarm) => onChange({ prewarm })} />
      </Section>

      <Section title="Emission">
        <NumberField label="Rate over Time" value={properties.emission.rateOverTime} min={0} max={100000} step={1} disabled={readOnly} onChange={(rateOverTime) => onChange({ emission: { ...properties.emission, rateOverTime } })} />
        <RangeField label="Start Delay" value={properties.startDelay} min={0} max={600} disabled={readOnly} onChange={(startDelay) => onChange({ startDelay })} />
        <RangeField label="Lifetime" value={properties.startLifetime} min={0.01} max={600} disabled={readOnly} onChange={(startLifetime) => onChange({ startLifetime })} />
        <RangeField label="Speed" value={properties.startSpeed} min={-1000} max={1000} disabled={readOnly} onChange={(startSpeed) => onChange({ startSpeed })} />
        <RangeField label="Size" value={properties.startSize} min={0} max={1000} disabled={readOnly} onChange={(startSize) => onChange({ startSize })} />
        <AngleRangeField label="Start Rotation" value={properties.startRotation} disabled={readOnly} onChange={(startRotation) => onChange({ startRotation })} />
      </Section>

      <Section title="Shape">
        <SelectField
          label="Shape"
          value={properties.shape.type}
          values={["point", "sphere", "cone", "box"]}
          disabled={readOnly}
          onChange={(type) => {
            if (type === "sphere") onChange({ shape: { type, radius: 0.5 } });
            else if (type === "cone") onChange({ shape: { type, radius: 0.25, angle: 25 } });
            else if (type === "box") onChange({ shape: { type, size: [1, 1, 1] } });
            else onChange({ shape: { type: "point" } });
          }}
        />
        {properties.shape.type === "sphere" ? (
          <NumberField label="Radius" value={properties.shape.radius} min={0} max={10000} disabled={readOnly} onChange={(radius) => onChange({ shape: { type: "sphere", radius } })} />
        ) : properties.shape.type === "cone" ? (
          <>
            <NumberField label="Radius" value={properties.shape.radius} min={0} max={10000} disabled={readOnly} onChange={(radius) => onChange({ shape: { type: "cone", radius, angle: properties.shape.type === "cone" ? properties.shape.angle : 25 } })} />
            <NumberField label="Angle" value={properties.shape.angle} min={0} max={90} suffix="°" disabled={readOnly} onChange={(angle) => onChange({ shape: { type: "cone", radius: properties.shape.type === "cone" ? properties.shape.radius : 0.25, angle } })} />
          </>
        ) : properties.shape.type === "box" ? (
          <VectorField label="Size" value={properties.shape.size} disabled={readOnly} onChange={(size) => onChange({ shape: { type: "box", size } })} />
        ) : null}
      </Section>

      <Section title="Motion">
        <VectorField label="Gravity" value={properties.gravity} disabled={readOnly} onChange={(gravity) => onChange({ gravity })} />
        <VectorField label="Linear Velocity" value={properties.velocityOverLifetime.linear} disabled={readOnly} onChange={(linear) => onChange({ velocityOverLifetime: { ...properties.velocityOverLifetime, linear } })} />
        <VectorField label="Orbital Velocity" value={properties.velocityOverLifetime.orbital} disabled={readOnly} onChange={(orbital) => onChange({ velocityOverLifetime: { ...properties.velocityOverLifetime, orbital } })} />
        <RangeField label="Size over Lifetime" value={properties.sizeOverLifetime} min={0} max={100} preserveOrder disabled={readOnly} onChange={(sizeOverLifetime) => onChange({ sizeOverLifetime })} />
      </Section>

      <Section title="Color over Lifetime">
        <ColorGradientPreview
          start={properties.colorOverLifetime.start}
          end={properties.colorOverLifetime.end}
        />
        <div className="grid grid-cols-2 gap-1.5">
          <UtilityButton
            label="Start / Endを交換"
            disabled={readOnly}
            onClick={() =>
              onChange({
                colorOverLifetime: {
                  start: properties.colorOverLifetime.end,
                  end: properties.colorOverLifetime.start,
                },
              })
            }
          />
          <UtilityButton
            label="同じ色に揃える"
            disabled={readOnly}
            onClick={() =>
              onChange({
                colorOverLifetime: {
                  end: [
                    properties.colorOverLifetime.start[0],
                    properties.colorOverLifetime.start[1],
                    properties.colorOverLifetime.start[2],
                    properties.colorOverLifetime.end[3],
                  ],
                },
              })
            }
          />
          <UtilityButton
            label="最後に透明"
            disabled={readOnly}
            onClick={() =>
              onChange({
                colorOverLifetime: {
                  end: [
                    properties.colorOverLifetime.end[0],
                    properties.colorOverLifetime.end[1],
                    properties.colorOverLifetime.end[2],
                    0,
                  ],
                },
              })
            }
          />
          <UtilityButton
            label="常に不透明"
            disabled={readOnly}
            onClick={() =>
              onChange({
                colorOverLifetime: {
                  start: [
                    properties.colorOverLifetime.start[0],
                    properties.colorOverLifetime.start[1],
                    properties.colorOverLifetime.start[2],
                    1,
                  ],
                  end: [
                    properties.colorOverLifetime.end[0],
                    properties.colorOverLifetime.end[1],
                    properties.colorOverLifetime.end[2],
                    1,
                  ],
                },
              })
            }
          />
        </div>
        <ColorField label="Start" value={properties.colorOverLifetime.start} disabled={readOnly} onChange={(start) => onChange({ colorOverLifetime: { ...properties.colorOverLifetime, start } })} />
        <ColorField label="End" value={properties.colorOverLifetime.end} disabled={readOnly} onChange={(end) => onChange({ colorOverLifetime: { ...properties.colorOverLifetime, end } })} />
      </Section>

      <Section title="Renderer">
        <SelectField label="Mode" value={properties.renderer.mode} values={["billboard", "stretched-billboard"]} disabled={readOnly} onChange={(mode) => onChange({ renderer: { mode: mode as typeof properties.renderer.mode } })} />
        <SelectField label="Blending" value={properties.renderer.blending} values={["normal", "additive"]} disabled={readOnly} onChange={(blending) => onChange({ renderer: { blending: blending as typeof properties.renderer.blending } })} />
        <SelectField label="Sort" value={properties.renderer.sortMode} values={["none", "distance", "youngest", "oldest"]} disabled={readOnly} onChange={(sortMode) => onChange({ renderer: { sortMode: sortMode as typeof properties.renderer.sortMode } })} />
        <AssetSelect label="Material" value={properties.renderer.materialAssetId} options={materials} disabled={readOnly} onChange={(materialAssetId) => onChange({ renderer: { materialAssetId } })} />
        <ParticleTextureField
          value={properties.renderer.textureAssetId}
          textures={textures}
          disabled={readOnly}
          onChange={(textureAssetId) => onChange({ renderer: { textureAssetId } })}
          onOpenTexture={onOpenTexture}
        />
        <Toggle label="Cast Shadows" checked={properties.renderer.castShadow} disabled={readOnly} onChange={(castShadow) => onChange({ renderer: { castShadow } })} />
        <Toggle label="Receive Shadows" checked={properties.renderer.receiveShadow} disabled={readOnly} onChange={(receiveShadow) => onChange({ renderer: { receiveShadow } })} />
      </Section>
    </div>
  );
}

function ParticleQuickTools({
  properties,
  readOnly,
  onChange,
}: {
  properties: ParticleAsset["properties"];
  readOnly: boolean;
  onChange: (patch: ParticlePropertiesPatch) => void;
}) {
  const resetToDefault = () => {
    onChange({
      ...DEFAULT_PARTICLE_PROPERTIES,
      renderer: {
        ...DEFAULT_PARTICLE_PROPERTIES.renderer,
        materialAssetId: properties.renderer.materialAssetId,
        textureAssetId: properties.renderer.textureAssetId,
      },
    });
  };

  return (
    <Section title="Quick Tools">
      <div>
        <p className="mb-1.5 text-[11px] leading-4 text-slate-500">
          TextureとMaterialの参照を保ったまま、よく使う動きと色へ整えます。
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {PARTICLE_AUTHORING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={readOnly}
              title={preset.description}
              onClick={() => onChange(preset.properties)}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left transition-colors hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-xs font-semibold text-slate-800">
                {preset.name}
              </span>
              <span className="mt-0.5 block text-[10px] leading-3.5 text-slate-500">
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50/70 p-2">
        <p className="text-xs font-semibold text-slate-700">発生量</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          RateとMax Particlesを同じ比率で調整します。
        </p>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {[0.25, 0.5, 2, 4].map((multiplier) => (
            <button
              key={multiplier}
              type="button"
              disabled={readOnly}
              onClick={() =>
                onChange(scaleParticleEmission(properties, multiplier))
              }
              className="rounded border border-slate-300 bg-white px-1 py-1 text-[11px] font-semibold text-slate-700 hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ×{multiplier}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <UtilityButton
          label="ループ再生"
          disabled={readOnly}
          onClick={() => onChange({ looping: true })}
        />
        <UtilityButton
          label="ワンショット"
          disabled={readOnly}
          onClick={() =>
            onChange({
              looping: false,
              prewarm: false,
              duration:
                properties.startDelay.max +
                properties.startLifetime.max * 2,
            })
          }
        />
        <UtilityButton
          label="基本へ戻す"
          disabled={readOnly}
          onClick={resetToDefault}
        />
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <h4 className="mb-3 text-[13px] font-semibold text-slate-800">{title}</h4>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function UtilityButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-medium leading-4 text-slate-700 hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function NumberField({ label, value, min, max, step = 0.01, suffix, disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">
      {label}
      <ScrubNumberInput value={value} min={min} max={max} step={step} suffix={suffix} disabled={disabled} ariaLabel={label} scrubLabel={label} onChange={onChange} />
    </label>
  );
}

function RangeField({ label, value, min, max, preserveOrder = false, disabled, onChange }: { label: string; value: ParticleScalarRange; min: number; max: number; preserveOrder?: boolean; disabled: boolean; onChange: (value: ParticleScalarRange) => void }) {
  const update = (key: "min" | "max", next: number) => {
    const range = { ...value, [key]: next };
    onChange(!preserveOrder && range.min > range.max ? { min: range.max, max: range.min } : range);
  };
  return (
    <div className="grid grid-cols-[minmax(90px,1fr)_156px] items-center gap-2 text-xs text-slate-600">
      <span>{label}</span>
      <div className="grid grid-cols-2 gap-1">
        {(["min", "max"] as const).map((key) => (
          <label key={key} className="block">
            <span className="mb-0.5 block text-center text-[9px] font-semibold uppercase leading-3 text-slate-400">{key}</span>
            <ScrubNumberInput value={value[key]} min={min} max={max} disabled={disabled} ariaLabel={`${label} ${key}`} scrubLabel={`${label} ${key}`} onChange={(next) => update(key, next)} className="px-1" />
          </label>
        ))}
      </div>
    </div>
  );
}

function AngleRangeField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: ParticleScalarRange;
  disabled: boolean;
  onChange: (value: ParticleScalarRange) => void;
}) {
  const degrees = {
    min: (value.min * 180) / Math.PI,
    max: (value.max * 180) / Math.PI,
  };
  return (
    <RangeField
      label={label}
      value={degrees}
      min={-36000}
      max={36000}
      disabled={disabled}
      onChange={(next) =>
        onChange({
          min: (next.min * Math.PI) / 180,
          max: (next.max * Math.PI) / 180,
        })
      }
    />
  );
}

function VectorField({ label, value, disabled, onChange }: { label: string; value: Vec3Like; disabled: boolean; onChange: (value: Vec3Like) => void }) {
  return (
    <div className="grid grid-cols-[minmax(80px,1fr)_180px] items-center gap-2 text-xs text-slate-600">
      <span>{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {value.map((entry, index) => (
          <label key={index} className="block">
            <span className="mb-0.5 block text-center text-[9px] font-semibold uppercase leading-3 text-slate-400">{"xyz"[index]}</span>
            <ScrubNumberInput value={entry} disabled={disabled} ariaLabel={`${label} ${"XYZ"[index]}`} scrubLabel={`${label} ${"XYZ"[index]}`} onChange={(next) => { const nextValue = [...value] as Vec3Like; nextValue[index] = next; onChange(nextValue); }} className="px-1" />
          </label>
        ))}
      </div>
    </div>
  );
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: Color4; disabled: boolean; onChange: (value: Color4) => void }) {
  const hex = colorToHex(value);
  return (
    <fieldset className="rounded-md border border-slate-200 bg-slate-50/70 p-2">
      <legend className="sr-only">{label}</legend>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] uppercase text-slate-500">
            {hex}
          </span>
          <input
            type="color"
            value={hex}
            disabled={disabled}
            aria-label={`${label}の色`}
            onChange={(event) => {
              const rgb = hexToRgb(event.currentTarget.value);
              if (rgb) onChange([rgb[0], rgb[1], rgb[2], value[3]]);
            }}
            className="h-7 w-9 rounded border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {(["R", "G", "B", "A"] as const).map((channel, index) => (
          <label key={channel} className="relative">
            <ScrubNumberInput
              value={Number(value[index].toFixed(3))}
              min={0}
              max={1}
              step={0.01}
              scrubStep={0.002}
              disabled={disabled}
              prefix={channel}
              ariaLabel={`${label} ${channel}`}
              scrubLabel={`${label} ${channel}`}
              onChange={(next) => {
                const color: Color4 = [value[0], value[1], value[2], value[3]];
                color[index] = next;
                onChange(color);
              }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ColorGradientPreview({
  start,
  end,
}: {
  start: Color4;
  end: Color4;
}) {
  return (
    <div>
      <div
        aria-label={`色と透明度の変化: ${colorToHex(start)}から${colorToHex(end)}`}
        className="h-7 rounded-md border border-slate-200"
        style={{
          backgroundImage: [
            `linear-gradient(90deg, ${colorToCss(start)}, ${colorToCss(end)})`,
            "linear-gradient(45deg, #e2e8f0 25%, transparent 25%)",
            "linear-gradient(-45deg, #e2e8f0 25%, transparent 25%)",
            "linear-gradient(45deg, transparent 75%, #e2e8f0 75%)",
            "linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
          ].join(","),
          backgroundPosition: "0 0, 0 0, 0 4px, 4px -4px, -4px 0",
          backgroundSize: "100% 100%, 8px 8px, 8px 8px, 8px 8px, 8px 8px",
        }}
      />
      <p className="mt-1 text-[11px] leading-4 text-slate-500">
        RGBとAlphaをStartからEndへ補間します。Alpha 0は完全に透明です。
      </p>
    </div>
  );
}

function colorToHex(value: Color4): string {
  return `#${value
    .slice(0, 3)
    .map((channel) =>
      Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function hexToRgb(value: string): [number, number, number] | null {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
  return [
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  ];
}

function colorToCss(value: Color4): string {
  const [r, g, b, a] = value;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(
    b * 255,
  )}, ${a})`;
}

function SelectField({ label, value, values, disabled, onChange }: { label: string; value: string; values: string[]; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">{label}<select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} className={CONTROL}>{values.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>;
}

function AssetSelect({ label, value, options, disabled, onChange }: { label: string; value?: string; options: Array<{ id: string; name: string }>; disabled: boolean; onChange: (value: string | undefined) => void }) {
  return <label className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">{label}<select value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value || undefined)} className={CONTROL}><option value="">なし</option>{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>;
}

function ParticleTextureField({
  value,
  textures,
  disabled,
  onChange,
  onOpenTexture,
}: {
  value?: string;
  textures: TextureAsset[];
  disabled: boolean;
  onChange: (value: string | undefined) => void;
  onOpenTexture: (assetId: string) => void;
}) {
  const [dropActive, setDropActive] = useState(false);
  const selectedTexture = textures.find((texture) => texture.id === value);
  const missingReference = Boolean(value && !selectedTexture);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !hasEditorDragData(event.dataTransfer, TEXTURE_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    const textureAssetId = readEditorDragData(
      event.dataTransfer,
      TEXTURE_DRAG_MIME,
    );
    clearEditorDragData();
    setDropActive(false);
    if (!textures.some((texture) => texture.id === textureAssetId)) return;
    onChange(textureAssetId);
  };

  return (
    <div
      onDragOverCapture={handleDragOver}
      onDragEnterCapture={handleDragOver}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Node &&
          event.currentTarget.contains(nextTarget)
        ) {
          return;
        }
        setDropActive(false);
      }}
      onDropCapture={handleDrop}
      className={`rounded-md border p-2 transition-colors ${
        dropActive
          ? "border-violet-500 bg-violet-50 ring-2 ring-violet-200"
          : missingReference
            ? "border-rose-300 bg-rose-50/60"
            : "border-slate-200 bg-slate-50/70"
      }`}
    >
      <div className="mb-2">
        <p className="text-xs font-semibold text-slate-800">Particle Texture</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          Texture Assetを選ぶか、Assetsからここへドロップします。透過画像のAlphaも描画へ反映します。
        </p>
      </div>
      <label className="block text-[11px] text-slate-500">
        Texture Asset
        <select
          value={value ?? ""}
          disabled={disabled || textures.length === 0}
          onChange={(event) =>
            onChange(event.currentTarget.value || undefined)
          }
          className={`${CONTROL} mt-1`}
        >
          <option value="">なし</option>
          {missingReference && value ? (
            <option value={value}>不明な参照: {value}</option>
          ) : null}
          {textures.map((texture) => (
            <option key={texture.id} value={texture.id}>
              {texture.name}
            </option>
          ))}
        </select>
      </label>
      {selectedTexture ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-slate-600">
            {selectedTexture.importSettings.colorSpace === "linear"
              ? "Linear"
              : "sRGB"}{" "}
            / {selectedTexture.importSettings.sampler.minFilter}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onOpenTexture(selectedTexture.id)}
            className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Texture設定を開く
          </button>
        </div>
      ) : textures.length === 0 ? (
        <p className="mt-2 rounded border border-dashed border-slate-300 bg-white px-2 py-1.5 text-[11px] leading-4 text-slate-500">
          利用できるTexture Assetがありません。Assetsへ画像をインポートしてください。
        </p>
      ) : null}
      {missingReference ? (
        <p role="alert" className="mt-2 text-[11px] font-medium leading-4 text-rose-700">
          参照先のTexture Assetが見つかりません。別のTextureを選ぶか解除してください。
        </p>
      ) : null}
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-2 text-xs text-slate-600">{label}<input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} className="h-4 w-4 accent-violet-600" /></label>;
}
