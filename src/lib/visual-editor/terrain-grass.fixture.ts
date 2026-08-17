import {
  applyTerrainBrush,
  createTerrainGeometry,
  isTerrainGeometry,
  terrainHeightRange,
} from "./terrain";
import {
  TERRAIN_PRESETS,
  createTerrainFromPreset,
  getTerrainPreset,
} from "./terrain-presets";
import {
  TERRAIN_GRASS_MAX_INSTANCES,
  TERRAIN_GRASS_PRESETS,
  TERRAIN_GRASS_TYPES,
  createTerrainGrassLayers,
  applyTerrainGrassBrush,
  generateTerrainGrassInstances,
  isTerrainGrassMask,
  sampleTerrainGrassMask,
  getTerrainGrassPreset,
  getTerrainGrassType,
  isTerrainGrassLayer,
  sampleTerrainHeight,
  sampleTerrainSlopeDegrees,
  type TerrainGrassLayer,
} from "./terrain-grass";

/** Filesystem-free assertions for rule-placed Terrain grass. */
export function runTerrainGrassFixtureAssertions(): void {
  assertCatalog();
  assertSampling();
  assertDeterminism();
  assertDensityStability();
  assertRules();
  assertInstanceCap();
  assertMaskPainting();
  assertPresets();
}

function assertMaskPainting(): void {
  const terrain = flatTerrain();
  const base = layer({ density: 12 });
  const full = generateTerrainGrassInstances(terrain, base);

  // A stroke falls off toward the rim, so one pass thins rather than clears —
  // the same as any paint brush. Repeated passes are what clear a disc.
  const single = applyTerrainGrassBrush(terrain, base, {
    mode: "erase",
    center: [0, 0],
    radius: 6,
    strength: 1,
  });
  assert(
    generateTerrainGrassInstances(terrain, single).placed < full.placed,
    "One erase pass removed nothing",
  );
  let erased = base;
  for (let pass = 0; pass < 4; pass += 1) {
    erased = applyTerrainGrassBrush(terrain, erased, {
      mode: "erase",
      center: [0, 0],
      radius: 6,
      strength: 1,
    });
  }
  assert(
    Array.isArray(erased.mask),
    "Erasing did not create a coverage mask",
  );
  const afterErase = generateTerrainGrassInstances(terrain, erased);
  assert(
    afterErase.placed < full.placed && afterErase.placed > 0,
    `Erasing cleared the wrong amount (${afterErase.placed} of ${full.placed})`,
  );
  for (let index = 0; index < afterErase.positions.length; index += 3) {
    const distance = Math.hypot(
      afterErase.positions[index],
      afterErase.positions[index + 2],
    );
    assert(
      distance > 2,
      `A blade survived at the centre of a fully erased disc (r=${distance.toFixed(2)})`,
    );
  }

  // Painting the same disc back must restore the field, and dropping a mask
  // that is 1 everywhere keeps the document small.
  let restored = erased;
  for (let pass = 0; pass < 6; pass += 1) {
    restored = applyTerrainGrassBrush(terrain, restored, {
      mode: "paint",
      center: [0, 0],
      radius: 6,
      strength: 1,
    });
  }
  assert(
    restored.mask === undefined,
    "A fully repainted layer must not keep an all-ones mask",
  );
  const afterRestore = generateTerrainGrassInstances(terrain, restored);
  assert(
    afterRestore.placed === full.placed,
    `Repainting did not restore the field (${afterRestore.placed} vs ${full.placed})`,
  );

  // Painting must thin a patch out, not shuffle the blades that remain.
  const partial = applyTerrainGrassBrush(terrain, base, {
    mode: "erase",
    center: [4, 4],
    radius: 5,
    strength: 0.5,
  });
  const partialPlacement = generateTerrainGrassInstances(terrain, partial);
  const survivors = new Set<string>();
  for (let index = 0; index < partialPlacement.positions.length; index += 3) {
    survivors.add(
      `${partialPlacement.positions[index]},${partialPlacement.positions[index + 2]}`,
    );
  }
  let matched = 0;
  for (let index = 0; index < full.positions.length; index += 3) {
    if (survivors.has(`${full.positions[index]},${full.positions[index + 2]}`)) {
      matched += 1;
    }
  }
  assert(
    matched === survivors.size,
    "Painting moved blades instead of thinning them out",
  );
  assert(
    partialPlacement.placed < full.placed,
    "A half-strength erase removed nothing",
  );

  // The mask rides at the height field's own resolution; anything else breaks
  // the correspondence when the Terrain is sculpted.
  assert(
    isTerrainGrassMask(terrain, partial.mask) && isTerrainGrassLayer(partial),
    "A painted layer failed its own schema",
  );
  assert(
    !isTerrainGrassMask(terrain, [0.5, 0.5]),
    "A mask of the wrong length was accepted",
  );
  assert(
    sampleTerrainGrassMask(terrain, undefined, 0, 0) === 1,
    "An unpainted layer must read as fully covered",
  );
}

function flatTerrain() {
  return createTerrainGeometry({ width: 20, depth: 20, resolution: 33 });
}

function layer(overrides: Partial<TerrainGrassLayer> = {}): TerrainGrassLayer {
  return {
    id: "fixture-layer",
    typeId: "short-grass",
    density: 4,
    heightRange: [-1000, 1000],
    slopeLimitDegrees: 90,
    seed: 4242,
    ...overrides,
  };
}

function assertCatalog(): void {
  assert(TERRAIN_GRASS_TYPES.length > 0, "Grass type catalog is empty");
  for (const type of TERRAIN_GRASS_TYPES) {
    assert(
      type.height > 0 && type.width > 0 && type.cards >= 1,
      `Grass type「${type.id}」has no drawable shape`,
    );
    assert(
      /^#[0-9a-f]{6}$/i.test(type.baseColor) && /^#[0-9a-f]{6}$/i.test(type.tipColor),
      `Grass type「${type.id}」has an unusable colour`,
    );
    // A blade wider than a few centimetres reads as a spike rather than grass.
    assert(
      type.width <= 0.04 && type.height / type.width >= 10,
      `Grass type「${type.id}」is too thick to read as a blade (${type.width}m wide, ${type.height}m tall)`,
    );
    assert(
      type.curve > 0,
      `Grass type「${type.id}」stands perfectly straight and will read as a spike`,
    );
    // Without a cull distance the far field aliases into moire rings, which is
    // exactly how this shipped once.
    assert(
      type.cullDistance > 0 && type.cullDistance <= 80,
      `Grass type「${type.id}」has no usable cull distance (${type.cullDistance})`,
    );
    assert(
      getTerrainGrassType(type.id)?.label === type.label,
      `Grass type「${type.id}」cannot be resolved by id`,
    );
  }
  assert(
    getTerrainGrassType("not-a-type") === undefined,
    "getTerrainGrassType resolved an unknown type",
  );
}

function assertSampling(): void {
  // TERRAIN_RESOLUTION_MIN is 9, so a smaller request silently falls back to
  // the default and would test a Terrain other than the one asked for.
  const terrain = createTerrainGeometry({ width: 10, depth: 10, resolution: 9 });
  assert(terrain.resolution === 9, "The sampling fixture did not get its Terrain");
  const raised = { ...terrain, heights: terrain.heights.map((_, index) => index) };
  const last = raised.resolution * raised.resolution - 1;
  // Bilinear sampling must land on the stored samples at the grid points, or
  // blades sit above or below the surface they are supposed to stand on.
  assert(
    Math.abs(sampleTerrainHeight(raised, -5, -5) - raised.heights[0]) < 1e-9,
    "Height sampling missed the corner sample",
  );
  assert(
    Math.abs(sampleTerrainHeight(raised, 5, 5) - raised.heights[last]) < 1e-9,
    "Height sampling missed the far corner sample",
  );
  const flat = flatTerrain();
  assert(
    sampleTerrainSlopeDegrees(flat, 0, 0) < 1e-6,
    "A flat Terrain must report no slope",
  );
  // A 45 degree ramp must read as 45 degrees.
  const rampStep = 20 / 32;
  const ramp = {
    ...flat,
    heights: flat.heights.map((_, index) => (index % flat.resolution) * rampStep),
  };
  assert(
    Math.abs(sampleTerrainSlopeDegrees(ramp, 0, 0) - 45) < 0.5,
    `A 45 degree ramp reported ${sampleTerrainSlopeDegrees(ramp, 0, 0).toFixed(2)} degrees`,
  );
}

function assertDeterminism(): void {
  const terrain = flatTerrain();
  const first = generateTerrainGrassInstances(terrain, layer());
  const second = generateTerrainGrassInstances(terrain, layer());
  assert(first.placed > 0, "A flat Terrain placed no grass at all");
  assert(
    first.positions.length === second.positions.length &&
      first.positions.every((value, index) => value === second.positions[index]),
    "Grass placement is not deterministic",
  );
  // Nothing is stored, so the published world must be able to rebuild the same
  // field from the seed alone. A different seed has to give a different field.
  const other = generateTerrainGrassInstances(terrain, layer({ seed: 99 }));
  assert(
    other.positions.length !== first.positions.length ||
      other.positions.some((value, index) => value !== first.positions[index]),
    "Two seeds produced the same placement",
  );
}

function assertDensityStability(): void {
  const terrain = flatTerrain();
  const sparse = generateTerrainGrassInstances(terrain, layer({ density: 2 }));
  const dense = generateTerrainGrassInstances(terrain, layer({ density: 8 }));
  assert(
    dense.placed > sparse.placed,
    "Raising the density did not add grass",
  );
  // Raising the density must fill in between the blades already on screen, not
  // reshuffle the field the author just approved of.
  assert(
    sparse.positions.every((value, index) => value === dense.positions[index]),
    "Raising the density moved the existing blades",
  );
}

function assertRules(): void {
  const flat = flatTerrain();
  const ramp = {
    ...flat,
    // A ridge: flat along -X, steep on +X.
    heights: flat.heights.map((_, index) => {
      const x = index % flat.resolution;
      return x < flat.resolution / 2 ? 0 : (x - flat.resolution / 2) * 1.5;
    }),
  };
  const gentle = generateTerrainGrassInstances(
    ramp,
    layer({ slopeLimitDegrees: 10, density: 12 }),
  );
  const anySlope = generateTerrainGrassInstances(
    ramp,
    layer({ slopeLimitDegrees: 90, density: 12 }),
  );
  assert(
    gentle.placed > 0 && gentle.placed < anySlope.placed,
    `The slope limit did not keep grass off the steep face (${gentle.placed} vs ${anySlope.placed})`,
  );

  const banded = generateTerrainGrassInstances(
    ramp,
    layer({ heightRange: [5, 1000], density: 12 }),
  );
  for (let index = 1; index < banded.positions.length; index += 3) {
    assert(
      banded.positions[index] >= 5 - 1e-6,
      `A blade grew below its height band at y=${banded.positions[index]}`,
    );
  }
  assert(banded.placed > 0, "The height band rejected every candidate");

  // A hole is a removed part of the surface; nothing may stand on it.
  const holed = applyTerrainBrush(flat, {
    kind: "hole-add",
    center: [0, 0],
    radius: 8,
    strength: 1,
  });
  const overHole = generateTerrainGrassInstances(holed, layer({ density: 12 }));
  const solid = generateTerrainGrassInstances(flat, layer({ density: 12 }));
  assert(
    overHole.placed < solid.placed,
    `Grass grew over a Terrain hole (${overHole.placed} vs ${solid.placed})`,
  );
  for (let index = 0; index < overHole.positions.length; index += 3) {
    const x = overHole.positions[index];
    const z = overHole.positions[index + 2];
    assert(
      Math.hypot(x, z) > 1e-6,
      "A blade stands at the centre of a removed cell",
    );
  }
}

function assertInstanceCap(): void {
  const terrain = flatTerrain();
  // A Terrain scaled up after the density was chosen must meet a limit, not a
  // frozen editor.
  const huge = generateTerrainGrassInstances(
    terrain,
    layer({ density: 500 }),
    1000,
  );
  assert(
    huge.placed === 1000 && huge.clampedByLimit,
    `The instance cap did not hold (${huge.placed} placed, clamped=${huge.clampedByLimit})`,
  );
  assert(
    huge.requested > huge.placed,
    "The clamped result must still report what the density asked for",
  );
  const within = generateTerrainGrassInstances(terrain, layer({ density: 1 }));
  assert(
    !within.clampedByLimit,
    "A layer inside the cap must not report itself as clamped",
  );
  assert(
    TERRAIN_GRASS_MAX_INSTANCES > 0,
    "The default instance cap must be positive",
  );
}

function assertPresets(): void {
  assert(TERRAIN_GRASS_PRESETS.length > 0, "No grass presets ship");
  const terrain = flatTerrain();
  for (const preset of TERRAIN_GRASS_PRESETS) {
    const layers = createTerrainGrassLayers(preset);
    assert(
      layers.length === preset.layers.length,
      `Preset「${preset.id}」lost a layer when expanded`,
    );
    assert(
      new Set(layers.map((entry) => entry.id)).size === layers.length,
      `Preset「${preset.id}」produced duplicate layer ids`,
    );
    assert(
      layers.every(isTerrainGrassLayer),
      `Preset「${preset.id}」produced a layer the schema rejects`,
    );
    // Two layers sharing a seed would stack blade on blade instead of reading
    // as different plants growing among each other.
    assert(
      new Set(layers.map((entry) => entry.seed)).size === layers.length,
      `Preset「${preset.id}」reuses a seed across layers`,
    );
    // A preset is the one-step path, so it has to produce something on the
    // plainest Terrain an author can make.
    const total = layers.reduce(
      (sum, entry) => sum + generateTerrainGrassInstances(terrain, entry).placed,
      0,
    );
    assert(
      total > 0,
      `Preset「${preset.id}」placed nothing on a default flat Terrain`,
    );
    assert(
      getTerrainGrassPreset(preset.id)?.label === preset.label,
      `Preset「${preset.id}」cannot be resolved by id`,
    );
  }
  assert(
    getTerrainGrassPreset("nope") === undefined,
    "getTerrainGrassPreset resolved an unknown preset",
  );
  assert(
    !isTerrainGrassLayer({ ...createTerrainGrassLayers(TERRAIN_GRASS_PRESETS[0])[0], typeId: "moss" }),
    "The schema accepted an unknown grass type",
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Assertions for the ready-made Terrain presets. */
export function runTerrainPresetFixtureAssertions(): void {
  assert(TERRAIN_PRESETS.length > 0, "No Terrain presets ship");
  for (const preset of TERRAIN_PRESETS) {
    const terrain = createTerrainFromPreset(preset);
    assert(
      isTerrainGeometry(terrain),
      `Terrain preset「${preset.id}」produced an invalid Terrain`,
    );
    // A preset exists to hand the author somewhere rather than a flat plate.
    const range = terrainHeightRange(terrain);
    assert(
      range.max - range.min > 0.5,
      `Terrain preset「${preset.id}」is flat (range ${(range.max - range.min).toFixed(2)})`,
    );
    // A Terrain that ends on a cliff reads as a cut-out, so the border falls
    // away to the base level on every side.
    const cells = terrain.resolution - 1;
    for (let index = 0; index <= cells; index += 1) {
      for (const edge of [
        terrain.heights[index],
        terrain.heights[cells * terrain.resolution + index],
        terrain.heights[index * terrain.resolution],
        terrain.heights[index * terrain.resolution + cells],
      ]) {
        assert(
          Math.abs(edge) < 0.001,
          `Terrain preset「${preset.id}」does not settle at its border (${edge})`,
        );
      }
    }
    const layers = terrain.grass ?? [];
    if (preset.grassPresetId) {
      assert(
        layers.length > 0 && layers.every(isTerrainGrassLayer),
        `Terrain preset「${preset.id}」carries no usable grass`,
      );
      // The point of a preset is that it looks planted on arrival.
      const placed = layers.reduce(
        (sum, entry) => sum + generateTerrainGrassInstances(terrain, entry).placed,
        0,
      );
      assert(
        placed > 0,
        `Terrain preset「${preset.id}」grows nothing on its own shape`,
      );
    }
    assert(
      getTerrainPreset(preset.id)?.label === preset.label,
      `Terrain preset「${preset.id}」cannot be resolved by id`,
    );
  }
  assert(
    getTerrainPreset("nope") === undefined,
    "getTerrainPreset resolved an unknown preset",
  );
}
