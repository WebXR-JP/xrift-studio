import {
  isEnvironmentTextureAsset,
  type AssetManifest,
  type Color4,
  type ParticleAsset,
  type ParticlePropertiesPatch,
  type ParticleScalarRange,
  type Vec3Like,
} from "../../lib/visual-editor";

type Props = {
  asset: ParticleAsset;
  assets: AssetManifest;
  readOnly: boolean;
  onChange: (patch: ParticlePropertiesPatch) => void;
};

const CONTROL =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export function ParticleAssetInspector({
  asset,
  assets,
  readOnly,
  onChange,
}: Props) {
  const properties = asset.properties;
  const materials = Object.values(assets.assets).filter(
    (candidate) => candidate.kind === "material",
  );
  const textures = Object.values(assets.assets).filter(
    (candidate) =>
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

      <Section title="System">
        <NumberField label="Max Particles" value={properties.maxParticles} min={1} max={100000} step={1} disabled={readOnly} onChange={(maxParticles) => onChange({ maxParticles })} />
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
        <ColorField label="Start" value={properties.colorOverLifetime.start} disabled={readOnly} onChange={(start) => onChange({ colorOverLifetime: { ...properties.colorOverLifetime, start } })} />
        <ColorField label="End" value={properties.colorOverLifetime.end} disabled={readOnly} onChange={(end) => onChange({ colorOverLifetime: { ...properties.colorOverLifetime, end } })} />
      </Section>

      <Section title="Renderer">
        <SelectField label="Mode" value={properties.renderer.mode} values={["billboard", "stretched-billboard"]} disabled={readOnly} onChange={(mode) => onChange({ renderer: { mode: mode as typeof properties.renderer.mode } })} />
        <SelectField label="Blending" value={properties.renderer.blending} values={["normal", "additive"]} disabled={readOnly} onChange={(blending) => onChange({ renderer: { blending: blending as typeof properties.renderer.blending } })} />
        <SelectField label="Sort" value={properties.renderer.sortMode} values={["none", "distance", "youngest", "oldest"]} disabled={readOnly} onChange={(sortMode) => onChange({ renderer: { sortMode: sortMode as typeof properties.renderer.sortMode } })} />
        <AssetSelect label="Material" value={properties.renderer.materialAssetId} options={materials} disabled={readOnly} onChange={(materialAssetId) => onChange({ renderer: { materialAssetId } })} />
        <AssetSelect label="Texture" value={properties.renderer.textureAssetId} options={textures} disabled={readOnly} onChange={(textureAssetId) => onChange({ renderer: { textureAssetId } })} />
        <Toggle label="Cast Shadows" checked={properties.renderer.castShadow} disabled={readOnly} onChange={(castShadow) => onChange({ renderer: { castShadow } })} />
        <Toggle label="Receive Shadows" checked={properties.renderer.receiveShadow} disabled={readOnly} onChange={(receiveShadow) => onChange({ renderer: { receiveShadow } })} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <h4 className="mb-3 text-[13px] font-semibold text-slate-800">{title}</h4>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function NumberField({ label, value, min, max, step = 0.01, suffix, disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">
      {label}
      <span className="relative">
        <input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => Number.isFinite(event.currentTarget.valueAsNumber) && onChange(event.currentTarget.valueAsNumber)} className={`${CONTROL} text-right ${suffix ? "pr-10" : ""}`} />
        {suffix ? <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span> : null}
      </span>
    </label>
  );
}

function RangeField({ label, value, min, max, preserveOrder = false, disabled, onChange }: { label: string; value: ParticleScalarRange; min: number; max: number; preserveOrder?: boolean; disabled: boolean; onChange: (value: ParticleScalarRange) => void }) {
  const update = (key: "min" | "max", next: number) => {
    const range = { ...value, [key]: next };
    onChange(!preserveOrder && range.min > range.max ? { min: range.max, max: range.min } : range);
  };
  return (
    <div className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">
      <span>{label}</span>
      <div className="grid grid-cols-2 gap-1">
        {(["min", "max"] as const).map((key) => (
          <label key={key} className="relative">
            <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] uppercase text-slate-400">{key}</span>
            <input type="number" value={value[key]} min={min} max={max} step="any" disabled={disabled} onChange={(event) => Number.isFinite(event.currentTarget.valueAsNumber) && update(key, event.currentTarget.valueAsNumber)} className={`${CONTROL} pl-7 text-right`} />
          </label>
        ))}
      </div>
    </div>
  );
}

function VectorField({ label, value, disabled, onChange }: { label: string; value: Vec3Like; disabled: boolean; onChange: (value: Vec3Like) => void }) {
  return (
    <div className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">
      <span>{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {value.map((entry, index) => (
          <label key={index} className="relative">
            <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[11px] uppercase text-slate-400">{"xyz"[index]}</span>
            <input type="number" value={entry} step="any" disabled={disabled} onChange={(event) => { const next = [...value] as Vec3Like; next[index] = event.currentTarget.valueAsNumber; onChange(next); }} className={`${CONTROL} pl-3 text-right`} />
          </label>
        ))}
      </div>
    </div>
  );
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: Color4; disabled: boolean; onChange: (value: Color4) => void }) {
  const hex = `#${value.slice(0, 3).map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
  return (
    <div className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">
      <span>{label}</span>
      <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-1">
        <input type="color" value={hex} disabled={disabled} onChange={(event) => { const raw = event.currentTarget.value; onChange([Number.parseInt(raw.slice(1,3),16)/255, Number.parseInt(raw.slice(3,5),16)/255, Number.parseInt(raw.slice(5,7),16)/255, value[3]]); }} className="h-8 w-9 rounded border border-slate-300 bg-white p-1" />
        <label className="relative"><input type="number" value={value[3]} min={0} max={1} step={0.01} disabled={disabled} onChange={(event) => onChange([value[0], value[1], value[2], event.currentTarget.valueAsNumber])} className={`${CONTROL} pr-5 text-right`} /><span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">A</span></label>
      </div>
    </div>
  );
}

function SelectField({ label, value, values, disabled, onChange }: { label: string; value: string; values: string[]; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">{label}<select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} className={CONTROL}>{values.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>;
}

function AssetSelect({ label, value, options, disabled, onChange }: { label: string; value?: string; options: Array<{ id: string; name: string }>; disabled: boolean; onChange: (value: string | undefined) => void }) {
  return <label className="grid grid-cols-[minmax(100px,1fr)_120px] items-center gap-2 text-xs text-slate-600">{label}<select value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value || undefined)} className={CONTROL}><option value="">なし</option>{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center justify-between gap-2 text-xs text-slate-600">{label}<input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} className="h-4 w-4 accent-violet-600" /></label>;
}
