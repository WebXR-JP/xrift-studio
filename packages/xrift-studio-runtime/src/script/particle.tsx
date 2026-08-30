import { useEffect, useMemo, useRef, type FC } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  NormalBlending,
  PointsMaterial,
  SRGBColorSpace,
  Vector3,
  type Points,
  type ColorRepresentation,
  type Texture,
} from "three";

export type XriftParticleRange = { min: number; max: number };

export type XriftParticleConfig = {
  maxParticles: number;
  duration: number;
  looping: boolean;
  prewarm: boolean;
  simulationSpace: "local" | "world";
  startDelay: XriftParticleRange;
  startLifetime: XriftParticleRange;
  startSpeed: XriftParticleRange;
  startSize: XriftParticleRange;
  startRotation: XriftParticleRange;
  gravity: [number, number, number];
  emission: {
    rateOverTime: number;
    bursts: Array<{
      time: number;
      count: number;
      cycles: number;
      interval: number;
    }>;
  };
  shape:
    | { type: "point" }
    | { type: "sphere"; radius: number }
    | { type: "cone"; radius: number; angle: number }
    | { type: "box"; size: [number, number, number] };
  colorOverLifetime: {
    start: [number, number, number, number];
    end: [number, number, number, number];
  };
  sizeOverLifetime: XriftParticleRange;
  velocityOverLifetime: {
    linear: [number, number, number];
    orbital: [number, number, number];
  };
  renderer: {
    mode: "billboard" | "stretched-billboard";
    blending: "normal" | "additive";
    sortMode: "none" | "distance" | "youngest" | "oldest";
    materialAssetId?: string;
    textureAssetId?: string;
    castShadow: boolean;
    receiveShadow: boolean;
  };
};

export type XriftParticleRuntimeOverrides = {
  playing?: boolean;
  stopped?: boolean;
  emissionRate?: number;
  speedMultiplier?: number;
  sizeMultiplier?: number;
  color?: string | number;
  opacity?: number;
  /** Owner-local command counter. The bridge converts it to a global revision. */
  restartRevision?: number;
};

export type XriftParticleRuntimeState = XriftParticleRuntimeOverrides & {
  revision: number;
  /**
   * Which Particle Component this bridge belongs to.
   *
   * Empty when the emitter was mounted without one. A trigger aimed at a
   * specific emitter needs it: an Entity can carry two, and the Editor's
   * picker lists them separately.
   */
  componentId: string;
};

export type XriftParticleRuntimeBridge = {
  setOwner(
    owner: object,
    order: number,
    key: string,
    overrides: XriftParticleRuntimeOverrides,
  ): void;
  removeOwner(owner: object): void;
  read(): Readonly<XriftParticleRuntimeState>;
};

export const XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY =
  "xriftParticleRuntime" as const;

/**
 * Owner-ordered runtime overrides shared by Studio Play and generated output.
 * Commands receive a bridge-global revision, so two Script owners can never
 * cancel each other's restart merely because their local counters match.
 */
export function createXriftParticleRuntimeBridge(
  options: { componentId?: string } = {},
): XriftParticleRuntimeBridge {
  const owners = new Map<
    object,
    {
      order: number;
      key: string;
      overrides: XriftParticleRuntimeOverrides;
    }
  >();
  const componentId = options.componentId ?? "";
  let state: XriftParticleRuntimeState = { revision: 0, componentId };
  let restartRevision = 0;

  const recompute = () => {
    const next: XriftParticleRuntimeState = {
      revision: state.revision + 1,
      componentId,
      ...(restartRevision > 0 ? { restartRevision } : {}),
    };
    const ordered = [...owners.values()].sort(
      (left, right) =>
        left.order - right.order || left.key.localeCompare(right.key),
    );
    for (const owner of ordered) {
      const { restartRevision: _ownerCommand, ...overrides } = owner.overrides;
      Object.assign(next, overrides);
    }
    state = next;
  };

  return {
    setOwner(owner, order, key, overrides) {
      const previous = owners.get(owner);
      if (
        overrides.restartRevision !== undefined &&
        overrides.restartRevision !== previous?.overrides.restartRevision
      ) {
        restartRevision += 1;
      }
      owners.set(owner, { order, key, overrides: { ...overrides } });
      recompute();
    },
    removeOwner(owner) {
      if (!owners.delete(owner)) return;
      recompute();
    },
    read: () => state,
  };
}

type ParticleSeed = {
  a: number;
  b: number;
  c: number;
  speed: number;
};

export type XriftScriptParticleEmitterProps = {
  /** Particle Component this emitter renders, so a trigger can address it. */
  componentId?: string;
  config: XriftParticleConfig;
  color: ColorRepresentation;
  opacity: number;
  map?: Texture | null;
  /** Editor selection feedback; not part of the authored simulation. */
  displayOpacityScale?: number;
};

export type XriftParticleEmissionPlan = {
  rate: number;
  continuousSlotCount: number;
  burstBirthTimes: readonly number[];
  activeCount: number;
  duration: number;
  looping: boolean;
  prewarm: boolean;
};

/**
 * Builds the bounded emitter pool used by both authored and Script-controlled
 * particles. Continuous slots are recycled for the full authored duration,
 * while burst slots retain their authored timestamps.
 */
export function createXriftParticleEmissionPlan(
  config: XriftParticleConfig,
  emissionRateOverride?: number,
): XriftParticleEmissionPlan {
  const capacity = Math.max(1, Math.min(10_000, config.maxParticles));
  const rate = Math.max(
    0,
    emissionRateOverride ?? config.emission.rateOverTime,
  );
  const maximumLifetime = Math.max(
    0.01,
    config.startLifetime.min,
    config.startLifetime.max,
  );
  const continuousSlotCount =
    rate <= 0
      ? 0
      : Math.min(capacity, Math.max(1, Math.ceil(rate * maximumLifetime)));
  const burstBirthTimes =
    emissionRateOverride === undefined
      ? createBurstBirthTimes(
          config.emission.bursts,
          Math.max(0.01, config.duration),
          capacity - continuousSlotCount,
        )
      : [];
  return {
    rate,
    continuousSlotCount,
    burstBirthTimes,
    activeCount: continuousSlotCount + burstBirthTimes.length,
    duration: Math.max(0.01, config.duration),
    looping: config.looping,
    prewarm: config.prewarm,
  };
}

/**
 * Resolves the current birth represented by one reusable particle slot.
 * Returning null means the slot has not emitted yet.
 */
export function resolveXriftParticleBirthTime(
  plan: XriftParticleEmissionPlan,
  index: number,
  elapsed: number,
  startDelay: number,
): number | null {
  if (index < plan.continuousSlotCount) {
    const firstBirth = index / Math.max(plan.rate, 0.0001) + startDelay;
    const period =
      plan.continuousSlotCount / Math.max(plan.rate, 0.0001);
    const elapsedCycles = Math.floor((elapsed - firstBirth) / period);
    if (elapsedCycles < 0 && !(plan.looping && plan.prewarm)) return null;
    if (plan.looping) {
      return firstBirth + elapsedCycles * period;
    }
    const emissionEnd = startDelay + plan.duration;
    const finalCycle = Math.floor(
      (emissionEnd - 1e-9 - firstBirth) / period,
    );
    if (finalCycle < 0) return null;
    return firstBirth + Math.min(elapsedCycles, finalCycle) * period;
  }

  const burstIndex = index - plan.continuousSlotCount;
  const authoredBirth = plan.burstBirthTimes[burstIndex];
  if (authoredBirth === undefined) return null;
  const firstBirth = authoredBirth + startDelay;
  if (!plan.looping) return firstBirth;
  const elapsedCycles = Math.floor(
    (elapsed - firstBirth) / plan.duration,
  );
  if (elapsedCycles < 0 && !plan.prewarm) return null;
  return firstBirth + elapsedCycles * plan.duration;
}

/**
 * One particle implementation for Studio Play and generated World / Item.
 * Script controls are discovered through the stable userData bridge.
 */
export const XriftScriptParticleEmitter: FC<
  XriftScriptParticleEmitterProps
> = ({
  componentId,
  config,
  color,
  opacity,
  map,
  displayOpacityScale = 1,
}) => {
  const count = Math.max(1, Math.min(10_000, config.maxParticles));
  const authoredEmissionPlan = useMemo(
    () => createXriftParticleEmissionPlan(config),
    [config],
  );
  const pointsRef = useRef<Points>(null);
  const elapsedRef = useRef(0);
  const restartRevisionRef = useRef(0);
  const runtimeBridge = useMemo(
    () => createXriftParticleRuntimeBridge({ componentId: componentId ?? "" }),
    [componentId],
  );
  const runtimeUserData = useMemo(
    () => ({ [XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY]: runtimeBridge }),
    [runtimeBridge],
  );
  const geometry = useMemo(() => createGeometry(count), [count]);
  const material = useMemo(
    () =>
      new PointsMaterial({
        color,
        map: map ?? null,
        size: baseParticleSize(config),
        sizeAttenuation: true,
        transparent: true,
        opacity: clampUnit(opacity) * clampUnit(displayOpacityScale),
        vertexColors: true,
        alphaTest: map ? 0.01 : 0,
        depthWrite: config.renderer.blending !== "additive",
        blending:
          config.renderer.blending === "additive"
            ? AdditiveBlending
            : NormalBlending,
      }),
    [color, config, displayOpacityScale, map, opacity],
  );
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, index) => particleSeed(index)),
    [count],
  );
  const velocity = useMemo(() => new Vector3(), []);
  const start = useMemo(() => new Vector3(), []);
  const positionValue = useMemo(() => new Vector3(), []);
  const orbitalRotation = useMemo(() => new Euler(), []);
  const currentColor = useMemo(() => new Color(), []);

  useEffect(() => {
    elapsedRef.current = 0;
    restartRevisionRef.current = 0;
  }, [config]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_state, delta) => {
    const runtime = runtimeBridge.read();
    const restartRevision = runtime.restartRevision ?? 0;
    if (restartRevisionRef.current !== restartRevision) {
      restartRevisionRef.current = restartRevision;
      elapsedRef.current = 0;
    }
    material.size =
      baseParticleSize(config) * Math.max(0, runtime.sizeMultiplier ?? 1);
    material.color.set(runtime.color ?? color);
    material.opacity =
      clampUnit(opacity) *
      clampUnit(displayOpacityScale) *
      clampUnit(runtime.opacity ?? 1);
    if (runtime.stopped) {
      elapsedRef.current = 0;
      if (pointsRef.current) pointsRef.current.visible = false;
      clearGeometry(geometry, count);
      return;
    }
    if (runtime.playing === false) return;

    elapsedRef.current += Math.min(delta, 0.1);
    const elapsed = elapsedRef.current;
    const position = geometry.getAttribute("position") as BufferAttribute;
    const colors = geometry.getAttribute("color") as BufferAttribute;
    const emissionPlan =
      runtime.emissionRate === undefined
        ? authoredEmissionPlan
        : createXriftParticleEmissionPlan(config, runtime.emissionRate);
    const speedMultiplier = Math.max(0, runtime.speedMultiplier ?? 1);
    let visibleParticleCount = 0;

    for (let index = 0; index < count; index += 1) {
      if (index >= emissionPlan.activeCount) {
        hideParticle(position, colors, index);
        continue;
      }
      const seed = seeds[index]!;
      const startDelay = mix(
        config.startDelay.min,
        config.startDelay.max,
        seed.c,
      );
      const bornAt = resolveXriftParticleBirthTime(
        emissionPlan,
        index,
        elapsed,
        startDelay,
      );
      if (bornAt === null) {
        hideParticle(position, colors, index);
        continue;
      }
      const rawAge = elapsed - bornAt;
      const lifetime = Math.max(
        0.01,
        mix(config.startLifetime.min, config.startLifetime.max, seed.b),
      );
      if (rawAge < 0 || rawAge > lifetime) {
        hideParticle(position, colors, index);
        continue;
      }
      const age = rawAge;
      visibleParticleCount += 1;
      const normalizedAge = Math.max(0, Math.min(1, age / lifetime));
      const speed =
        mix(config.startSpeed.min, config.startSpeed.max, seed.speed) *
        speedMultiplier;
      initialParticle(config.shape, seed, start, velocity);
      velocity.multiplyScalar(speed);
      positionValue.set(
        start.x +
          (velocity.x + config.velocityOverLifetime.linear[0]) * age +
          config.gravity[0] * age * age * 0.5,
        start.y +
          (velocity.y + config.velocityOverLifetime.linear[1]) * age +
          config.gravity[1] * age * age * 0.5,
        start.z +
          (velocity.z + config.velocityOverLifetime.linear[2]) * age +
          config.gravity[2] * age * age * 0.5,
      );
      orbitalRotation.set(
        config.velocityOverLifetime.orbital[0] * age,
        config.velocityOverLifetime.orbital[1] * age,
        config.velocityOverLifetime.orbital[2] * age,
      );
      positionValue.applyEuler(orbitalRotation);
      position.setXYZ(
        index,
        positionValue.x,
        positionValue.y,
        positionValue.z,
      );
      const startColor = config.colorOverLifetime.start;
      const endColor = config.colorOverLifetime.end;
      currentColor.setRGB(
        mix(startColor[0], endColor[0], normalizedAge),
        mix(startColor[1], endColor[1], normalizedAge),
        mix(startColor[2], endColor[2], normalizedAge),
        SRGBColorSpace,
      );
      colors.setXYZW(
        index,
        currentColor.r,
        currentColor.g,
        currentColor.b,
        mix(startColor[3], endColor[3], normalizedAge),
      );
    }
    position.needsUpdate = true;
    colors.needsUpdate = true;
    if (pointsRef.current) {
      pointsRef.current.visible = visibleParticleCount > 0;
    }
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      userData={runtimeUserData}
      castShadow={config.renderer.castShadow}
      receiveShadow={config.renderer.receiveShadow}
    />
  );
};

function createBurstBirthTimes(
  bursts: XriftParticleConfig["emission"]["bursts"],
  duration: number,
  capacity: number,
): number[] {
  if (capacity <= 0) return [];
  const scheduled: Array<{ time: number; count: number }> = [];
  for (const burst of bursts) {
    const cycles = Math.max(1, Math.floor(burst.cycles));
    const count = Math.max(0, Math.floor(burst.count));
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const time = Math.max(0, burst.time) + cycle * Math.max(0, burst.interval);
      if (time > duration) continue;
      scheduled.push({ time, count });
    }
  }
  scheduled.sort((left, right) => left.time - right.time);
  const birthTimes: number[] = [];
  for (const burst of scheduled) {
    for (
      let particle = 0;
      particle < burst.count && birthTimes.length < capacity;
      particle += 1
    ) {
      birthTimes.push(burst.time);
    }
    if (birthTimes.length >= capacity) break;
  }
  return birthTimes;
}

function baseParticleSize(config: XriftParticleConfig): number {
  return Math.max(
    0.001,
    ((config.startSize.min + config.startSize.max) / 2) *
      ((config.sizeOverLifetime.min + config.sizeOverLifetime.max) / 2),
  );
}

function createGeometry(count: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3 + 1] = -10_000;
  }
  const position = new BufferAttribute(positions, 3);
  const color = new BufferAttribute(colors, 4);
  position.setUsage(DynamicDrawUsage);
  color.setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", position);
  geometry.setAttribute("color", color);
  return geometry;
}

function clearGeometry(geometry: BufferGeometry, count: number): void {
  const position = geometry.getAttribute("position") as BufferAttribute;
  const colors = geometry.getAttribute("color") as BufferAttribute;
  for (let index = 0; index < count; index += 1) {
    hideParticle(position, colors, index);
  }
  position.needsUpdate = true;
  colors.needsUpdate = true;
}

function hideParticle(
  position: BufferAttribute,
  colors: BufferAttribute,
  index: number,
): void {
  position.setXYZ(index, 0, -10_000, 0);
  colors.setXYZW(index, 0, 0, 0, 0);
}

function particleSeed(index: number): ParticleSeed {
  return {
    a: hash(index * 4 + 1),
    b: hash(index * 4 + 2),
    c: hash(index * 4 + 3),
    speed: hash(index * 4 + 4),
  };
}

function hash(value: number): number {
  const result = Math.sin(value * 12.9898 + 78.233) * 43_758.5453;
  return result - Math.floor(result);
}

function mix(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function initialParticle(
  shape: XriftParticleConfig["shape"],
  seed: ParticleSeed,
  start: Vector3,
  direction: Vector3,
): void {
  start.set(0, 0, 0);
  if (shape.type === "sphere") {
    const theta = seed.a * Math.PI * 2;
    const phi = Math.acos(seed.b * 2 - 1);
    const radius = shape.radius * Math.cbrt(seed.c);
    direction.set(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta),
    );
    start.copy(direction).multiplyScalar(radius);
    return;
  }
  if (shape.type === "box") {
    start.set(
      (seed.a - 0.5) * shape.size[0],
      (seed.b - 0.5) * shape.size[1],
      (seed.c - 0.5) * shape.size[2],
    );
    direction.set(0, 1, 0);
    return;
  }
  if (shape.type === "cone") {
    const theta = seed.a * Math.PI * 2;
    const radial = Math.sqrt(seed.b) * shape.radius;
    start.set(Math.cos(theta) * radial, 0, Math.sin(theta) * radial);
    const slope = Math.tan((shape.angle * Math.PI) / 180);
    direction
      .set(Math.cos(theta) * slope, 1, Math.sin(theta) * slope)
      .normalize();
    return;
  }
  direction.set(0, 1, 0);
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
