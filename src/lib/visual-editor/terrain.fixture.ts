import { BUILTIN_ASSET_IDS, createPrototypeProject } from "./prototype-project";
import {
  addTerrainEntity,
  applyTerrainBrushToScene,
  getTerrainGeometry,
  type MeshComponent,
} from "./scene-document";
import { sceneDocumentCodec } from "./serialization";
import {
  applyTerrainBrush,
  createTerrainGeometry,
  createTerrainMeshBuffers,
  resampleTerrainGeometry,
  terrainHeightRange,
} from "./terrain";

/** Pure assertions for Terrain sampling, persistence, and scene replacement. */
export function runTerrainFixtureAssertions(): void {
  const flat = createTerrainGeometry({ width: 8, depth: 6, resolution: 9 });
  assert(
    flat.heights.length === 81 && flat.heights.every((height) => height === 0),
    "A new Terrain must begin as a flat square height grid",
  );
  const buffers = createTerrainMeshBuffers(flat);
  assert(
    buffers.positions.length === 9 * 9 * 3 &&
      buffers.indices.length === 8 * 8 * 6,
    "Terrain geometry buffers must contain one vertex per sample and two triangles per cell",
  );

  const raised = applyTerrainBrush(flat, {
    kind: "raise",
    center: [0, 0],
    radius: 2,
    strength: 3,
  });
  const centerIndex = 4 * flat.resolution + 4;
  assert(
    flat.heights[centerIndex] === 0 && raised.heights[centerIndex]! > 2.9,
    "Raise must be immutable and increase the sample under the brush center",
  );
  const flattened = applyTerrainBrush(raised, {
    kind: "flatten",
    center: [0, 0],
    radius: 2,
    strength: 1,
    targetHeight: 0,
  });
  assert(
    Math.abs(flattened.heights[centerIndex] ?? Number.NaN) < 0.001,
    "Flatten with a full blend must reach its requested target height",
  );
  assert(
    applyTerrainBrush(raised, {
      kind: "flatten",
      center: [0, 0],
      radius: 2,
      strength: 1,
    }) === raised,
    "Flatten must reject a brush operation without an explicit target height",
  );
  const peak = {
    ...flat,
    heights: flat.heights.map((height, index) =>
      index === centerIndex ? height + 6 : height,
    ),
  };
  const smoothed = applyTerrainBrush(peak, {
    kind: "smooth",
    center: [0, 0],
    radius: 2,
    strength: 1,
  });
  assert(
    (smoothed.heights[centerIndex] ?? 6) < (peak.heights[centerIndex] ?? 0),
    "Smooth must reduce an isolated peak",
  );
  const stamped = applyTerrainBrush(flat, {
    kind: "stamp",
    center: [0, 0],
    radius: 2,
    strength: 1,
    targetHeight: 4,
    falloff: 0,
  });
  assert(
    stamped.heights[centerIndex] === 4,
    "Stamp must set a hard brush center to the requested height",
  );
  const holed = applyTerrainBrush(flat, {
    kind: "hole-add",
    center: [0, 0],
    radius: 1.5,
    strength: 1,
  });
  const holedBuffers = createTerrainMeshBuffers(holed);
  assert(
    holed.holes?.some(Boolean) && holedBuffers.indices.length < buffers.indices.length,
    "Paint Holes must remove cells from the actual Terrain mesh",
  );
  const filled = applyTerrainBrush(holed, {
    kind: "hole-remove",
    center: [0, 0],
    radius: 1.5,
    strength: 1,
  });
  assert(
    filled.holes?.every((hole) => !hole) &&
      createTerrainMeshBuffers(filled).indices.length === buffers.indices.length,
    "Fill Holes must restore the Terrain cells",
  );
  const resampled = resampleTerrainGeometry(stamped, {
    width: 12,
    depth: 10,
    resolution: 17,
  });
  assert(
    resampled.width === 12 &&
      resampled.depth === 10 &&
      resampled.resolution === 17 &&
      resampled.heights.length === 17 * 17,
    "Terrain Settings must resample heights into the requested dimensions",
  );

  const project = createPrototypeProject("world", "terrain-fixture");
  const added = addTerrainEntity(
    project.scene,
    project.assets,
    BUILTIN_ASSET_IDS.material.green,
    { width: 12, depth: 10, resolution: 17, position: [2, 0, -1] },
  );
  assert(added, "Terrain placement must accept a project Material");
  const entity = added.scene.entities[added.entityId];
  const mesh = entity?.components.find(
    (component): component is MeshComponent => component.type === "mesh",
  );
  const terrain = mesh ? getTerrainGeometry(mesh) : undefined;
  assert(
    terrain?.resolution === 17 &&
      entity?.components.some(
        (component) =>
          component.type === "collider" &&
          component.shape === "mesh" &&
          component.meshMode === "trimesh",
      ),
    "Terrain placement must include a static Trimesh Collider",
  );
  const sculpted = applyTerrainBrushToScene(added.scene, added.entityId, {
    kind: "lower",
    center: [0, 0],
    radius: 1.5,
    strength: 2,
  });
  const sculptedMesh = sculpted.entities[added.entityId]?.components.find(
    (component): component is MeshComponent => component.type === "mesh",
  );
  const sculptedTerrain = sculptedMesh
    ? getTerrainGeometry(sculptedMesh)
    : undefined;
  const range = sculptedTerrain ? terrainHeightRange(sculptedTerrain) : undefined;
  assert(
    sculpted !== added.scene && (range?.min ?? 0) < 0,
    "Terrain brush scene edits must replace the Scene document with changed height samples",
  );
  const decoded = sceneDocumentCodec.parse(sceneDocumentCodec.serialize(sculpted));
  assert(
    decoded.ok,
    "Terrain height samples must survive Scene document serialization",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Terrain fixture failed: ${message}`);
}
