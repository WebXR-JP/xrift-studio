import {
  createXriftParticleEmissionPlan,
  createXriftParticleRuntimeBridge,
  resolveXriftParticleBirthTime,
  type XriftParticleConfig,
} from "../../../../packages/xrift-studio-runtime/src/script/particle";
import { normalizeParticleProperties } from "../particle-system";

/** Pure ownership assertions for the Particle bridge shared by Play and publish. */
export function runParticleRuntimeFixtureAssertions(): void {
  const bridge = createXriftParticleRuntimeBridge();
  const firstOwner = {};
  const secondOwner = {};

  bridge.setOwner(firstOwner, 1, "script-a", {
    color: "#ff0000",
    emissionRate: 10,
    restartRevision: 1,
  });
  const first = bridge.read();
  assert(
    first.color === "#ff0000" &&
      first.emissionRate === 10 &&
      first.restartRevision === 1,
    "first owner overrides were not applied",
  );

  bridge.setOwner(secondOwner, 2, "script-b", {
    color: "#0000ff",
    opacity: 0.5,
    restartRevision: 1,
  });
  const layered = bridge.read();
  assert(
    layered.color === "#0000ff" &&
      layered.emissionRate === 10 &&
      layered.opacity === 0.5,
    "Particle owners were not composed in Script order",
  );
  assert(
    layered.restartRevision === 2,
    "equal owner-local restart counters must become distinct global commands",
  );

  bridge.setOwner(secondOwner, 2, "script-b", {
    color: "#00ff00",
    opacity: 0.75,
    restartRevision: 1,
  });
  assert(
    bridge.read().restartRevision === 2,
    "updating non-command overrides must not issue another restart",
  );

  bridge.removeOwner(secondOwner);
  const restored = bridge.read();
  assert(
    restored.color === "#ff0000" &&
      restored.emissionRate === 10 &&
      restored.opacity === undefined,
    "removing one owner did not reveal the preceding Script overrides",
  );

  bridge.removeOwner(firstOwner);
  const reset = bridge.read();
  assert(
    reset.color === undefined &&
      reset.emissionRate === undefined &&
      reset.restartRevision === 2,
    "removing the final owner did not clear runtime state safely",
  );

  const burstOnly = createXriftParticleEmissionPlan(
    particleConfig({
      maxParticles: 8,
      duration: 2,
      looping: false,
      emission: {
        rateOverTime: 0,
        bursts: [{ time: 0.25, count: 3, cycles: 2, interval: 0.5 }],
      },
    }),
  );
  assert(
    burstOnly.continuousSlotCount === 0 &&
      burstOnly.activeCount === 6 &&
      burstOnly.burstBirthTimes.join(",") ===
        "0.25,0.25,0.25,0.75,0.75,0.75",
    "burst-only emitters must keep their authored births",
  );

  const nonLooping = createXriftParticleEmissionPlan(
    particleConfig({
      maxParticles: 10,
      duration: 5,
      looping: false,
      startLifetime: { min: 1, max: 1 },
      emission: { rateOverTime: 10, bursts: [] },
    }),
  );
  const lateBirth = resolveXriftParticleBirthTime(
    nonLooping,
    9,
    5.2,
    0,
  );
  assert(
    lateBirth !== null && Math.abs(lateBirth - 4.9) < 0.000_001,
    "non-looping continuous slots must recycle throughout duration",
  );
  assert(
    lateBirth + 1 > 5.2,
    "particles born before duration must remain alive after emission stops",
  );

  assert(
    normalizeParticleProperties({ maxParticles: 100_000 }).maxParticles ===
      10_000,
    "authoring and runtime Particle capacity must share the 10,000 limit",
  );
}

function particleConfig(
  patch: Partial<XriftParticleConfig>,
): XriftParticleConfig {
  return {
    maxParticles: 100,
    duration: 5,
    looping: true,
    prewarm: false,
    simulationSpace: "local",
    startDelay: { min: 0, max: 0 },
    startLifetime: { min: 1, max: 1 },
    startSpeed: { min: 1, max: 1 },
    startSize: { min: 1, max: 1 },
    startRotation: { min: 0, max: 0 },
    gravity: [0, 0, 0],
    emission: { rateOverTime: 1, bursts: [] },
    shape: { type: "point" },
    colorOverLifetime: {
      start: [1, 1, 1, 1],
      end: [1, 1, 1, 0],
    },
    sizeOverLifetime: { min: 1, max: 1 },
    velocityOverLifetime: {
      linear: [0, 0, 0],
      orbital: [0, 0, 0],
    },
    renderer: {
      mode: "billboard",
      blending: "normal",
      sortMode: "none",
      castShadow: false,
      receiveShadow: false,
    },
    ...patch,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Particle runtime fixture failed: ${message}`);
}
