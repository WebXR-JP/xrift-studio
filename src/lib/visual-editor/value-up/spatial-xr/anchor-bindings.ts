import type { SpatialPose } from "./spatial-capture";

export const SPATIAL_BINDING_SCHEMA_VERSION = "0.1.0" as const;

export type SpatialEntityBinding = {
  entityId: string;
  captureId: string;
  surfaceId?: string;
  semanticLabel?: string;
  anchorHandle?: string;
  fallbackPose: SpatialPose;
  createdAt: string;
};

export type SpatialBindingManifest = {
  schemaVersion: typeof SPATIAL_BINDING_SCHEMA_VERSION;
  bindings: SpatialEntityBinding[];
};

export function createSpatialBindingManifest(bindings: SpatialEntityBinding[] = []): SpatialBindingManifest {
  return { schemaVersion: SPATIAL_BINDING_SCHEMA_VERSION, bindings };
}

export function upsertSpatialBinding(manifest: SpatialBindingManifest, binding: SpatialEntityBinding): SpatialBindingManifest {
  const bindings = manifest.bindings.filter((entry) => entry.entityId !== binding.entityId);
  bindings.push(binding);
  return { ...manifest, bindings };
}

export function removeSpatialBindingsForCapture(manifest: SpatialBindingManifest, captureId: string): SpatialBindingManifest {
  return { ...manifest, bindings: manifest.bindings.filter((entry) => entry.captureId !== captureId) };
}
