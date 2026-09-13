/** Each viewer derives cosmetic motion from the official Vehicle's synchronized pose. */
export const VEHICLE_WHEEL_SCRIPT_ID = "script-xrift-vehicle-wheel-v1";
export const VEHICLE_SMOKE_SCRIPT_ID = "script-xrift-vehicle-smoke-v1";
export const VEHICLE_SMOKE_ASSET_ID = "particle-xrift-vehicle-exhaust-v1";
export const VEHICLE_WHEEL_POSITIONS = [
  [-0.8732, 0.32, -0.83], [0.8732, 0.32, -0.83],
  [-0.8732, 0.32, 0.83], [0.8732, 0.32, 0.83],
] as const;

const motion = `
    const object = ctx.object3d as unknown as Object3D;
    const previous = new Vector3();
    const current = new Vector3();
    const direction = new Vector3();
    let initialized = false;
    const measure = () => {
      object.getWorldPosition(current);
      if (!initialized) { previous.copy(current); initialized = true; return 0; }
      direction.subVectors(current, previous);
      previous.copy(current);
      const distance = direction.length();
      // Initial placement and teleports must not produce a burst or a wheel jump.
      if (distance > 3) return 0;
      return distance;
    };
`;
export const VEHICLE_WHEEL_SOURCE = `import { defineScript } from "xrift:script";
import { Vector3, Quaternion, type Object3D } from "three";
export default defineScript({
  name: "タイヤの回転",
  start(ctx) {
${motion}
    const scale = new Vector3();
    const quaternion = new Quaternion();
    const forward = new Vector3();
    const original = object.rotation.x;
    return {
      update() {
        const distance = measure();
        if (distance < 0.00001) return;
        object.parent?.getWorldQuaternion(quaternion);
        const sign = direction.dot(forward.set(0, 0, -1).applyQuaternion(quaternion)) >= 0 ? -1 : 1;
        object.getWorldScale(scale);
        const radius = 0.31 * Math.max(0.001, Math.abs(scale.y));
        object.rotation.x = (object.rotation.x + sign * distance / radius) % (Math.PI * 2);
      },
      stop() { object.rotation.x = original; },
    };
  },
});
`;
export const VEHICLE_SMOKE_SOURCE = `import { defineScript } from "xrift:script";
import { Vector3, type Object3D } from "three";
export default defineScript({
  name: "走行中の煙",
  start(ctx) {
${motion}
    let lastRate = -1;
    return {
      update() {
        const rate = measure() > 0.0001 ? 8 : 0;
        if (rate !== lastRate) { ctx.particles.setEmissionRate(rate); lastRate = rate; }
      },
    };
  },
});
`;
