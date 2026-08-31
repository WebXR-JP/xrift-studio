import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import { TextureLoader, type Texture } from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

import { XriftTextPanel } from "../../../packages/xrift-studio-runtime/src/script/text-panel";
import type { XriftTextPanelConfig } from "../../../packages/xrift-studio-runtime/src/text-panel-layout";
import { resolveLocalBasisTranscoderPath } from "../../lib/visual-editor/basis-transcoder";
import {
  getTextureSourceFormat,
  type AssetManifest,
  type FontAsset,
  type TextComponent,
  type TextureAsset,
} from "../../lib/visual-editor";
import { tauri } from "../../lib/tauri";
import {
  configureMaterialPreviewTexture,
  readProjectTextureDataUrl,
} from "./material-texture-preview";

const KTX2_TRANSCODER_PATH = resolveLocalBasisTranscoderPath();

/**
 * Draws a Text component in the editor viewport through the same runtime object
 * the published world uses, so a caption plate is measured and positioned
 * identically while editing and after upload.
 */
export function TextPanelVisual({
  component,
  assets,
  projectPath,
}: {
  component: TextComponent;
  assets: AssetManifest;
  projectPath?: string;
}) {
  const backgroundTextureAssetId =
    component.background?.mode === "texture"
      ? component.background.textureAssetId
      : undefined;
  const textureAsset = backgroundTextureAssetId
    ? assets.assets[backgroundTextureAssetId]
    : undefined;
  const map = useBackgroundTexture(
    textureAsset?.kind === "texture" ? textureAsset : undefined,
    projectPath,
  );
  const fontAsset = component.fontAssetId
    ? assets.assets[component.fontAssetId]
    : undefined;
  const fontUrl = useProjectFontUrl(
    fontAsset?.kind === "font" ? fontAsset : undefined,
    projectPath,
  );

  const config = useMemo<XriftTextPanelConfig>(
    () => ({
      text: component.text,
      color: component.color,
      fontSize: component.fontSize,
      ...(component.maxWidth === undefined ? {} : { maxWidth: component.maxWidth }),
      anchorX: component.anchorX,
      anchorY: component.anchorY,
      outlineWidth: component.outlineWidth,
      outlineColor: component.outlineColor,
      ...(component.fontId === undefined ? {} : { fontId: component.fontId }),
      ...(component.fontWeight === undefined
        ? {}
        : { fontWeight: component.fontWeight }),
      ...(component.textAlign === undefined
        ? {}
        : { textAlign: component.textAlign }),
      ...(component.lineHeight === undefined
        ? {}
        : { lineHeight: component.lineHeight }),
      ...(component.letterSpacing === undefined
        ? {}
        : { letterSpacing: component.letterSpacing }),
      ...(component.background === undefined
        ? {}
        : { background: component.background }),
      ...(fontUrl ? { fontUrl } : {}),
    }),
    [component, fontUrl],
  );

  return <XriftTextPanel config={config} map={map} />;
}

/**
 * Reads an imported font file for editor preview.
 *
 * The desktop editor serves no asset URLs, so troika is handed the file as a
 * data URL over IPC. The Text keeps its catalog font until the bytes arrive,
 * which is also what happens when the Asset was deleted from disk.
 */
function useProjectFontUrl(
  fontAsset: FontAsset | undefined,
  projectPath: string | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const relativePath =
    fontAsset?.source.kind === "project" ? fontAsset.source.relativePath : null;

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!relativePath || !projectPath) {
      return () => {
        active = false;
      };
    }
    void tauri
      .readProjectFileDataUrl(projectPath, relativePath)
      .then((dataUrl) => {
        if (active) setUrl(dataUrl);
      })
      .catch(() => {
        // A missing or unreadable file leaves the catalog font in place rather
        // than blanking the caption.
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [projectPath, relativePath]);

  return url;
}

/**
 * Decodes the plate's Texture Asset for editor preview.
 *
 * The desktop editor has no served asset URLs, so the bytes come back over IPC
 * as a data URL the same way Material and Particle previews read theirs.
 */
function useBackgroundTexture(
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
          textureAsset.importSettings.colorSpace === "linear" ? "linear" : "srgb",
          "text-background",
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
  }, [gl, projectPath, textureKey]);

  return texture;
}
