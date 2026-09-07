import { useEffect, useMemo, useState } from "react";

import { XriftTextPanel } from "../../../packages/xrift-studio-runtime/src/script/text-panel";
import type { XriftTextPanelConfig } from "../../../packages/xrift-studio-runtime/src/text-panel-layout";
import type {
  AssetManifest,
  FontAsset,
  TextComponent,
} from "../../lib/visual-editor";
import { tauri } from "../../lib/tauri";
import { useProjectTexture } from "./use-project-texture";

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
  // The plate's picture is read through the same hook the Image quad uses, so
  // a KTX2 background or a linear colour space is honoured on both.
  const map = useProjectTexture(
    textureAsset?.kind === "texture" ? textureAsset : undefined,
    projectPath,
    "text-background",
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

  return (
    <XriftTextPanel config={config} map={map} componentId={component.id} />
  );
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
