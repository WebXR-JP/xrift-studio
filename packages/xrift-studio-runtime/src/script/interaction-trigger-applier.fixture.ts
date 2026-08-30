import { Mesh, MeshStandardMaterial, Object3D } from "three";

import {
  XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY,
  createXriftAudioSourceRuntimeBridge,
  type XriftAudioSourcePlayResult,
  type XriftAudioSourceRuntimeController,
} from "./audio-source.js";
import {
  XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
  createXriftLightRuntimeBridge,
} from "./light.js";
import { createXriftInteractionApplier } from "./interaction-trigger-runtime.js";
import {
  XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY,
  createXriftParticleRuntimeBridge,
} from "./particle.js";
import {
  XRIFT_SCENE_RUNTIME_USER_DATA_KEY,
  createXriftSceneRuntimeBridge,
} from "./scene-runtime.js";
import {
  XRIFT_INTERACTION_SCENE_ENTITY_ID,
  XRIFT_INTERACTION_SELF_ENTITY_ID,
} from "./interaction-trigger.js";
import type { XriftInteractionAction } from "./interaction-trigger.js";

/**
 * The write half of an Interaction Trigger, against a plain scene graph.
 *
 * This is the part that changes a running world, and the two ways it can go
 * wrong are invisible in a rendered preview: writing to a Component that is not
 * the chosen one, and leaving an override applied after Stop.
 */
export async function runInteractionTriggerApplierFixtureAssertions(): Promise<void> {
  const root = new Object3D();
  const button = entityObject("entity-button");
  const speaker = entityObject("entity-speaker");
  const child = entityObject("entity-speaker-child");
  const sign = entityObject("entity-sign");
  root.add(button, speaker, sign);
  speaker.add(child);

  const light = createXriftLightRuntimeBridge({
    componentId: "component-light",
    lightType: "point",
    enabled: false,
    color: "#ffffff",
    intensity: 1,
  });
  const otherLight = createXriftLightRuntimeBridge({
    componentId: "component-light-2",
    lightType: "point",
    enabled: false,
    color: "#ffffff",
    intensity: 1,
  });
  attach(speaker, XRIFT_LIGHT_RUNTIME_USER_DATA_KEY, light);
  attach(speaker, XRIFT_LIGHT_RUNTIME_USER_DATA_KEY, otherLight);

  const audio = createXriftAudioSourceRuntimeBridge({
    componentId: "component-audio",
    audioAssetId: "audio-click",
    spatial: true,
    enabled: true,
    sourceStatus: "available",
    volume: 1,
    loop: false,
    autoplay: false,
  });
  const controller = new FixtureAudioController();
  audio.connect(controller);
  await audio.refresh();
  attach(speaker, XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY, audio);

  // A nested Entity's Audio Source must stay out of reach of a trigger aimed
  // at its parent.
  const childAudio = createXriftAudioSourceRuntimeBridge({
    componentId: "component-audio",
    audioAssetId: "audio-child",
    spatial: true,
    enabled: true,
    sourceStatus: "available",
    volume: 1,
    loop: false,
    autoplay: false,
  });
  const childController = new FixtureAudioController();
  childAudio.connect(childController);
  await childAudio.refresh();
  attach(child, XRIFT_AUDIO_SOURCE_RUNTIME_USER_DATA_KEY, childAudio);

  const applier = createXriftInteractionApplier({
    root,
    componentId: "component-trigger",
    order: 0,
  });

  sign.visible = false;
  applier.apply(
    action({
      entityId: "entity-sign",
      componentId: null,
      target: "entity",
      property: "enabled",
      value: { kind: "bool", value: true },
    }),
  );
  assert(sign.visible, "showing a hidden Entity did not apply");
  applier.apply(
    action({
      entityId: "entity-sign",
      componentId: null,
      target: "entity",
      property: "enabled",
      mode: "toggle",
      value: null,
    }),
  );
  assert(!sign.visible, "toggling an Entity did not read its current state");

  applier.apply(
    action({
      entityId: "entity-speaker",
      componentId: "component-light",
      target: "light",
      property: "intensity",
      value: { kind: "float", value: 4 },
    }),
  );
  applier.apply(
    action({
      entityId: "entity-speaker",
      componentId: "component-light",
      target: "light",
      property: "enabled",
      mode: "toggle",
      value: null,
    }),
  );
  assert(
    light.read().intensity === 4 && light.read().enabled,
    "two writes to one Light did not compose into a single override",
  );
  assert(
    otherLight.read().intensity === 1 && !otherLight.read().enabled,
    "a Light the action did not name was written to",
  );

  applier.apply(
    action({
      entityId: "entity-speaker",
      componentId: "component-audio",
      target: "audio-source",
      property: "playback",
      value: { kind: "enum", value: "play" },
    }),
  );
  applier.apply(
    action({
      entityId: "entity-speaker",
      componentId: "component-audio",
      target: "audio-source",
      property: "volume",
      value: { kind: "float", value: 0.25 },
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
  assert(
    audio.read().playback === "play" && audio.read().volume === 0.25,
    "the Audio Source did not receive the trigger's command and volume",
  );
  assert(
    childAudio.read().playback !== "play",
    "a child Entity's Audio Source was written by its parent's trigger",
  );

  applier.apply(
    action({
      entityId: "entity-missing",
      componentId: null,
      target: "entity",
      property: "enabled",
      value: { kind: "bool", value: true },
    }),
  );

  // Transform is written straight onto the object, so the assertion that
  // matters is that Stop puts it back exactly where the Scene had it. A fresh
  // Entity is used because the restore point is captured at the first write,
  // and `sign` was already written to by the visibility case above.
  const platform = entityObject("entity-platform");
  platform.position.set(1, 2, 3);
  root.add(platform);
  applier.apply(
    action({
      entityId: "entity-platform",
      componentId: "transform",
      target: "transform",
      property: "position",
      value: { kind: "vector3", value: [4, 5, 6] },
    }),
  );
  // Read into locals: the assertion helper narrows what it is given, and a
  // narrowed `sign.position.x` would make the restore assertion below
  // unreachable to the type checker.
  const movedTo = [platform.position.x, platform.position.y, platform.position.z].join(",");
  assert(movedTo === "4,5,6", "writing a Transform position did not apply");
  applier.apply(
    action({
      entityId: "entity-platform",
      componentId: "transform",
      target: "transform",
      property: "rotation",
      value: { kind: "vector3", value: [0, 90, 0] },
    }),
  );
  const turnedTo = platform.rotation.y;
  assert(
    Math.abs(turnedTo - Math.PI / 2) < 1e-6,
    "a Transform rotation was not converted from degrees",
  );
  assert(
    applier.read({
      entityId: "entity-platform",
      componentId: "transform",
      targetKind: "transform",
      property: "rotation",
    })?.kind === "vector3",
    "a Transform rotation could not be read back",
  );

  // A Material write owns a clone first: the Asset is shared, so writing the
  // instance the Mesh happened to hold would recolour every other Entity.
  const shared = new MeshStandardMaterial({ color: 0xffffff });
  const lamp = entityObject("entity-lamp");
  const lampMesh = new Mesh(undefined, shared);
  lamp.add(lampMesh);
  const bystander = entityObject("entity-bystander");
  const bystanderMesh = new Mesh(undefined, shared);
  bystander.add(bystanderMesh);
  root.add(lamp, bystander);
  applier.apply(
    action({
      entityId: "entity-lamp",
      componentId: "material",
      target: "material",
      property: "baseColor",
      value: { kind: "color", value: [1, 0, 0] },
    }),
  );
  const lampMaterial = lampMesh.material as MeshStandardMaterial;
  const lampIsRed = lampMaterial.color.r === 1 && lampMaterial.color.g === 0;
  assert(lampIsRed, "a Material colour write did not reach the Entity's Mesh");
  assert(
    lampMaterial !== shared,
    "a Material write changed the shared Asset instead of an owned clone",
  );
  const bystanderMaterial = bystanderMesh.material as MeshStandardMaterial;
  const bystanderUntouched = bystanderMaterial.color.g === 1;
  assert(
    bystanderUntouched,
    "a Material write leaked into another Entity using the same Material",
  );
  applier.apply(
    action({
      entityId: "entity-lamp",
      componentId: "material",
      target: "material",
      property: "opacity",
      value: { kind: "float", value: 0.25 },
    }),
  );
  const lampOpacity = (lampMesh.material as MeshStandardMaterial).opacity;
  const lampTransparent = (lampMesh.material as MeshStandardMaterial).transparent;
  assert(
    lampOpacity === 0.25 && lampTransparent,
    "a Material opacity write did not switch the Material to the transparent pass",
  );

  // A Particle emitter is addressed by its Component id, so an Entity carrying
  // two effects can start one without the other.
  const smoke = createXriftParticleRuntimeBridge({ componentId: "component-smoke" });
  const sparks = createXriftParticleRuntimeBridge({ componentId: "component-sparks" });
  attach(sign, XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY, smoke);
  attach(sign, XRIFT_PARTICLE_RUNTIME_USER_DATA_KEY, sparks);
  applier.apply(
    action({
      entityId: "entity-sign",
      componentId: "component-sparks",
      target: "particle",
      property: "emitting",
      value: { kind: "bool", value: true },
    }),
  );
  assert(
    sparks.read().playing === true && sparks.read().stopped === false,
    "starting a Particle emitter did not reach its bridge",
  );
  assert(
    smoke.read().playing === undefined,
    "starting one Particle emitter also started the other",
  );
  applier.apply(
    action({
      entityId: "entity-sign",
      componentId: "component-sparks",
      target: "particle",
      property: "emissionRate",
      value: { kind: "float", value: 120 },
    }),
  );
  assert(
    sparks.read().emissionRate === 120 && sparks.read().playing === true,
    "writing a second Particle property discarded the first",
  );
  const beforeBurst = sparks.read().restartRevision ?? 0;
  applier.apply(
    action({
      entityId: "entity-sign",
      componentId: "component-sparks",
      target: "particle",
      property: "restart",
      value: { kind: "bool", value: true },
    }),
  );
  assert(
    (sparks.read().restartRevision ?? 0) > beforeBurst,
    "a Particle burst did not restart the emitter",
  );

  // Scene-wide writes go to the bridge on the Scene root, not to an Entity,
  // and releasing the trigger has to put the authored look back.
  const sceneBridge = createXriftSceneRuntimeBridge();
  (root.userData as Record<string, unknown>)[
    XRIFT_SCENE_RUNTIME_USER_DATA_KEY
  ] = sceneBridge;
  applier.apply(
    action({
      entityId: XRIFT_INTERACTION_SCENE_ENTITY_ID,
      componentId: null,
      target: "scene",
      property: "fade",
      value: { kind: "float", value: 1 },
    }),
  );
  applier.apply(
    action({
      entityId: XRIFT_INTERACTION_SCENE_ENTITY_ID,
      componentId: null,
      target: "scene",
      property: "exposure",
      value: { kind: "float", value: 4 },
    }),
  );
  const fadedTo = sceneBridge.read().fade;
  const exposedTo = sceneBridge.read().exposure;
  assert(fadedTo === 1, "a Scene fade did not reach the Scene bridge");
  assert(exposedTo === 4, "a Scene exposure did not reach the Scene bridge");

  applier.dispose();
  assert(
    lampMesh.material === shared,
    "a Material write survived the trigger's disposal",
  );
  assert(
    sparks.read().playing === undefined && sparks.read().emissionRate === undefined,
    "Particle overrides survived the trigger's disposal",
  );
  assert(
    sceneBridge.read().fade === 0 && sceneBridge.read().exposure === null,
    "Scene overrides survived the trigger's disposal",
  );
  const restoredTo = [platform.position.x, platform.position.y, platform.position.z].join(",");
  assert(
    restoredTo === "1,2,3",
    "a Transform write survived the trigger's disposal",
  );
  const restoredTurn = platform.rotation.y;
  assert(
    restoredTurn === 0,
    "a Transform rotation survived the trigger's disposal",
  );
  assert(
    light.read().intensity === 1 && !light.read().enabled,
    "Light overrides survived the trigger's disposal",
  );
  assert(
    audio.read().volume === 1,
    "Audio Source overrides survived the trigger's disposal",
  );

  // The same graph on two Entities has to move the one it is attached to. An
  // action naming the self sentinel resolves to whoever owns the trigger, and
  // an unspecified component means "whichever one that Entity turns out to
  // have" — the only thing a reusable graph can say about a Light it has never
  // seen.
  {
    const ownRoot = new Object3D();
    const doorA = entityObject("entity-door-a");
    const doorB = entityObject("entity-door-b");
    ownRoot.add(doorA, doorB);
    const lampA = createXriftLightRuntimeBridge({
      componentId: "component-light-a",
      lightType: "point",
      enabled: true,
      color: "#ffffff",
      intensity: 1,
    });
    attach(doorA, XRIFT_LIGHT_RUNTIME_USER_DATA_KEY, lampA);

    for (const [entityId, door] of [
      ["entity-door-a", doorA],
      ["entity-door-b", doorB],
    ] as const) {
      const applier = createXriftInteractionApplier({
        root: ownRoot,
        componentId: "component-trigger",
        order: 0,
        selfEntityId: entityId,
      });
      door.visible = true;
      applier.apply(
        action({
          entityId: XRIFT_INTERACTION_SELF_ENTITY_ID,
          componentId: null,
          target: "entity",
          property: "enabled",
          value: { kind: "bool", value: false },
        }),
      );
    }
    assert(
      doorA.visible === false && doorB.visible === false,
      "the self sentinel did not resolve to the Entity that owns the trigger",
    );

    const owningApplier = createXriftInteractionApplier({
      root: ownRoot,
      componentId: "component-trigger",
      order: 0,
      selfEntityId: "entity-door-a",
    });
    owningApplier.apply(
      action({
        entityId: XRIFT_INTERACTION_SELF_ENTITY_ID,
        // Unspecified on purpose: the graph does not know this Light's id.
        componentId: "",
        target: "light",
        property: "intensity",
        value: { kind: "float", value: 4 },
      }),
    );
    assert(
      Math.abs(lampA.read().intensity - 4) < 1e-6,
      "an unspecified component did not reach the Light the Entity actually has",
    );
  }

}

function entityObject(entityId: string): Object3D {
  const object = new Object3D();
  object.userData.renderedEntityId = entityId;
  return object;
}

function attach(parent: Object3D, key: string, bridge: unknown): void {
  const holder = new Object3D();
  holder.userData[key] = bridge;
  parent.add(holder);

}

function action(
  input: Omit<XriftInteractionAction, "nodeIndex" | "mode"> &
    Partial<Pick<XriftInteractionAction, "mode">>,
): XriftInteractionAction {
  return { nodeIndex: 0, mode: "set", ...input };
}

class FixtureAudioController implements XriftAudioSourceRuntimeController {
  volume = 1;
  loop = false;
  currentTime = 0;
  playing = false;

  setVolume(value: number): void {
    this.volume = value;
  }

  setLoop(value: boolean): void {
    this.loop = value;
  }

  async play(): Promise<XriftAudioSourcePlayResult> {
    this.playing = true;
    return "playing";
  }

  pause(): boolean {
    this.playing = false;
    return true;
  }

  stop(): boolean {
    this.playing = false;
    this.currentTime = 0;
    return true;
  }

  seek(time: number): boolean {
    this.currentTime = time;
    return true;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Interaction trigger applier fixture: ${message}`);
}
