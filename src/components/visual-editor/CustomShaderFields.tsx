import { useEffect, useRef, useState } from "react";
import {
  CLASSIC_SHADER_BLEND_MODES,
  CLASSIC_SHADER_LIMITS,
  type ClassicR3fShaderUniform,
  type ClassicR3fShaderVariant,
  type TextureAsset,
} from "../../lib/visual-editor";

/**
 * The Custom Shader controls the Material Inspector shows beside the number,
 * colour, vector and texture rows: number lists, the two texture kinds that
 * take more than one row, and the per-variant drawing settings.
 */

// The Inspector's input style, without the fixed height a multi-line field
// cannot keep.
const FIELD_CLASS =
  "min-w-0 w-full rounded border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

type MatrixUniform = Extract<ClassicR3fShaderUniform, { kind: "matrix" }>;
type ArrayUniform = Extract<ClassicR3fShaderUniform, { kind: "array" }>;
type VolumeUniform = Extract<ClassicR3fShaderUniform, { kind: "texture-3d" }>;
type CubeUniform = Extract<ClassicR3fShaderUniform, { kind: "texture-cube" }>;

/** Numbers separated by commas, spaces or line breaks; null when one is not a number. */
export function parseShaderNumberList(text: string): number[] | null {
  const numbers = text
    .split(/[\s,]+/)
    .filter((entry) => entry.length > 0)
    .map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
}

function formatShaderNumberList(value: readonly number[], perLine: number): string {
  if (!(perLine > 0)) return value.join(", ");
  const lines: string[] = [];
  for (let index = 0; index < value.length; index += perLine) {
    lines.push(value.slice(index, index + perLine).join(", "));
  }
  return lines.join(",\n");
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => Object.is(entry, right[index]))
  );
}

/** How many lists a field remembers having sent, to know them when they come back. */
const SENT_LISTS_REMEMBERED = 16;

/**
 * A list of numbers as text.
 *
 * The text is kept as typed and saved each time it reads as an accepted list,
 * so a number can be retyped digit by digit; a list the uniform cannot hold
 * stays in the field with the reason and is not saved.
 */
function ShaderNumberListField({
  value,
  perLine,
  disabled,
  ariaLabel,
  accepts,
  rule,
  onChange,
}: {
  value: readonly number[];
  /** Numbers per line when the saved value is written out; 0 for one run. */
  perLine: number;
  disabled: boolean;
  ariaLabel: string;
  accepts: (numbers: readonly number[]) => boolean;
  /** What the list has to be, shown under the field. */
  rule: string;
  onChange: (numbers: number[]) => void;
}) {
  const saved = formatShaderNumberList(value, perLine);
  const [draft, setDraft] = useState(saved);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Lists this field has sent and not yet seen come back as the saved value.
  const sentRef = useRef<number[][]>([]);
  useEffect(() => {
    // A list this field sent has come back. Saving takes a moment, and the
    // author may have typed on since, so the text stays as typed.
    const echoed = sentRef.current.findIndex((sent) => sameNumbers(sent, value));
    if (echoed >= 0) {
      sentRef.current = sentRef.current.slice(echoed + 1);
      return;
    }
    // The saved value changed somewhere else (Undo, an AI client): show it.
    // While the draft still reads as the saved numbers, it is the author's own
    // typing and stays as typed.
    sentRef.current = [];
    const typed = parseShaderNumberList(draftRef.current);
    if (!typed || !sameNumbers(typed, value)) setDraft(saved);
    // `saved` is the value written out, so it stands in for `value`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const typed = parseShaderNumberList(draft);
  const rejected = !typed || !accepts(typed);
  return (
    <div className="space-y-0.5">
      <textarea
        value={draft}
        disabled={disabled}
        spellCheck={false}
        rows={Math.min(Math.max(saved.split("\n").length, 2), 6)}
        aria-label={ariaLabel}
        aria-invalid={rejected}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          const numbers = parseShaderNumberList(next);
          if (numbers && accepts(numbers) && !sameNumbers(numbers, value)) {
            // A list the owner refuses never comes back, so only the last few
            // are remembered.
            sentRef.current = [...sentRef.current.slice(-(SENT_LISTS_REMEMBERED - 1)), numbers];
            onChange(numbers);
          }
        }}
        className={`${FIELD_CLASS} resize-y py-1 font-mono text-[10px] leading-4`}
      />
      <p className={`text-[10px] leading-4 ${rejected ? "text-amber-700" : "text-slate-500"}`}>
        {rejected ? `保存していません。${rule}` : rule}
      </p>
    </div>
  );
}

export function ShaderMatrixField({
  uniform,
  disabled,
  ariaLabel,
  onChange,
}: {
  uniform: MatrixUniform;
  disabled: boolean;
  ariaLabel: string;
  onChange: (uniform: MatrixUniform) => void;
}) {
  return (
    <ShaderNumberListField
      value={uniform.value}
      perLine={uniform.value.length === 9 ? 3 : 4}
      disabled={disabled}
      ariaLabel={ariaLabel}
      accepts={(numbers) => numbers.length === 9 || numbers.length === 16}
      rule="9個（mat3）か16個（mat4）の数値を、列ごとにカンマで区切って入力します。"
      onChange={(value) => onChange({ kind: "matrix", value })}
    />
  );
}

export function ShaderArrayField({
  uniform,
  disabled,
  ariaLabel,
  onChange,
}: {
  uniform: ArrayUniform;
  disabled: boolean;
  ariaLabel: string;
  onChange: (uniform: ArrayUniform) => void;
}) {
  return (
    <ShaderNumberListField
      value={uniform.value}
      perLine={0}
      disabled={disabled}
      ariaLabel={ariaLabel}
      accepts={(numbers) =>
        numbers.length >= 1 &&
        numbers.length <= CLASSIC_SHADER_LIMITS.arrayLength
      }
      rule={`GLSLの配列へ渡す数値を、1〜${CLASSIC_SHADER_LIMITS.arrayLength}個までカンマで区切って入力します。`}
      onChange={(value) => onChange({ kind: "array", value })}
    />
  );
}

function ShaderTextureSelect({
  value,
  textures,
  disabled,
  ariaLabel,
  onChange,
  onOpenTexture,
}: {
  value: string;
  textures: readonly TextureAsset[];
  disabled: boolean;
  ariaLabel: string;
  onChange: (textureAssetId: string) => void;
  onOpenTexture: (assetId: string) => void;
}) {
  // An Asset this kind cannot read stays listed while it is the saved choice,
  // so the row shows what is saved instead of the first usable picture.
  const listed = textures.some((texture) => texture.id === value);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <select
        value={value}
        disabled={disabled || textures.length === 0}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={`${FIELD_CLASS} h-7 flex-1 text-[10px]`}
      >
        {listed ? null : <option value={value}>選び直してください</option>}
        {textures.map((texture) => (
          <option key={texture.id} value={texture.id}>
            {texture.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onOpenTexture(value)}
        title="テクスチャを開く"
        className="shrink-0 rounded border border-slate-300 px-1 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
      >
        開く
      </button>
    </div>
  );
}

export function ShaderVolumeTextureField({
  uniform,
  textures,
  disabled,
  ariaLabel,
  onChange,
  onOpenTexture,
}: {
  uniform: VolumeUniform;
  /** Decoded pictures only: a volume cannot be cut from KTX2, EXR or HDR. */
  textures: readonly TextureAsset[];
  disabled: boolean;
  ariaLabel: string;
  onChange: (uniform: VolumeUniform) => void;
  onOpenTexture: (assetId: string) => void;
}) {
  return (
    <div className="space-y-1">
      <ShaderTextureSelect
        value={uniform.textureAssetId}
        textures={textures}
        disabled={disabled}
        ariaLabel={ariaLabel}
        onChange={(textureAssetId) => onChange({ ...uniform, textureAssetId })}
        onOpenTexture={onOpenTexture}
      />
      <label className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 text-[11px] text-slate-600">
        <span>スライス数</span>
        <input
          type="number"
          min={1}
          max={CLASSIC_SHADER_LIMITS.volumeAxis}
          step={1}
          value={uniform.slices ?? ""}
          placeholder="自動"
          disabled={disabled}
          aria-label={`${ariaLabel}のスライス数`}
          onChange={(event) => {
            const text = event.currentTarget.value.trim();
            const { slices: _saved, ...rest } = uniform;
            if (text === "") {
              onChange(rest);
              return;
            }
            const slices = Number(text);
            if (
              Number.isInteger(slices) &&
              slices >= 1 &&
              slices <= CLASSIC_SHADER_LIMITS.volumeAxis
            ) {
              onChange({ ...rest, slices });
            }
          }}
          className={`${FIELD_CLASS} h-7 font-mono text-[10px]`}
        />
      </label>
      <p className="text-[10px] leading-4 text-slate-500">
        画像を左から右へ等分し、3Dテクスチャの奥行きにします。空欄のときは、正方形のスライスが並んでいるものとして数えます。
      </p>
    </div>
  );
}

const CUBE_FACE_LABELS = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"] as const;

export function ShaderCubeTextureField({
  uniform,
  textures,
  disabled,
  ariaLabel,
  onChange,
  onOpenTexture,
}: {
  uniform: CubeUniform;
  /** Decoded pictures only: a face cannot be KTX2, EXR or HDR. */
  textures: readonly TextureAsset[];
  disabled: boolean;
  ariaLabel: string;
  onChange: (uniform: CubeUniform) => void;
  onOpenTexture: (assetId: string) => void;
}) {
  return (
    <div className="space-y-1">
      {CUBE_FACE_LABELS.map((label, index) => (
        <div
          key={label}
          className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-1.5"
        >
          <span className="font-mono text-[10px] text-slate-600">{label}</span>
          <ShaderTextureSelect
            value={uniform.faces[index]?.textureAssetId ?? ""}
            textures={textures}
            disabled={disabled}
            ariaLabel={`${ariaLabel}の${label}面`}
            onChange={(textureAssetId) =>
              onChange({
                ...uniform,
                faces: CUBE_FACE_LABELS.map((_face, faceIndex) =>
                  faceIndex === index
                    ? { textureAssetId }
                    : (uniform.faces[faceIndex] ?? { textureAssetId }),
                ),
              })
            }
            onOpenTexture={onOpenTexture}
          />
        </div>
      ))}
      <p className="text-[10px] leading-4 text-slate-500">
        6枚とも同じ大きさの正方形の画像を選びます。
      </p>
    </div>
  );
}

const BLENDING_LABELS: Record<
  (typeof CLASSIC_SHADER_BLEND_MODES)[number],
  string
> = {
  normal: "Normal（通常）",
  additive: "Additive（加算）",
  multiply: "Multiply（乗算）",
  subtractive: "Subtractive（減算）",
};

/**
 * How each variant is drawn: blending, the transparent pass, depth writing and
 * frustum culling. A shader with one variant shows one group.
 */
export function ShaderVariantSettings({
  variants,
  disabled,
  onChange,
}: {
  variants: readonly ClassicR3fShaderVariant[];
  disabled: boolean;
  onChange: (variants: ClassicR3fShaderVariant[]) => void;
}) {
  const update = (
    index: number,
    change: (variant: ClassicR3fShaderVariant) => ClassicR3fShaderVariant,
  ) =>
    onChange(
      variants.map((variant, current) =>
        current === index ? change(variant) : variant,
      ),
    );
  return (
    <div className="space-y-2">
      {variants.map((variant, index) => {
        const blending = variant.blending ?? "normal";
        const culled = variant.frustumCulled !== false;
        const target = variant.meshNameIncludes
          ? `${variant.name}（名前に「${variant.meshNameIncludes}」を含むMesh）`
          : variants.length > 1
            ? `${variant.name}（ほかのMesh）`
            : null;
        return (
          <div key={`${index}:${variant.name}`} className="space-y-1.5">
            {target ? (
              <p className="break-words text-[11px] font-semibold text-slate-600 [overflow-wrap:anywhere]">
                {target}
              </p>
            ) : null}
            <label className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 text-[11px] text-slate-700">
              <span>Blending</span>
              <select
                value={blending}
                disabled={disabled}
                aria-label={`${variant.name}のBlending`}
                onChange={(event) => {
                  const next = event.currentTarget
                    .value as (typeof CLASSIC_SHADER_BLEND_MODES)[number];
                  update(index, ({ blending: _saved, ...rest }) =>
                    // Normal is how a variant without the setting is drawn,
                    // so it is saved as the setting being absent.
                    next === "normal" ? rest : { ...rest, blending: next },
                  );
                }}
                className={`${FIELD_CLASS} h-7 text-[10px]`}
              >
                {CLASSIC_SHADER_BLEND_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {BLENDING_LABELS[mode]}
                  </option>
                ))}
              </select>
            </label>
            {blending !== "normal" && !variant.transparent ? (
              <p className="text-[10px] leading-4 text-amber-700">
                Normal以外では、Transparentも有効にしてください。無効のままでは不透明なものと同じ順に描かれ、重なりが正しく見えません。
              </p>
            ) : null}
            <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
              <span>
                Transparent
                <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                  不透明なものを描いた後に、奥から順に描きます。
                </span>
              </span>
              <input
                type="checkbox"
                checked={variant.transparent}
                disabled={disabled}
                aria-label={`${variant.name}のTransparent`}
                onChange={(event) => {
                  const transparent = event.currentTarget.checked;
                  update(index, (current) => ({ ...current, transparent }));
                }}
                className="h-4 w-4 shrink-0 accent-violet-600"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
              <span>
                Depth Write
                <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                  深度を書き込みます。光や煙のように重ねて見せるものでは切ります。
                </span>
              </span>
              <input
                type="checkbox"
                checked={variant.depthWrite}
                disabled={disabled}
                aria-label={`${variant.name}のDepth Write`}
                onChange={(event) => {
                  const depthWrite = event.currentTarget.checked;
                  update(index, (current) => ({ ...current, depthWrite }));
                }}
                className="h-4 w-4 shrink-0 accent-violet-600"
              />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
              <span>
                Frustum Culling
                <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">
                  画面の外にあるMeshの描画を省きます。頂点シェーダーでMeshを別の場所へ動かす場合は切ってください。
                </span>
              </span>
              <input
                type="checkbox"
                checked={culled}
                disabled={disabled}
                aria-label={`${variant.name}のFrustum Culling`}
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  update(index, ({ frustumCulled: _saved, ...rest }) =>
                    // Culled is how a variant without the setting is drawn.
                    next ? rest : { ...rest, frustumCulled: false },
                  );
                }}
                className="h-4 w-4 shrink-0 accent-violet-600"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
