import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import { TextureLoader, type Texture } from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

import { resolveLocalBasisTranscoderPath } from "../../lib/visual-editor/basis-transcoder";
import {
  getTextureSourceFormat,
  type TextureAsset,
} from "../../lib/visual-editor";
import {
  configureMaterialPreviewTexture,
  readProjectTextureDataUrl,
} from "./material-texture-preview";

const KTX2_TRANSCODER_PATH = resolveLocalBasisTranscoderPath();

/**
 * Decodes a Texture Asset for an editor-side runtime object.
 *
 * The desktop editor has no served asset URLs, so the bytes come back over IPC
 * as a data URL the same way Material and Particle previews read theirs. The
 * Text plate and the Image quad both read their picture through this one hook,
 * so a KTX2 file or a colour-space setting cannot be honoured by one and
 * missed by the other.
 *
 * The returned Texture belongs to the hook: it is disposed when the Asset
 * changes or the caller unmounts, so callers hand it to a material and never
 * dispose it themselves.
 */
export function useProjectTexture(
  textureAsset: TextureAsset | undefined,
  projectPath: string | undefined,
  role: string,
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
          textureAsset.importSettings.colorSpace === "linear" ? "linear" : "srgb",
          role,
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
    };
    // `textureKey` stands in for the asset's identity and contents; depending on
    // the asset object would reload on every unrelated manifest edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, projectPath, role, textureKey]);

  return texture;
}
