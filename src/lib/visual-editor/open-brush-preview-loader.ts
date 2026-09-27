import { createOpenBrushMaterialExtension } from "../../../packages/xrift-studio-runtime/src/open-brush/material-extension";
export {
  installOpenBrushPbrFallback,
  markOpenBrushPbrFallback,
  normalizeOpenBrushGlslSource,
  readOpenBrushPbrFallback,
  type OpenBrushPbrFallbackInfo,
} from "../../../packages/xrift-studio-runtime/src/open-brush/material-extension";
export { loadOpenBrushPresetMaterial as loadOpenBrushPreviewMaterial } from "../../../packages/xrift-studio-runtime/src/open-brush/preset-loader";

/** The editor and publication share the same brush reconstruction. */
export function createOpenBrushPreviewExtension(parser: unknown, brushBaseUrl: string) {
  return createOpenBrushMaterialExtension(parser, brushBaseUrl);
}
