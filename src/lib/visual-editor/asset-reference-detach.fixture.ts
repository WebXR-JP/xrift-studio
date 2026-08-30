import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  normalizeMaterialProperties,
  type AssetManifest,
  type MaterialAsset,
  type ModelAsset,
  type TextureAsset,
} from "./asset-manifest";
import {
  analyzeAssetDeletion,
  assetReferenceKey,
  collectAssetReferences,
  deleteAssetIfUnreferenced,
  detachAssetReferences,
} from "./asset-operations";
import { PREFAB_DOCUMENT_SCHEMA_VERSION, type PrefabDocument } from "./prefab-document";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createTransformComponent,
  type MeshComponent,
  type SceneDocument,
  type TextComponent,
  type XRiftComponent,
} from "./scene-document";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const MATERIAL_ID = "material-asset";
const TEXTURE_ID = "texture-asset";
const MODEL_ID = "model-asset";

function fixtureAssets(): AssetManifest {
  const texture: TextureAsset = {
    id: TEXTURE_ID,
    name: "Texture",
    kind: "texture",
    status: "ready",
    source: { kind: "project", relativePath: "assets/texture.png" },
  } as TextureAsset;
  const material: MaterialAsset = {
    id: MATERIAL_ID,
    name: "Material",
    kind: "material",
    status: "ready",
    source: { kind: "document" },
    properties: normalizeMaterialProperties({
      pbrMetallicRoughness: { baseColorTexture: { textureAssetId: TEXTURE_ID } },
    }),
  } as MaterialAsset;
  const model: ModelAsset = {
    id: MODEL_ID,
    name: "Model",
    kind: "model",
    status: "ready",
    source: { kind: "project", relativePath: "assets/model.glb" },
    importSettings: {
      scale: 1,
      generateColliders: false,
      optimizeMeshes: false,
      importAnimations: false,
    },
    materialSlots: [
      { slot: "slot-0", name: "Body", defaultMaterialAssetId: MATERIAL_ID },
    ],
  } as ModelAsset;
  return {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {
      [texture.id]: texture,
      [material.id]: material,
      [model.id]: model,
    },
  };
}

function fixtureScene(): SceneDocument {
  const mesh: MeshComponent = {
    id: "mesh-component",
    type: "mesh",
    enabled: true,
    geometryAssetId: MODEL_ID,
    geometry: { kind: "asset", assetId: MODEL_ID },
    materialBindings: [{ slot: "slot-0", materialAssetId: MATERIAL_ID }],
    castShadow: true,
    receiveShadow: true,
  };
  const text: TextComponent = {
    id: "text-component",
    type: "text",
    enabled: true,
    text: "Sign",
    color: "#ffffff",
    fontSize: 0.2,
    anchorX: "center",
    anchorY: "middle",
    outlineWidth: 0,
    outlineColor: "#000000",
    background: {
      mode: "texture",
      color: "#0f172a",
      opacity: 0.85,
      textureAssetId: TEXTURE_ID,
      paddingX: 0.08,
      paddingY: 0.06,
      fit: "text",
      width: 1,
      height: 0.4,
      offset: 0.005,
      doubleSided: false,
    },
  };
  const xrift: XRiftComponent = {
    id: "xrift-component",
    type: "xrift-component",
    enabled: true,
    schemaId: "xrift/Picture",
    schemaVersion: "1.0.0",
    properties: {},
    assetReferences: [TEXTURE_ID],
    entityReferences: [],
  };
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "detach-fixture-scene",
    name: "detach fixture",
    rootEntityIds: ["mesh-entity", "sign-entity"],
    entities: {
      "mesh-entity": {
        id: "mesh-entity",
        name: "Mesh Entity",
        parentId: null,
        children: [],
        enabled: true,
        components: [createTransformComponent("mesh-transform"), mesh],
      },
      "sign-entity": {
        id: "sign-entity",
        name: "Sign Entity",
        parentId: null,
        children: [],
        enabled: true,
        components: [createTransformComponent("sign-transform"), text, xrift],
      },
    },
  } as SceneDocument;
}

function fixturePrefabs(): Record<string, PrefabDocument> {
  const mesh: MeshComponent = {
    id: "prefab-mesh-component",
    type: "mesh",
    enabled: true,
    geometryAssetId: "builtin-primitive/box",
    materialBindings: [{ slot: "default", materialAssetId: MATERIAL_ID }],
    castShadow: true,
    receiveShadow: true,
  };
  return {
    "prefab-1": {
      schemaVersion: PREFAB_DOCUMENT_SCHEMA_VERSION,
      prefabId: "prefab-1",
      name: "Prefab",
      source: { sceneId: "detach-fixture-scene", rootEntityIds: [] },
      rootEntityIds: ["prefab-entity"],
      entities: {
        "prefab-entity": {
          id: "prefab-entity",
          name: "Prefab Entity",
          parentId: null,
          children: [],
          enabled: true,
          components: [createTransformComponent("prefab-transform"), mesh],
        },
      },
    } as PrefabDocument,
  };
}

function fixtureDocuments() {
  return {
    assets: fixtureAssets(),
    scene: fixtureScene(),
    prefabs: fixturePrefabs(),
  };
}

function meshOf(scene: SceneDocument, entityId: string): MeshComponent | undefined {
  return scene.entities[entityId]?.components.find(
    (component): component is MeshComponent => component.type === "mesh",
  );
}

/**
 * The delete dialog offers to unlink dependencies, so every row it lists has to
 * be one the detach can actually clear. These assertions keep the analysis and
 * the detach on the same traversal: after unlinking, the analysis must report
 * nothing left and the Asset must delete.
 */
export function runAssetReferenceDetachFixtureAssertions(): void {
  const documents = fixtureDocuments();

  // The Material is referenced from a Scene Mesh, a Prefab Mesh and a Model's
  // default slot, so deleting it is blocked with one row per use.
  const materialAnalysis = analyzeAssetDeletion(documents, MATERIAL_ID);
  assert(
    !materialAnalysis.canDelete && materialAnalysis.reason === "referenced",
    "A referenced Material was reported as deletable",
  );
  const materialKinds = materialAnalysis.references.map((reference) => reference.kind).sort();
  assert(
    JSON.stringify(materialKinds) ===
      JSON.stringify(["model-material", "prefab-material", "scene-material"]),
    `Material references were not reported per owner: ${materialKinds.join(", ")}`,
  );
  assert(
    materialAnalysis.references.every(
      (reference) => reference.detachEffect === "clear-slot",
    ),
    "Unlinking a Material slot was reported as removing the Component",
  );

  // Unlinking one row leaves the others in place, so the dialog's per-row
  // button cannot quietly clear more than the row the author pressed.
  const single = detachAssetReferences(
    documents,
    MATERIAL_ID,
    materialAnalysis.references.find(
      (reference) => reference.kind === "scene-material",
    ),
  );
  assert(single.changed, "Unlinking one Material reference changed nothing");
  assert(
    meshOf(single.scene, "mesh-entity")?.materialBindings.length === 0,
    "The Scene Mesh kept its binding to the unlinked Material",
  );
  assert(
    collectAssetReferences(
      { assets: single.assets, scene: single.scene, prefabs: single.prefabs },
      MATERIAL_ID,
    ).length === 2,
    "Unlinking one row cleared references the author did not select",
  );
  assert(
    meshOf(documents.scene, "mesh-entity")?.materialBindings.length === 1,
    "Detaching mutated the documents it was given",
  );

  // Unlinking everything is what turns a blocked delete into a delete.
  const detached = detachAssetReferences(documents, MATERIAL_ID);
  assert(
    detached.detached.length === materialAnalysis.references.length,
    "Unlinking every reference skipped a row the dialog listed",
  );
  const afterDetach = {
    assets: detached.assets,
    scene: detached.scene,
    prefabs: detached.prefabs,
  };
  assert(
    collectAssetReferences(afterDetach, MATERIAL_ID).length === 0,
    "A reference survived unlinking, so the delete stays blocked",
  );
  assert(
    detached.prefabs["prefab-1"].entities["prefab-entity"].components.length === 2,
    "Unlinking a Prefab Material slot removed the Component",
  );
  const deleted = deleteAssetIfUnreferenced(afterDetach, MATERIAL_ID);
  assert(deleted.changed, "The Asset stayed after every reference was unlinked");
  assert(
    deleted.assets.assets[MATERIAL_ID] === undefined,
    "The deleted Material is still in the manifest",
  );

  // Geometry, unlike a Material slot, cannot be emptied: the Mesh goes and the
  // Entity stays, which is what the row promises before it is pressed.
  const modelAnalysis = analyzeAssetDeletion(documents, MODEL_ID);
  assert(
    modelAnalysis.references.length === 1 &&
      modelAnalysis.references[0].detachEffect === "remove-component",
    "Unlinking a Model's Geometry was offered as emptying a slot",
  );
  const modelDetached = detachAssetReferences(documents, MODEL_ID);
  assert(
    meshOf(modelDetached.scene, "mesh-entity") === undefined,
    "The Mesh survived losing the Geometry Asset it draws",
  );
  assert(
    modelDetached.scene.entities["mesh-entity"] !== undefined,
    "Unlinking a Geometry reference deleted the Entity",
  );

  // A Texture is reached through a Material's texture slot, a Text background
  // and an XRift Component's asset list. All three are slots.
  const textureAnalysis = analyzeAssetDeletion(documents, TEXTURE_ID);
  const textureKinds = textureAnalysis.references.map((reference) => reference.kind).sort();
  assert(
    JSON.stringify(textureKinds) ===
      JSON.stringify(["material-texture", "scene-text", "scene-xrift"]),
    `Texture references were not reported per owner: ${textureKinds.join(", ")}`,
  );
  const textureDetached = detachAssetReferences(documents, TEXTURE_ID);
  const detachedMaterial = textureDetached.assets.assets[MATERIAL_ID];
  assert(
    detachedMaterial?.kind === "material" &&
      detachedMaterial.properties.pbrMetallicRoughness.baseColorTexture === undefined,
    "The Material kept a texture slot pointing at the unlinked Texture",
  );
  assert(
    collectAssetReferences(
      {
        assets: textureDetached.assets,
        scene: textureDetached.scene,
        prefabs: textureDetached.prefabs,
      },
      TEXTURE_ID,
    ).length === 0,
    "A Texture reference survived unlinking",
  );

  // Row identity has to survive a re-analysis, or the dialog's buttons would
  // target rows that moved after the previous unlink.
  const reanalyzed = analyzeAssetDeletion(documents, TEXTURE_ID);
  assert(
    JSON.stringify(reanalyzed.references.map(assetReferenceKey)) ===
      JSON.stringify(textureAnalysis.references.map(assetReferenceKey)),
    "Re-analyzing the same documents produced different reference rows",
  );
}
