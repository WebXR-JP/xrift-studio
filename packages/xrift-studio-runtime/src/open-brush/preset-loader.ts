import { LoadingManager, type RawShaderMaterial } from "three";
import {
  createOpenBrushMaterialExtension,
  type InternalTiltShaderLoader,
  type OpenBrushMaterialExtension,
} from "./material-extension.js";

const OPEN_BRUSH_STANDALONE_MATERIAL_CACHE = new Map<
  string,
  Promise<RawShaderMaterial>
>();
const OPEN_BRUSH_STANDALONE_LOADER_CACHE = new Map<
  string,
  InternalTiltShaderLoader
>();

/** Loads one reusable brush preset without requiring its original glTF. */
export function loadOpenBrushPresetMaterial(
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
