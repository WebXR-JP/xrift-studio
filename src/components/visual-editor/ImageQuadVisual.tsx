import { useMemo } from "react";

import { XriftImageQuad } from "../../../packages/xrift-studio-runtime/src/script/image-quad";
import type { XriftImageQuadConfig } from "../../../packages/xrift-studio-runtime/src/image-quad-layout";
import type { AssetManifest, ImageComponent } from "../../lib/visual-editor";
import { useProjectTexture } from "./use-project-texture";

/**
 * Draws an Image component in the editor viewport through the same runtime
 * object the published world uses, so a gallery picture is the same size and
 * shape while editing and after upload.
 */
export function ImageQuadVisual({
  component,
  assets,
  projectPath,
}: {
  component: ImageComponent;
  assets: AssetManifest;
  projectPath?: string;
}) {
  const textureAsset = component.textureAssetId
    ? assets.assets[component.textureAssetId]
    : undefined;
  const map = useProjectTexture(
    textureAsset?.kind === "texture" ? textureAsset : undefined,
    projectPath,
    "image",
  );

  const config = useMemo<XriftImageQuadConfig>(
    () => ({
      width: component.width,
      ...(component.height === undefined ? {} : { height: component.height }),
      anchorX: component.anchorX,
      anchorY: component.anchorY,
      color: component.color,
      opacity: component.opacity,
      alphaMode: component.alphaMode,
      doubleSided: component.doubleSided,
      lit: component.lit,
    }),
    [component],
  );

  return (
    <XriftImageQuad
      config={config}
      map={map}
      // A chosen picture that has not decoded yet keeps the quad hidden
      // rather than flashing a square; a missing Asset is drawn as the
      // tinted plate the Inspector warns about.
      awaitingMap={textureAsset?.kind === "texture"}
      componentId={component.id}
    />
  );
}
