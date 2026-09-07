import {
  DEFAULT_IMAGE_QUAD_CONFIG,
  resolveImageQuadPlate,
} from "../../../packages/xrift-studio-runtime/src/image-quad-layout";
import {
  createTextureAsset,
  type AssetManifest,
  type TextureAsset,
} from "./asset-manifest";
import { collectAssetReferences, detachAssetReferences } from "./asset-operations";
import { instantiateSceneAsset, isScenePlaceableAsset } from "./asset-placement";
import { compileVisualProject } from "./compiler/compile";
import {
  IMAGE_QUAD_LAYOUT_OVERLAY_PATH,
  IMAGE_QUAD_OBJECT_OVERLAY_PATH,
  IMAGE_QUAD_RUNTIME_OVERLAY_PATH,
  IMAGE_RUNTIME_OVERLAY_PATH,
  TEXT_RUNTIME_OVERLAY_PATH,
} from "./compiler/script-emit";
import type { VisualCompilerDocuments } from "./compiler/types";
import { addEditorComponent, createEmptyEntity } from "./editor-session";
import { collectInteractionTriggerTargets } from "./interaction-trigger-targets";
import {
  addDefaultInteractivityAsset,
  updateInteractivityAsset,
} from "./interactivity-graph";
import { createInteractionTriggerGraphExtension } from "./interactivity-recipes";
import { createPrototypeProject } from "./prototype-project";
import {
  createImageComponent,
  createInteractionTriggerComponent,
  updateImageComponent,
  type ImageComponent,
  type SceneDocument,
} from "./scene-document";

/**
 * Assertions for the Image component: creation, placement, patches, layout,
 * emission and the runtime bridges around it.
 *
 * Four surfaces draw a picture (editor viewport, Play, published runtime,
 * generated Classic source) from the same document fields, so the risk worth
 * covering is a patch, a placement or a compile step quietly dropping one.
 */
export function runImageComponentFixtureAssertions(): void {
  assertImageArrivesReadyToUse();
  assertTexturePlacesAsImageEntity();
  assertPatchesRejectUnusableValues();
  assertQuadLayoutFollowsPicture();
  assertCompilerEmitsQuadRuntime();
  assertRuntimeManifestCarriesImage();
  assertTriggerWorldCarriesBridges();
  assertDeletingThePictureDetachesIt();
  assertTriggerTargetsOfferImage();
}

function assertImageArrivesReadyToUse(): void {
  const prototype = createPrototypeProject("world", "image-fixture");
  const assets = withPictures(prototype.assets);
  const created = requireEntity(createEmptyEntity(prototype.scene, null, "Frame"));

  const bare = addEditorComponent(
    created.scene,
    assets,
    created.entityId,
    "core.image",
    "world",
  );
  assert(bare.added, "the Image entry must create a component without a picture");
  const bareImage = findImage(bare.scene, created.entityId);
  assert(
    bareImage.textureAssetId === undefined &&
      bareImage.width === DEFAULT_IMAGE_QUAD_CONFIG.width &&
      bareImage.height === undefined &&
      bareImage.alphaMode === "cutout" &&
      bareImage.lit === false,
    "a bare Image must arrive one unit wide, aspect-fitted, cut out and unlit",
  );

  // Add Component right after selecting a picture in Assets puts that picture
  // up: the selection is the Asset the author has in hand.
  const preferred = addEditorComponent(
    created.scene,
    assets,
    created.entityId,
    "core.image",
    "world",
    PICTURE_ASSET_ID,
  );
  assert(
    findImage(preferred.scene, created.entityId).textureAssetId === PICTURE_ASSET_ID,
    "a selected picture Texture must become the Image's picture",
  );

  // A sky is not a picture: a selected environment Texture is ignored rather
  // than drawn as a squashed panorama.
  const sky = addEditorComponent(
    created.scene,
    assets,
    created.entityId,
    "core.image",
    "world",
    SKY_ASSET_ID,
  );
  assert(
    findImage(sky.scene, created.entityId).textureAssetId === undefined,
    "a selected environment Texture must not become an Image's picture",
  );

  assert(
    createImageComponent("image-empty", { width: 0, opacity: 4 })?.width ===
      DEFAULT_IMAGE_QUAD_CONFIG.width,
    "an unusable width on creation must fall back to the default",
  );
  assert(
    createImageComponent("image-empty", { opacity: 4 })?.opacity === 1,
    "an opacity above one on creation must clamp",
  );
}

function assertTexturePlacesAsImageEntity(): void {
  const prototype = createPrototypeProject("world", "image-place-fixture");
  const assets = withPictures(prototype.assets);
  assert(
    isScenePlaceableAsset(assets.assets[PICTURE_ASSET_ID]),
    "a picture Texture must be placeable into the Scene",
  );
  assert(
    !isScenePlaceableAsset(assets.assets[SKY_ASSET_ID]),
    "an environment Texture must keep its Skybox drop target instead",
  );

  const placed = instantiateSceneAsset(
    prototype.scene,
    assets,
    prototype.prefabs,
    PICTURE_ASSET_ID,
    { position: [1, 1.5, -2] },
  );
  assert(placed.placed, "placing a picture Texture must create an Entity");
  if (!placed.placed) return;
  assert(placed.assetKind === "texture", "the placement must report the Texture kind");
  const entity = placed.scene.entities[placed.entityId];
  assert(
    entity?.name === "poster" && placed.scene.rootEntityIds.includes(placed.entityId),
    "the placed Entity must carry the picture's name at Scene root",
  );
  const image = findImage(placed.scene, placed.entityId);
  assert(
    image.textureAssetId === PICTURE_ASSET_ID && image.height === undefined,
    "the placed Image must show the dropped picture at its own aspect ratio",
  );
  const transform = entity.components.find((component) => component.type === "transform");
  assert(
    transform?.type === "transform" &&
      transform.position[0] === 1 &&
      transform.position[1] === 1.5 &&
      transform.position[2] === -2,
    "the placed Image must land at the drop position",
  );

  const skyPlacement = instantiateSceneAsset(
    prototype.scene,
    assets,
    prototype.prefabs,
    SKY_ASSET_ID,
  );
  assert(
    !skyPlacement.placed && skyPlacement.reason === "unsupported-kind",
    "placing an environment Texture must be refused",
  );
}

function assertPatchesRejectUnusableValues(): void {
  const prototype = createPrototypeProject("world", "image-patch-fixture");
  const created = requireEntity(createEmptyEntity(prototype.scene, null, "Frame"));
  const added = addEditorComponent(
    created.scene,
    prototype.assets,
    created.entityId,
    "core.image",
    "world",
  );
  const entityId = created.entityId;
  const base = added.scene;

  for (const [label, patch] of [
    ["a zero width", { width: 0 }],
    ["a negative height", { height: -1 }],
    ["an opacity above one", { opacity: 1.5 }],
    ["an unknown anchor", { anchorX: "middle" as never }],
    ["an unknown alpha mode", { alphaMode: "opaque" as never }],
    ["a non-boolean flag", { lit: "yes" as never }],
    ["an empty colour", { color: " " }],
  ] as const) {
    assert(
      updateImageComponent(base, entityId, patch) === base,
      `${label} must leave the Scene untouched`,
    );
  }

  const withPicture = updateImageComponent(base, entityId, {
    textureAssetId: PICTURE_ASSET_ID,
    width: 2,
    height: 0.5,
  });
  const stored = findImage(withPicture, entityId);
  assert(
    stored.textureAssetId === PICTURE_ASSET_ID && stored.width === 2 && stored.height === 0.5,
    "a valid patch must be stored",
  );
  assert(
    updateImageComponent(withPicture, entityId, { width: 2 }) === withPicture,
    "a patch that changes nothing must not produce a new Scene revision",
  );

  // `null` is「画像に合わせる」: the absence of a height, not a height.
  const fitted = updateImageComponent(withPicture, entityId, { height: null });
  assert(
    findImage(fitted, entityId).height === undefined,
    "a null height must put the picture back on its own aspect ratio",
  );
  // An empty id is how the Inspector says「画像を外す」.
  const cleared = updateImageComponent(fitted, entityId, { textureAssetId: "" });
  assert(
    findImage(cleared, entityId).textureAssetId === undefined,
    "an empty Texture id must clear the picture rather than store an empty string",
  );
}

function assertQuadLayoutFollowsPicture(): void {
  const base = { ...DEFAULT_IMAGE_QUAD_CONFIG, width: 2 };
  const landscape = resolveImageQuadPlate(base, 2);
  assert(
    landscape.width === 2 && landscape.height === 1,
    "an aspect-fitted quad must derive its height from the picture",
  );
  assert(
    landscape.centerX === 0 && landscape.centerY === 0,
    "a centred quad must sit on the Entity origin",
  );
  const fixed = resolveImageQuadPlate({ ...base, height: 3 }, 2);
  assert(fixed.height === 3, "an authored height must win over the picture's aspect");
  const unknown = resolveImageQuadPlate(base, null);
  assert(
    unknown.height === 2,
    "with no picture to measure the quad must be square rather than a guess",
  );
  const anchored = resolveImageQuadPlate(
    { ...base, anchorX: "left", anchorY: "bottom" },
    1,
  );
  assert(
    anchored.centerX === 1 && anchored.centerY === 1,
    "a left / bottom anchor must push the quad up and to the right of the origin",
  );
}

function assertCompilerEmitsQuadRuntime(): void {
  const documents = imageFixtureDocuments();
  const compiled = compileVisualProject(documents, {
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert(compiled.canStage, "an Image world must be stageable");
  const source =
    compiled.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
    source.includes("<XriftImageQuad") &&
      source.includes('from "./xrift-studio/image-quad-runtime"'),
    "Image must compile to the shared quad runtime",
  );
  assert(
    source.includes("map={imageQuadMap}"),
    "the picture must compile to a loaded map",
  );
  for (const path of [
    IMAGE_QUAD_RUNTIME_OVERLAY_PATH,
    IMAGE_QUAD_OBJECT_OVERLAY_PATH,
    IMAGE_QUAD_LAYOUT_OVERLAY_PATH,
    IMAGE_RUNTIME_OVERLAY_PATH,
  ]) {
    const file = compiled.overlayFiles.find((entry) => entry.relativePath === path);
    assert(file !== undefined, `the staged project must include ${path}`);
    assert(
      !/from\s*["']\.{1,2}\/[a-z-]+\.js["']/.test(file.content),
      `${path} must not keep NodeNext .js specifiers the staged build cannot resolve`,
    );
  }
  assert(
    compiled.assetCopyPlan.some((entry) => entry.assetId === PICTURE_ASSET_ID),
    "the picture must be copied into the published world",
  );
  assert(
    !compiled.diagnostics.some((diagnostic) => diagnostic.code.startsWith("image-")),
    "a resolvable picture must compile without an Image diagnostic",
  );

  // A frame with nothing in it ships as the tinted quad the editor showed,
  // and says so, rather than vanishing.
  const empty = compileVisualProject(imageFixtureDocuments({ textureAssetId: "" }), {
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  const emptySource =
    empty.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
    emptySource.includes("<XriftImageQuad") && !emptySource.includes("map={imageQuadMap}"),
    "an Image without a picture must still compile to its quad, with no map",
  );
  assert(
    empty.diagnostics.some((diagnostic) => diagnostic.code === "image-texture-unset"),
    "an Image without a picture must be reported",
  );
}

function assertRuntimeManifestCarriesImage(): void {
  const compiled = compileVisualProject(imageFixtureDocuments(), {
    generatedAt: "2026-01-01T00:00:00.000Z",
    outputMode: "classic-runtime",
  });
  const manifest = compiled.runtimeManifestFile?.content ?? "";
  assert(manifest.length > 0, "a runtime world must emit a manifest");
  const parsed = JSON.parse(manifest) as {
    scenes: Record<string, { entities: Record<string, { components: unknown[] }> }>;
    assets: Record<string, { kind: string }>;
  };
  const components = Object.values(parsed.scenes)
    .flatMap((scene) => Object.values(scene.entities))
    .flatMap((entity) => entity.components) as Array<Record<string, unknown>>;
  const image = components.find((component) => component.type === "image");
  assert(image !== undefined, "the runtime manifest must carry the Image component");
  assert(
    image.textureAssetId === PICTURE_ASSET_ID &&
      image.width === 1.5 &&
      image.height === undefined &&
      image.alphaMode === "cutout",
    "the runtime manifest must carry the picture reference and the authored size",
  );
  assert(
    parsed.assets[PICTURE_ASSET_ID]?.kind === "texture",
    "the runtime manifest must publish the picture the Image points at",
  );
}

/**
 * The trigger runtime imports the Text and Image bridges unconditionally, so a
 * world with a graph and no Text or Image has to carry both modules or its
 * staged build fails on a missing import.
 */
function assertTriggerWorldCarriesBridges(): void {
  const prototype = createPrototypeProject("world", "image-trigger-fixture");
  const created = requireEntity(createEmptyEntity(prototype.scene, null, "Button"));
  const graphId = "image-fixture-graph";
  const added = addDefaultInteractivityAsset(prototype.assets, {
    id: graphId,
    name: "Button graph",
    folderId: null,
  });
  assert(added.added, "the fixture graph could not be created");
  const assets = updateInteractivityAsset(
    added.manifest,
    graphId,
    createInteractionTriggerGraphExtension(),
  );
  const trigger = createInteractionTriggerComponent("image-fixture-trigger", graphId);
  assert(trigger !== null, "the fixture trigger could not be created");
  const entity = created.scene.entities[created.entityId];
  const scene: SceneDocument = {
    ...created.scene,
    entities: {
      ...created.scene.entities,
      [created.entityId]: {
        ...entity,
        components: [...entity.components, trigger],
      },
    },
  };
  const compiled = compileVisualProject(
    {
      project: prototype.project,
      scenes: { [scene.sceneId]: scene },
      assets,
      prefabs: prototype.prefabs,
    },
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );
  for (const path of [TEXT_RUNTIME_OVERLAY_PATH, IMAGE_RUNTIME_OVERLAY_PATH]) {
    assert(
      compiled.overlayFiles.some((file) => file.relativePath === path),
      `a world with a graph and no Text or Image must still ship ${path}`,
    );
  }
  assert(
    !compiled.overlayFiles.some(
      (file) => file.relativePath === IMAGE_QUAD_RUNTIME_OVERLAY_PATH,
    ),
    "a world without an Image must not ship the quad renderer",
  );
}

function assertDeletingThePictureDetachesIt(): void {
  const documents = imageFixtureDocuments();
  const scene = Object.values(documents.scenes)[0]!;
  const bundle = {
    assets: documents.assets,
    scene,
    prefabs: documents.prefabs ?? {},
  };
  const references = collectAssetReferences(bundle, PICTURE_ASSET_ID);
  assert(
    references.length === 1,
    "an Image must count as one reference to its picture, so the delete is blocked",
  );
  const detached = detachAssetReferences(bundle, PICTURE_ASSET_ID);
  assert(detached.changed, "detaching the picture must change the Scene");
  const entityId = Object.keys(detached.scene.entities).find((id) =>
    detached.scene.entities[id]?.components.some((component) => component.type === "image"),
  );
  assert(entityId !== undefined, "detaching must keep the Image component");
  assert(
    findImage(detached.scene, entityId).textureAssetId === undefined,
    "detaching must clear the picture rather than remove the Image",
  );
  assert(
    collectAssetReferences(
      { assets: detached.assets, scene: detached.scene, prefabs: detached.prefabs },
      PICTURE_ASSET_ID,
    ).length === 0,
    "no reference may survive detaching",
  );
}

function assertTriggerTargetsOfferImage(): void {
  const documents = imageFixtureDocuments();
  const scene = Object.values(documents.scenes)[0]!;
  const targets = collectInteractionTriggerTargets(scene, documents.assets);
  const frame = targets.find((target) => target.name === "Frame");
  const image = frame?.components.find((component) => component.targetKind === "image");
  assert(Boolean(image), "the Image Component is not offered as a trigger target");
  for (const name of ["enabled", "color", "opacity"]) {
    assert(
      image!.properties.some((property) => property.name === name),
      `the Image target does not offer ${name}`,
    );
  }
  assert(
    !image!.properties.some((property) => property.kind === "asset"),
    "the Image target must not offer a picture swap until every surface can load one",
  );
}

const PICTURE_ASSET_ID = "image-fixture-poster";
const SKY_ASSET_ID = "image-fixture-sky";

/** A one-Entity world whose Image shows a project picture. */
function imageFixtureDocuments(
  overrides: { textureAssetId?: string } = {},
): VisualCompilerDocuments {
  const prototype = createPrototypeProject("world", "image-compile-fixture");
  const created = requireEntity(createEmptyEntity(prototype.scene, null, "Frame"));
  const added = addEditorComponent(
    created.scene,
    prototype.assets,
    created.entityId,
    "core.image",
    "world",
  );
  const scene = updateImageComponent(added.scene, created.entityId, {
    textureAssetId: overrides.textureAssetId ?? PICTURE_ASSET_ID,
    width: 1.5,
  });
  return {
    project: prototype.project,
    scenes: { [scene.sceneId]: scene },
    assets: withPictures(prototype.assets),
    prefabs: prototype.prefabs,
  };
}

function withPictures(assets: AssetManifest): AssetManifest {
  const poster = createTextureAsset({
    id: PICTURE_ASSET_ID,
    name: "poster",
    source: { kind: "project", relativePath: "textures/poster.png" },
    importSettings: {},
  });
  const sky = createTextureAsset({
    id: SKY_ASSET_ID,
    name: "sky",
    source: { kind: "project", relativePath: "textures/sky.png" },
    importSettings: {},
  });
  if (!poster || !sky) throw new Error("the fixture Textures could not be created");
  const posterAsset: TextureAsset = { ...poster, status: "ready" };
  const skyAsset: TextureAsset = {
    ...sky,
    status: "ready",
    usage: "environment",
    projection: "equirectangular",
  };
  return {
    ...assets,
    assets: { ...assets.assets, [posterAsset.id]: posterAsset, [skyAsset.id]: skyAsset },
  };
}

function requireEntity(
  result: ReturnType<typeof createEmptyEntity>,
): NonNullable<ReturnType<typeof createEmptyEntity>> {
  if (!result) throw new Error("the fixture Entity could not be created");
  return result;
}

function findImage(scene: SceneDocument, entityId: string): ImageComponent {
  const entity = scene.entities[entityId];
  const component = entity?.components.find(
    (candidate): candidate is ImageComponent => candidate.type === "image",
  );
  if (!component) throw new Error(`No Image component on Entity ${entityId}`);
  return component;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
