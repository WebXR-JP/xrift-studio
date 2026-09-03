import {
  isMaterialExtensionName,
  MATERIAL_EXTENSION_DESCRIPTORS,
  MATERIAL_EXTENSION_NAMES,
  pruneMaterialExtensions,
  type MaterialExtensionName,
} from "./material-extension-registry";
import {
  MATERIAL_SHOWCASE_ASSETS,
  MATERIAL_SHOWCASE_DEFINITIONS,
  getMaterialShowcaseAsset,
  materialShowcaseAssetId,
  materialShowcaseBaselineAssetId,
} from "./material-showcase-catalog";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * The showcase Materials exist to be looked at, and a value that does not
 * survive validation looks exactly like a value that was never set: the
 * extension is present, the slider reads a default, and the surface shows
 * nothing. `applyExtensionFields` drops an out-of-range number without saying
 * so, so every authored value is compared against what the Asset ended up
 * holding rather than against the table it was written in.
 */
export function runMaterialShowcaseCatalogFixtureAssertions(): void {
  const ids = new Set<string>();
  for (const asset of MATERIAL_SHOWCASE_ASSETS) {
    assert(!ids.has(asset.id), `Duplicate showcase Material id: ${asset.id}`);
    ids.add(asset.id);
    assert(
      asset.name.trim().length > 0,
      `${asset.id} has no name to show in the Asset panel`,
    );
    assert(
      getMaterialShowcaseAsset(asset.id)?.id === asset.id,
      `${asset.id} is not resolvable by id, so a placed 見本 cannot bring it`,
    );
  }

  const demonstrated = new Set<MaterialExtensionName>();

  for (const definition of MATERIAL_SHOWCASE_DEFINITIONS) {
    const primary = getMaterialShowcaseAsset(
      materialShowcaseAssetId(definition.key),
    );
    assert(Boolean(primary), `${definition.key} produced no Material`);
    if (!primary) continue;

    const authored = definition.extensions as Record<
      string,
      Record<string, unknown> | null | undefined
    >;
    const stored = primary.properties.extensions as unknown as Record<
      string,
      Record<string, unknown> | undefined
    >;

    for (const [name, fields] of Object.entries(authored)) {
      assert(
        stored[name] !== undefined,
        `${definition.key} declares ${name} but the Material does not carry it`,
      );
      demonstrated.add(name as MaterialExtensionName);
      for (const [field, value] of Object.entries(fields ?? {})) {
        const actual = stored[name]?.[field];
        assert(
          JSON.stringify(actual) === JSON.stringify(value),
          `${definition.key}: ${name}.${field} was authored as ${JSON.stringify(value)} but stored as ${JSON.stringify(actual)}`,
        );
      }
    }

    // Dispersion needs volume, and volume needs transmission. A 見本 missing a
    // dependency would land looking like the extension does nothing.
    const pruned = pruneMaterialExtensions<unknown>(
      primary.properties.extensions,
    );
    for (const name of Object.keys(authored)) {
      assert(
        pruned[name as MaterialExtensionName] !== undefined,
        `${definition.key} declares ${name} without the extensions glTF requires alongside it`,
      );
    }

    if (definition.extensions.KHR_materials_unlit !== undefined) {
      assert(
        Object.keys(authored).length === 1,
        `${definition.key} combines Unlit with another extension, which glTF forbids`,
      );
    }

    assert(
      isMaterialExtensionName(definition.extensionLabel),
      `${definition.key} names ${definition.extensionLabel}, which is not a known extension`,
    );
    assert(
      authored[definition.extensionLabel] !== undefined,
      `${definition.key} is labelled ${definition.extensionLabel} but does not use it`,
    );

    if (!definition.baselineName) continue;
    const baseline = getMaterialShowcaseAsset(
      materialShowcaseBaselineAssetId(definition.key),
    );
    assert(
      Boolean(baseline),
      `${definition.key} names a comparison Material that was never built`,
    );
    if (!baseline) continue;
    // The pair is a comparison, so everything except the extensions has to be
    // identical: a baseline with a different colour or roughness would show a
    // difference the extension did not cause.
    assert(
      JSON.stringify(baseline.properties.pbrMetallicRoughness) ===
        JSON.stringify(primary.properties.pbrMetallicRoughness) &&
        JSON.stringify(baseline.properties.emissiveFactor) ===
          JSON.stringify(primary.properties.emissiveFactor),
      `${definition.key} and its comparison differ in more than the extension`,
    );
    assert(
      baseline.properties.extensions[
        definition.extensionLabel as MaterialExtensionName
      ] === undefined,
      `${definition.key}'s comparison still carries ${definition.extensionLabel}`,
    );
  }

  // Adding an extension to the registry without a 見本 leaves it in the same
  // state the whole set existed to fix: authorable, compiled, and impossible
  // to discover.
  for (const name of MATERIAL_EXTENSION_NAMES) {
    assert(
      demonstrated.has(name),
      `${name} (${MATERIAL_EXTENSION_DESCRIPTORS[name].label}) has no showcase Material`,
    );
  }
}
