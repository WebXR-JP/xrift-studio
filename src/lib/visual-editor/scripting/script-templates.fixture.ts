import {
  createDefaultScriptComponentState,
  extractScriptContract,
  getScriptPropValueValidationError,
  resolveScriptPropValue,
} from "./script-contract";
import {
  createScriptTemplateSource,
  DEFAULT_SCRIPT_TEMPLATE_ID,
  getScriptTemplate,
  listScriptTemplateSummaries,
  SCRIPT_TEMPLATE_CATALOG,
  SCRIPT_TEMPLATE_CATALOG_VERSION,
} from "./script-templates";
import {
  createScriptAsset,
  createScriptRelativePath,
} from "./script-files";
import { ASSET_MANIFEST_SCHEMA_VERSION } from "../asset-manifest";
import {
  collectDynamicScriptImports,
  collectScriptSpecifiers,
  collectUnsupportedUseFrameImports,
  isAllowedScriptSpecifier,
  isRemoteScriptSpecifier,
} from "./specifiers";

/** Filesystem-free assertions for the built-in Script template catalog. */
export function runScriptTemplateFixtureAssertions(): void {
  assertCatalogEntries();
  assertSourceGeneration();
  assertParticleTemplate();
  assertTextureTransformTemplate();
  assertExternalAssetTemplates();
  assertTemplateLanguagePersistence();
  assertSummaries();
  assertEnumDefaults();
}

function assertTemplateLanguagePersistence(): void {
  const manifest = {
    schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
    assets: {},
  };
  const relativePath = createScriptRelativePath(
    "Model Display",
    manifest,
    [],
    "tsx",
  );
  const asset = createScriptAsset(
    "fixture-script",
    "Model Display",
    relativePath,
    null,
    "tsx",
  );
  assert(
    relativePath === "scripts/model-display.tsx",
    "TSX template source did not receive a .tsx path",
  );
  assert(
    asset.language === "tsx",
    "TSX template language was not persisted on the Script Asset",
  );
}

function assertCatalogEntries(): void {
  assert(
    SCRIPT_TEMPLATE_CATALOG_VERSION === 4,
    "template catalog version changed without a fixture update",
  );
  assert(SCRIPT_TEMPLATE_CATALOG.length > 0, "template catalog is empty");

  const ids = new Set<string>();
  for (const template of SCRIPT_TEMPLATE_CATALOG) {
    assert(Boolean(template.id.trim()), "a template ID is empty");
    assert(!ids.has(template.id), `template ID is duplicated: ${template.id}`);
    ids.add(template.id);
    assert(Boolean(template.name.trim()), `${template.id}: name is empty`);
    assert(
      Boolean(template.suggestedName.trim()),
      `${template.id}: suggested name is empty`,
    );
    assert(
      template.language === "ts" || template.language === "tsx",
      `${template.id}: language is invalid`,
    );

    assertContract(template.id, template.source);
    assertPortableSource(template.id, template.source);

    const generatedName = `Fixture ${template.id}`;
    const generated = createScriptTemplateSource(template.id, generatedName);
    assert(generated !== null, `${template.id}: source generation returned null`);
    assert(
      !generated.includes("__XRIFT_SCRIPT_NAME__"),
      `${template.id}: generated source retained the name token`,
    );
    const generatedContract = extractScriptContract(generated);
    assert(
      generatedContract.complete &&
        generatedContract.issues.length === 0 &&
        generatedContract.name === generatedName,
      `${template.id}: generated source has an invalid contract`,
    );
    assertPortableSource(template.id, generated);
  }
}

function assertExternalAssetTemplates(): void {
  const model = getScriptTemplate("model-display");
  assert(Boolean(model), "model-display template is missing");
  if (model) {
    assert(model.language === "tsx", "model-display must create a TSX source");
    assert(
      model.requiredAssetKinds.includes("model"),
      "model-display does not declare its Model Asset requirement",
    );
    assert(
      model.source.includes("ScriptRenderProps") &&
        model.source.includes("ctx.assets.url(") &&
        model.source.includes("useGLTF("),
      "model-display does not exercise the declared-Asset Render context",
    );
  }

  const audio = getScriptTemplate("audio-hotkey");
  assert(Boolean(audio), "audio-hotkey template is missing");
  if (audio) {
    assert(
      audio.requiredAssetKinds.includes("audio"),
      "audio-hotkey does not declare its Audio Asset requirement",
    );
    assert(
      audio.source.includes("ctx.assets.loadAudio(") &&
        audio.source.includes("ctx.lifecycle.task(") &&
        audio.source.includes("audio?.setVolume("),
      "audio-hotkey does not exercise the lifecycle-owned Audio API",
    );
  }

  const audioSource = getScriptTemplate("audio-source-control");
  assert(Boolean(audioSource), "audio-source-control template is missing");
  if (audioSource) {
    assert(
      audioSource.requiredAssetKinds.includes("audio") &&
        audioSource.requiredComponents.includes("Audio Source"),
      "audio-source-control does not declare its Audio Asset and Component requirements",
    );
    assert(
      audioSource.source.includes("ctx.audioSources.select(") &&
        audioSource.source.includes("sources.play()") &&
        audioSource.source.includes("sources.setVolume(") &&
        audioSource.source.includes("sources.setLoop(") &&
        audioSource.source.includes("sources.seek(") &&
        audioSource.source.includes("sources.reset()") &&
        audioSource.source.includes('source.status === "autoplay-blocked"') &&
        audioSource.source.includes("started > 0") &&
        audioSource.source.includes("ctx.lifecycle.task("),
      "audio-source-control does not exercise owner-scoped Audio Source controls",
    );
    assert(
      !audioSource.source.includes("ctx.assets.loadAudio("),
      "audio-source-control should control the declared Audio Source instead of creating a separate player",
    );
    assert(
      !audioSource.source.includes("catch ("),
      "audio-source-control should use the non-throwing Audio Source play status contract",
    );
  }
}

function assertSourceGeneration(): void {
  const defaultTemplate = getScriptTemplate(DEFAULT_SCRIPT_TEMPLATE_ID);
  assert(Boolean(defaultTemplate), "default template does not exist");
  assert(
    createScriptTemplateSource("missing-template", "Missing") === null,
    "an unknown template ID generated source",
  );
  if (!defaultTemplate) return;

  const sanitized = createScriptTemplateSource(
    defaultTemplate.id,
    '  Unsafe"\\\n\rName  ',
  );
  assert(sanitized !== null, "sanitized source generation returned null");
  assert(
    extractScriptContract(sanitized).name === "UnsafeName",
    "unsafe characters were not removed from the generated Script name",
  );

  const fallback = createScriptTemplateSource(
    defaultTemplate.id,
    '"\\\n\r',
  );
  assert(fallback !== null, "fallback source generation returned null");
  assert(
    extractScriptContract(fallback).name === defaultTemplate.suggestedName,
    "an empty sanitized name did not use the suggested name",
  );
}

function assertTextureTransformTemplate(): void {
  const texture = getScriptTemplate("texture-scroll");
  assert(Boolean(texture), "texture-scroll template is missing");
  if (!texture) return;

  assert(
    texture.requiredAssetKinds.includes("texture") &&
      texture.requiredComponents.includes("Mesh Renderer"),
    "texture-scroll does not declare its Texture and Mesh requirements",
  );
  assert(
    texture.source.includes("ctx.assets.loadTexture(") &&
      texture.source.includes("ctx.materials.setTexture(") &&
      texture.source.includes("ctx.materials.setTextureTransform(") &&
      texture.source.includes("ctx.materials.resetTextureTransform("),
    "texture-scroll does not exercise isolated Material Texture transforms",
  );
  assert(
    !texture.source.includes("texture.offset") &&
      !texture.source.includes("texture.repeat") &&
      !texture.source.includes("loaded.offset") &&
      !texture.source.includes("loaded.repeat"),
    "texture-scroll mutates the loaded Texture instead of its Material-owned transform",
  );
}

function assertParticleTemplate(): void {
  const particle = getScriptTemplate("particle-control");
  assert(Boolean(particle), "particle-control template is missing");
  if (!particle) return;

  assert(
    particle.requiredAssetKinds.includes("particle"),
    "particle-control does not declare its Particle Asset requirement",
  );
  assert(
    particle.requiredComponents.includes("Particle Emitter"),
    "particle-control does not declare its Particle Emitter requirement",
  );
  assert(
    particle.source.includes("ctx.particles.play()") &&
      particle.source.includes("ctx.particles.setEmissionRate(") &&
      particle.source.includes("ctx.particles.reset()"),
    "particle-control does not exercise the Particle Script API",
  );
}

function assertSummaries(): void {
  const summaries = listScriptTemplateSummaries();
  assert(
    summaries.length === SCRIPT_TEMPLATE_CATALOG.length,
    "template summary count differs from the catalog",
  );
  assert(
    summaries.every(
      (summary, index) =>
        summary.id === SCRIPT_TEMPLATE_CATALOG[index]?.id &&
        !("source" in summary),
    ),
    "template summaries are reordered or expose source",
  );
}

function assertEnumDefaults(): void {
  const contract = extractScriptContract(`
    import { defineScript, prop } from "xrift:script";
    export default defineScript({
      name: "Enum defaults",
      props: {
        mode: prop.enum({ options: ["loop", "once", "ping-pong"] }),
        explicit: prop.enum({
          options: ["first", "second"],
          default: "second",
        }),
        empty: prop.enum({ options: [] }),
        bounded: prop.number({ min: 2, max: 5 }),
        tint: prop.color(),
        invalidTint: prop.color({ default: "red" }),
      },
    });
  `);
  const state = createDefaultScriptComponentState(contract);
  assert(
    state.properties.mode === "loop",
    "enum without an explicit default did not use options[0]",
  );
  assert(
    state.properties.explicit === "second",
    "an explicit enum default was replaced",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(state.properties, "empty") &&
      contract.issues.some(
        (issue) =>
          issue.code === "unreadable-prop-options" &&
          issue.propName === "empty",
      ),
    "an enum without options should be excluded from persisted state",
  );
  assert(
    state.properties.bounded === 2,
    "a bounded number fallback should respect its minimum",
  );
  assert(
    state.properties.tint === "#ffffff",
    "a color without an explicit default should use the canonical fallback",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(
      state.properties,
      "invalidTint",
    ) &&
      contract.issues.some(
        (issue) =>
          issue.code === "unreadable-prop-default" &&
          issue.propName === "invalidTint",
      ),
    "an invalid color default should be excluded instead of guessed",
  );
  const modeDescriptor = contract.props.find(
    (descriptor) => descriptor.name === "mode",
  );
  const boundedDescriptor = contract.props.find(
    (descriptor) => descriptor.name === "bounded",
  );
  const tintDescriptor = contract.props.find(
    (descriptor) => descriptor.name === "tint",
  );
  assert(
    modeDescriptor &&
      resolveScriptPropValue(modeDescriptor, undefined) === "loop",
    "Inspector fallback should match the persisted enum default",
  );
  assert(
    boundedDescriptor &&
      getScriptPropValueValidationError(boundedDescriptor, 6) !== null,
    "number max should be enforced at the shared write boundary",
  );
  assert(
    tintDescriptor &&
      getScriptPropValueValidationError(tintDescriptor, "red") !== null,
    "color values outside #RRGGBB should be rejected",
  );
}

function assertContract(templateId: string, source: string): void {
  const contract = extractScriptContract(source);
  assert(
    contract.complete && contract.issues.length === 0 && Boolean(contract.name),
    `${templateId}: contract extraction failed (${contract.issues
      .map((issue) => issue.code)
      .join(", ")})`,
  );
}

function assertPortableSource(templateId: string, source: string): void {
  const specifiers = collectScriptSpecifiers(source).map(
    ({ specifier }) => specifier,
  );
  assert(
    specifiers.includes("xrift:script"),
    `${templateId}: xrift:script import is missing`,
  );
  assert(
    specifiers.every((specifier) => isAllowedScriptSpecifier(specifier)),
    `${templateId}: unsupported import found (${specifiers
      .filter((specifier) => !isAllowedScriptSpecifier(specifier))
      .join(", ")})`,
  );
  assert(
    specifiers.every((specifier) => !isRemoteScriptSpecifier(specifier)),
    `${templateId}: remote import found`,
  );
  assert(
    collectDynamicScriptImports(source).length === 0,
    `${templateId}: dynamic import found`,
  );
  assert(
    collectUnsupportedUseFrameImports(source).length === 0,
    `${templateId}: unsupported React Three Fiber frame import found`,
  );
  assert(
    !/\beval\s*\(|\bnew\s+Function\s*\(/.test(source),
    `${templateId}: forbidden dynamic evaluation found`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Script template fixture failed: ${message}`);
  }
}
