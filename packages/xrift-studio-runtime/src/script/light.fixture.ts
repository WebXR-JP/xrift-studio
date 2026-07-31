import { Object3D } from "three";

import {
  XRIFT_LIGHT_RUNTIME_USER_DATA_KEY,
  createXriftLightRuntimeBridge,
  createXriftLightRuntimeResources,
  type XriftLightRuntimeBridge,
  type XriftLightType,
} from "./light.js";

/** DOM-free contract checks for the shared Studio / published Light runtime. */
export function runLightRuntimeFixtureAssertions(): void {
  const bridge = createXriftLightRuntimeBridge({
    componentId: "light-standalone",
    lightType: "point",
    enabled: true,
    color: "#ffffff",
    intensity: 1,
    distance: 5,
  });
  const earlierOwner = {};
  const laterOwner = {};
  bridge.setOwner(earlierOwner, 1, "script-a", {
    color: "#ff0000",
    intensity: 2,
  });
  bridge.setOwner(laterOwner, 2, "script-b", {
    intensity: 4,
    distance: 12,
  });
  assert(
    bridge.read().color === "#ff0000" &&
      bridge.read().intensity === 4 &&
      bridge.read().distance === 12,
    "Light owners were not composed in Script order",
  );
  bridge.configure({
    color: "#00ff00",
    intensity: 0.5,
    distance: 3,
  });
  assert(
    bridge.read().color === "#ff0000" &&
      bridge.read().intensity === 4,
    "an authored edit replaced active Script overrides",
  );
  bridge.removeOwner(laterOwner);
  assert(
    bridge.read().intensity === 2 && bridge.read().distance === 3,
    "removing a later owner did not reveal the earlier/authored values",
  );
  bridge.removeOwner(earlierOwner);
  assert(
    bridge.read().color === "#00ff00" &&
      bridge.read().intensity === 0.5 &&
      bridge.read().distance === 3,
    "Light owner cleanup did not restore authored values",
  );

  const root = entityObject("entity-root");
  const point = lightObject("light-point", "point", {
    enabled: true,
    color: "#ffffff",
    intensity: 1,
    distance: 4,
  });
  const ambient = lightObject("light-ambient", "ambient", {
    enabled: true,
    color: "#eeeeff",
    intensity: 0.25,
  });
  root.add(point.object, ambient.object);
  const child = entityObject("entity-child");
  const childLight = lightObject("light-child", "point", {
    enabled: true,
    color: "#ffffff",
    intensity: 9,
    distance: 2,
  });
  child.add(childLight.object);
  root.add(child);

  const earlier = createXriftLightRuntimeResources({
    object3d: root,
    entityId: "entity-root",
    componentId: "script-earlier",
    order: 1,
  });
  const later = createXriftLightRuntimeResources({
    object3d: root,
    entityId: "entity-root",
    componentId: "script-later",
    order: 2,
  });
  assert(
    earlier.lights.count() === 2 &&
      earlier.lights.list().length === 2 &&
      !earlier.lights
        .list()
        .some((entry) => entry.componentId === "light-child"),
    "ctx.lights crossed the child Entity boundary",
  );

  earlier.lights.setIntensity(2);
  later.lights.setIntensity(4);
  assert(
    point.bridge.read().intensity === 4 &&
      ambient.bridge.read().intensity === 4,
    "later Script Light overrides did not win",
  );
  later.dispose();
  assert(
    point.bridge.read().intensity === 2 &&
      ambient.bridge.read().intensity === 2,
    "disposing the later Script did not reveal the earlier override",
  );
  const selectedAll = earlier.lights.select({});
  selectedAll.setIntensity(3);
  earlier.lights.setIntensity(2);
  assert(
    point.bridge.read().intensity === 2 &&
      ambient.bridge.read().intensity === 2,
    "select({}) replaced the top-level ctx.lights override layer",
  );

  const points = earlier.lights.select({ lightType: "point" });
  assert(
    points.count() === 1 &&
      points.setDistance(16) === 1 &&
      point.bridge.read().distance === 16,
    "Point Light selection or distance override failed",
  );
  const ambientOnly = earlier.lights.select({ lightType: "ambient" });
  assert(
    ambientOnly.setDistance(99) === 0 &&
      ambient.bridge.read().distance === undefined,
    "setDistance reported or applied support for a non-distance Light",
  );

  points.setColor("#ff0000");
  earlier.lights.setColor("#0000ff");
  assert(
    point.bridge.read().color === "#0000ff" &&
      ambient.bridge.read().color === "#0000ff",
    "the latest field write within one Script did not win",
  );
  points.setColor("#ff0000");
  assert(
    point.bridge.read().color === "#ff0000" &&
      ambient.bridge.read().color === "#0000ff",
    "a selected Light override escaped its selector",
  );

  const late = lightObject("light-late", "spot", {
    enabled: false,
    color: "#ffffff",
    intensity: 0.75,
    distance: 6,
  });
  root.add(late.object);
  earlier.lights.setEnabled(true);
  earlier.update();
  assert(
    late.bridge.read().enabled &&
      late.bridge.read().intensity === 2 &&
      late.bridge.read().color === "#0000ff",
    "a late-mounted or authored-disabled Light did not receive live overrides",
  );

  root.remove(point.object);
  earlier.update();
  assert(
    point.bridge.read().intensity === 1 &&
      point.bridge.read().color === "#ffffff" &&
      point.bridge.read().distance === 4,
    "a removed Light retained a Script owner",
  );
  const replacement = lightObject("light-point", "spot", {
    enabled: true,
    color: "#ffffff",
    intensity: 0.5,
    distance: 8,
  });
  root.add(replacement.object);
  earlier.update();
  assert(
    replacement.bridge.read().intensity === 2 &&
      replacement.bridge.read().color === "#0000ff" &&
      replacement.bridge.read().distance === 8,
    "a replacement Light did not receive matching live owner state",
  );

  earlier.lights.reset();
  assert(
    ambient.bridge.read().intensity === 0.25 &&
      late.bridge.read().intensity === 0.75 &&
      !late.bridge.read().enabled &&
      replacement.bridge.read().intensity === 0.5,
    "ctx.lights.reset did not restore every authored Light value",
  );
  earlier.dispose();
}

function entityObject(entityId: string): Object3D {
  const object = new Object3D();
  object.userData.renderedEntityId = entityId;
  return object;
}

function lightObject(
  componentId: string,
  lightType: XriftLightType,
  authored: {
    enabled: boolean;
    color: string;
    intensity: number;
    distance?: number;
  },
): { object: Object3D; bridge: XriftLightRuntimeBridge } {
  const object = new Object3D();
  const bridge = createXriftLightRuntimeBridge({
    componentId,
    lightType,
    ...authored,
  });
  object.userData[XRIFT_LIGHT_RUNTIME_USER_DATA_KEY] = bridge;
  return { object, bridge };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Script Light runtime fixture failed: ${message}`);
  }
}
