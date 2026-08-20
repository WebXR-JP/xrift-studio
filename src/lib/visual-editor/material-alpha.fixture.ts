import {
  materialAlphaRenderProps,
  materialBlendingConstant,
  materialIsTransparent,
  materialWritesDepth,
  normalizeMaterialProperties,
  MATERIAL_BLEND_MODES,
} from "./asset-manifest";
import {
  SCENE_DOCUMENT_SCHEMA_VERSION,
  createTransformComponent,
  updateMeshVisibilitySettings,
  type MeshComponent,
  type SceneDocument,
} from "./scene-document";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sceneWithMesh(): SceneDocument {
  const mesh: MeshComponent = {
    id: "mesh-component",
    type: "mesh",
    enabled: true,
    geometryAssetId: "builtin-primitive/box",
    materialBindings: [],
    castShadow: true,
    receiveShadow: true,
  };
  return {
    schemaVersion: SCENE_DOCUMENT_SCHEMA_VERSION,
    sceneId: "alpha-fixture-scene",
    name: "fixture",
    rootEntityIds: ["mesh-entity"],
    entities: {
      "mesh-entity": {
        id: "mesh-entity",
        name: "mesh-entity",
        parentId: null,
        children: [],
        enabled: true,
        components: [createTransformComponent("mesh-transform"), mesh],
      },
    },
  } as SceneDocument;
}

function meshOf(scene: SceneDocument): MeshComponent | undefined {
  return scene.entities["mesh-entity"]?.components.find(
    (component): component is MeshComponent => component.type === "mesh",
  );
}

/** Deterministic assertions for the Material alpha and blending contract. */
export function runMaterialAlphaFixtureAssertions(): void {
  // A new Material is opaque and blends normally, so nothing about the defaults
  // pushes a surface into the transparent pass it does not need.
  const base = normalizeMaterialProperties({});
  assert(base.blending === "normal", "A new Material does not blend normally");
  assert(base.depthWrite === "auto", "A new Material overrides depth write");
  assert(
    base.alphaToCoverage === false,
    "A new Material resolves cutouts through MSAA",
  );
  const opaque = materialAlphaRenderProps(base);
  assert(!opaque.transparent, "An opaque Material was sent to the blend pass");
  assert(opaque.depthWrite, "An opaque Material stopped writing depth");
  assert(opaque.alphaTest === 0, "An opaque Material clips fragments");

  // A blend mode other than normal only does anything in the transparent pass.
  // Drawn opaquely, an additive surface simply covers what is behind it, which
  // is the opposite of what the author asked for.
  for (const blending of MATERIAL_BLEND_MODES) {
    const properties = normalizeMaterialProperties({ blending });
    assert(
      properties.blending === blending,
      `Blend mode ${blending} did not survive normalization`,
    );
    assert(
      materialIsTransparent(properties) === (blending !== "normal"),
      `Blend mode ${blending} resolved to the wrong pass`,
    );
  }

  // MASK is the only mode that clips. A cutoff carried into BLEND would punch
  // holes the author never asked for.
  const masked = normalizeMaterialProperties({
    alphaMode: "MASK",
    alphaCutoff: 0.3,
  });
  assert(
    materialAlphaRenderProps(masked).alphaTest === 0.3,
    "A MASK Material did not clip at its cutoff",
  );
  const blended = normalizeMaterialProperties({
    alphaMode: "BLEND",
    alphaCutoff: 0.3,
  });
  assert(
    materialAlphaRenderProps(blended).alphaTest === 0,
    "A BLEND Material clipped at the MASK cutoff",
  );

  // Depth write: auto follows the alpha mode, and an explicit choice wins over
  // it — which is the whole reason the override exists.
  assert(
    materialWritesDepth({ alphaMode: "OPAQUE", depthWrite: "auto" }),
    "An opaque Material stopped writing depth on auto",
  );
  assert(
    !materialWritesDepth({ alphaMode: "BLEND", depthWrite: "auto" }),
    "A blended Material wrote depth on auto",
  );
  assert(
    materialWritesDepth({ alphaMode: "BLEND", depthWrite: "on" }),
    "An explicit depth write was ignored on a blended Material",
  );
  assert(
    !materialWritesDepth({ alphaMode: "OPAQUE", depthWrite: "off" }),
    "An explicit depth write was ignored on an opaque Material",
  );

  // The constant names are what both the editor lookup and the emitted world
  // are keyed on, so a rename here silently breaks one of them.
  assert(
    materialBlendingConstant("normal") === "NormalBlending" &&
      materialBlendingConstant("additive") === "AdditiveBlending" &&
      materialBlendingConstant("multiply") === "MultiplyBlending" &&
      materialBlendingConstant("subtractive") === "SubtractiveBlending",
    "A blend mode resolved to a three.js constant that does not exist",
  );

  // Draw order lives on the Mesh, not the Material: three carries it per
  // object, so two Entities sharing one Material can still need opposite order.
  // Zero is the renderer's own sorting, so it is stored as absent rather than
  // as a key that means nothing.
  const meshScene = sceneWithMesh();
  const ordered = updateMeshVisibilitySettings(
    meshScene,
    "mesh-entity",
    { renderOrder: 12 },
  );
  assert(
    meshOf(ordered)?.renderOrder === 12,
    "An authored draw order did not reach the Mesh",
  );
  const cleared = updateMeshVisibilitySettings(ordered, "mesh-entity", {
    renderOrder: null,
  });
  assert(
    meshOf(cleared)?.renderOrder === undefined,
    "Clearing the draw order left a value behind",
  );
  const zeroed = updateMeshVisibilitySettings(ordered, "mesh-entity", {
    renderOrder: 0,
  });
  assert(
    meshOf(zeroed)?.renderOrder === undefined,
    "Zero was stored as a draw order instead of meaning automatic",
  );
  const rejected = updateMeshVisibilitySettings(ordered, "mesh-entity", {
    renderOrder: 5000,
  });
  assert(
    meshOf(rejected)?.renderOrder === 12,
    "A draw order beyond the limit was accepted",
  );
  const fractional = updateMeshVisibilitySettings(ordered, "mesh-entity", {
    renderOrder: 1.5,
  });
  assert(
    meshOf(fractional)?.renderOrder === 12,
    "A fractional draw order was accepted",
  );

  // A Material saved before these fields existed still loads, and loads inert.
  const legacy = normalizeMaterialProperties({
    alphaMode: "BLEND",
  });
  assert(
    legacy.blending === "normal" && legacy.depthWrite === "auto",
    "A Material without the new fields did not fall back to inert values",
  );
}
