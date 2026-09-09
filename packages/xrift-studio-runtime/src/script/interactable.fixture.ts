import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { trackInteractionLayer } from "./interaction-layer.js";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

export function runInteractableLayerFixtureAssertions() {
  const root = new Group();
  const nested = new Group();
  root.add(nested);
  const stop = trackInteractionLayer(root, 11);
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  mesh.layers.enable(7);
  const originalMask = mesh.layers.mask;
  const ray = new Raycaster(new Vector3(0, 0, 2), new Vector3(0, 0, -1), 0, 3.5);
  ray.layers.set(11);
  try {
    nested.add(mesh);
    root.updateMatrixWorld(true);
    assert(ray.intersectObject(root, true).length > 0, "Late mesh is not reachable by the official interaction ray");
    nested.remove(mesh);
    assert(mesh.layers.mask === originalMask, "Removing a mesh must restore its original layers");
    nested.add(mesh);
    assert(mesh.layers.isEnabled(11), "Reattaching a mesh must make it reachable again");
    const replacement = new Group();
    root.add(replacement);
    replacement.add(mesh);
    assert(mesh.layers.isEnabled(11), "Reparenting under an interaction must preserve reachability");
    stop();
    assert(mesh.layers.mask === originalMask, "Cleanup must retain unrelated layers");
    const lateAfterStop = new Group();
    replacement.add(lateAfterStop);
    assert(!lateAfterStop.layers.isEnabled(11), "Cleanup must remove child listeners");
  } finally {
    stop();
    geometry.dispose();
    material.dispose();
  }
}
