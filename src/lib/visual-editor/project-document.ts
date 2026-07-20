export const VISUAL_PROJECT_SCHEMA_VERSION = "0.1.0" as const;

export type VisualProjectKind = "world" | "item";

export type VisualProjectMetadata = {
  name: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type VisualPublicationRecord = {
  uploadedAt: string;
  worldId?: string;
  itemId?: string;
  contentId?: string;
  versionId?: string;
  versionNumber?: number;
  contentHash?: string;
  status?: string;
  /** Stored only when XRift explicitly returned the URL. */
  url?: string;
};

/**
 * Authoring manifest for a visual project. It is deliberately independent of
 * a classic XRift package and does not model package.json.
 */
export type VisualProjectDocument = {
  schemaVersion: typeof VISUAL_PROJECT_SCHEMA_VERSION;
  projectId: string;
  projectKind: VisualProjectKind;
  metadata: VisualProjectMetadata;
  /** ID of the scene opened and compiled as the project entry point. */
  entrySceneId: string;
  /** Maps scene IDs to project-relative scene-document paths. */
  scenePaths: Record<string, string>;
  /** Project-relative path to the shared asset manifest. */
  assetManifestPath: string;
  /** Most recent successful XRift upload, never synthesized by the editor. */
  lastPublication?: VisualPublicationRecord;
};
