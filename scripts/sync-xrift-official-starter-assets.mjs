import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import draco3d from "draco3d";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const revision = "abbce026ea1f1066726f385089d5f28b2ef5a890";
const baseUrl = `https://raw.githubusercontent.com/WebXR-JP/xrift-world-template/${revision}/public`;
const outputDirectory = path.resolve("public/visual-editor/starter-assets");
const upstream = [
  {
    source: "duck.glb",
    target: "xrift-world-template-duck.glb",
    sha256: "154d3d5f025f9a0a614b5ea27b5e816120e0d286077b05ba67281e4b2823684d",
  },
  {
    source: "tokyo-station.jpg",
    // Upstream keeps a .jpg name, but the pinned bytes are a PNG image.
    target: "xrift-world-template-tokyo-station.png",
    sha256: "613c5e5af594cf273bc14076cc86761a74826e9c57fbcec1e45c42a988fd3265",
  },
  {
    source: "bunny.drc",
    target: null,
    sha256: "3bb08f257d873f69ded447e07c2dd4e9d7a264d58a686c88978c38430c5f6eb4",
  },
];

class NodeFileReader {
  result = null;
  error = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then(
      (result) => {
        this.result = result;
        this.onloadend?.();
      },
      (error) => {
        this.error = error;
        this.onloadend?.();
      },
    );
  }

  readAsDataURL(blob) {
    void blob.arrayBuffer().then(
      (result) => {
        this.result = `data:${blob.type};base64,${Buffer.from(result).toString("base64")}`;
        this.onloadend?.();
      },
      (error) => {
        this.error = error;
        this.onloadend?.();
      },
    );
  }
}

globalThis.FileReader ??= NodeFileReader;

await mkdir(outputDirectory, { recursive: true });
const downloaded = new Map();
for (const asset of upstream) {
  const response = await fetch(`${baseUrl}/${asset.source}`);
  if (!response.ok) throw new Error(`${asset.source}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertHash(asset.source, bytes, asset.sha256);
  downloaded.set(asset.source, bytes);
  if (asset.target) await writeFile(path.join(outputDirectory, asset.target), bytes);
}

const bunnyGlb = await convertDracoToGlb(downloaded.get("bunny.drc"));
await writeFile(
  path.join(outputDirectory, "xrift-world-template-bunny.glb"),
  bunnyGlb,
);

for (const file of [
  ["xrift-world-template-duck.glb", downloaded.get("duck.glb")],
  ["xrift-world-template-tokyo-station.png", downloaded.get("tokyo-station.jpg")],
  ["xrift-world-template-bunny.glb", bunnyGlb],
]) {
  process.stdout.write(`${file[0]} ${file[1].byteLength} ${hash(file[1])}\n`);
}

async function convertDracoToGlb(bytes) {
  if (!bytes) throw new Error("bunny.drc was not downloaded");
  const module = await draco3d.createDecoderModule({});
  const decoder = new module.Decoder();
  const buffer = new module.DecoderBuffer();
  const mesh = new module.Mesh();
  try {
    buffer.Init(bytes, bytes.byteLength);
    const status = decoder.DecodeBufferToMesh(buffer, mesh);
    if (!status.ok() || mesh.ptr === 0) {
      throw new Error(status.error_msg() || "Draco decode failed");
    }
    const geometry = new BufferGeometry();
    const attributes = [
      ["position", module.POSITION],
      ["normal", module.NORMAL],
      ["color", module.COLOR],
      ["uv", module.TEX_COORD],
    ];
    for (const [name, semantic] of attributes) {
      const attributeId = decoder.GetAttributeId(mesh, semantic);
      if (attributeId < 0) continue;
      const attribute = decoder.GetAttribute(mesh, attributeId);
      const values = new module.DracoFloat32Array();
      try {
        decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
        const array = new Float32Array(values.size());
        for (let index = 0; index < array.length; index += 1) {
          array[index] = values.GetValue(index);
        }
        geometry.setAttribute(
          name,
          new BufferAttribute(array, attribute.num_components()),
        );
      } finally {
        module.destroy(values);
      }
    }
    const face = new module.DracoInt32Array();
    try {
      const indices = new Uint32Array(mesh.num_faces() * 3);
      for (let index = 0; index < mesh.num_faces(); index += 1) {
        decoder.GetFaceFromMesh(mesh, index, face);
        indices[index * 3] = face.GetValue(0);
        indices[index * 3 + 1] = face.GetValue(1);
        indices[index * 3 + 2] = face.GetValue(2);
      }
      geometry.setIndex(new BufferAttribute(indices, 1));
    } finally {
      module.destroy(face);
    }
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const root = new Group();
    root.name = "Draco Sample";
    const object = new Mesh(
      geometry,
      new MeshStandardMaterial({
        color: 0xc084fc,
        roughness: 0.4,
        metalness: 0.2,
      }),
    );
    object.name = "Draco Geometry";
    root.add(object);
    const exported = await new GLTFExporter().parseAsync(root, {
      binary: true,
      onlyVisible: false,
    });
    if (!(exported instanceof ArrayBuffer)) throw new Error("GLB export failed");
    return new Uint8Array(exported);
  } finally {
    module.destroy(mesh);
    module.destroy(buffer);
    module.destroy(decoder);
  }
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertHash(name, bytes, expected) {
  const actual = hash(bytes);
  if (actual !== expected) {
    throw new Error(`${name}: SHA-256 mismatch (${actual})`);
  }
}
