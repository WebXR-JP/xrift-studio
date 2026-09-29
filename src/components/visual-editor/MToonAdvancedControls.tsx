import { MTOON_DEFAULTS } from "../../../packages/xrift-studio-runtime/src/mtoon-contract";
import type {
  MaterialAsset,
  MaterialExtensionsPatch,
  TextureAsset,
} from "../../lib/visual-editor/asset-manifest";
import type { MaterialPreviewTextureStatuses } from "./material-texture-preview";
import { useMaterialField } from "./material-field-context";

type MToonControls = {
  EditorSection: typeof import("./AssetQuickEditor").EditorSection;
  RangeControl: typeof import("./AssetQuickEditor").RangeControl;
  NumberControl: typeof import("./AssetQuickEditor").NumberControl;
  Color3Control: typeof import("./AssetQuickEditor").Color3Control;
  TextureSlot: typeof import("./AssetQuickEditor").TextureSlot;
  MaterialInput: typeof import("./material-field-context").MaterialInput;
};

/** The single and multiple selection editors share the same authoring controls. */
export function MToonAdvancedControls({
  value,
  textures,
  projectPath,
  previewTextureStatuses,
  readOnly,
  zWriteEditable,
  onChange,
  onOpenTexture,
  controls,
}: {
  value: NonNullable<MaterialAsset["properties"]["extensions"]["VRMC_materials_mtoon"]>;
  textures: TextureAsset[];
  projectPath?: string;
  previewTextureStatuses: MaterialPreviewTextureStatuses;
  readOnly: boolean;
  zWriteEditable?: boolean;
  onChange: (patch: NonNullable<MaterialExtensionsPatch["VRMC_materials_mtoon"]>) => void;
  onOpenTexture: (assetId: string) => void;
  controls: MToonControls;
}) {
  const { EditorSection, RangeControl, NumberControl, Color3Control, TextureSlot, MaterialInput } = controls;
  const shadingShiftField = useMaterialField("extensions.VRMC_materials_mtoon.shadingShiftTexture");
  const path = (field: string) => `extensions.VRMC_materials_mtoon.${field}`;
  const textureProps = { textures, projectPath, disabled: readOnly, onOpenTexture };

  return (
    <>
      <EditorSection title="Shading Shift Map" reading="陰影の境界を変える画像">
        <TextureSlot
          label="Shading Shift Map"
          materialPath={path("shadingShiftTexture")}
          description="R（赤）を使い、部分ごとに明るい面と暗い面の境界をずらします（リニア色空間）。"
          value={value.shadingShiftTexture}
          previewStatus={previewTextureStatuses.shadingShiftMap}
          {...textureProps}
          onChange={(shadingShiftTexture) => onChange({ shadingShiftTexture })}
        />
        <NumberControl
          label="Shading Shift Map Scale"
          materialPath={path("shadingShiftTexture.scale")}
          value={value.shadingShiftTexture?.scale ?? 1}
          description="画像によるずらす量です。負の値で明暗の変化を反転します。"
          disabled={readOnly || (!value.shadingShiftTexture && !shadingShiftField?.mixed)}
          onChange={(scale) => {
            if (value.shadingShiftTexture) onChange({ shadingShiftTexture: { ...value.shadingShiftTexture, scale } });
          }}
        />
      </EditorSection>

      <EditorSection title="Matcap" reading="マットキャップ">
        <Color3Control
          label="Matcap Color"
          materialPath={path("matcapFactor")}
          value={value.matcapFactor ?? MTOON_DEFAULTS.matcapFactor}
          max={1}
          description="Matcap Mapに掛け合わせる色です。"
          disabled={readOnly}
          onChange={(matcapFactor) => onChange({ matcapFactor })}
        />
        <TextureSlot
          label="Matcap Map"
          materialPath={path("matcapTexture")}
          description="見る向きに合わせた映り込みを加えます（sRGB）。UV Animationの影響は受けません。"
          value={value.matcapTexture}
          previewStatus={previewTextureStatuses.matcapMap}
          {...textureProps}
          onChange={(matcapTexture) => onChange({ matcapTexture })}
        />
      </EditorSection>

      <EditorSection title="Rim Lighting" reading="リムライト">
        <Color3Control
          label="Rim Color"
          materialPath={path("parametricRimColorFactor")}
          value={value.parametricRimColorFactor ?? MTOON_DEFAULTS.parametricRimColorFactor}
          max={1}
          description="視線に対して斜めになった面に加える色です。黒で効果なし。"
          disabled={readOnly}
          onChange={(parametricRimColorFactor) => onChange({ parametricRimColorFactor })}
        />
        <TextureSlot
          label="Rim Multiply Map"
          materialPath={path("rimMultiplyTexture")}
          description="RGBをMatcapとRim Colorに掛け合わせます（sRGB）。"
          value={value.rimMultiplyTexture}
          previewStatus={previewTextureStatuses.rimMultiplyMap}
          {...textureProps}
          onChange={(rimMultiplyTexture) => onChange({ rimMultiplyTexture })}
        />
        <NumberControl
          label="Rim Fresnel Power"
          materialPath={path("parametricRimFresnelPowerFactor")}
          value={value.parametricRimFresnelPowerFactor ?? MTOON_DEFAULTS.parametricRimFresnelPowerFactor}
          min={0}
          description="大きいほどリムライトが縁に集中します。"
          disabled={readOnly}
          onChange={(parametricRimFresnelPowerFactor) => onChange({ parametricRimFresnelPowerFactor })}
        />
        <NumberControl
          label="Rim Lift"
          materialPath={path("parametricRimLiftFactor")}
          value={value.parametricRimLiftFactor ?? MTOON_DEFAULTS.parametricRimLiftFactor}
          description="大きいほどリムライトが広い面に現れます。"
          disabled={readOnly}
          onChange={(parametricRimLiftFactor) => onChange({ parametricRimLiftFactor })}
        />
        <RangeControl
          label="Rim Lighting Mix"
          materialPath={path("rimLightingMixFactor")}
          value={value.rimLightingMixFactor ?? MTOON_DEFAULTS.rimLightingMixFactor}
          description="0で設定した色、1でライトの影響を受ける色になります。"
          disabled={readOnly}
          onChange={(rimLightingMixFactor) => onChange({ rimLightingMixFactor })}
        />
      </EditorSection>

      <EditorSection title="UV Animation" reading="画像のスクロールと回転">
        <TextureSlot
          label="UV Animation Mask Map"
          materialPath={path("uvAnimationMaskTexture")}
          description="B（青）を使い、部分ごとに動く速さを変えます（リニア色空間）。黒で停止、白で指定した速さ。"
          value={value.uvAnimationMaskTexture}
          previewStatus={previewTextureStatuses.uvAnimationMaskMap}
          {...textureProps}
          onChange={(uvAnimationMaskTexture) => onChange({ uvAnimationMaskTexture })}
        />
        <NumberControl
          label="UV Scroll X Speed"
          materialPath={path("uvAnimationScrollXSpeedFactor")}
          value={value.uvAnimationScrollXSpeedFactor ?? MTOON_DEFAULTS.uvAnimationScrollXSpeedFactor}
          description="1でUVを毎秒1ずらします。負の値で逆方向、0で停止。"
          disabled={readOnly}
          onChange={(uvAnimationScrollXSpeedFactor) => onChange({ uvAnimationScrollXSpeedFactor })}
        />
        <NumberControl
          label="UV Scroll Y Speed"
          materialPath={path("uvAnimationScrollYSpeedFactor")}
          value={value.uvAnimationScrollYSpeedFactor ?? MTOON_DEFAULTS.uvAnimationScrollYSpeedFactor}
          description="1でUVを毎秒1ずらします。負の値で逆方向、0で停止。"
          disabled={readOnly}
          onChange={(uvAnimationScrollYSpeedFactor) => onChange({ uvAnimationScrollYSpeedFactor })}
        />
        <NumberControl
          label="UV Rotation Speed"
          materialPath={path("uvAnimationRotationSpeedFactor")}
          value={value.uvAnimationRotationSpeedFactor ?? MTOON_DEFAULTS.uvAnimationRotationSpeedFactor}
          description="単位はrad/秒です。約6.283で毎秒1回転、負の値で逆方向、0で停止。"
          disabled={readOnly}
          onChange={(uvAnimationRotationSpeedFactor) => onChange({ uvAnimationRotationSpeedFactor })}
        />
      </EditorSection>

      <EditorSection title="MToon Rendering" reading="描画設定">
        <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <MaterialInput
            type="checkbox"
            materialPath={path("transparentWithZWrite")}
            checked={value.transparentWithZWrite}
            disabled={readOnly || zWriteEditable === false}
            onChange={(event) => onChange({ transparentWithZWrite: event.currentTarget.checked })}
            className="accent-violet-600 disabled:opacity-50"
          />
          <span>Transparent With ZWrite</span>
        </label>
        <p className="text-[11px] leading-4 text-slate-500">Alpha ModeがBlendで、Depth Writeが自動のとき、半透明の面も深度を書き込みます。</p>
        <NumberControl
          label="Render Queue Offset"
          materialPath={path("renderQueueOffsetNumber")}
          value={value.renderQueueOffsetNumber ?? MTOON_DEFAULTS.renderQueueOffsetNumber}
          min={-9}
          max={9}
          step={1}
          description="Alpha ModeがBLENDのときの描画順です。大きいほど後に描画します。"
          disabled={readOnly}
          onChange={(renderQueueOffsetNumber) => onChange({ renderQueueOffsetNumber })}
        />
      </EditorSection>
    </>
  );
}
