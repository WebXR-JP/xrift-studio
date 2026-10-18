import type { PrototypeVisualProject } from "./prototype-project";

const equal = (before: unknown, after: unknown) => before === after || JSON.stringify(before) === JSON.stringify(after);

/** Only renderer-owned thumbnails and the save timestamp may advance an
 * asynchronous document lease without changing the author's input. */
export function isDerivedMcpDocumentUpdate(before: PrototypeVisualProject, after: PrototypeVisualProject): boolean {
  if (!equal(before.scene, after.scene) || !equal(before.prefabs, after.prefabs)) return false;
  const project = (value: PrototypeVisualProject["project"]) => {
    const { updatedAt: _updatedAt, ...metadata } = value.metadata;
    return { ...value, metadata };
  };
  if (!equal(project(before.project), project(after.project))) return false;
  const { assets: previousAssets, ...previousManifest } = before.assets;
  const { assets: currentAssets, ...currentManifest } = after.assets;
  if (!equal(previousManifest, currentManifest) || Object.keys(previousAssets).length !== Object.keys(currentAssets).length) return false;
  for (const [id, previous] of Object.entries(previousAssets)) {
    const current = currentAssets[id];
    if (!current) return false;
    if (previous === current) continue;
    const { thumbnail: _previousThumbnail, ...previousAuthoring } = previous;
    const { thumbnail: _currentThumbnail, ...currentAuthoring } = current;
    if (!equal(previousAuthoring, currentAuthoring)) return false;
  }
  return true;
}

/** Every revision observed during conversion must be accounted for by an
 * allowed derived update. Cancellation and file/source writes do not qualify. */
export function isMcpDerivedRevisionCurrent(before: PrototypeVisualProject, after: PrototypeVisualProject,
  beforeRevision: number, afterRevision: number, beforeDerived: number, afterDerived: number): boolean {
  const revisions = afterRevision - beforeRevision, derived = afterDerived - beforeDerived;
  return revisions >= 0 && derived >= 0 && revisions === derived && isDerivedMcpDocumentUpdate(before, after);
}
