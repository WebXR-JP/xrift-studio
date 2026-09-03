import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import {
  getXriftComponentDefinition,
  type XriftComponentDefinition,
} from "./component-registry";
import type {
  JsonObject,
  JsonValue,
  SceneDocument,
  Vec3,
  XRiftComponent,
} from "./scene-document";

/**
 * The official Components' own `position` / `rotation` / `scale` props.
 *
 * A Component that draws itself at one of these offsets creates a second
 * origin inside the Entity: the Entity's transform gizmo stays on the Entity
 * origin while the screen, mirror or board is drawn somewhere else, and a
 * rotation drag then swings the content around a pivot the author cannot see.
 * Studio's own convention - the built-in Prefab recipes pin these props to
 * identity and the Inspector tells the author to use the Entity Transform -
 * is that the Entity transform is the only origin, so these helpers fold a
 * Component's own placement back into it.
 */
const PLACEMENT_FIELD_KINDS: Readonly<Record<string, readonly string[]>> = {
  position: ["vec3"],
  rotation: ["vec3"],
  // VideoScreen's `scale` is the screen's width and height, not a transform
  // scale, so only the group-compatible `number-or-vec3` form counts.
  scale: ["number-or-vec3"],
};

export type XriftComponentPlacement = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** Property names this Component actually declares, in registry order. */
  propertyNames: readonly string[];
};

export type PlacementTransform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

/** Placement props the definition declares, empty when it draws at its origin. */
export function getXriftComponentPlacementPropertyNames(
  schemaId: string,
): readonly string[] {
  const definition = getXriftComponentDefinition(schemaId);
  return definition ? placementPropertyNames(definition) : [];
}

/** The offset in these props, or null when the schema declares none. */
export function readXriftPlacementProperties(
  schemaId: string,
  properties: JsonObject,
): XriftComponentPlacement | null {
  const definition = getXriftComponentDefinition(schemaId);
  if (!definition) return null;
  const propertyNames = placementPropertyNames(definition);
  if (propertyNames.length === 0) return null;
  return {
    position: propertyNames.includes("position")
      ? readVec3(properties.position, [0, 0, 0])
      : [0, 0, 0],
    rotation: propertyNames.includes("rotation")
      ? readVec3(properties.rotation, [0, 0, 0])
      : [0, 0, 0],
    scale: propertyNames.includes("scale")
      ? readScale(properties.scale)
      : [1, 1, 1],
    propertyNames,
  };
}

/** The Component's own offset, or null when it declares no placement props. */
export function readXriftComponentPlacement(
  component: XRiftComponent,
): XriftComponentPlacement | null {
  return readXriftPlacementProperties(component.schemaId, component.properties);
}

export function isIdentityPlacement(placement: XriftComponentPlacement): boolean {
  return (
    vecEquals(placement.position, [0, 0, 0]) &&
    vecEquals(placement.rotation, [0, 0, 0]) &&
    vecEquals(placement.scale, [1, 1, 1])
  );
}

/** These props with the placement cleared, so the Entity origin is the only one. */
export function stripXriftPlacementProperties(
  schemaId: string,
  properties: JsonObject,
): JsonObject {
  const propertyNames = getXriftComponentPlacementPropertyNames(schemaId);
  return Object.fromEntries(
    Object.entries(properties).filter(([name]) => !propertyNames.includes(name)),
  );
}

/**
 * `transform * placement`, the matrix the Component is actually drawn with.
 *
 * The Component's group is a child of the Entity's group in the viewport, in
 * Play and in the published world alike, so composing the two is what moves
 * the Entity origin onto the drawn content without moving the content.
 */
export function composeTransformWithPlacement(
  transform: PlacementTransform,
  placement: XriftComponentPlacement,
): PlacementTransform {
  const composed = new Matrix4()
    .compose(
      new Vector3().fromArray(transform.position),
      new Quaternion().setFromEuler(new Euler().fromArray(transform.rotation)),
      new Vector3().fromArray(transform.scale),
    )
    .multiply(
      new Matrix4().compose(
        new Vector3().fromArray(placement.position),
        new Quaternion().setFromEuler(new Euler().fromArray(placement.rotation)),
        new Vector3().fromArray(placement.scale),
      ),
    );
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  composed.decompose(position, quaternion, scale);
  const rotation = new Euler().setFromQuaternion(quaternion);
  return {
    position: roundVec3([position.x, position.y, position.z]),
    rotation: roundVec3([rotation.x, rotation.y, rotation.z]),
    scale: roundVec3([scale.x, scale.y, scale.z]),
  };
}

/**
 * The Component's placement moved onto the transform it is drawn under.
 *
 * Returns both unchanged when the schema declares no placement props, so a
 * caller can run every official Component through it.
 */
export function foldXriftPlacementIntoTransform(
  schemaId: string,
  transform: PlacementTransform,
  properties: JsonObject,
): { transform: PlacementTransform; properties: JsonObject } {
  const placement = readXriftPlacementProperties(schemaId, properties);
  if (!placement) return { transform, properties };
  return {
    transform: composeTransformWithPlacement(transform, placement),
    properties: stripXriftPlacementProperties(schemaId, properties),
  };
}

/**
 * Moves an official Component's own placement onto its Entity's Transform.
 *
 * Conservative on purpose, in the same way the legacy RigidBody migration is:
 * only the shape the code importer produces - one official Component alone on
 * an Entity that carries nothing else - is folded, because anything else on
 * the Entity (a Mesh, a Collider, a child Entity) is drawn at the Entity
 * origin and would move with it.
 */
export function migrateXriftComponentPlacementIntoTransform(
  scene: SceneDocument,
): SceneDocument {
  let changed = false;
  const entities = Object.fromEntries(
    Object.entries(scene.entities).map(([entityId, entity]) => {
      const xriftComponents = entity.components.filter(
        (component): component is XRiftComponent =>
          component.type === "xrift-component",
      );
      if (xriftComponents.length !== 1) return [entityId, entity];
      const component = xriftComponents[0];
      const definition = getXriftComponentDefinition(component.schemaId);
      const placement = readXriftComponentPlacement(component);
      if (!definition || !placement || isIdentityPlacement(placement)) {
        return [entityId, entity];
      }
      // A wrapper draws the Entity's children inside its own group, so its
      // offset already moves them; a leaf does not, so folding one on an
      // Entity that has children would move content the offset never touched.
      if (
        definition.attachBehavior.kind === "leaf" &&
        entity.children.length > 0
      ) {
        return [entityId, entity];
      }
      const others = entity.components.filter(
        (candidate) => candidate.id !== component.id,
      );
      if (others.some((candidate) => candidate.type !== "transform")) {
        return [entityId, entity];
      }
      const transform = others.find(
        (candidate) => candidate.type === "transform",
      );
      if (!transform || transform.type !== "transform") return [entityId, entity];
      const folded = composeTransformWithPlacement(
        {
          position: transform.position,
          rotation: transform.rotation,
          scale: transform.scale,
        },
        placement,
      );
      changed = true;
      return [
        entityId,
        {
          ...entity,
          components: entity.components.map((candidate) => {
            if (candidate.id === transform.id) {
              return { ...transform, ...folded };
            }
            if (candidate.id === component.id) {
              return {
                ...component,
                properties: stripXriftPlacementProperties(
                  component.schemaId,
                  component.properties,
                ),
              };
            }
            return candidate;
          }),
        },
      ];
    }),
  );
  return changed ? { ...scene, entities } : scene;
}

function placementPropertyNames(
  definition: XriftComponentDefinition,
): readonly string[] {
  return definition.fields
    .filter((field) => PLACEMENT_FIELD_KINDS[field.name]?.includes(field.kind))
    .map((field) => field.name);
}

function readVec3(value: JsonValue | undefined, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback];
  const entries = value.map((entry) =>
    typeof entry === "number" && Number.isFinite(entry) ? entry : Number.NaN,
  );
  return entries.some(Number.isNaN)
    ? [...fallback]
    : [entries[0], entries[1], entries[2]];
}

function readScale(value: JsonValue | undefined): Vec3 {
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
    return [value, value, value];
  }
  const vector = readVec3(value, [1, 1, 1]);
  return vector.some((entry) => entry === 0) ? [1, 1, 1] : vector;
}

function vecEquals(left: Vec3, right: Vec3): boolean {
  return left.every((entry, index) => Math.abs(entry - right[index]) < 1e-9);
}

function roundVec3(value: Vec3): Vec3 {
  return value.map((entry) =>
    Math.abs(entry) < 1e-9 ? 0 : Number(entry.toFixed(6)),
  ) as Vec3;
}
