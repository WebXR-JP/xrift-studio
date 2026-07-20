import { LockKeyhole, Trash2 } from "lucide-react";
import {
  getXriftComponentDefinition,
  type JsonObject,
  type JsonValue,
  type XRiftComponent,
  type XriftComponentFieldDefinition,
} from "../../lib/visual-editor";

type Props = {
  component: XRiftComponent;
  readOnly: boolean;
  onPropertyChange: (name: string, value: JsonValue | undefined) => void;
  onEnabledChange: (enabled: boolean) => void;
  onRemove: () => void;
};

type TagValue = { id: string; label: string; color: string };

const INPUT_CLASS =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export function XRiftComponentInspector({
  component,
  readOnly,
  onPropertyChange,
  onEnabledChange,
  onRemove,
}: Props) {
  const definition = getXriftComponentDefinition(component.schemaId);
  if (!definition) {
    return (
      <section className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
        <div className="font-semibold">不明なXRift Component</div>
        <div className="mt-1 font-mono text-xs">{component.schemaId}</div>
      </section>
    );
  }

  const recipeLocked = component.authoring?.readOnly === true;
  const effectiveReadOnly = readOnly || recipeLocked;

  return (
    <section className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={component.enabled}
              disabled={effectiveReadOnly}
              onChange={(event) => onEnabledChange(event.currentTarget.checked)}
              aria-label={`${definition.label}を有効化`}
              className="h-4 w-4 accent-violet-600"
            />
            <h3 className="truncate text-[13px] font-semibold text-slate-900">
              {definition.label}
            </h3>
            {recipeLocked ? (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-600"
                title="Builtin Prefabの設定を保護しています"
              >
                <LockKeyhole size={10} aria-hidden="true" />
                Built-in
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-4 text-slate-500">
            {definition.description}
          </p>
        </div>
        <button
          type="button"
          disabled={effectiveReadOnly}
          onClick={onRemove}
          aria-label={`${definition.label}を削除`}
          title={`${definition.label}を削除`}
          className="rounded p-1.5 text-slate-400 hover:bg-rose-100 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </header>

      <div className="space-y-3 p-3">
        {recipeLocked ? (
          <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-4 text-slate-600">
            XRift PrefabのComponent設定は読み取り専用です。位置・回転・大きさはEntityのTransformで調整できます。
          </div>
        ) : null}
        {definition.fields.map((field) => (
          <FieldEditor
            key={field.name}
            field={field}
            value={component.properties[field.name]}
            readOnly={effectiveReadOnly || !component.enabled}
            onChange={(value) => onPropertyChange(field.name, value)}
          />
        ))}
        {definition.runtimeBindings.length > 0 ? (
          <div className="rounded border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs leading-4 text-sky-800">
            {definition.runtimeBindings.map((binding) => binding.name).join(" / ")} は実行時の動作です。
            Visual Editorでは安全な設定値だけを保存します。
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FieldEditor({
  field,
  value,
  readOnly,
  onChange,
}: {
  field: XriftComponentFieldDefinition;
  value: JsonValue | undefined;
  readOnly: boolean;
  onChange: (value: JsonValue | undefined) => void;
}) {
  const requiredValueMissing =
    field.required &&
    (value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim().length === 0));
  const label = (
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-slate-600">
        {field.label}
        {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {!field.required && value !== undefined ? (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onChange(undefined)}
          className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-40"
        >
          リセット
        </button>
      ) : null}
    </div>
  );

  return (
    <div>
      {label}
      {renderFieldControl(field, value, readOnly, onChange)}
      {requiredValueMissing ? (
        <p className="mt-1 text-xs font-medium leading-4 text-rose-700">
          この値を設定するとXRift向けの変換を実行できます。
        </p>
      ) : null}
      <p className="mt-1 text-xs leading-4 text-slate-400">
        {field.description}
      </p>
    </div>
  );
}

function renderFieldControl(
  field: XriftComponentFieldDefinition,
  value: JsonValue | undefined,
  readOnly: boolean,
  onChange: (value: JsonValue | undefined) => void,
) {
  if (field.kind === "boolean") {
    const checked = typeof value === "boolean" ? value : Boolean(field.defaultValue);
    return (
      <label className="flex h-8 items-center justify-between rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700">
        {checked ? "On" : "Off"}
        <input
          type="checkbox"
          checked={checked}
          disabled={readOnly}
          onChange={(event) => onChange(event.currentTarget.checked)}
          className="h-4 w-4 accent-violet-600"
        />
      </label>
    );
  }

  if (field.kind === "enum") {
    return (
      <select
        value={typeof value === "string" ? value : ""}
        disabled={readOnly}
        onChange={(event) =>
          onChange(event.currentTarget.value || field.defaultValue)
        }
        className={INPUT_CLASS}
      >
        {!field.required ? <option value="">Default</option> : null}
        {field.enumValues?.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === "number") {
    const numberValue = typeof value === "number" ? value : "";
    return (
      <input
        type="number"
        value={numberValue}
        min={field.range?.min}
        max={field.range?.max}
        step={field.range?.step ?? "any"}
        disabled={readOnly}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          onChange(Number.isFinite(next) ? next : undefined);
        }}
        className={INPUT_CLASS}
      />
    );
  }

  if (field.kind === "color-number") {
    const color = numberToColor(typeof value === "number" ? value : 0xffffff);
    return (
      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-2">
        <input
          type="color"
          value={color}
          disabled={readOnly}
          onChange={(event) => onChange(colorToNumber(event.currentTarget.value))}
          className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-1 disabled:cursor-not-allowed"
        />
        <input
          type="text"
          value={`0x${color.slice(1).toUpperCase()}`}
          disabled={readOnly}
          onChange={(event) => {
            const parsed = parseColorNumber(event.currentTarget.value);
            if (parsed !== null) onChange(parsed);
          }}
          className={`${INPUT_CLASS} font-mono`}
        />
      </div>
    );
  }

  if (field.kind === "vec2" || field.kind === "vec3") {
    const size = field.kind === "vec2" ? 2 : 3;
    return (
      <VectorInput
        size={size}
        value={asNumberVector(value, size)}
        disabled={readOnly}
        onChange={onChange}
      />
    );
  }

  if (field.kind === "number-or-vec3") {
    const isVector = Array.isArray(value);
    return (
      <div className="space-y-2">
        <div className="flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
          <ModeButton
            label="Uniform"
            active={!isVector}
            disabled={readOnly}
            onClick={() => onChange(isVector ? Number(value[0] ?? 1) : value ?? 1)}
          />
          <ModeButton
            label="XYZ"
            active={isVector}
            disabled={readOnly}
            onClick={() => {
              const scalar = typeof value === "number" ? value : 1;
              onChange([scalar, scalar, scalar]);
            }}
          />
        </div>
        {isVector ? (
          <VectorInput
            size={3}
            value={asNumberVector(value, 3)}
            disabled={readOnly}
            onChange={onChange}
          />
        ) : (
          <input
            type="number"
            value={typeof value === "number" ? value : 1}
            step="any"
            disabled={readOnly}
            onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
            className={INPUT_CLASS}
          />
        )}
      </div>
    );
  }

  if (field.kind === "grabbable-transform") {
    const transform = asTransform(value);
    return (
      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
        <NestedVector label="Position" value={transform.position} disabled={readOnly} onChange={(position) => onChange({ ...transform, position })} />
        <NestedVector label="Rotation" value={transform.rotation} disabled={readOnly} onChange={(rotation) => onChange({ ...transform, rotation })} />
        <label className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2 text-xs text-slate-500">
          Scale
          <input
            type="number"
            value={transform.scale}
            step="any"
            disabled={readOnly}
            onChange={(event) => onChange({ ...transform, scale: event.currentTarget.valueAsNumber })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
    );
  }

  if (field.kind === "tags") {
    return (
      <TagsEditor
        value={asTags(value)}
        disabled={readOnly}
        onChange={(tags) => onChange(tags)}
      />
    );
  }

  return (
    <input
      type={field.name.toLowerCase().includes("url") || field.name === "src" ? "url" : "text"}
      value={typeof value === "string" ? value : ""}
      disabled={readOnly}
      onChange={(event) => onChange(event.currentTarget.value)}
      className={INPUT_CLASS}
    />
  );
}

function VectorInput({
  size,
  value,
  disabled,
  onChange,
}: {
  size: 2 | 3;
  value: number[];
  disabled: boolean;
  onChange: (value: JsonValue) => void;
}) {
  return (
    <div className={`grid ${size === 2 ? "grid-cols-2" : "grid-cols-3"} gap-1.5`}>
      {value.map((entry, index) => (
        <label key={index} className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-semibold uppercase text-slate-400">
            {"xyz"[index]}
          </span>
          <input
            type="number"
            value={entry}
            step="any"
            disabled={disabled}
            onChange={(event) => {
              const next = [...value];
              next[index] = event.currentTarget.valueAsNumber;
              onChange(next);
            }}
            className={`${INPUT_CLASS} pl-5 text-right tabular-nums`}
          />
        </label>
      ))}
    </div>
  );
}

function NestedVector({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number[];
  disabled: boolean;
  onChange: (value: JsonValue) => void;
}) {
  return (
    <div className="grid grid-cols-[58px_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <VectorInput size={3} value={value} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function TagsEditor({
  value,
  disabled,
  onChange,
}: {
  value: TagValue[];
  disabled: boolean;
  onChange: (value: TagValue[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {value.map((tag, index) => (
        <div key={`${tag.id}-${index}`} className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)_26px] gap-1">
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : "#64748b"}
            disabled={disabled}
            onChange={(event) => updateTag(value, index, { color: event.currentTarget.value }, onChange)}
            className="h-8 w-[34px] rounded border border-slate-300 bg-white p-1"
            aria-label={`${tag.label || tag.id}の色`}
          />
          <input
            value={tag.id}
            disabled={disabled}
            placeholder="ID"
            onChange={(event) => updateTag(value, index, { id: event.currentTarget.value }, onChange)}
            className={INPUT_CLASS}
          />
          <input
            value={tag.label}
            disabled={disabled}
            placeholder="表示名"
            onChange={(event) => updateTag(value, index, { label: event.currentTarget.value }, onChange)}
            className={INPUT_CLASS}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter((_, candidate) => candidate !== index))}
            className="rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
            aria-label={`${tag.label || tag.id}を削除`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...value,
            { id: `tag-${value.length + 1}`, label: "New Tag", color: "#64748b" },
          ])
        }
        className="w-full rounded-md border border-dashed border-slate-300 bg-slate-50 py-1.5 text-xs font-semibold text-slate-600 hover:border-violet-400 hover:text-violet-700 disabled:opacity-40"
      >
        タグを追加
      </button>
    </div>
  );
}

function ModeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 rounded px-2 py-1 text-xs font-semibold ${active ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}
    >
      {label}
    </button>
  );
}

function asNumberVector(value: JsonValue | undefined, size: 2 | 3): number[] {
  if (Array.isArray(value) && value.length === size) {
    return value.map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : 0));
  }
  return Array.from({ length: size }, () => 0);
}

function asTransform(value: JsonValue | undefined): {
  position: number[];
  rotation: number[];
  scale: number;
} {
  const record = isJsonObject(value) ? value : {};
  return {
    position: asNumberVector(record.position, 3),
    rotation: asNumberVector(record.rotation, 3),
    scale: typeof record.scale === "number" && Number.isFinite(record.scale) ? record.scale : 1,
  };
}

function asTags(value: JsonValue | undefined): TagValue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isJsonObject(entry)) return [];
    if (
      typeof entry.id !== "string" ||
      typeof entry.label !== "string" ||
      typeof entry.color !== "string"
    ) {
      return [];
    }
    return [{ id: entry.id, label: entry.label, color: entry.color }];
  });
}

function updateTag(
  tags: TagValue[],
  index: number,
  patch: Partial<TagValue>,
  onChange: (value: TagValue[]) => void,
) {
  onChange(tags.map((tag, candidate) => (candidate === index ? { ...tag, ...patch } : tag)));
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberToColor(value: number): string {
  const normalized = Math.max(0, Math.min(0xffffff, Math.round(value)));
  return `#${normalized.toString(16).padStart(6, "0")}`;
}

function colorToNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function parseColorNumber(value: string): number | null {
  const normalized = value.trim().replace(/^#/, "").replace(/^0x/i, "");
  return /^[0-9a-f]{1,6}$/i.test(normalized)
    ? Number.parseInt(normalized, 16)
    : null;
}
