import mtoonContractSource from "../../../../packages/xrift-studio-runtime/src/mtoon-contract.ts?raw";
import mtoonMaterialSource from "../../../../packages/xrift-studio-runtime/src/mtoon-material.tsx?raw";
import mtoonRuntimeSource from "../../../../packages/xrift-studio-runtime/src/mtoon-runtime.ts?raw";
import readableVrmSource from "../../../../packages/xrift-studio-runtime/src/vendor/three-vrm-readable.js?raw";
import readableVrmTypes from "../../../../packages/xrift-studio-runtime/src/vendor/three-vrm-readable.d.ts?raw";
import { SCRIPT_RUNTIME_DIRECTORY } from "./script-emit";
import type { CompilerOverlayFile } from "./types";

/** The same MToon shading and outline code is used by Edit, Play and output. */
export function createMToonOverlayFiles(): CompilerOverlayFile[] {
  return [
    ["mtoon-contract.ts", mtoonContractSource],
    ["mtoon-material.tsx", mtoonMaterialSource],
    ["mtoon-runtime.ts", mtoonRuntimeSource],
    ["three-vrm-readable.js", readableVrmSource],
    ["three-vrm-readable.d.ts", readableVrmTypes],
  ].map(([name, content]) => ({
    relativePath: `${SCRIPT_RUNTIME_DIRECTORY}/${name}`,
    content: name.startsWith("three-vrm-readable") ? content : content
      .replace(/"\.\/mtoon-contract(?:\.js)?"/g, '"./mtoon-contract"')
      .replace(/"\.\/mtoon-runtime(?:\.js)?"/g, '"./mtoon-runtime"')
      .replace(/"@pixiv\/three-vrm"/g, '"./three-vrm-readable"'),
    kind: "source",
    owner: "xrift-studio-compiler",
  }));
}
