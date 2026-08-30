import { Object3D } from "three";

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

  applier.dispose();
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
