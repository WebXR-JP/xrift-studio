import { Matrix4, Quaternion, Vector3, type Group } from "three";

export type VehicleGroundSettings = {
  speed: number;
  turnRate: number;
  followGround: boolean;
  maxSlope: number;
};
export type VehicleGroundQuery = (origin: Vector3, distance: number) => {
  point: Vector3;
  normal: Vector3;
} | null;

/** Shared as portable source with the Vehicle template. Only the driver's
 * onDrive callback writes the official Vehicle's pose, preserving its sync.
 * This is ground following, not a suspension or collision-response solver.
 */
export function createVehicleGroundDrive(query: VehicleGroundQuery) {
  const position = new Vector3();
  const scale = new Vector3();
  const rotation = new Quaternion();
  const parentRotation = new Quaternion();
  const heading = new Vector3();
  const up = new Vector3();
  const right = new Vector3();
  const backward = new Vector3();
  const offset = new Vector3();
  const origin = new Vector3();
  const basis = new Matrix4();
  const worldUp = new Vector3(0, 1, 0);
  const wheels = [[-0.8732, -0.83], [0.8732, -0.83], [-0.8732, 0.83], [0.8732, 0.83]];

  return (input: { forward: number; right: number }, delta: number, vehicle: Group, settings: VehicleGroundSettings) => {
    const dt = Math.min(Math.max(delta, 0), 0.1);
    if (!settings.followGround) {
      vehicle.translateZ(-input.forward * settings.speed * dt);
      vehicle.rotateY(-input.right * settings.turnRate * dt);
      return;
    }
    // Small distance steps prevent driving over a gap between frame samples.
    const steps = Math.max(1, Math.ceil(Math.abs(input.forward * settings.speed * dt) / 0.1));
    for (let step = 0; step < steps; step += 1) {
      vehicle.updateWorldMatrix(true, false);
      vehicle.matrixWorld.decompose(position, rotation, scale);
      if (Math.min(scale.x, scale.y, scale.z) <= 0.0001) return;
      heading.set(0, 0, -1).applyQuaternion(rotation);
      heading.y = 0;
      if (heading.lengthSq() < 0.0001) return;
      heading.normalize().applyAxisAngle(worldUp, -input.right * settings.turnRate * dt / steps);
      position.addScaledVector(heading, input.forward * settings.speed * dt / steps);
      // Probe across the proposed heading. Exclude sensors
      // and moving actors in the Rapier query supplied by Render.
      up.set(0, 0, 0);
      const minNormalY = Math.cos(settings.maxSlope * Math.PI / 180);
      const yaw = Math.atan2(-heading.x, -heading.z);
      for (const [x, z] of wheels) {
        offset.set(x! * scale.x, 0, z! * scale.z).applyAxisAngle(worldUp, yaw);
        origin.copy(position).add(offset);
        origin.y += 1.5 * scale.y;
        const hit = query(origin, 3 * scale.y);
        if (!hit || hit.normal.y < minNormalY) return;
        up.add(hit.normal);
      }
      up.normalize();
      backward.copy(heading).negate().projectOnPlane(up).normalize();
      right.crossVectors(up, backward).normalize();
      basis.makeBasis(right, up, backward);
      rotation.setFromRotationMatrix(basis);
      // Highest support prevents the tires sinking into a ramp transition.
      let height = -Infinity;
      wheels.forEach(([x, z]) => {
        offset.set(x! * scale.x, 0.01 * scale.y, z! * scale.z).applyQuaternion(rotation);
        origin.copy(position).add(offset);
        origin.y += 1.5 * scale.y;
        const hit = query(origin, 3 * scale.y);
        if (!hit || hit.normal.y < minNormalY) {
          height = NaN;
          return;
        }
        height = Math.max(height, hit.point.y - offset.y);
      });
      if (!Number.isFinite(height)) return;
      // A curb is not a ramp. Keep large discontinuities from teleporting the car.
      if (Math.abs(height - position.y) > 0.6 * scale.y) return;
      position.y = height;
      if (vehicle.parent) {
        vehicle.parent.worldToLocal(position);
        vehicle.parent.getWorldQuaternion(parentRotation).invert();
        rotation.premultiply(parentRotation);
      }
      vehicle.position.copy(position);
      vehicle.quaternion.copy(rotation);
      vehicle.updateMatrixWorld(true);
    }
  };
}
