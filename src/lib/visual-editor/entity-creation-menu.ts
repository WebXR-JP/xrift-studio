import { BUILTIN_PRIMITIVE_CREATION_CATALOG } from "./creation-catalog";
import { getEditorEntityCreationDefinitions, type EditorComponentDefinition } from "./editor-session";
import { getXriftComponentDefinition, getXriftEntityCreationMenuGroups, type XriftComponentDefinition } from "./component-registry";
import type { BuiltinPrefabRecipe } from "./builtin-prefab-catalog";
import type { VisualProjectKind } from "./project-document";

export type EntityCreationMenuEntry = {
  id: string;
  label: string;
  description: string;
  group: "Entity" | "Primitive" | "World" | "Light" | "UI" | "Audio" | "Effect" | "XRift";
  kind: "empty" | "primitive" | "component" | "xrift" | "prefab";
  actionId: string;
  hint?: string;
  component?: EditorComponentDefinition;
  xrift?: XriftComponentDefinition;
};

const HIDDEN_ENTITY_CREATION_SCHEMAS = new Set<string>([
  "xrift.skybox", "xrift.tag-board", "xrift.entry-log-board", "xrift.portal",
]);

/** One placement choice per XRift schema. Recipes provide the ready-to-use setup. */
export function getEntityCreationMenuEntries(
  projectKind: VisualProjectKind,
  recipes: readonly BuiltinPrefabRecipe[],
): EntityCreationMenuEntry[] {
  const primitives = BUILTIN_PRIMITIVE_CREATION_CATALOG.filter((entry) => entry.showInCreateMenu);
  const ordered = [...primitives].sort((left, right) => {
    const priority = (id: string) => id.endsWith("/box") ? 0 : id.endsWith("/plane") ? 1 : 2;
    return priority(left.creationId) - priority(right.creationId);
  });
  const entries: EntityCreationMenuEntry[] = [
    { id: "empty", label: "空のEntity", description: "", group: "Entity", kind: "empty", actionId: "" },
    ...ordered.map((entry): EntityCreationMenuEntry => ({
      id: entry.creationId, label: entry.name, description: entry.description,
      group: "Primitive", kind: "primitive", actionId: entry.creationId,
    })),
  ];
  const xrift = new Map<string, EntityCreationMenuEntry>();
  for (const group of getXriftEntityCreationMenuGroups(projectKind)) {
    for (const definition of group.components) {
      if (HIDDEN_ENTITY_CREATION_SCHEMAS.has(definition.schemaId)) continue;
      xrift.set(definition.schemaId, {
        id: definition.schemaId, label: definition.label, description: definition.description,
        group: definition.schemaId === "xrift.spawn-point" ? "World" : "XRift",
        kind: "xrift", actionId: definition.schemaId, xrift: definition,
      });
    }
  }
  for (const recipe of recipes) {
    if (!recipe.projectKinds.includes(projectKind) || HIDDEN_ENTITY_CREATION_SCHEMAS.has(recipe.schemaId)) continue;
    const definition = getXriftComponentDefinition(recipe.schemaId);
    xrift.set(recipe.schemaId, {
      id: recipe.schemaId, label: definition?.label ?? recipe.name,
      description: [recipe.description, recipe.configuration?.hint].filter(Boolean).join(" "),
      group: recipe.schemaId === "xrift.spawn-point" ? "World" : "XRift",
      kind: "prefab", actionId: recipe.id, xrift: definition,
      hint: recipe.configuration?.requiredBeforeCompile ? recipe.configuration.hint : undefined,
    });
  }
  const spawn = xrift.get("xrift.spawn-point");
  if (spawn) entries.push(spawn);
  for (const definition of getEditorEntityCreationDefinitions(projectKind)) {
    entries.push({
      id: definition.id, label: definition.label, description: "", kind: "component", actionId: definition.id,
      group: definition.componentType === "light" ? "Light"
        : definition.componentType === "audio-source" ? "Audio"
          : definition.componentType === "particle-emitter" ? "Effect" : "UI",
      component: definition,
    });
  }
  entries.push(...[...xrift.values()].filter((entry) => entry.group === "XRift"));
  return entries;
}
