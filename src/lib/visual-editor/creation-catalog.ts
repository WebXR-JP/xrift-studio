import { BUILTIN_ASSET_IDS } from "./builtin-asset-ids";
import type {
  MaterialSlotDefinition,
  PrimitiveAsset,
  PrimitiveGeometry,
} from "./asset-manifest";

export type BuiltinPrimitiveCreationDefinition = {
  /** Stable editor command ID; this is not an AssetManifest asset ID. */
  creationId: string;
  name: string;
  description: string;
  primitive: PrimitiveGeometry;
  previewColor: string;
  defaultTransform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  materialSlots: MaterialSlotDefinition[];
  castShadow: boolean;
  receiveShadow: boolean;
  /** Cards and other purely visual primitives do not need a physics shape. */
  addCollider: boolean;
  /** Texture-card presets are created from the matching Texture Inspector. */
  showInCreateMenu: boolean;
  /**
   * Builtin Material this creation is placed with.
   *
   * This used to be a shape-keyed map inside the editor shell, which meant a
   * creation could not choose its own Material and two creations of the same
   * shape could not differ. The glow cube is a box that must arrive emissive,
   * so the choice belongs to the creation rather than to its geometry.
   */
  preferredMaterialAssetId: string;
};

export const BUILTIN_PRIMITIVE_CREATION_IDS = {
  box: "builtin-primitive/box",
  sphere: "builtin-primitive/sphere",
  cylinder: "builtin-primitive/cylinder",
  cone: "builtin-primitive/cone",
  plane: "builtin-primitive/plane",
  glowCube: "builtin-primitive/glow-cube",
  backdropCard: "builtin-primitive/backdrop-card",
  grassCard: "builtin-primitive/grass-card",
} as const;

export const BUILTIN_PRIMITIVE_CREATION_CATALOG = [
  createDefinition(
    BUILTIN_PRIMITIVE_CREATION_IDS.box,
    "立方体",
    "壁、台、建物のブロックに使える基本形状",
    "box",
    "#60a5fa",
    BUILTIN_ASSET_IDS.material.blue,
  ),
  createDefinition(
    BUILTIN_PRIMITIVE_CREATION_IDS.sphere,
    "球",
    "装飾やインタラクションの目印に使える球体",
    "sphere",
    "#a78bfa",
    BUILTIN_ASSET_IDS.material.violet,
  ),
  createDefinition(
    BUILTIN_PRIMITIVE_CREATION_IDS.cylinder,
    "円柱",
    "柱や足場のベースに使える円柱",
    "cylinder",
    "#34d399",
    BUILTIN_ASSET_IDS.material.green,
  ),
  createDefinition(
    BUILTIN_PRIMITIVE_CREATION_IDS.cone,
    "円錐",
    "マーカーや屋根に使える円錐",
    "cone",
    "#fb923c",
    BUILTIN_ASSET_IDS.material.orange,
  ),
  createDefinition(
    BUILTIN_PRIMITIVE_CREATION_IDS.plane,
    "床",
    "ワールドの土台として配置できる床",
    "plane",
    "#94a3b8",
    BUILTIN_ASSET_IDS.material.slate,
  ),
  createDefinition(
    BUILTIN_PRIMITIVE_CREATION_IDS.glowCube,
    "光るキューブ",
    "Bloomで光って見えるキューブ。手軽な間接照明として置ける",
    "box",
    "#ffedd5",
    BUILTIN_ASSET_IDS.material.glow,
    {
      // Off the floor and a little smaller than a plain cube: it reads as a
      // fixture rather than a building block.
      defaultTransform: {
        position: [0, 1.6, 0],
        rotation: [0, 0, 0],
        scale: [0.6, 0.6, 0.6],
      },
      // A light source that also darkens what is behind it looks wrong, and a
      // fixture is usually placed out of reach.
      castShadow: false,
      receiveShadow: false,
      addCollider: false,
    },
  ),
  createDefinition(
    BUILTIN_PRIMITIVE_CREATION_IDS.backdropCard,
    "遠景カード",
    "半透明テクスチャを使う、遠景向けの両面カード",
    "plane",
    "#7dd3fc",
    BUILTIN_ASSET_IDS.material.slate,
    {
      defaultTransform: {
        position: [0, 5.5, -18],
        rotation: [0, 0, 0],
        scale: [20, 11, 1],
      },
      castShadow: false,
      receiveShadow: false,
      addCollider: false,
      showInCreateMenu: false,
    },
  ),
  createDefinition(
    BUILTIN_PRIMITIVE_CREATION_IDS.grassCard,
    "草カード",
    "半透明テクスチャを使う、草や花向けの両面カード",
    "plane",
    "#86efac",
    BUILTIN_ASSET_IDS.material.green,
    {
      defaultTransform: {
        position: [0, 1.2, 0],
        rotation: [0, 0, 0],
        scale: [1.5, 2.4, 1],
      },
      castShadow: false,
      receiveShadow: false,
      addCollider: false,
      showInCreateMenu: false,
    },
  ),
] satisfies readonly BuiltinPrimitiveCreationDefinition[];

export function getBuiltinPrimitiveCreation(
  creationId: string,
): BuiltinPrimitiveCreationDefinition | undefined {
  return BUILTIN_PRIMITIVE_CREATION_CATALOG.find(
    (definition) => definition.creationId === creationId,
  );
}

/**
 * Compatibility adapter for documents created before the creation catalog. New saved projects should
 * keep builtins in the creation catalog and only store the resulting Mesh.
 */
export function toLegacyPrimitiveAsset(
  definition: BuiltinPrimitiveCreationDefinition,
  legacyAssetId: string,
  defaultMaterialAssetId: string,
): PrimitiveAsset {
  return {
    id: legacyAssetId,
    name: definition.name,
    kind: "primitive",
    status: "ready",
    source: { kind: "builtin", key: definition.creationId },
    primitive: definition.primitive,
    defaultMaterialAssetId,
    materialSlots: definition.materialSlots.map((slot) => ({
      ...slot,
      defaultMaterialAssetId,
    })),
  };
}

function createDefinition(
  creationId: string,
  name: string,
  description: string,
  primitive: PrimitiveGeometry,
  previewColor: string,
  preferredMaterialAssetId: string,
  options: Partial<
    Pick<
      BuiltinPrimitiveCreationDefinition,
      | "defaultTransform"
      | "castShadow"
      | "receiveShadow"
      | "addCollider"
      | "showInCreateMenu"
    >
  > = {},
): BuiltinPrimitiveCreationDefinition {
  const isPlane = primitive === "plane";
  return {
    creationId,
    name,
    description,
    primitive,
    previewColor,
    preferredMaterialAssetId,
    defaultTransform:
      options.defaultTransform ??
      (isPlane
        ? {
            position: [0, 0, 0],
            rotation: [-Math.PI / 2, 0, 0],
            scale: [6, 6, 6],
          }
        : {
            position: [0, 0.5, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          }),
    materialSlots: [{ slot: "default", name: "Default" }],
    castShadow: options.castShadow ?? !isPlane,
    receiveShadow: options.receiveShadow ?? true,
    addCollider: options.addCollider ?? true,
    showInCreateMenu: options.showInCreateMenu ?? true,
  };
}
