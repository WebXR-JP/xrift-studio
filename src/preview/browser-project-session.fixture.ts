import { latestBrowserPublication } from "../lib/browser-project-storage";
import { createPrototypeProject, type PrototypeVisualProject } from "../lib/visual-editor/prototype-project";
import type { VisualProjectDocuments } from "../lib/visual-editor/persistence";
import { openBrowserProjectSession } from "./browser-project-session";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`browser publication fixture: ${message}`);
}

async function rejects(operation: () => Promise<unknown>, message: string): Promise<void> {
  try { await operation(); }
  catch { return; }
  throw new Error(`browser publication fixture: ${message}`);
}

export async function runBrowserPublicationFixtureAssertions(): Promise<void> {
  const bundle = createPrototypeProject("world", "Publication fixture");
  const staleBundle: PrototypeVisualProject = structuredClone(bundle);
  let stored: VisualProjectDocuments = {
    project: bundle.project,
    scenes: { [bundle.scene.sceneId]: bundle.scene },
    assets: bundle.assets,
    prefabs: bundle.prefabs,
  };
  let failNextSave = false;
  let releaseFirstSave: (() => void) | undefined;
  let firstSaveStarted: (() => void) | undefined;
  const firstSaveReached = new Promise<void>((resolve) => { firstSaveStarted = resolve; });
  const firstSaveGate = new Promise<void>((resolve) => { releaseFirstSave = resolve; });
  let saveCount = 0;
  const session = await openBrowserProjectSession("browser-project://publication-fixture", {
    acquire: async () => () => {},
    read: async () => structuredClone(stored),
    save: async (_path, next) => {
      saveCount++;
      if (saveCount === 1) {
        firstSaveStarted?.();
        await firstSaveGate;
      }
      if (failNextSave) { failNextSave = false; throw new Error("injected storage failure"); }
      stored = structuredClone(next);
    },
    files: async () => new Map(),
    archive: async () => ({ blob: new Blob(), fileName: "fixture.xriftstudio", fileCount: 0 }),
  });

  const queuedBundle: PrototypeVisualProject = {
    ...bundle,
    project: {
      ...bundle.project,
      metadata: { ...bundle.project.metadata, title: "Saved before publication" },
    },
  };
  const pendingSave = session.save(queuedBundle);
  await firstSaveReached;
  const result = {
    worldId: "world-fixture",
    contentId: "world-fixture",
    versionId: "version-1",
    versionNumber: 1,
    uploadedAt: "2026-09-24T01:00:00.000Z",
  };
  const pendingPublication = session.recordPublication(bundle, result);
  releaseFirstSave?.();
  await pendingSave;
  const publishedBundle = await pendingPublication;
  assert(stored.project.metadata.title === "Saved before publication", "publication keeps an earlier queued autosave");
  assert(stored.project.lastPublication?.worldId === result.worldId, "remote world ID persisted");
  assert(publishedBundle.project.lastPublication?.versionId === result.versionId, "returned bundle carries publication");

  await session.save(staleBundle);
  assert(stored.project.lastPublication?.versionId === result.versionId, "stale save cannot erase publication");
  assert(stored.project.metadata.updatedAt >= result.uploadedAt, "stale save cannot roll back publication time");

  failNextSave = true;
  const nextResult = { ...result, versionId: "version-2", versionNumber: 2, uploadedAt: "2026-09-24T02:00:00.000Z" };
  await rejects(() => session.recordPublication(staleBundle, nextResult), "storage failure is reported");
  assert(stored.project.lastPublication?.versionId === result.versionId, "failed write leaves durable version unchanged");
  await session.recordPublication(staleBundle, nextResult);
  assert(stored.project.lastPublication?.versionId === nextResult.versionId, "same result can be saved after failure");
  await session.recordPublication(staleBundle, nextResult);
  assert(stored.project.lastPublication?.versionId === nextResult.versionId, "same version retry is idempotent");

  await rejects(
    () => session.recordPublication(staleBundle, { ...nextResult, worldId: "another-world", contentId: "another-world" }),
    "different remote world is rejected",
  );
  await rejects(
    () => session.recordPublication({ ...staleBundle, project: { ...staleBundle.project, projectId: "another-project" } }, nextResult),
    "different project is rejected",
  );
  assert(stored.project.lastPublication?.worldId === result.worldId, "rejected results leave remote ID unchanged");

  const older = latestBrowserPublication("world", stored.project.lastPublication, result);
  assert(older?.versionId === nextResult.versionId, "older version cannot replace newer version");
  const newer = latestBrowserPublication("world", stored.project.lastPublication, {
    ...result,
    versionId: "version-3",
    versionNumber: 3,
    uploadedAt: "2026-09-24T00:00:00.000Z",
  });
  assert(newer?.versionNumber === 3, "higher remote version wins even if client clock is behind");
  await session.close();
}
