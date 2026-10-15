import { useEffect, useId, useState } from "react";
import type { AssetManifest } from "../../lib/visual-editor/asset-manifest";
import type { SceneSettings } from "../../lib/visual-editor/scene-settings";
import { resolveSkyShaderMaterial, SKY_SHADER_DRIVEN_UNIFORMS } from "../../lib/visual-editor/sky-shader";
import { ScrubNumberInput } from "./ScrubNumberInput";

export type ChatgptSceneSettingsSection = "skybox" | "fog";
export type ChatgptSceneSettingsPatch = {
  skybox?: Partial<SceneSettings["skybox"]>;
  fog?: Partial<SceneSettings["fog"]>;
};

function normalizedHex(value: string): string | null {
  const hex = value.trim().toLowerCase();
  if (/^#[\da-f]{6}$/.test(hex)) return hex;
  if (/^#[\da-f]{3}$/.test(hex)) return `#${[...hex.slice(1)].map(channel => channel + channel).join("")}`;
  return null;
}

function SceneColorControl({ label, value, disabled, onChange }: {
  label: string; value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const id = useId();
  const [hexText, setHexText] = useState(value);
  useEffect(() => { setHexText(value); }, [value, disabled]);
  const commit = (input: string) => {
    const hex = normalizedHex(input);
    setHexText(hex ?? value);
    if (!disabled && hex && hex !== value) onChange(hex);
  };
  return <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
    <label htmlFor={id} className="text-[11px] text-slate-600">{label}</label>
    <div className="flex min-w-0 items-center gap-1.5">
      <input id={id} type="color" aria-label={`${label}の色`} value={value} disabled={disabled}
        onChange={event => commit(event.currentTarget.value)}
        className="h-7 w-9 shrink-0 rounded border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50" />
      <input type="text" aria-label={`${label}のHEX`} value={hexText} disabled={disabled} maxLength={7}
        spellCheck={false} autoComplete="off" onChange={event => setHexText(event.currentTarget.value)}
        onBlur={() => commit(hexText)} onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setHexText(value); }
        }}
        className="h-7 w-20 min-w-0 rounded border border-slate-300 bg-white px-1.5 text-right font-mono text-[11px] text-slate-700 outline-none focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-400" />
    </div>
  </div>;
}

function SceneToggle({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void;
}) {
  return <label className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
    <span>{label}</span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.currentTarget.checked)}
      className="size-3.5 accent-brand-600 disabled:cursor-not-allowed" />
  </label>;
}

/** Edit current Scene values without replacing the saved account of an AI change. */
export function ChatgptSceneControls({ settings, sections, assets, onChange, disabled = false }: {
  settings: SceneSettings;
  sections: readonly ChatgptSceneSettingsSection[];
  assets: AssetManifest;
  onChange: (patch: ChatgptSceneSettingsPatch) => void;
  disabled?: boolean;
}) {
  const skybox = settings.skybox;
  const fog = settings.fog;
  const shader = resolveSkyShaderMaterial(assets, skybox.materialAssetId);
  const shaderActive = shader.status === "ready";
  const image = skybox.imageAssetId ? assets.assets[skybox.imageAssetId] : undefined;
  const imageReady = Boolean(image && (image.kind === "texture" || image.kind === "skybox") && image.status === "ready" && image.source.kind === "project");
  const gradient = !shaderActive && !skybox.imageAssetId;
  const exposureAffectsBackground = skybox.enabled && (!shaderActive || Boolean(shader.shader.uniforms[SKY_SHADER_DRIVEN_UNIFORMS.exposure]));
  const exposureAffectsIbl = skybox.iblEnabled && imageReady;
  const exposureDisabled = disabled || (!exposureAffectsBackground && !exposureAffectsIbl);
  const change = (patch: ChatgptSceneSettingsPatch) => { if (!disabled) onChange(patch); };
  const showSkybox = sections.includes("skybox");
  const showFog = sections.includes("fog");
  if (!showSkybox && !showFog) return null;
  return <fieldset aria-label="現在のScene設定を調整" disabled={disabled}
    className="mt-2 min-w-0 space-y-3 rounded-md border border-slate-200 bg-white px-2.5 pb-2.5 pt-1">
    <legend className="px-1 text-[11px] font-medium text-slate-700">現在のScene設定を調整</legend>
    {showSkybox ? <section aria-label="Skyboxの設定" className="min-w-0 space-y-2">
      <p className="text-[11px] font-medium text-slate-700">Skybox</p>
      <p hidden data-chatgpt-copy-hidden className="whitespace-pre-line">{`Skyboxを表示 ${skybox.enabled ? "オン" : "オフ"}\n${gradient ? `上空の色 ${skybox.topColor}\n地平線の色 ${skybox.bottomColor}\n` : ""}Skyboxの明るさ ${skybox.exposure}\nIBL ${skybox.iblEnabled ? "オン" : "オフ"}`}</p>
      <SceneToggle label="Skyboxを表示" checked={skybox.enabled} disabled={disabled} onChange={enabled => change({ skybox: { enabled } })} />
      {shaderActive ? <p className="break-words text-[11px] text-slate-500">Skybox Shader：{shader.asset.name}</p>
        : skybox.imageAssetId ? <p className="break-words text-[11px] text-slate-500">背景画像：{image?.name ?? "素材が見つかりません"}</p> : null}
      {gradient ? <>
        <SceneColorControl label="上空の色" value={skybox.topColor} disabled={disabled || !skybox.enabled} onChange={topColor => change({ skybox: { topColor } })} />
        <SceneColorControl label="地平線の色" value={skybox.bottomColor} disabled={disabled || !skybox.enabled} onChange={bottomColor => change({ skybox: { bottomColor } })} />
      </> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-600">明るさ</span>
        <ScrubNumberInput ariaLabel="Skyboxの明るさ" scrubLabel="Skyboxの明るさ" min={0} step={0.05}
          value={skybox.exposure} disabled={exposureDisabled} size="xs" wrapperClassName="w-20 shrink-0"
          onChange={exposure => change({ skybox: { exposure } })} />
      </div>
      {shaderActive && !shader.shader.uniforms[SKY_SHADER_DRIVEN_UNIFORMS.exposure] ? <p className="text-[11px] text-slate-500">このSkybox Shaderは明るさの調整に対応していません。IBLが有効な場合は、IBLの明るさを調整します。</p> : null}
      <SceneToggle label="IBLを有効にする" checked={skybox.iblEnabled} disabled={disabled || (!imageReady && !skybox.iblEnabled)}
        onChange={iblEnabled => { if (!iblEnabled || imageReady) change({ skybox: { iblEnabled } }); }} />
      {!imageReady ? <p className="text-[11px] text-slate-500">IBLには読み込み済みの背景画像が必要です。シーン設定で画像を選んでください。</p> : null}
    </section> : null}
    {showFog ? <section aria-label="Fogの設定" className="min-w-0 space-y-2">
      <p className="text-[11px] font-medium text-slate-700">Fog</p>
      <p hidden data-chatgpt-copy-hidden className="whitespace-pre-line">{`Fogを有効にする ${fog.enabled ? "オン" : "オフ"}\nFogの色 ${fog.color}\nFogの開始距離 ${fog.near} m\nFogの終了距離 ${fog.far} m`}</p>
      <SceneToggle label="Fogを有効にする" checked={fog.enabled} disabled={disabled} onChange={enabled => change({ fog: { enabled } })} />
      <SceneColorControl label="Fogの色" value={fog.color} disabled={disabled || !fog.enabled} onChange={color => change({ fog: { color } })} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-600">開始距離</span>
        <ScrubNumberInput ariaLabel="Fogの開始距離" scrubLabel="Fogの開始距離" min={0} max={Math.max(0, fog.far - 0.001)} step={0.5} suffix="m"
          value={fog.near} disabled={disabled || !fog.enabled} size="xs" wrapperClassName="w-24 shrink-0"
          onChange={near => change({ fog: { near: Math.max(0, Math.min(near, fog.far - 0.001)) } })} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-600">終了距離</span>
        <ScrubNumberInput ariaLabel="Fogの終了距離" scrubLabel="Fogの終了距離" min={fog.near + 0.001} step={0.5} suffix="m"
          value={fog.far} disabled={disabled || !fog.enabled} size="xs" wrapperClassName="w-24 shrink-0"
          onChange={far => change({ fog: { far: Math.max(far, fog.near + 0.001) } })} />
      </div>
    </section> : null}
  </fieldset>;
}
