import { Image } from "lucide-react";
import { getSceneRecipe } from "../../lib/visual-editor/scene-recipe-catalog";
import { getWaterShaderCatalogEntry } from "../../lib/visual-editor/water-shader-catalog";
import { TERRAIN_PRESETS } from "../../lib/visual-editor/terrain-presets";
import { GLOW_FIXTURE_SHAPES, GLOW_MATERIAL_PRESETS } from "../../lib/visual-editor/glow-material-catalog";
import { PARTICLE_AUTHORING_PRESETS } from "../../lib/visual-editor/particle-system";
import { OPEN_BRUSH_CATALOG } from "../../lib/visual-editor/open-brush-catalog";
import { getXriftComponentDefinition } from "../../lib/visual-editor/component-registry";
import { openBrushCatalogThumbnailUrl, xriftComponentCatalogThumbnailUrl } from "../../lib/visual-editor/catalog-thumbnails";
import type { ResolvedWind } from "../../lib/visual-editor/wind-contract";
import { SceneRecipeCatalogPreview } from "./SceneRecipeCatalogPreview";
import { TerrainPresetCatalogPreview } from "./TerrainPresetCatalogPreview";
import { WaterShaderCatalogPreview } from "./WaterShaderCatalogPreview";
import { GlowMaterialCatalogPreview } from "./GlowMaterialCatalogPreview";
import { ParticlePresetCatalogPreview } from "./ParticlePresetCatalogPreview";
import { WorldAssetCatalogPreview } from "./WorldAssetCatalogPreview";
import { CatalogThumbnailImage } from "./CatalogThumbnailImage";

const previewWind: ResolvedWind = { direction: [1, 0], speed: 1, turbulence: 0.25 };
const recipeProviders = new Set(["xrift-scene-recipes", "xrift-material-showcases", "xrift-gimmicks"]);

/** Same data and renderers as the asset store, never an invented illustration. */
export function ChatgptBuiltinThumbnail({ candidateId, name }: { candidateId: string; name: string }) {
  const [, provider, ...parts] = candidateId.split(":");
  const key = parts.join(":");
  if (recipeProviders.has(provider)) {
    const recipe = getSceneRecipe(key);
    if (recipe) return <SceneRecipeCatalogPreview recipe={recipe} />;
  }
  if (provider === "xrift-water-shaders") {
    const entry = getWaterShaderCatalogEntry(key);
    if (entry) return <WaterShaderCatalogPreview shader={entry.shader} wind={previewWind} />;
  }
  if (provider === "xrift-terrain-presets") {
    const preset = TERRAIN_PRESETS.find(item => item.id === key);
    if (preset) return <TerrainPresetCatalogPreview preset={preset} />;
  }
  if (provider === "xrift-glow-materials") {
    const [shapeId, presetId] = key.includes("/") ? key.split("/") : [GLOW_FIXTURE_SHAPES[0].id, key];
    const preset = GLOW_MATERIAL_PRESETS.find(item => item.id === presetId);
    const shape = GLOW_FIXTURE_SHAPES.find(item => item.id === shapeId);
    if (preset && shape) return <GlowMaterialCatalogPreview preset={preset} shape={shape} />;
  }
  if (provider === "xrift-particle-presets") {
    const preset = PARTICLE_AUTHORING_PRESETS.find(item => item.id === key);
    if (preset) return <ParticlePresetCatalogPreview preset={preset} />;
  }
  const brush = provider === "open-brush" ? OPEN_BRUSH_CATALOG.find(item => item.id === key) : undefined;
  if (brush) return <CatalogThumbnailImage src={openBrushCatalogThumbnailUrl(brush.brushGuid)} alt={`${name}のプレビュー`} fallback={<Image aria-hidden="true" className="size-5" />} />;
  if (provider === "xrift-components") {
    if (key === "studio.vehicle" || key === "studio.seat") return <WorldAssetCatalogPreview kind={key === "studio.vehicle" ? "vehicle" : "seat"} className="h-full w-full" />;
    const definition = getXriftComponentDefinition(key);
    if (definition) return <CatalogThumbnailImage src={xriftComponentCatalogThumbnailUrl(definition.importName)} alt={`${name}のプレビュー`} fallback={<Image aria-hidden="true" className="size-5" />} />;
  }
  return <span className="flex h-full items-center justify-center bg-slate-100 text-[10px] text-slate-500">プレビューなし</span>;
}
