import { addAssetFolder } from "./asset-manifest";
import {
  addDefaultDocumentAsset,
  resolveAssetCreationFolderId,
} from "./document-asset-creation";
import {
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "./editor-history";
import { createPrototypeProject } from "./prototype-project";
import { validateKhrInteractivityExtension } from "./interactivity-graph";
import { assetManifestCodec } from "./serialization";

export function runDocumentAssetCreationFixtureAssertions(): void {
  const project = createPrototypeProject("world", "document-asset-creation");
  const folder = addAssetFolder(project.assets, {
    id: "fixture-folder",
    name: "Environment",
    parentId: null,
  });
  assert(folder.added, "Fixture folder could not be created");

  const material = addDefaultDocumentAsset(folder.manifest, {
    kind: "material",
    id: "fixture-material",
    folderId: folder.folderId,
  });
  assert(material.added, "Material could not be created in the target folder");
  assert(
    material.manifest.assets[material.assetId]?.folderId === folder.folderId &&
      material.manifest.assets[material.assetId]?.order === 0,
    "Material folder membership or sibling order was not committed",
  );

  const particle = addDefaultDocumentAsset(material.manifest, {
    kind: "particle",
    id: "fixture-particle",
    folderId: folder.folderId,
  });
  assert(particle.added, "Particle could not be created in the target folder");
  assert(
    particle.manifest.assets[particle.assetId]?.folderId === folder.folderId &&
      particle.manifest.assets[particle.assetId]?.order === 1,
    "Particle did not follow the existing sibling order",
  );

  const interactivity = addDefaultDocumentAsset(particle.manifest, {
    kind: "interactivity",
    id: "fixture-interactivity",
    folderId: folder.folderId,
  });
  const interactivityAsset = interactivity.manifest.assets[interactivity.assetId];
  assert(interactivity.added, "Interactivity Graph could not be created");
  assert(
    interactivityAsset?.kind === "interactivity" && interactivityAsset.order === 2,
    "Interactivity Graph did not retain folder order",
  );
  assert(
    validateKhrInteractivityExtension(
      interactivityAsset.kind === "interactivity" ? interactivityAsset.extension : null,
    ).every((diagnostic) => diagnostic.severity !== "error"),
    "Default KHR_interactivity graph must validate",
  );
  assert(
    assetManifestCodec.parse(assetManifestCodec.serialize(interactivity.manifest)).ok,
    "Interactivity Asset did not round-trip through the AssetManifest codec",
  );

  assert(
    resolveAssetCreationFolderId(particle.manifest, null, {
      folderId: folder.folderId,
    }) === folder.folderId,
    "A folder context did not resolve to that folder",
  );
  assert(
    resolveAssetCreationFolderId(particle.manifest, null, {
      assetId: material.assetId,
    }) === folder.folderId,
    "An Asset context did not resolve to its containing folder",
  );
  assert(
    resolveAssetCreationFolderId(particle.manifest, folder.folderId) ===
      folder.folderId,
    "Folder whitespace did not resolve to the active physical folder",
  );
  const rootMaterial = addDefaultDocumentAsset(particle.manifest, {
    kind: "material",
    id: "fixture-root-material",
    folderId: null,
  });
  assert(rootMaterial.added, "Root Material fixture could not be created");
  assert(
    resolveAssetCreationFolderId(rootMaterial.manifest, folder.folderId, {
      assetId: rootMaterial.assetId,
    }) === null,
    "An Asset at root inherited the currently open physical folder",
  );
  assert(
    resolveAssetCreationFolderId(
      rootMaterial.manifest,
      "folder-materials",
    ) === null,
    "A virtual kind filter was treated as a physical folder",
  );

  const rejected = addDefaultDocumentAsset(rootMaterial.manifest, {
    kind: "material",
    id: "invalid-folder-material",
    folderId: "missing-folder",
  });
  assert(
    !rejected.added && rejected.manifest === rootMaterial.manifest,
    "An invalid creation folder changed the Asset manifest",
  );

  const initialSnapshot = {
    bundle: { ...project, assets: folder.manifest },
    sceneSelection: null,
    assetSelection: Object.keys(folder.manifest.assets)[0] ?? null,
  };
  let history = createEditorHistory(initialSnapshot);
  history = commitEditorHistory(history, {
    ...initialSnapshot,
    bundle: { ...initialSnapshot.bundle, assets: material.manifest },
    assetSelection: material.assetId,
  });
  assert(
    history.past.length === 1 &&
      history.present.assetSelection === material.assetId,
    "Asset creation and selection were not recorded as one history entry",
  );
  history = undoEditorHistory(history).history;
  assert(
    !history.present.bundle.assets.assets[material.assetId] &&
      history.present.assetSelection === initialSnapshot.assetSelection,
    "Undo did not restore the previous Asset and selection state",
  );
  history = redoEditorHistory(history).history;
  assert(
    Boolean(history.present.bundle.assets.assets[material.assetId]) &&
      history.present.assetSelection === material.assetId,
    "Redo did not restore the created Asset and selection",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
