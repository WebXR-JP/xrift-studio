import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { TextureLoader, type Texture, type WebGLRenderer } from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { createClassicShaderDataTexture } from "../../../packages/xrift-studio-runtime/src/classic-shader-data-texture";
import { tauri } from "../../lib/tauri";
import { resolveLocalBasisTranscoderPath } from "../../lib/visual-editor/basis-transcoder";
import {
  classicShaderTextureAssetIds,
  classicShaderTextureFormat,
  getTextureSourceFormat,
  type AssetManifest,
  type MaterialAsset,
  type TextureAsset,
} from "../../lib/visual-editor";
import { contentEqual } from "./content-equal";
import {
  useSceneReviewResource,
  type SceneReviewLoadState,
} from "./scene-review-readiness";

/**
 * The pictures Custom Shader Materials read, loaded once per Texture Asset.
 *
 * A world built from code often puts one shader on hundreds of meshes, and the
 * editor builds a Material per mesh. Each Material used to decode its own copy
 * of every picture; they now share the decoded texture, the way the Runtime
 * JSON loader and the generated world already do, and every uniform takes a
 * clone that carries only its sampler state.
 */

type ProjectTextureAsset = TextureAsset & {
  source: { kind: "project"; relativePath: string };
};

type CacheEntry = {
  promise: Promise<Texture>;
  users: number;
  texture?: Texture;
  release?: ReturnType<typeof setTimeout>;
};

const TEXTURES = new Map<string, CacheEntry>();
const KTX2_TRANSCODER_PATH = resolveLocalBasisTranscoderPath();
/** Long enough for a Material rebuild to pick the same picture up again. */
const RELEASE_DELAY_MS = 2000;

function isProjectTextureAsset(
  asset: unknown,
): asset is ProjectTextureAsset {
  const candidate = asset as TextureAsset | undefined;
  return candidate?.kind === "texture" && candidate.source.kind === "project";
}

/** Identity of the decoded picture: the file, not the settings of one use. */
export function classicShaderTextureKey(
  projectPath: string,
  asset: ProjectTextureAsset,
): string {
  return [
    projectPath,
    asset.id,
    asset.sourceHash ?? "",
    asset.source.relativePath,
    getTextureSourceFormat(asset) ?? "",
  ].join("\n");
}

async function loadClassicShaderTexture(
  projectPath: string,
  asset: ProjectTextureAsset,
  gl: WebGLRenderer,
): Promise<Texture> {
  const format = classicShaderTextureFormat(asset);
  if (format === "unsupported") {
    throw new Error("HDR images cannot be read by a Custom Shader uniform");
  }
  const dataUrl = await tauri.readImageDataUrl(
    projectPath,
    asset.source.relativePath,
  );
  if (format === "float") {
    const response = await fetch(dataUrl);
    return createClassicShaderDataTexture(await response.arrayBuffer());
  }
  if (format === "ktx2") {
    const loader = new KTX2Loader()
      .setTranscoderPath(KTX2_TRANSCODER_PATH)
      .detectSupport(gl);
    try {
      return await loader.loadAsync(dataUrl);
    } finally {
      loader.dispose();
    }
  }
  return new TextureLoader().loadAsync(dataUrl);
}

/**
 * Takes a share of one Asset's decoded texture.
 *
 * `release` gives the share back. The texture is disposed a moment after the
 * last share is returned, so swapping a Material does not reload its pictures.
 */
export function acquireClassicShaderTexture(
  projectPath: string,
  asset: ProjectTextureAsset,
  gl: WebGLRenderer,
  load: typeof loadClassicShaderTexture = loadClassicShaderTexture,
): { promise: Promise<Texture>; release: () => void } {
  const key = classicShaderTextureKey(projectPath, asset);
  let entry = TEXTURES.get(key);
  if (!entry) {
    const created: CacheEntry = {
      users: 0,
      promise: load(projectPath, asset, gl).then((texture) => {
        texture.name = asset.name;
        created.texture = texture;
        // Everyone left while the picture was still decoding.
        if (TEXTURES.get(key) !== created) texture.dispose();
        return texture;
      }),
    };
    // A failed read is not remembered, so the next Material tries again.
    created.promise.catch(() => {
      if (TEXTURES.get(key) === created) TEXTURES.delete(key);
    });
    TEXTURES.set(key, created);
    entry = created;
  }
  const shared = entry;
  if (shared.release !== undefined) {
    clearTimeout(shared.release);
    shared.release = undefined;
  }
  shared.users += 1;
  let released = false;
  return {
    promise: shared.promise,
    release: () => {
      if (released) return;
      released = true;
      shared.users -= 1;
      if (shared.users > 0 || TEXTURES.get(key) !== shared) return;
      shared.release = setTimeout(() => {
        if (shared.users > 0 || TEXTURES.get(key) !== shared) return;
        TEXTURES.delete(key);
        shared.texture?.dispose();
      }, RELEASE_DELAY_MS);
    },
  };
}

/** Decoded pictures currently held, for the fixture that counts loads. */
export function classicShaderTextureCacheSize(): number {
  return TEXTURES.size;
}

/** One object for "no shader textures", so setting it again is not a change. */
const NO_CLASSIC_SHADER_TEXTURES: Readonly<Record<string, Texture>> =
  Object.freeze({});

/**
 * The loaded texture of every Texture Asset a Custom Shader Material reads,
 * keyed by Asset id. Pass the result to `createClassicR3fMaterial`.
 */
export function useClassicShaderTextures(
  material: MaterialAsset | undefined,
  assets: AssetManifest,
  projectPath?: string,
): Readonly<Record<string, Texture>> {
  const gl = useThree((state) => state.gl);
  const shader =
    material?.shader?.kind === "classic-r3f" ? material.shader : undefined;
  const assetIds = useMemo(
    () => (shader ? classicShaderTextureAssetIds(shader) : []),
    [shader],
  );
  const [textures, setTextures] = useState<Readonly<Record<string, Texture>>>(
    NO_CLASSIC_SHADER_TEXTURES,
  );
  const signature = JSON.stringify(
    assetIds.map((assetId) => {
      const asset = assets.assets[assetId];
      return [
        assetId,
        asset?.kind,
        asset?.sourceHash,
        asset?.source,
        asset?.kind === "texture" ? getTextureSourceFormat(asset) : undefined,
      ];
    }),
  );
  const hasTextures = assetIds.length > 0;
  const reportReview = useSceneReviewResource(`classic:${projectPath ?? ""}:${signature}`, { status: hasTextures ? "loading" : "ready" });
  const [readiness, setReadiness] = useState<{ key: string; state: SceneReviewLoadState }>({ key: "", state: { status: "ready" } });
  useLayoutEffect(() => {
    if (!hasTextures) reportReview({ status: "ready" });
    else if (readiness.key === signature) reportReview(readiness.state);
  }, [hasTextures, readiness, reportReview, signature]);

  useEffect(() => {
    if (!hasTextures || !projectPath) {
      // This branch runs for every Material without shader textures — nearly
      // all of them — each time its Assets change. Handing React a new empty
      // object and a new status every time re-rendered each such Mesh a second
      // time for no change, so both are only replaced when they differ.
      setTextures(NO_CLASSIC_SHADER_TEXTURES);
      const state: SceneReviewLoadState = hasTextures
        ? { status: "error", message: "Shaderの画像の参照元を読み込めず、見た目を確認できませんでした" }
        : { status: "ready" };
      setReadiness((current) =>
        current.key === signature && contentEqual(current.state, state, 1)
          ? current
          : { key: signature, state },
      );
      return;
    }
    let active = true;
    const shares = assetIds.flatMap((assetId) => {
      const asset = assets.assets[assetId];
      return isProjectTextureAsset(asset)
        ? [{ assetId, ...acquireClassicShaderTexture(projectPath, asset, gl) }]
        : [];
    });
    void Promise.all(
      shares.map(async (share) => [share.assetId, await share.promise] as const),
    )
      .then((entries) => {
        if (!active) return;
        setTextures(Object.fromEntries(entries));
        setReadiness({ key: signature, state: entries.length === assetIds.length ? { status: "ready" } : { status: "error", message: "Shaderの画像が不足し、見た目を確認できませんでした" } });
      })
      .catch(() => {
        if (!active) return;
        setTextures(NO_CLASSIC_SHADER_TEXTURES);
        setReadiness({ key: signature, state: { status: "error", message: "Shaderの画像を読み込めず、見た目を確認できませんでした" } });
      });
    return () => {
      active = false;
      for (const share of shares) share.release();
    };
    // `signature` stands in for the Assets this shader reads; depending on the
    // manifest itself would reload on every unrelated edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, hasTextures, projectPath, signature]);

  return textures;
}
