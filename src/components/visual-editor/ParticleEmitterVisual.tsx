import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  NormalBlending,
  Points,
  PointsMaterial,
  Vector3,
} from "three";
import {
  normalizeParticleProperties,
  type ParticleAsset,
} from "../../lib/visual-editor";

const MAX_EDITOR_PARTICLES = 512;

export function ParticleEmitterVisual({
  asset,
  selected,
}: {
  asset: ParticleAsset;
  selected: boolean;
}) {
  const properties = useMemo(
    () => normalizeParticleProperties(asset.properties),
    [asset.properties],
  );
  const count = Math.max(
    1,
    Math.min(
      MAX_EDITOR_PARTICLES,
      properties.maxParticles,
      Math.ceil(
        properties.emission.rateOverTime *
          Math.max(properties.startLifetime.min, properties.startLifetime.max),
      ),
    ),
  );
  const pointsRef = useRef<Points>(null);
  const elapsedRef = useRef(0);
  const geometry = useMemo(() => createGeometry(count), [count]);
  const material = useMemo(
    () =>
      new PointsMaterial({
        size: Math.max(
          0.01,
          (properties.startSize.min + properties.startSize.max) / 2,
        ),
        sizeAttenuation: true,
        transparent: true,
        opacity: selected ? 1 : 0.9,
        vertexColors: true,
        depthWrite: properties.renderer.blending !== "additive",
        blending:
          properties.renderer.blending === "additive"
            ? AdditiveBlending
            : NormalBlending,
      }),
    [
      properties.renderer.blending,
      properties.startSize.max,
      properties.startSize.min,
      selected,
    ],
  );
  const seeds = useMemo(
    () => Array.from({ length: count }, (_, index) => particleSeed(index)),
    [count],
  );
  const velocity = useMemo(() => new Vector3(), []);
  const start = useMemo(() => new Vector3(), []);
  const color = useMemo(() => new Color(), []);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [asset.id, asset.properties]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((_, delta) => {
    elapsedRef.current += Math.min(delta, 0.1);
    const position = geometry.getAttribute("position") as BufferAttribute;
    const colors = geometry.getAttribute("color") as BufferAttribute;
    const elapsed = elapsedRef.current;
    const lifetime = Math.max(
      0.01,
      (properties.startLifetime.min + properties.startLifetime.max) / 2,
    );
    const rate = Math.max(0.01, properties.emission.rateOverTime);
    const startColor = properties.colorOverLifetime.start;
    const endColor = properties.colorOverLifetime.end;

    for (let index = 0; index < count; index += 1) {
      const seed = seeds[index];
      const bornAt = index / rate + properties.startDelay.min;
      const rawAge = elapsed - bornAt;
      if (rawAge < 0 && !properties.prewarm) {
        position.setXYZ(index, 0, -10_000, 0);
        continue;
      }
      const age = properties.looping
        ? ((rawAge % lifetime) + lifetime) % lifetime
        : rawAge;
      if (!properties.looping && (age < 0 || age > lifetime)) {
        position.setXYZ(index, 0, -10_000, 0);
        continue;
      }
      const normalizedAge = Math.max(0, Math.min(1, age / lifetime));
      const speed = mix(properties.startSpeed.min, properties.startSpeed.max, seed.speed);
      initialParticle(properties.shape, seed, start, velocity);
      velocity.multiplyScalar(speed);
      const x =
        start.x +
        (velocity.x + properties.velocityOverLifetime.linear[0]) * age +
        properties.gravity[0] * age * age * 0.5;
      const y =
        start.y +
        (velocity.y + properties.velocityOverLifetime.linear[1]) * age +
        properties.gravity[1] * age * age * 0.5;
      const z =
        start.z +
        (velocity.z + properties.velocityOverLifetime.linear[2]) * age +
        properties.gravity[2] * age * age * 0.5;
      const orbit = properties.velocityOverLifetime.orbital[1] * age;
      const cosine = Math.cos(orbit);
      const sine = Math.sin(orbit);
      position.setXYZ(index, x * cosine - z * sine, y, x * sine + z * cosine);
      color.setRGB(
        mix(startColor[0], endColor[0], normalizedAge),
        mix(startColor[1], endColor[1], normalizedAge),
        mix(startColor[2], endColor[2], normalizedAge),
      );
      colors.setXYZ(index, color.r, color.g, color.b);
    }
    position.needsUpdate = true;
    colors.needsUpdate = true;
    const points = pointsRef.current;
    if (points) points.visible = properties.looping || elapsed <= properties.duration;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

type ParticleSeed = {
  a: number;
  b: number;
  c: number;
  speed: number;
};

function createGeometry(count: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = new BufferAttribute(new Float32Array(count * 3), 3);
  const colors = new BufferAttribute(new Float32Array(count * 3), 3);
  positions.setUsage(DynamicDrawUsage);
  colors.setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("color", colors);
  return geometry;
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

function initialParticle(
  shape: ReturnType<typeof normalizeParticleProperties>["shape"],
  seed: ParticleSeed,
  start: Vector3,
  direction: Vector3,
) {
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
    direction.set(Math.cos(theta) * slope, 1, Math.sin(theta) * slope).normalize();
    return;
  }
  direction.set(0, 1, 0);
}

function mix(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}
