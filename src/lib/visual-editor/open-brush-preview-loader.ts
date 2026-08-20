import { LoadingManager, type RawShaderMaterial } from "three";
import {
  createOpenBrushMaterialExtension,
  type InternalTiltShaderLoader,
  type OpenBrushMaterialExtension,
} from "../../../packages/xrift-studio-runtime/src/open-brush/material-extension";

export {
  installOpenBrushPbrFallback,
  markOpenBrushPbrFallback,
  normalizeOpenBrushGlslSource,
  readOpenBrushPbrFallback,
  type OpenBrushPbrFallbackInfo,
} from "../../../packages/xrift-studio-runtime/src/open-brush/material-extension";

const OPEN_BRUSH_STANDALONE_MATERIAL_CACHE = new Map<
  string,
  Promise<RawShaderMaterial>
>();
const OPEN_BRUSH_STANDALONE_LOADER_CACHE = new Map<
  string,
  InternalTiltShaderLoader
>();

/**
 * The editor viewport and the published world share one brush loader, so a
 * preview and its publication cannot drift apart. Only the caches below are
 * editor-specific: a published world loads each brush once through its own
 * glTF, while the catalog reuses presets across many previews.
 */
export function createOpenBrushPreviewExtension(
  parser: unknown,
  brushBaseUrl: string,
) {
  return createOpenBrushMaterialExtension(parser, brushBaseUrl);
}

/** Loads one reusable brush preset without requiring its original glTF. */
export function loadOpenBrushPreviewMaterial(
  brushName: string,
  brushBaseUrl: string,
): Promise<RawShaderMaterial> {
  const key = `${brushBaseUrl}\n${brushName}`;
  const cached = OPEN_BRUSH_STANDALONE_MATERIAL_CACHE.get(key);
  if (cached) return cached;
  const loader = getStandaloneOpenBrushLoader(brushBaseUrl);
  const promise = new Promise<RawShaderMaterial>((resolve, reject) => {
    loader.load(brushName, resolve, undefined, reject);
  }).catch((error: unknown) => {
    OPEN_BRUSH_STANDALONE_MATERIAL_CACHE.delete(key);
    throw error;
  });
  OPEN_BRUSH_STANDALONE_MATERIAL_CACHE.set(key, promise);
  return promise;
}

function getStandaloneOpenBrushLoader(
  brushBaseUrl: string,
): InternalTiltShaderLoader {
  const cached = OPEN_BRUSH_STANDALONE_LOADER_CACHE.get(brushBaseUrl);
  if (cached) return cached;
  const extension = createOpenBrushMaterialExtension(
    { options: { manager: new LoadingManager() } },
    brushBaseUrl,
  ) as unknown as OpenBrushMaterialExtension;
  OPEN_BRUSH_STANDALONE_LOADER_CACHE.set(
    brushBaseUrl,
    extension.tiltShaderLoader,
  );
  return extension.tiltShaderLoader;
}
