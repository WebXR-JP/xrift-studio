import {
  createTextureAsset,
  type AssetManifest,
  type TextureAsset,
} from "./asset-manifest";
import { compileVisualProject } from "./compiler/compile";
import {
  TEXT_FONT_CATALOG_OVERLAY_PATH,
  TEXT_PANEL_LAYOUT_OVERLAY_PATH,
  TEXT_PANEL_OBJECT_OVERLAY_PATH,
  TEXT_PANEL_RUNTIME_OVERLAY_PATH,
  TEXT_PANEL_RUNTIME_PACKAGE,
} from "./compiler/script-emit";
import { isAllowedCompilerRuntimePackage } from "../xrift-cli";
import type { VisualCompilerDocuments } from "./compiler/types";
import { addEditorComponent, createEmptyEntity } from "./editor-session";
import { createPrototypeProject } from "./prototype-project";
import {
  DEFAULT_TEXT_BACKGROUND,
  createTextComponent,
  updateTextComponent,
  type SceneDocument,
  type TextComponent,
} from "./scene-document";

/**
 * Assertions for the Text component's fonts, background plate and emission.
 *
 * The three surfaces that draw text (editor viewport, published runtime,
 * generated Classic source) read the same document fields, so the risk worth
 * covering is a patch or a compile step quietly dropping one of them.
 */
export function runTextComponentFixtureAssertions(): void {
  assertPresetsCreateReadyToUseText();
  assertPatchesRejectUnusableValues();
  assertCompilerEmitsPanelRuntime();
  assertRuntimeManifestCarriesBackground();
}

function assertPresetsCreateReadyToUseText(): void {
  const prototype = createPrototypeProject("world", "text-fixture");
  const created = requireEntity(createEmptyEntity(prototype.scene, null, "Sign"));
  const panel = addEditorComponent(
    created.scene,
    prototype.assets,
    created.entityId,
    "core.text.panel",
    "world",
  );
  assert(panel.added, "the Text Panel entry must create a component");
  const panelText = findText(panel.scene, created.entityId);
  assert(
    panelText.background?.mode === "color",
    "the Text Panel preset must arrive with a plate behind the words",
  );
  assert(
    panelText.fontId === "noto-sans-jp" && panelText.fontWeight === 700,
    "the Text Panel preset must arrive with a bold Japanese face selected",
  );

  const caption = addEditorComponent(
    created.scene,
    prototype.assets,
    created.entityId,
    "core.text.caption",
    "world",
  );
  const captionText = findText(caption.scene, created.entityId);
  assert(
    captionText.anchorX === "left" && captionText.textAlign === "left",
    "the caption preset must be left aligned for a wall label",
  );
  assert(
    captionText.background?.opacity === 1,
    "the caption plate must be opaque so small type stays readable",
  );

  const plain = createTextComponent("text-plain");
  assert(
    plain !== null &&
      plain.background === undefined &&
      plain.fontId === undefined,
    "a plain Text must stay on the automatic font with no plate",
  );

  // An unknown family would resolve to no file, so it must not survive
  // creation either.
  const bogus = createTextComponent("text-bogus", { fontId: "not-a-family" });
  assert(
    bogus?.fontId === undefined,
    "an unknown font id must be dropped rather than stored",
  );
  const snapped = createTextComponent("text-snap", {
    fontId: "noto-sans-jp",
    fontWeight: 900,
  });
  assert(
    snapped?.fontWeight === 700,
    "a weight the family does not publish must snap on creation",
  );
}

function assertPatchesRejectUnusableValues(): void {
  const prototype = createPrototypeProject("world", "text-patch-fixture");
  const created = requireEntity(createEmptyEntity(prototype.scene, null, "Label"));
  const added = addEditorComponent(
    created.scene,
    prototype.assets,
    created.entityId,
    "core.text",
    "world",
  );
  const entityId = created.entityId;
  const base = added.scene;

  for (const [label, patch] of [
    ["an unknown font id", { fontId: "definitely-not-a-family" }],
    ["an out-of-range weight", { fontWeight: 1200 }],
    ["a non-positive line height", { lineHeight: 0 }],
    ["an unknown alignment", { textAlign: "middle" as never }],
    ["a negative plate padding", { background: { paddingX: -1 } }],
    ["an opacity above one", { background: { opacity: 1.5 } }],
    ["a zero fixed width", { background: { width: 0 } }],
  ] as const) {
    assert(
      updateTextComponent(base, entityId, patch) === base,
      `${label} must leave the Scene untouched`,
    );
  }

  const withBackground = updateTextComponent(base, entityId, {
    background: { mode: "texture", textureAssetId: "texture-a" },
  });
  const stored = findText(withBackground, entityId);
  assert(
    stored.background?.mode === "texture" &&
      stored.background.textureAssetId === "texture-a",
    "a partial background patch must merge onto the defaults",
  );
  assert(
    stored.background?.paddingX === DEFAULT_TEXT_BACKGROUND.paddingX,
    "fields the patch omitted must keep their default",
  );
  assert(
    updateTextComponent(withBackground, entityId, {
      background: { mode: "texture", textureAssetId: "texture-a" },
    }) === withBackground,
    "a patch that changes nothing must not produce a new Scene revision",
  );

  const restyled = updateTextComponent(withBackground, entityId, {
    fontId: "noto-sans-jp",
    fontWeight: 700,
  });
  assert(
    findText(restyled, entityId).fontWeight === 700,
    "a published weight must be kept as chosen",
  );
  // Studio bundles one family, so the snap that still matters in a stored
  // document is a weight that family never published.
  const snapped = updateTextComponent(restyled, entityId, { fontWeight: 500 });
  assert(
    findText(snapped, entityId).fontWeight === 400,
    "a weight the family does not publish must snap in the stored document",
  );
  // "auto" is the absence of a choice; storing it would give one state two
  // spellings and make the document compare unequal to itself.
  const automatic = updateTextComponent(snapped, entityId, { fontId: "auto" });
  assert(
    findText(automatic, entityId).fontId === undefined,
    "choosing the automatic font must clear the stored font id",
  );
}

function assertCompilerEmitsPanelRuntime(): void {
  const documents = textFixtureDocuments();
  const compiled = compileVisualProject(documents, {
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert(compiled.canStage, "a Text world must be stageable");
  const source =
    compiled.overlayFiles.find((file) => file.relativePath === "src/World.tsx")
      ?.content ?? "";
  assert(
    source.includes("<XriftTextPanel") &&
      source.includes('from "./xrift-studio/text-panel-runtime"'),
    "Text must compile to the shared panel runtime",
  );
  assert(
    source.includes("map={textPanelMap}"),
    "a texture background must compile to a loaded map",
  );
  assert(
    !source.includes("</Text>"),
    "the old bare drei Text emission must be gone",
  );
  for (const path of [
    TEXT_PANEL_RUNTIME_OVERLAY_PATH,
    TEXT_PANEL_OBJECT_OVERLAY_PATH,
    TEXT_PANEL_LAYOUT_OVERLAY_PATH,
    TEXT_FONT_CATALOG_OVERLAY_PATH,
  ]) {
    const file = compiled.overlayFiles.find((entry) => entry.relativePath === path);
    assert(file !== undefined, `the staged project must include ${path}`);
    assert(
      !/from\s*["']\.{1,2}\/[a-z-]+\.js["']/.test(file.content),
      `${path} must not keep NodeNext .js specifiers the staged build cannot resolve`,
    );
  }
  assert(
    compiled.assetCopyPlan.some((entry) => entry.assetId === TEXT_BACKGROUND_ASSET_ID),
    "the plate's Texture must be copied into the published world",
  );
  assert(
    compiled.stagingPlan.runtimePackageSpecs.includes(TEXT_PANEL_RUNTIME_PACKAGE),
    "a Text world must ask staging to install troika",
  );
  // Text used to download its font, which made the world reach the network and
  // put a permission in its manifest. The file is bundled now, so a Text world
  // must declare nothing: this asserts the manifest stays empty rather than
  // trusting that whoever edits the emission remembers why.
  const manifest = JSON.parse(
    compiled.overlayFiles.find((file) => file.relativePath === "xrift.json")
      ?.content ?? "{}",
  ) as { world?: { permissions?: unknown } };
  assert(
    manifest.world?.permissions === undefined,
    "a Text world must publish without asking for a permission",
  );
  assert(
    !source.includes("cdn.jsdelivr.net"),
    "the generated world must not name a font CDN",
  );
  assert(
    compiled.stagingPlan.bundledAssetCopyPlan.some(
      (entry) =>
        entry.source === "text-fonts" &&
        entry.targetRelativePath ===
          "public/xrift-studio/vendor/text-fonts/noto-sans-jp-japanese-700-normal.woff",
    ),
    "a Text world must carry the font file it renders with",
  );
  // XRift decides where a world's own files are served from at load time, so
  // the generated source has to read that base rather than assume Studio's.
  assert(
    source.includes("fontBaseUrl={baseUrl}") && source.includes("useXRift()"),
    "the generated world must resolve its font under the XRift base URL",
  );
  // Asking for a package publish staging is not allowed to install is not a
  // slow path, it is a dead end: the publish stops before npm runs and the
  // author is told only "Invalid compiler runtime package request". Every spec
  // the compiler can emit has to be installable.
  for (const spec of compiled.stagingPlan.runtimePackageSpecs) {
    assert(
      isAllowedCompilerRuntimePackage(spec),
      `publish staging must be allowed to install ${spec}`,
    );
  }
}

function assertRuntimeManifestCarriesBackground(): void {
  const compiled = compileVisualProject(textFixtureDocuments(), {
    generatedAt: "2026-01-01T00:00:00.000Z",
    outputMode: "classic-runtime",
  });
  const manifest = compiled.runtimeManifestFile?.content ?? "";
  assert(manifest.length > 0, "a runtime world must emit a manifest");
  const parsed = JSON.parse(manifest) as {
    scenes: Record<string, { entities: Record<string, { components: unknown[] }> }>;
  };
  const components = Object.values(parsed.scenes)
    .flatMap((scene) => Object.values(scene.entities))
    .flatMap((entity) => entity.components) as Array<Record<string, unknown>>;
  const text = components.find((component) => component.type === "text");
  assert(text !== undefined, "the runtime manifest must carry the Text component");
  const background = text.background as Record<string, unknown> | undefined;
  assert(
    background?.mode === "texture" &&
      background.textureAssetId === TEXT_BACKGROUND_ASSET_ID,
    "the runtime manifest must carry the plate and its Texture reference",
  );
  assert(
    text.fontId === "noto-sans-jp" && text.fontWeight === 700,
    "the runtime manifest must carry the chosen font",
  );
}

const TEXT_BACKGROUND_ASSET_ID = "text-fixture-plate";

/** A one-Entity world whose Text carries a font and an image plate. */
function textFixtureDocuments(): VisualCompilerDocuments {
  const prototype = createPrototypeProject("world", "text-compile-fixture");
  const created = requireEntity(createEmptyEntity(prototype.scene, null, "Sign"));
  const added = addEditorComponent(
    created.scene,
    prototype.assets,
    created.entityId,
    "core.text.panel",
    "world",
  );
  const scene = updateTextComponent(added.scene, created.entityId, {
    background: { mode: "texture", textureAssetId: TEXT_BACKGROUND_ASSET_ID },
  });
  return {
    project: prototype.project,
    scenes: { [scene.sceneId]: scene },
    assets: withPlateTexture(prototype.assets),
    prefabs: prototype.prefabs,
  };
}

function withPlateTexture(assets: AssetManifest): AssetManifest {
  const created = createTextureAsset({
    id: TEXT_BACKGROUND_ASSET_ID,
    name: "plate",
    source: { kind: "project", relativePath: "textures/plate.png" },
    importSettings: {},
  });
  if (!created) throw new Error("the fixture plate Texture could not be created");
  const texture: TextureAsset = { ...created, status: "ready" };
  return { ...assets, assets: { ...assets.assets, [texture.id]: texture } };
}

function requireEntity(
  result: ReturnType<typeof createEmptyEntity>,
): NonNullable<ReturnType<typeof createEmptyEntity>> {
  if (!result) throw new Error("the fixture Entity could not be created");
  return result;
}

function findText(scene: SceneDocument, entityId: string): TextComponent {
  const entity = scene.entities[entityId];
  const component = entity?.components.find(
    (candidate): candidate is TextComponent => candidate.type === "text",
  );
  if (!component) throw new Error(`No Text component on Entity ${entityId}`);
  return component;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
