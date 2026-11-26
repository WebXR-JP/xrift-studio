import React, { Suspense, useEffect, useState } from "react";
import { createRoot as createDomRoot } from "react-dom/client";
import { advance, createRoot, extend } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { XRiftProvider } from "@xrift/world-components";
import * as THREE from "three";
import { ShaderCubeTextureField, ShaderMatrixField, ShaderVolumeTextureField } from "../src/components/visual-editor/CustomShaderFields";
import { PrimitiveMeshVisual } from "../src/components/visual-editor/SceneViewport";
import { classicShaderTextureCacheSize } from "../src/components/visual-editor/classic-shader-textures";
import { tauri } from "../src/lib/tauri";
import { XriftWorld } from "../packages/xrift-studio-runtime/src/react-three-fiber/index";
import type { AssetManifest, MaterialAsset, TextureAsset } from "../src/lib/visual-editor/asset-manifest";
import type { ClassicR3fShaderUniform } from "../src/lib/visual-editor/custom-shader-contract";
import type { MeshComponent, SceneEntity } from "../src/lib/visual-editor/scene-document";
import { loadBuiltShellWorld } from "./vrm-mtoon-render.fixture";

extend(THREE);
const directory = "/node_modules/.cache/xrift-studio/custom-shader-render-parity/";
const SIZE = 160;
const TEXTURE_UNIFORMS = ["uPicture", "uData", "uLut", "uSky"];
/** The samplers of the third Material: with and without mip levels, and anisotropy. */
const SAMPLER_UNIFORMS = ["uPlain", "uMipped", "uMippedNearest", "uFlat", "uSlanted", "uCubePlain", "uCubeMipped", "uCubeMippedNearest"];
const FILTER_NAMES: Record<number, string> = {
  [THREE.NearestFilter]: "nearest",
  [THREE.LinearFilter]: "linear",
  [THREE.NearestMipmapNearestFilter]: "nearest-mipmap-nearest",
  [THREE.NearestMipmapLinearFilter]: "nearest-mipmap-linear",
  [THREE.LinearMipmapNearestFilter]: "linear-mipmap-nearest",
  [THREE.LinearMipmapLinearFilter]: "linear-mipmap-linear",
};
/** Edit, the generated World, the Runtime JSON adapter from source and the built shell. */
type Mode = "edit" | "jsx" | "runtime" | "shell";
type ShaderMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

function base64(bytes: Uint8Array) {
  let text = "";
  for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(text);
}

/**
 * Draws the two fixture Materials the way one path draws them and returns the
 * frames, with the state each path left on its Materials and meshes.
 */
export async function renderCustomShaderParity(mode: Mode) {
  const generated = await import(/* @vite-ignore */ `${directory}src/World.tsx`);
  const assets = generated.parityAssets as AssetManifest;
  const entities = generated.parityEntities as SceneEntity[];
  const files = generated.parityFiles as Record<string, string>;
  const publicUrl = `${location.origin}${directory}public/`;
  const materialOf = (entity: SceneEntity) => {
    const mesh = entity.components.find((component): component is MeshComponent => component.type === "mesh")!;
    return { mesh, material: assets.assets[mesh.materialBindings[0]!.materialAssetId] as MaterialAsset };
  };
  const [plainSource, glowSource, samplerSource] = entities.map(materialOf) as [ReturnType<typeof materialOf>, ReturnType<typeof materialOf>, ReturnType<typeof materialOf>];

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(SIZE, SIZE);
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  (camera as THREE.OrthographicCamera & { manual?: boolean }).manual = true;
  camera.position.z = 3;
  const root = createRoot(document.createElement("canvas"));

  // The editor reads project files through IPC. Serve it the published files
  // and count how often each one is asked for.
  const reads: Record<string, number> = {};
  const originalRead = tauri.readImageDataUrl;
  tauri.readImageDataUrl = async (_projectPath: string, relativePath: string) => {
    reads[relativePath] = (reads[relativePath] ?? 0) + 1;
    const published = files[relativePath];
    if (!published) throw new Error(`Unknown Texture file: ${relativePath}`);
    const blob = await (await fetch(`${publicUrl}${published}`)).blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  };

  const shaderMeshes = () => {
    const found: ShaderMesh[] = [];
    scene.traverse((object) => {
      const mesh = object as ShaderMesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.uniforms?.uPlacement) found.push(mesh);
    });
    return found;
  };
  const glows = (mesh: ShaderMesh) => "GLOW" in (mesh.material.defines ?? {});
  const ready = (mesh: ShaderMesh) => TEXTURE_UNIFORMS.every((name) => mesh.material.uniforms[name]?.value);
  /** The mesh of the third Material, once every one of its samplers has its picture. */
  const samplerMesh = () => {
    let found: ShaderMesh | undefined;
    scene.traverse((object) => {
      const mesh = object as ShaderMesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.uniforms?.uMipped) found = mesh;
    });
    return found && SAMPLER_UNIFORMS.every((name) => found!.material.uniforms[name]?.value) ? found : undefined;
  };
  async function waitFor<T>(read: () => T | undefined | false, what: string): Promise<T> {
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const value = read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`${mode}: ${what} (${shaderMeshes().length} Custom Shader meshes in the scene)`);
  }
  const wrap = (content: React.ReactNode) => (
    <Suspense fallback={null}><XRiftProvider baseUrl={publicUrl}>{content}</XRiftProvider></Suspense>
  );
  const editorMesh = (key: string, source: typeof plainSource, material = source.material) => (
    <PrimitiveMeshVisual key={key} component={source.mesh} primitive="plane" material={material} assets={assets}
      projectPath="custom-shader-render-parity" selected={false} materialDropHighlighted={false} viewportMaterialStyle="scene" />
  );
  /** Six meshes per Material, as a world built from code repeats one shader, and the sampler plane. */
  const editorMeshes = (firstGlowMaterial = glowSource.material) => [
    ...[0, 1, 2, 3, 4, 5].flatMap((index) => [
      editorMesh(`plain-${index}`, plainSource),
      editorMesh(`glow-${index}`, glowSource, index === 0 ? firstGlowMaterial : glowSource.material),
    ]),
    editorMesh("samplers", samplerSource),
  ];
  const publishedMesh = (Material: React.ComponentType) => <mesh><planeGeometry args={[1, 1]} /><Material /></mesh>;

  try {
    await root.configure({ gl: renderer, scene, camera, frameloop: "never", size: { width: SIZE, height: SIZE, top: 0, left: 0 }, events: undefined });
    const expected = mode === "edit" ? 12 : 2;
    if (mode === "edit") root.render(wrap(editorMeshes()));
    else if (mode === "jsx") root.render(wrap(React.createElement(generated.World)));
    else if (mode === "runtime") {
      // What the browser publication shell mounts, here from source.
      root.render(wrap(<Physics paused><XriftWorld manifest={`${location.origin}${directory}${generated.parityRuntimeManifest}`} physics="inherit" /></Physics>));
    } else {
      // The shell as it is published from the browser: the build in public/,
      // reading its manifest and files from its own folder.
      const World = await loadBuiltShellWorld(`${location.origin}/xrift-runtime-shell/remoteEntry.js`);
      root.render(wrap(<Physics paused>{React.createElement(World)}</Physics>));
    }
    const meshes = await waitFor(() => {
      const found = shaderMeshes();
      return found.length === expected && found.every(ready) && found;
    }, "the Custom Shader meshes did not load");
    const plain = meshes.find((mesh) => !glows(mesh))!;
    const glow = meshes.find(glows)!;
    const samplers = await waitFor(samplerMesh, "the sampler plane did not load");

    const show = (visible: ShaderMesh) => scene.traverse((object) => {
      const drawable = object as THREE.Mesh & THREE.Line & THREE.Points & THREE.Sprite;
      if (drawable.isMesh || drawable.isLine || drawable.isPoints || drawable.isSprite) object.visible = object === visible;
    });
    /** One frame of this path's own loop: its clock, then its draw. */
    const frame = (time: number, background: THREE.Color) => {
      scene.background = background;
      scene.fog = null;
      renderer.setRenderTarget(target);
      advance(time);
      const bytes = new Uint8Array(SIZE * SIZE * 4);
      renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, bytes);
      return base64(bytes);
    };
    const black = new THREE.Color(0, 0, 0);
    const slideRight = Math.PI / 2;
    const slideLeft = Math.PI * 1.5;

    show(plain);
    const plainRight = frame(slideRight, black);
    const time = [plain.material.uniforms.uTime!.value as number];
    const plainLeft = frame(slideLeft, black);
    time.push(plain.material.uniforms.uTime!.value as number);
    show(glow);
    const glowBlack = frame(slideRight, black);
    const glowGrey = frame(slideRight, new THREE.Color(0.2, 0.2, 0.2));
    // Bounds far out of view: only a mesh that is not culled is still drawn.
    for (const mesh of [plain, glow]) mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(1000, 0, 0), 1);
    const glowFar = frame(slideRight, black);
    show(plain);
    const plainFar = frame(slideRight, black);
    for (const mesh of [plain, glow]) mesh.geometry.boundingSphere = null;
    show(samplers);
    const sampled = frame(slideRight, black);

    // How each sampler is set: on the three.js texture, and on the GPU object
    // the frame above was drawn from.
    const gl = renderer.getContext();
    const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
    const glFilterNames: Record<number, string> = {
      [gl.NEAREST]: "NEAREST", [gl.LINEAR]: "LINEAR",
      [gl.NEAREST_MIPMAP_NEAREST]: "NEAREST_MIPMAP_NEAREST", [gl.NEAREST_MIPMAP_LINEAR]: "NEAREST_MIPMAP_LINEAR",
      [gl.LINEAR_MIPMAP_NEAREST]: "LINEAR_MIPMAP_NEAREST", [gl.LINEAR_MIPMAP_LINEAR]: "LINEAR_MIPMAP_LINEAR",
    };
    const samplerState = Object.fromEntries(SAMPLER_UNIFORMS.map((name) => {
      const texture = samplers.material.uniforms[name]!.value as THREE.Texture;
      const handle = (renderer.properties.get(texture) as { __webglTexture?: WebGLTexture }).__webglTexture;
      const cube = (texture as THREE.CubeTexture).isCubeTexture === true;
      const kind = cube ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
      const bound = gl.getParameter(cube ? gl.TEXTURE_BINDING_CUBE_MAP : gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
      gl.bindTexture(kind, handle ?? null);
      const gpu = handle ? {
        minFilter: glFilterNames[gl.getTexParameter(kind, gl.TEXTURE_MIN_FILTER) as number],
        magFilter: glFilterNames[gl.getTexParameter(kind, gl.TEXTURE_MAG_FILTER) as number],
        anisotropy: anisotropic ? gl.getTexParameter(kind, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT) as number : null,
      } : null;
      gl.bindTexture(kind, bound);
      return [name, {
        generateMipmaps: texture.generateMipmaps,
        minFilter: FILTER_NAMES[texture.minFilter], magFilter: FILTER_NAMES[texture.magFilter],
        anisotropy: texture.anisotropy, gpu,
      }];
    }));

    const report = {
      mode,
      frames: { plainRight, plainLeft, glowBlack, glowGrey, glowFar, plainFar, sampled },
      samplerState,
      /** The most samples the GPU offers, or null without the extension. */
      maxAnisotropy: anisotropic ? gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number : null,
      time,
      frustumCulled: { plain: plain.frustumCulled, glow: glow.frustumCulled },
      blending: { plain: plain.material.blending, glow: glow.material.blending },
      floatData: (glow.material.uniforms.uData!.value as THREE.Texture).type === THREE.FloatType,
      // Less the render target these frames are drawn into.
      gpuTextures: renderer.info.memory.textures - 1,
      glError: renderer.getContext().getError(),
      reads: { ...reads },
      cachedTextures: mode === "edit" ? classicShaderTextureCacheSize() : undefined,
      /** frustumCulled of one mesh without the glow Material, and while it wears it. */
      swapped: undefined as boolean[] | undefined,
    };

    if (mode === "edit") {
      root.render(wrap(editorMeshes(plainSource.material)));
      await waitFor(() => !glows(glow) && ready(glow), "the editor did not swap the Material");
      const takenOff = glow.frustumCulled;
      root.render(wrap(editorMeshes()));
      await waitFor(() => glows(glow) && ready(glow), "the editor did not put the Material back");
      report.swapped = [takenOff, glow.frustumCulled];
      report.reads = { ...reads };
    } else if (mode === "jsx") {
      root.render(wrap(publishedMesh(generated.PublishedCustomShaderGlowMaterial)));
      const mesh = await waitFor(() => {
        const found = shaderMeshes();
        return found.length === 1 && glows(found[0]!) && ready(found[0]!) && found[0];
      }, "the published glow Material did not mount");
      const wearing = mesh.frustumCulled;
      root.render(wrap(publishedMesh(generated.PublishedCustomShaderMaterial)));
      await waitFor(() => !Array.isArray(mesh.material) && mesh.material.uniforms?.uPlacement && !glows(mesh) && ready(mesh), "the published Material did not swap");
      report.swapped = [mesh.frustumCulled, wearing];
    }
    return report;
  } finally {
    tauri.readImageDataUrl = originalRead;
    root.unmount();
    await new Promise((resolve) => setTimeout(resolve, 40));
    target.dispose();
    renderer.dispose();
  }
}

/** What the two texture fields last handed to their owner. */
export const savedTextureFields: { volume?: unknown; cube?: unknown; opened: string[] } = { opened: [] };

/**
 * Mounts the 3D texture and cube map fields of the Inspector on their own,
 * over the editor, with seven pictures to choose from.
 */
export function mountShaderTextureFields() {
  const names = ["strip", "px", "nx", "py", "ny", "pz", "nz"];
  const textures = names.map((name) => ({
    id: `texture-${name}`, name: `${name}.png`, kind: "texture", status: "ready",
    source: { kind: "project", relativePath: `assets/textures/${name}.png` },
  })) as unknown as TextureAsset[];
  function Fields() {
    const [volume, setVolume] = useState<Extract<ClassicR3fShaderUniform, { kind: "texture-3d" }>>(
      { kind: "texture-3d", textureAssetId: "texture-strip" });
    const [cube, setCube] = useState<Extract<ClassicR3fShaderUniform, { kind: "texture-cube" }>>(
      { kind: "texture-cube", faces: names.slice(1).map((name) => ({ textureAssetId: `texture-${name}` })) });
    useEffect(() => { savedTextureFields.volume = volume; savedTextureFields.cube = cube; }, [volume, cube]);
    const open = (assetId: string) => { savedTextureFields.opened.push(assetId); };
    return (
      <div className="w-80 space-y-3 p-3">
        <ShaderVolumeTextureField uniform={volume} textures={textures} disabled={false} ariaLabel="Lut" onChange={setVolume} onOpenTexture={open} />
        <ShaderCubeTextureField uniform={cube} textures={textures} disabled={false} ariaLabel="Sky" onChange={setCube} onOpenTexture={open} />
      </div>
    );
  }
  document.getElementById("root")!.style.display = "none";
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;display:flex;align-items:flex-start;background:white";
  document.body.append(host);
  createDomRoot(host).render(<Fields />);
}

/**
 * The owner of a matrix field that saves late: what the field sent, what the
 * owner holds, and the two ways its value changes.
 */
export const lateMatrixOwner: {
  /** Lists the field sent that the owner has not applied yet, oldest first. */
  pending: number[][];
  held: number[];
  /** Applies the oldest pending list, as a save that comes back. */
  deliver: () => void;
  /** Replaces the value from outside the field, as Undo or an AI client does. */
  replace: (value: number[]) => void;
} = { pending: [], held: [], deliver: () => {}, replace: () => {} };

/**
 * Mounts the matrix field of the Inspector on its own, with an owner that
 * applies what the field sends only when the test says so. The Inspector
 * applies it a moment after the typing, and by then the author may have
 * typed on.
 */
export function mountLateShaderMatrixField() {
  function Field() {
    const [value, setValue] = useState([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    useEffect(() => {
      lateMatrixOwner.held = value;
      lateMatrixOwner.deliver = () => {
        const next = lateMatrixOwner.pending.shift();
        if (next) setValue(next);
      };
      lateMatrixOwner.replace = setValue;
    }, [value]);
    return (
      <div className="w-80 p-3">
        <ShaderMatrixField uniform={{ kind: "matrix", value }} disabled={false} ariaLabel="Late placement"
          onChange={(uniform) => { lateMatrixOwner.pending.push(uniform.value); }} />
      </div>
    );
  }
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;display:flex;align-items:flex-start;background:white";
  document.body.append(host);
  createDomRoot(host).render(<Field />);
}
