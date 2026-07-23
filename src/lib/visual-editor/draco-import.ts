import {
  Group,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
} from "three";
import dracoWasmUrl from "three/examples/jsm/libs/draco/draco_decoder.wasm?url";
import dracoWasmWrapperUrl from "three/examples/jsm/libs/draco/draco_wasm_wrapper.js?url";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/** Converts a standalone Draco geometry into a self-contained GLB in-browser. */
export async function convertDracoGeometryToGlb(
  bytes: ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const sourceBytes = new Uint8Array(
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes),
  );
  const source = sourceBytes.buffer as ArrayBuffer;
  const loader = new DRACOLoader();
  loader.setDecoderPath({
    js: dracoWasmWrapperUrl,
    wasm: dracoWasmUrl,
  });
  try {
    const geometry = await new Promise<BufferGeometry>((resolve, reject) => {
      loader.parse(source, resolve, reject);
    });
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const root = new Group();
    root.name = "Draco Model";
    const mesh = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: 0xc084fc,
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    mesh.name = "Draco Geometry";
    root.add(mesh);

    const exported = await new GLTFExporter().parseAsync(root, {
      binary: true,
      onlyVisible: false,
    });
    if (!(exported instanceof ArrayBuffer)) {
      throw new Error("Draco変換結果がbinary GLBではありません。 ");
    }
    return new Uint8Array(exported);
  } finally {
    loader.dispose();
  }
}
