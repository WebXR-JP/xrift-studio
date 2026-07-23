export const THREE_EDITOR_MODEL_FORMATS = {
  "3dm": "Rhino 3DM",
  "3ds": "3D Studio",
  "3mf": "3D Manufacturing Format",
  amf: "Additive Manufacturing Format",
  dae: "COLLADA",
  drc: "Draco geometry",
  fbx: "Autodesk FBX",
  glb: "glTF Binary",
  gltf: "glTF JSON",
  json: "Three.js JSON",
  kmz: "KMZ / COLLADA",
  ldr: "LDraw",
  md2: "Quake II MD2",
  mpd: "LDraw MPD",
  obj: "Wavefront OBJ",
  pcd: "Point Cloud Data",
  ply: "Polygon File Format",
  stl: "STL",
  svg: "SVG geometry",
  usd: "Universal Scene Description",
  usda: "Universal Scene Description ASCII",
  usdc: "Universal Scene Description Crate",
  usdz: "Universal Scene Description ZIP",
  vox: "MagicaVoxel VOX",
  vrm: "VRM",
  wrl: "VRML",
  xyz: "XYZ point cloud",
} as const;

export type ThreeEditorModelFormat = keyof typeof THREE_EDITOR_MODEL_FORMATS;

export const STUDIO_NATIVE_MODEL_FORMATS = [
  "glb",
  "gltf",
  "obj",
  "vrm",
] as const satisfies readonly ThreeEditorModelFormat[];

export const STUDIO_IMAGE_FORMATS = {
  png: { mimeType: "image/png", extensions: ["png"] },
  jpeg: { mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
  webp: { mimeType: "image/webp", extensions: ["webp"] },
  avif: { mimeType: "image/avif", extensions: ["avif"] },
  gif: { mimeType: "image/gif", extensions: ["gif"] },
  bmp: { mimeType: "image/bmp", extensions: ["bmp"] },
  svg: { mimeType: "image/svg+xml", extensions: ["svg"] },
  ktx2: { mimeType: "image/ktx2", extensions: ["ktx2"] },
} as const;

export type StudioImageFormat = keyof typeof STUDIO_IMAGE_FORMATS;

export const ASSET_IMPORT_ACCEPT = [
  ".unitypackage",
  ".unity",
  ".prefab",
  ...Object.keys(THREE_EDITOR_MODEL_FORMATS).map((extension) => `.${extension}`),
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".svg",
  ".ktx2",
  ".hdr",
  ".exr",
  ".mp3",
  ".wav",
  "model/gltf-binary",
  "model/gltf+json",
  "model/obj",
  "model/vrm",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/bmp",
  "image/svg+xml",
  "image/vnd.radiance",
  "image/x-hdr",
  "image/x-exr",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
].join(",");

export const THREE_EDITOR_MODEL_EXTENSION_PATTERN = new RegExp(
  `\\.(?:${Object.keys(THREE_EDITOR_MODEL_FORMATS)
    .map(escapeRegExp)
    .join("|")})(?:[?#].*)?$`,
  "i",
);

export const STUDIO_IMAGE_EXTENSION_PATTERN =
  /\.(?:png|jpe?g|webp|avif|gif|bmp|svg|ktx2)(?:[?#].*)?$/i;

export function isThreeEditorModelFormat(
  value: string,
): value is ThreeEditorModelFormat {
  return Object.prototype.hasOwnProperty.call(THREE_EDITOR_MODEL_FORMATS, value);
}

export function studioImageFormatForExtension(
  extension: string,
): StudioImageFormat | undefined {
  const normalized = extension.toLowerCase();
  return (Object.entries(STUDIO_IMAGE_FORMATS) as Array<
    [StudioImageFormat, (typeof STUDIO_IMAGE_FORMATS)[StudioImageFormat]]
  >).find(([, definition]) =>
    (definition.extensions as readonly string[]).includes(normalized),
  )?.[0];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
