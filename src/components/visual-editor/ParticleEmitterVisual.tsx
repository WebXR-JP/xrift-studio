import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import {
  Color,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { XriftScriptParticleEmitter } from "../../../packages/xrift-studio-runtime/src/script/particle";
import { resolveLocalBasisTranscoderPath } from "../../lib/visual-editor/basis-transcoder";
import {
  getTextureSourceFormat,
  normalizeParticleProperties,
  normalizeMaterialProperties,
  type MaterialAsset,
  type ParticleAsset,
  type TextureAsset,
} from "../../lib/visual-editor";
import {
  configureMaterialPreviewTexture,
  readProjectTextureDataUrl,
} from "./material-texture-preview";

const KTX2_TRANSCODER_PATH = resolveLocalBasisTranscoderPath();

export function ParticleEmitterVisual({
  asset,
  textureAsset,
  materialAsset,
  projectPath,
  selected,
}: {
  asset: ParticleAsset;
  textureAsset?: TextureAsset;
  materialAsset?: MaterialAsset;
  projectPath?: string;
  selected: boolean;
}) {
  const properties = useMemo(
    () => normalizeParticleProperties(asset.properties),
    [asset.properties],
  );
  const particleMap = useParticleTexture(textureAsset, projectPath);
  const materialBaseColor = useMemo(() => {
    if (!materialAsset) return [1, 1, 1, 1] as const;
    return normalizeMaterialProperties(
      materialAsset.properties as unknown as Parameters<
        typeof normalizeMaterialProperties
      >[0],
    ).pbrMetallicRoughness.baseColorFactor;
  }, [materialAsset]);
  const materialColor = useMemo(
    () =>
      new Color().setRGB(
        materialBaseColor[0],
        materialBaseColor[1],
        materialBaseColor[2],
        SRGBColorSpace,
      ),
    [materialBaseColor],
  );

  return (
    <XriftScriptParticleEmitter
      config={properties}
      color={materialColor}
      opacity={materialBaseColor[3]}
      map={particleMap}
      displayOpacityScale={selected ? 1 : 0.9}
    />
  );
}

function useParticleTexture(
  textureAsset: TextureAsset | undefined,
  projectPath: string | undefined,
): Texture | null {
  const gl = useThree((state) => state.gl);
  const [texture, setTexture] = useState<Texture | null>(null);
  const textureKey = textureAsset
    ? [
        projectPath ?? "",
        textureAsset.id,
        textureAsset.sourceHash ?? "",
        textureAsset.source.kind === "project"
          ? textureAsset.source.relativePath
          : textureAsset.source.kind === "builtin"
            ? textureAsset.source.key
            : "document",
      ].join("\n")
    : "";

  useEffect(() => {
    let active = true;
    let ownedTexture: Texture | null = null;
    setTexture(null);
    if (
      !textureAsset ||
      (!projectPath && textureAsset.source.kind !== "builtin") ||
      textureAsset.source.kind === "document"
    ) {
      return () => {
        active = false;
      };
    }

    const readableTexture = textureAsset as TextureAsset & {
      source:
        | { kind: "project"; relativePath: string }
        | { kind: "builtin"; key: string };
    };
    void readProjectTextureDataUrl(projectPath ?? "", readableTexture)
      .then(async (dataUrl): Promise<Texture> => {
        if (getTextureSourceFormat(textureAsset) === "ktx2") {
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
      })
      .then((loaded) => {
        configureMaterialPreviewTexture(
          loaded,
          textureAsset,
          { textureAssetId: textureAsset.id, texCoord: 0 },
          textureAsset.importSettings.colorSpace === "srgb"
            ? "srgb"
            : textureAsset.importSettings.colorSpace === "linear"
              ? "linear"
              : "srgb",
          "particle",
        );
        if (!active) {
          loaded.dispose();
          return;
        }
        ownedTexture = loaded;
        setTexture(loaded);
      })
      .catch(() => {
        if (active) setTexture(null);
      });

    return () => {
      active = false;
      ownedTexture?.dispose();
      ownedTexture = null;
    };
  }, [gl, projectPath, textureAsset, textureKey]);

  return texture;
}
