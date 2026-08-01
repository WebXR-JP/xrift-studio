import {
  XRIFT_STUDIO_RUNTIME_FORMAT,
  XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION,
  isXriftRuntimeManifest,
} from "./schema.js";

/** Deterministic boundary checks for manifests loaded by the runtime. */
export function runRuntimeSchemaFixtureAssertions(): void {
  const validTerrain = {
    format: XRIFT_STUDIO_RUNTIME_FORMAT,
    schemaVersion: XRIFT_STUDIO_RUNTIME_SCHEMA_VERSION,
    generator: "xrift-studio",
    compilerVersion: "fixture",
    projectId: "fixture-project",
    projectKind: "world",
    entryScene: "scene-main",
    scenes: {
      "scene-main": {
        id: "scene-main",
        name: "Fixture scene",
        rootEntityIds: ["terrain"],
        entities: {
          terrain: {
            id: "terrain",
            name: "Terrain",
            parentId: null,
            children: [],
            enabled: true,
            transform: {
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
            components: [
              {
                id: "mesh-terrain",
                type: "mesh",
                enabled: true,
                geometry: {
                  kind: "terrain",
                  width: 8,
                  depth: 8,
                  resolution: 9,
                  heights: Array.from({ length: 81 }, () => 0),
                  holes: Array.from({ length: 64 }, () => false),
                },
                materialBindings: [],
                castShadow: true,
                receiveShadow: true,
              },
            ],
          },
        },
      },
    },
    assets: {},
  };
  assert(
    isXriftRuntimeManifest(validTerrain),
    "A valid bounded Terrain manifest was rejected",
  );

  const invalidResolution = structuredClone(validTerrain);
  (invalidResolution.scenes["scene-main"].entities.terrain.components[0] as {
    geometry: { resolution: number };
  }).geometry.resolution = 1025;
  assert(
    !isXriftRuntimeManifest(invalidResolution),
    "An unbounded Terrain resolution was accepted",
  );

  const invalidHeights = structuredClone(validTerrain);
  (invalidHeights.scenes["scene-main"].entities.terrain.components[0] as {
    geometry: { heights: number[] };
  }).geometry.heights.pop();
  assert(
    !isXriftRuntimeManifest(invalidHeights),
    "A Terrain with a mismatched sample array was accepted",
  );

  const invalidHoles = structuredClone(validTerrain);
  (invalidHoles.scenes["scene-main"].entities.terrain.components[0] as {
    geometry: { holes: boolean[] };
  }).geometry.holes.pop();
  assert(
    !isXriftRuntimeManifest(invalidHoles),
    "A Terrain with a mismatched hole mask was accepted",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Runtime schema fixture failed: ${message}`);
}
