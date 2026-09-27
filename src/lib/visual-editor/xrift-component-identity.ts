import { getXriftComponentDefinition } from "./component-registry";
import { sha256Utf8 } from "./compiler/hash";
import type { JsonObject, XRiftComponent } from "./scene-document";

/** Allocate scene-unique runtime identifiers for a new copy or Prefab instance. */
export function cloneXriftComponentIdentifiers(
  component: XRiftComponent,
  entityId: string,
  componentId: string,
): JsonObject {
  const properties = { ...component.properties };
  const definition = getXriftComponentDefinition(component.schemaId);
  if (!definition) return properties;

  for (const field of definition.fields) {
    const value = properties[field.name];
    if (
      !field.uniqueWithinScene ||
      typeof value !== "string" ||
      !value.trim()
    ) continue;

    // Component IDs are only unique within their owning Entity. Include both,
    // and use the full identity rather than its suffix (Prefab IDs share one).
    const suffix = sha256Utf8(
      JSON.stringify([entityId, componentId, definition.schemaId, field.name]),
    ).slice(0, 24);
    properties[field.name] = `${definition.importName.toLowerCase()}-${suffix}`;
  }
  return properties;
}
