import { getXriftComponentMenuGroups } from "./component-registry";

/** Same labels and order in World and Item; execution still checks projectKinds. */
export function getDiscoverableXriftGroups(): ReturnType<typeof getXriftComponentMenuGroups> {
  const groups = getXriftComponentMenuGroups("world").map((group) => ({ ...group, components: [...group.components] }));
  for (const group of getXriftComponentMenuGroups("item")) {
    const existing = groups.find((candidate) => candidate.category === group.category);
    if (!existing) groups.push({ ...group, components: [...group.components] });
    else for (const component of group.components) {
      if (!existing.components.some((candidate) => candidate.schemaId === component.schemaId)) existing.components.push(component);
    }
  }
  return groups;
}
