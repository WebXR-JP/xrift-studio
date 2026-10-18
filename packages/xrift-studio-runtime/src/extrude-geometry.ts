import { ExtrudeGeometry, Shape, Vector2 } from "three";
import { validateXriftExtrudeProfile, type XriftExtrudeProfile } from "./extrude-profile.js";

/** One geometry factory for Edit, Play, JSX publication and the Three runtime. */
export function createXriftExtrudeGeometry(profile: XriftExtrudeProfile): ExtrudeGeometry {
  const error = validateXriftExtrudeProfile(profile);
  if (error) throw new Error(error);
  const shape = new Shape(profile.points.map(([x, y]) => new Vector2(x, y)));
  return new ExtrudeGeometry(shape, { depth: profile.depth, steps: 1, bevelEnabled: false, curveSegments: 1 });
}
