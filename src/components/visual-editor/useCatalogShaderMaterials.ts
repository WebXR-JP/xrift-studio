import { useEffect, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { resolveClassicShaderVariant } from "../../../packages/xrift-studio-runtime/src/classic-shader-contract";
import { advanceMaterialTimeUniforms } from "../../../packages/xrift-studio-runtime/src/shader-time";
import { catalogMaterialTextures } from "../../lib/visual-editor/catalog-material-dependencies";
import { catalogPublicAssetUrl } from "../../lib/visual-editor/catalog-public-url";
import type { ClassicR3fMaterialShader } from "../../lib/visual-editor/custom-shader-contract";
import { getFoliageMaterialAsset } from "../../lib/visual-editor/foliage-shader-catalog";
import type { ResolvedSceneLighting } from "../../lib/visual-editor/lighting-contract";
import type { ResolvedWind } from "../../lib/visual-editor/wind-contract";
import { useCatalogPreviewAssetLoad } from "./CatalogPreviewFrame";
import { createClassicR3fMaterial } from "./ProjectModelVisual";
import {
  applyLightingDrivenUniforms,
  applyWindDrivenUniforms,
} from "./scene-driven-uniforms";

/**
 * The Custom Shader a catalog Material carries, when it is one.
 *
 * A PBR catalog Material is one three.js material for a whole model
 * (`useCatalogMaterial`). A Custom Shader Material picks a variant per mesh
 * name, so a card has to build it the way the Scene View does.
 */
export function getCatalogShaderMaterial(
  materialAssetId: string | undefined,
): ClassicR3fMaterialShader | undefined {
  const shader = materialAssetId
    ? getFoliageMaterialAsset(materialAssetId)?.shader
    : undefined;
  return shader?.kind === "classic-r3f" ? shader : undefined;
}

export type CatalogShaderMaterials = {
  /** The Material the mesh of this name wears: one per variant, shared. */
  forMesh: (meshName: string) => THREE.ShaderMaterial;
};

/**
 * Builds a catalog Custom Shader Material for a card, with its bundled
 * pictures read straight from the app, lit by the card's own light and blown
 * by the wind a new Scene starts with.
 *
 * Returns null until every picture has loaded: a Material built before that
 * would keep drawing without them.
 */
export function useCatalogShaderMaterials(
  materialAssetId: string | undefined,
  lighting: ResolvedSceneLighting,
  wind: ResolvedWind,
): CatalogShaderMaterials | null {
  const shader = useMemo(() => getCatalogShaderMaterial(materialAssetId), [materialAssetId]);
  const trackLoad = useCatalogPreviewAssetLoad();
  const [textures, setTextures] = useState<Record<string, THREE.Texture> | null>(null);

  useEffect(() => {
    setTextures(null);
    if (!shader) return;
    let cancelled = false;
    const definitions = catalogMaterialTextures({ shader });
    const loaded: Record<string, THREE.Texture> = {};
    const pending: THREE.Texture[] = [];
    const finishes: Array<(success?: boolean) => void> = [];
    let remaining = definitions.length;
    if (remaining === 0) setTextures(loaded);
    for (const definition of definitions) {
      const finish = trackLoad();
      finishes.push(finish);
      pending.push(new THREE.TextureLoader().load(
        `${catalogPublicAssetUrl(definition.publicPath)}?v=${definition.sha256.slice(0, 12)}`,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          loaded[definition.assetId] = texture;
          remaining -= 1;
          // Before the load is reported finished, so the card never sees a
          // moment with nothing left to wait for and no Material yet.
          if (remaining === 0) setTextures(loaded);
          finish();
        },
        undefined,
        () => {
          if (!cancelled) finish(false);
        },
      ));
    }
    return () => {
      cancelled = true;
      finishes.forEach((finish) => finish());
      pending.forEach((texture) => texture.dispose());
    };
  }, [shader, trackLoad]);

  const materials = useMemo(() => {
    if (!shader || !textures) return null;
    const byVariant = new Map<number, THREE.ShaderMaterial>();
    const forMesh = (meshName: string) => {
      const variant = resolveClassicShaderVariant(shader, meshName);
      const key = variant ? shader.variants.indexOf(variant) : -1;
      const existing = byVariant.get(key);
      if (existing) return existing;
      const material = createClassicR3fMaterial(shader, textures, meshName);
      applyLightingDrivenUniforms(material, shader, lighting);
      applyWindDrivenUniforms(material, shader, wind);
      byVariant.set(key, material);
      return material;
    };
    return { forMesh, byVariant };
  }, [lighting, shader, textures, wind]);

  useEffect(() => {
    if (!materials) return;
    return () => {
      for (const material of materials.byVariant.values()) material.dispose();
    };
  }, [materials]);

  useFrame((state) => {
    if (!materials) return;
    const elapsed = state.clock.getElapsedTime();
    for (const material of materials.byVariant.values()) {
      advanceMaterialTimeUniforms(material, elapsed);
    }
  });

  return materials;
}
