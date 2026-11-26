import classicShaderContractSource from "../../../../packages/xrift-studio-runtime/src/classic-shader-contract.ts?raw";
import classicShaderDataTextureSource from "../../../../packages/xrift-studio-runtime/src/classic-shader-data-texture.ts?raw";
import classicShaderMaterialSource from "../../../../packages/xrift-studio-runtime/src/classic-shader-material.tsx?raw";
import classicShaderRuntimeSource from "../../../../packages/xrift-studio-runtime/src/classic-shader-runtime.ts?raw";
import shaderTimeSource from "../../../../packages/xrift-studio-runtime/src/shader-time.ts?raw";
import { SCRIPT_RUNTIME_DIRECTORY } from "./script-emit";
import type { CompilerOverlayFile } from "./types";

/** What the generated entry imports the Custom Shader Material from. */
export const CLASSIC_SHADER_MATERIAL_IMPORT_PATH =
  "./xrift-studio/classic-shader-material";
/** What the generated entry imports the EXR float data loader from. */
export const CLASSIC_SHADER_DATA_TEXTURE_IMPORT_PATH =
  "./xrift-studio/classic-shader-data-texture";

/** The package writes `./x.js` for NodeNext; the staged world is flat and extensionless. */
function rewriteClassicShaderImports(source: string): string {
  return source.replace(
    /(\bfrom\s*)(["'])\.\/(classic-shader-contract|classic-shader-runtime|shader-time)\.js\2/g,
    (_whole, prefix: string, quote: string, moduleName: string) =>
      `${prefix}${quote}./${moduleName}${quote}`,
  );
}

function overlay(name: string, source: string): CompilerOverlayFile {
  return {
    relativePath: `${SCRIPT_RUNTIME_DIRECTORY}/${name}`,
    content: rewriteClassicShaderImports(source),
    kind: "source",
    owner: "xrift-studio-compiler",
  };
}

/**
 * Ships the Custom Shader Material builder into the published world.
 *
 * It is the source the editor's Scene View draws with. The generated entry
 * only hands it the shader descriptor and the loaded textures, so a sampler
 * option, a blend mode or a uniform kind cannot mean one thing while authoring
 * and another once published.
 */
export function createClassicShaderOverlayFiles(): CompilerOverlayFile[] {
  return [
    overlay("classic-shader-contract.ts", classicShaderContractSource),
    overlay("classic-shader-material.tsx", classicShaderMaterialSource),
    overlay("classic-shader-runtime.ts", classicShaderRuntimeSource),
    overlay("shader-time.ts", shaderTimeSource),
  ];
}

/**
 * Ships the EXR reader, for a world whose shader samples float data.
 *
 * Separate from the builder so that a world without such a uniform does not
 * carry the EXR decoder.
 */
export function createClassicShaderDataTextureOverlayFile(): CompilerOverlayFile {
  return overlay("classic-shader-data-texture.ts", classicShaderDataTextureSource);
}
