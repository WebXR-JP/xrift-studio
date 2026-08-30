/**
 * The Inspector's editors for one node's values.
 *
 * A socket's editor has to follow its type — a colour is a swatch, a vector is
 * three boxes, a choice is a list — and an Interaction Trigger action adds the
 * seconds it takes and the curve it follows. Each is a plain controlled field,
 * so the editor keeps the draft and the history in one place.
 */

import {
  applyEasing,
  INTERACTIVITY_EASINGS,
  linearRgbToTint,
  tintToLinearRgb,
  type InteractivityEasing,
  type KhrInteractivityJsonValue,
} from "../../lib/visual-editor";
import {
  defaultTriggerActionValue,
  xriftInteractionEnumIndex,
  type XriftInteractionPropertyDescriptor,
} from "../../lib/visual-editor";

export function numbersOf(value: KhrInteractivityJsonValue[] | undefined, length: number): number[] {
  return Array.from({ length }, (_unused, index) => {
    const entry = value?.[index];
    return typeof entry === "number" && Number.isFinite(entry) ? entry : 0;
  });
}

/**
 * An editor for one literal socket value.
 *
 * Without this the only way to say which colour a `pointer/set` writes was to
 * hand-edit the KHR JSON, which is what made the graph editor feel like a
 * viewer rather than an editor.
 */
export function LiteralValueField({
  socket,
  signature,
  value,
  isColor,
  disabled,
  onChange,
}: {
  socket: string;
  signature: string | undefined;
  value: KhrInteractivityJsonValue[] | undefined;
  isColor: boolean;
  disabled: boolean;
  onChange: (next: KhrInteractivityJsonValue[]) => void;
}) {
  const length =
    signature === "float2" ? 2 : signature === "float3" ? 3 : signature === "float4" ? 4 : 1;
  const channels = numbersOf(value, length);
  const alpha = signature === "float4" ? channels[3] : null;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium text-slate-300">{socket}</span>
        <code className="text-[9px] text-slate-500">{signature ?? "型未設定"}</code>
      </div>
      {signature === "bool" ? (
        <label className="flex items-center gap-2 text-[10px] text-slate-300">
          <input
            type="checkbox"
            checked={value?.[0] === true}
            disabled={disabled}
            onChange={(event) => onChange([event.target.checked])}
            className="h-3.5 w-3.5"
          />
          {value?.[0] === true ? "true" : "false"}
        </label>
      ) : isColor ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={linearRgbToTint(channels)}
            disabled={disabled}
            onChange={(event) => {
              const [red, green, blue] = tintToLinearRgb(event.target.value);
              onChange(alpha === null ? [red, green, blue] : [red, green, blue, alpha]);
            }}
            className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-950 disabled:opacity-45"
            aria-label={`${socket} の色`}
          />
          <code className="text-[10px] text-slate-400">{linearRgbToTint(channels)}</code>
          {alpha === null ? null : (
            <label className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
              A
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={alpha}
                disabled={disabled}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onChange([
                    channels[0],
                    channels[1],
                    channels[2],
                    Math.min(1, Math.max(0, next)),
                  ]);
                }}
                className="h-7 w-16 rounded border border-slate-600 bg-slate-950 px-1.5 text-[11px] disabled:opacity-45"
              />
            </label>
          )}
        </div>
      ) : (
        <div className="flex gap-1">
          {channels.map((entry, index) => (
            <input
              key={index}
              type="number"
              step={signature === "int" ? 1 : 0.1}
              value={entry}
              disabled={disabled}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                const channel = signature === "int" ? Math.round(next) : next;
                onChange(channels.map((prior, at) => (at === index ? channel : prior)));
              }}
              className="h-7 w-full min-w-0 rounded border border-slate-600 bg-slate-950 px-1.5 text-[11px] disabled:opacity-45"
              aria-label={`${socket}${length > 1 ? ` ${index + 1}` : ""}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * An editor for the value one Interaction Trigger action writes.
 *
 * The generic literal editor can only offer raw numbers because it knows the
 * KHR type and nothing else. Here the property descriptor supplies the range,
 * the option labels and whether the three floats are a colour, so the author
 * edits "音量 0.4" instead of "float[0] = 0.4".
 */
export function TriggerValueField({
  descriptor,
  value,
  disabled,
  onChange,
}: {
  descriptor: XriftInteractionPropertyDescriptor;
  value: KhrInteractivityJsonValue[] | null;
  disabled: boolean;
  onChange: (next: KhrInteractivityJsonValue[]) => void;
}) {
  const current = value ?? defaultTriggerActionValue(descriptor);
  const first = current[0];
  if (descriptor.kind === "bool") {
    const checked = first !== false;
    return (
      <label className="flex items-center gap-2 text-[10px] text-slate-300">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange([event.target.checked])}
          className="h-3.5 w-3.5"
        />
        {descriptor.label}を{checked ? "ON" : "OFF"}にする
      </label>
    );
  }
  if (descriptor.kind === "enum") {
    const options = descriptor.options ?? [];
    const index =
      typeof first === "number" && options[first]
        ? first
        : xriftInteractionEnumIndex(descriptor, String(descriptor.defaultValue));
    return (
      <label className="block text-[10px] text-slate-300">
        {descriptor.label}
        <select
          value={index}
          disabled={disabled}
          onChange={(event) => onChange([Number(event.target.value)])}
          className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
        >
          {options.map((option, optionIndex) => (
            <option key={option.value} value={optionIndex}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (descriptor.kind === "color") {
    const channels = numbersOf(current, 3);
    return (
      <label className="block text-[10px] text-slate-300">
        {descriptor.label}
        <span className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={linearRgbToTint(channels)}
            disabled={disabled}
            onChange={(event) => onChange(tintToLinearRgb(event.target.value))}
            className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-600 bg-slate-950 disabled:opacity-45"
            aria-label={`${descriptor.label} の色`}
          />
          <code className="text-[10px] text-slate-400">
            {linearRgbToTint(channels)}
          </code>
        </span>
      </label>
    );
  }
  if (descriptor.kind === "vector3") {
    const components = numbersOf(current, 3);
    return (
      <div className="space-y-1">
        <span className="block text-[10px] text-slate-300">{descriptor.label}</span>
        <div className="flex gap-1">
          {(["X", "Y", "Z"] as const).map((axis, index) => (
            <label key={axis} className="flex min-w-0 flex-1 items-center gap-1">
              <span className="text-[9px] text-slate-500">{axis}</span>
              <input
                type="number"
                step={descriptor.step ?? 0.1}
                value={components[index] ?? 0}
                disabled={disabled}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next)) return;
                  onChange(
                    components.map((prior, at) => (at === index ? next : prior)),
                  );
                }}
                className="h-8 w-full min-w-0 rounded border border-slate-600 bg-slate-950 px-1.5 text-xs disabled:opacity-45"
                aria-label={`${descriptor.label} ${axis}`}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }
  const numeric = typeof first === "number" ? first : Number(descriptor.defaultValue);
  return (
    <label className="block text-[10px] text-slate-300">
      {descriptor.label}
      <input
        type="number"
        value={numeric}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step ?? 0.1}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isFinite(next)) return;
          const lower = descriptor.min ?? Number.NEGATIVE_INFINITY;
          const upper = descriptor.max ?? Number.POSITIVE_INFINITY;
          onChange([Math.min(Math.max(next, lower), upper)]);
        }}
        className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
      />
    </label>
  );
}

/**
 * Property kinds a timed change is meaningful for.
 *
 * A switch and a picked option have no halfway point; offering a duration for
 * them would promise a fade that can only ever be a jump at the end.
 */
export const TIMED_PROPERTY_KINDS: ReadonlySet<string> = new Set([
  "float",
  "color",
  "vector3",
]);

export const EASING_LABELS: Readonly<Record<InteractivityEasing, string>> = {
  linear: "一定の速さ",
  "ease-in": "ゆっくり始まる",
  "ease-out": "ゆっくり止まる",
  "ease-in-out": "両端がゆっくり",
  "ease-in-strong": "強くゆっくり始まる",
  "ease-out-strong": "強くゆっくり止まる",
  "ease-out-back": "少し行き過ぎて戻る",
};

/** Draws the chosen curve, so the wording and the motion are the same thing. */
export function EasingCurve({ easing }: { easing: InteractivityEasing }) {
  const points = Array.from({ length: 33 }, (_unused, step) => {
    const ratio = step / 32;
    const eased = applyEasing(ratio, easing);
    // The back curve leaves the unit square; the viewBox is padded for it.
    return `${(ratio * 60).toFixed(2)},${(26 - eased * 20).toFixed(2)}`;
  }).join(" ");
  return (
    <svg
      viewBox="0 0 60 32"
      role="img"
      aria-label={`${EASING_LABELS[easing]}の変化の仕方`}
      className="h-8 w-16 shrink-0 rounded border border-slate-700 bg-slate-950"
    >
      <line x1="0" y1="26" x2="60" y2="26" stroke="#334155" strokeWidth="0.5" />
      <line x1="0" y1="6" x2="60" y2="6" stroke="#334155" strokeWidth="0.5" />
      <polyline
        points={points}
        fill="none"
        stroke="#a78bfa"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * How long an action takes, and how the change is spread over that time.
 *
 * A door that snaps open and a door that swings open are the same action with
 * a different duration, so this belongs on the action rather than in a separate
 * node. It is only offered for values that have an in-between: flipping a
 * switch or picking an option halfway through means nothing.
 */
export function TriggerTimingField({
  seconds,
  easing,
  disabled,
  onSecondsChange,
  onEasingChange,
}: {
  seconds: number;
  easing: InteractivityEasing;
  disabled: boolean;
  onSecondsChange: (seconds: number) => void;
  onEasingChange: (easing: InteractivityEasing) => void;
}) {
  return (
    <div className="space-y-2 rounded border border-slate-700 bg-slate-950/60 p-2">
      <label className="block text-[10px] text-slate-300">
        かける時間（秒）
        <input
          type="number"
          min={0}
          max={600}
          step={0.1}
          value={seconds}
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (!Number.isFinite(next)) return;
            onSecondsChange(Math.min(600, Math.max(0, next)));
          }}
          className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs disabled:opacity-45"
        />
      </label>
      {seconds > 0 ? (
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-[10px] text-slate-300">
            変わり方
            <select
              value={easing}
              disabled={disabled}
              onChange={(event) =>
                onEasingChange(event.target.value as InteractivityEasing)
              }
              className="mt-1 h-8 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs"
            >
              {INTERACTIVITY_EASINGS.map((entry) => (
                <option key={entry} value={entry}>
                  {EASING_LABELS[entry]}
                </option>
              ))}
            </select>
          </label>
          <EasingCurve easing={easing} />
        </div>
      ) : (
        <p className="text-[10px] leading-4 text-slate-400">
          0 のままなら、その場ですぐ変わります。秒数を入れると、その時間をかけて変化します。
        </p>
      )}
    </div>
  );
}