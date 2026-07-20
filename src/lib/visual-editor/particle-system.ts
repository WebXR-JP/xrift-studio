import type {
  AssetManifest,
  Color4,
  ParticleAsset,
  ParticleBurst,
  ParticleProperties,
  ParticleScalarRange,
  Vec3Like,
} from "./asset-manifest";

export type ParticlePropertiesPatch = Partial<
  Omit<
    ParticleProperties,
    | "startDelay"
    | "startLifetime"
    | "startSpeed"
    | "startSize"
    | "startRotation"
    | "emission"
    | "shape"
    | "colorOverLifetime"
    | "sizeOverLifetime"
    | "velocityOverLifetime"
    | "renderer"
  >
> & {
  startDelay?: Partial<ParticleScalarRange>;
  startLifetime?: Partial<ParticleScalarRange>;
  startSpeed?: Partial<ParticleScalarRange>;
  startSize?: Partial<ParticleScalarRange>;
  startRotation?: Partial<ParticleScalarRange>;
  emission?: Partial<ParticleProperties["emission"]>;
  shape?: ParticleProperties["shape"];
  colorOverLifetime?: Partial<ParticleProperties["colorOverLifetime"]>;
  sizeOverLifetime?: Partial<ParticleScalarRange>;
  velocityOverLifetime?: Partial<ParticleProperties["velocityOverLifetime"]>;
  renderer?: Partial<ParticleProperties["renderer"]>;
};

export const DEFAULT_PARTICLE_PROPERTIES: ParticleProperties = {
  maxParticles: 1_000,
  duration: 5,
  looping: true,
  prewarm: false,
  simulationSpace: "local",
  startDelay: { min: 0, max: 0 },
  startLifetime: { min: 1, max: 2 },
  startSpeed: { min: 0.8, max: 1.6 },
  startSize: { min: 0.08, max: 0.16 },
  startRotation: { min: 0, max: Math.PI * 2 },
  gravity: [0, -0.35, 0],
  emission: { rateOverTime: 28, bursts: [] },
  shape: { type: "cone", radius: 0.18, angle: 24 },
  colorOverLifetime: {
    start: [1, 0.82, 0.35, 1],
    end: [1, 0.18, 0.04, 0],
  },
  sizeOverLifetime: { min: 1, max: 0.15 },
  velocityOverLifetime: {
    linear: [0, 0, 0],
    orbital: [0, 0, 0],
  },
  renderer: {
    mode: "billboard",
    blending: "additive",
    sortMode: "distance",
    castShadow: false,
    receiveShadow: false,
  },
};

export function createDefaultParticleAsset(input: {
  id: string;
  name: string;
  folderId?: string | null;
  properties?: ParticlePropertiesPatch;
}): ParticleAsset | null {
  const id = input.id.trim();
  const name = input.name.trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    kind: "particle",
    status: "ready",
    source: { kind: "document" },
    thumbnail: { status: "missing" },
    folderId: input.folderId ?? null,
    properties: applyParticlePropertiesPatch(
      cloneParticleProperties(DEFAULT_PARTICLE_PROPERTIES),
      input.properties ?? {},
    ),
  };
}

export function addDefaultParticleAsset(
  manifest: AssetManifest,
  input: Parameters<typeof createDefaultParticleAsset>[0],
): { manifest: AssetManifest; assetId: string; added: boolean } {
  const asset = createDefaultParticleAsset(input);
  if (
    !asset ||
    manifest.assets[asset.id] ||
    (asset.folderId && !manifest.folders?.[asset.folderId])
  ) {
    return { manifest, assetId: input.id, added: false };
  }
  const siblingOrders = Object.values(manifest.assets)
    .filter((candidate) => (candidate.folderId ?? null) === (asset.folderId ?? null))
    .map((candidate) => candidate.order ?? -1);
  asset.order = Math.max(-1, ...siblingOrders) + 1;
  return {
    manifest: {
      ...manifest,
      assets: { ...manifest.assets, [asset.id]: asset },
    },
    assetId: asset.id,
    added: true,
  };
}

export function normalizeParticleProperties(
  input: Partial<ParticleProperties> | undefined,
): ParticleProperties {
  return applyParticlePropertiesPatch(
    cloneParticleProperties(DEFAULT_PARTICLE_PROPERTIES),
    input ?? {},
  );
}

export function updateParticleAsset(
  manifest: AssetManifest,
  assetId: string,
  patch: ParticlePropertiesPatch,
): AssetManifest {
  const asset = manifest.assets[assetId];
  if (asset?.kind !== "particle") return manifest;
  const current = normalizeParticleProperties(asset.properties);
  const properties = applyParticlePropertiesPatch(current, patch, manifest);
  if (JSON.stringify(properties) === JSON.stringify(asset.properties)) return manifest;
  return {
    ...manifest,
    assets: {
      ...manifest.assets,
      [assetId]: { ...asset, properties },
    },
  };
}

function applyParticlePropertiesPatch(
  current: ParticleProperties,
  patch: ParticlePropertiesPatch,
  manifest?: AssetManifest,
): ParticleProperties {
  const renderer = { ...current.renderer, ...patch.renderer };
  if (
    renderer.materialAssetId &&
    manifest &&
    manifest.assets[renderer.materialAssetId]?.kind !== "material"
  ) {
    delete renderer.materialAssetId;
  }
  if (
    renderer.textureAssetId &&
    manifest &&
    manifest.assets[renderer.textureAssetId]?.kind !== "texture"
  ) {
    delete renderer.textureAssetId;
  }

  return {
    maxParticles: integer(patch.maxParticles, current.maxParticles, 1, 100_000),
    duration: finite(patch.duration, current.duration, 0.01, 600),
    looping: booleanValue(patch.looping, current.looping),
    prewarm: booleanValue(patch.prewarm, current.prewarm),
    simulationSpace:
      patch.simulationSpace === "local" || patch.simulationSpace === "world"
        ? patch.simulationSpace
        : current.simulationSpace,
    startDelay: normalizedRange(current.startDelay, patch.startDelay, 0, 600),
    startLifetime: normalizedRange(current.startLifetime, patch.startLifetime, 0.01, 600),
    startSpeed: normalizedRange(current.startSpeed, patch.startSpeed, -1_000, 1_000),
    startSize: normalizedRange(current.startSize, patch.startSize, 0, 1_000),
    startRotation: normalizedRange(current.startRotation, patch.startRotation, -Math.PI * 100, Math.PI * 100),
    gravity: vector3(patch.gravity, current.gravity, -1_000, 1_000),
    emission: {
      rateOverTime: finite(
        patch.emission?.rateOverTime,
        current.emission.rateOverTime,
        0,
        100_000,
      ),
      bursts: normalizeBursts(patch.emission?.bursts ?? current.emission.bursts),
    },
    shape: normalizeShape(patch.shape ?? current.shape),
    colorOverLifetime: {
      start: color4(patch.colorOverLifetime?.start, current.colorOverLifetime.start),
      end: color4(patch.colorOverLifetime?.end, current.colorOverLifetime.end),
    },
    sizeOverLifetime: normalizedRange(
      current.sizeOverLifetime,
      patch.sizeOverLifetime,
      0,
      100,
      false,
    ),
    velocityOverLifetime: {
      linear: vector3(
        patch.velocityOverLifetime?.linear,
        current.velocityOverLifetime.linear,
        -1_000,
        1_000,
      ),
      orbital: vector3(
        patch.velocityOverLifetime?.orbital,
        current.velocityOverLifetime.orbital,
        -1_000,
        1_000,
      ),
    },
    renderer: {
      mode:
        renderer.mode === "billboard" || renderer.mode === "stretched-billboard"
          ? renderer.mode
          : current.renderer.mode,
      blending:
        renderer.blending === "normal" || renderer.blending === "additive"
          ? renderer.blending
          : current.renderer.blending,
      sortMode:
        renderer.sortMode === "none" ||
        renderer.sortMode === "distance" ||
        renderer.sortMode === "youngest" ||
        renderer.sortMode === "oldest"
          ? renderer.sortMode
          : current.renderer.sortMode,
      ...(renderer.materialAssetId
        ? { materialAssetId: renderer.materialAssetId }
        : {}),
      ...(renderer.textureAssetId
        ? { textureAssetId: renderer.textureAssetId }
        : {}),
      castShadow: booleanValue(renderer.castShadow, current.renderer.castShadow),
      receiveShadow: booleanValue(
        renderer.receiveShadow,
        current.renderer.receiveShadow,
      ),
    },
  };
}

function normalizedRange(
  current: ParticleScalarRange,
  patch: Partial<ParticleScalarRange> | undefined,
  minimum: number,
  maximum: number,
  sort = true,
): ParticleScalarRange {
  const min = finite(patch?.min, current.min, minimum, maximum);
  const max = finite(patch?.max, current.max, minimum, maximum);
  return sort && min > max ? { min: max, max: min } : { min, max };
}

function normalizeBursts(value: ParticleBurst[]): ParticleBurst[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 64).map((burst) => ({
    time: finite(burst?.time, 0, 0, 600),
    count: integer(burst?.count, 1, 1, 100_000),
    cycles: integer(burst?.cycles, 1, 1, 10_000),
    interval: finite(burst?.interval, 0, 0, 600),
  }));
}

function normalizeShape(shape: ParticleProperties["shape"]): ParticleProperties["shape"] {
  if (!shape || typeof shape !== "object") return { type: "point" };
  if (shape.type === "sphere") {
    return { type: "sphere", radius: finite(shape.radius, 0.5, 0, 10_000) };
  }
  if (shape.type === "cone") {
    return {
      type: "cone",
      radius: finite(shape.radius, 0.25, 0, 10_000),
      angle: finite(shape.angle, 25, 0, 90),
    };
  }
  if (shape.type === "box") {
    return { type: "box", size: vector3(shape.size, [1, 1, 1], 0, 10_000) };
  }
  return { type: "point" };
}

function cloneParticleProperties(value: ParticleProperties): ParticleProperties {
  return {
    ...value,
    startDelay: { ...value.startDelay },
    startLifetime: { ...value.startLifetime },
    startSpeed: { ...value.startSpeed },
    startSize: { ...value.startSize },
    startRotation: { ...value.startRotation },
    gravity: cloneVec3(value.gravity),
    emission: {
      rateOverTime: value.emission.rateOverTime,
      bursts: value.emission.bursts.map((burst) => ({ ...burst })),
    },
    shape:
      value.shape.type === "box"
        ? { ...value.shape, size: cloneVec3(value.shape.size) }
        : { ...value.shape },
    colorOverLifetime: {
      start: cloneColor4(value.colorOverLifetime.start),
      end: cloneColor4(value.colorOverLifetime.end),
    },
    sizeOverLifetime: { ...value.sizeOverLifetime },
    velocityOverLifetime: {
      linear: cloneVec3(value.velocityOverLifetime.linear),
      orbital: cloneVec3(value.velocityOverLifetime.orbital),
    },
    renderer: { ...value.renderer },
  };
}

function finite(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Math.round(finite(value, fallback, minimum, maximum));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function vector3(
  value: unknown,
  fallback: Vec3Like,
  minimum: number,
  maximum: number,
): Vec3Like {
  if (!Array.isArray(value) || value.length !== 3) return cloneVec3(fallback);
  return [
    finite(value[0], fallback[0], minimum, maximum),
    finite(value[1], fallback[1], minimum, maximum),
    finite(value[2], fallback[2], minimum, maximum),
  ];
}

function color4(value: unknown, fallback: Color4): Color4 {
  if (!Array.isArray(value) || value.length !== 4) return cloneColor4(fallback);
  return [
    finite(value[0], fallback[0], 0, 1),
    finite(value[1], fallback[1], 0, 1),
    finite(value[2], fallback[2], 0, 1),
    finite(value[3], fallback[3], 0, 1),
  ];
}

function cloneVec3(value: Vec3Like): Vec3Like {
  return [value[0], value[1], value[2]];
}

function cloneColor4(value: Color4): Color4 {
  return [value[0], value[1], value[2], value[3]];
}
