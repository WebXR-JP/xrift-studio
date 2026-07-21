declare module "three-icosa/dist/three-icosa.module.js" {
  import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

  export class GLTFGoogleTiltBrushMaterialExtension {
    constructor(parser: unknown, brushPath: string, isLegacy?: boolean);
    readonly name: string;
    beforeRoot(): Promise<void> | null;
    afterRoot(gltf: GLTF): Promise<void> | null;
  }
}
