import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("生成モデルの原本をGLBと同時に保存し、再読み込み・部分修正・破損検出に使える", async ({ page }) => {
  let bytes: Buffer;
  try { bytes = await readFile("node_modules/.cache/chatgpt-blender-model/fixture.glb"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") test.skip(true, "Installed Blender native smoke output is required for the actual GLB import");
    throw error;
  }
  await page.goto("/e2e.html?scenario=ready");
  await expect(page.getByRole("button", { name: /新規プロジェクト/ })).toBeVisible();
  const result = await page.evaluate(async ({ dataUrl, byteLength }) => {
    const sourcePath = "/src/lib/visual-editor/chatgpt-model-source.ts";
    const modelingPath = "/src/lib/visual-editor/chatgpt-modeling.ts";
    const starterPath = "/src/lib/visual-editor/starter-templates.ts";
    const serializationPath = "/src/lib/visual-editor/serialization.ts";
    const generationPath = "/src/lib/visual-editor/chatgpt-generation.ts";
    const transferPath = "/src/lib/visual-editor/hierarchy-transfer.ts";
    const assignmentPath = "/src/lib/visual-editor/model-assignment.ts";
    const { createBlenderModelAsset }: typeof import("../src/lib/visual-editor/chatgpt-modeling") = await import(/* @vite-ignore */ modelingPath);
    const { readBlenderModelSource, readBlenderEntityModelSource }: typeof import("../src/lib/visual-editor/chatgpt-model-source") = await import(/* @vite-ignore */ sourcePath);
    const { createStarterVisualProject }: typeof import("../src/lib/visual-editor/starter-templates") = await import(/* @vite-ignore */ starterPath);
    const { assetManifestCodec }: typeof import("../src/lib/visual-editor/serialization") = await import(/* @vite-ignore */ serializationPath);
    const { placeChatgptObject }: typeof import("../src/lib/visual-editor/chatgpt-generation") = await import(/* @vite-ignore */ generationPath);
    const { createHierarchyTransfer, prepareHierarchyTransferFiles, planHierarchyImport }: typeof import("../src/lib/visual-editor/hierarchy-transfer") = await import(/* @vite-ignore */ transferPath);
    const { setEntityModel }: typeof import("../src/lib/visual-editor/model-assignment") = await import(/* @vite-ignore */ assignmentPath);
    const bundle = createStarterVisualProject("world", "blank", "model-source-integrity-isolated");
    const projectPath = "C:\\fixture\\model-source-integrity-isolated";
    const disk = new Map<string, string>();
    const payloads = new Map<string, string>();
    const writes: string[][] = [];
    let failCommit = true, readCount = 0, blenderCalls = 0;
    const invoke = window.__TAURI_INTERNALS__!.invoke!;
    window.__TAURI_INTERNALS__!.invoke = async (command, args, options) => {
      if (command === "create_blender_model" && args?.projectPath === projectPath) { blenderCalls++; return { path: `${projectPath}\\output.glb`, fileName: "output.glb", byteLength }; }
      if (command === "read_local_model_import_source" && args?.sourcePath === `${projectPath}\\output.glb`) return { fileName: "output.glb", mimeType: "model/gltf-binary", byteLength, dataUrl };
      if (command === "commit_visual_asset_import" && args?.projectPath === projectPath) {
        const entries = args.writes as { relativePath: string; dataUrl: string }[];
        writes.push(entries.map(entry => entry.relativePath));
        if (failCommit) throw new Error("isolated atomic commit failure");
        for (const entry of entries) { disk.set(entry.relativePath, await (await fetch(entry.dataUrl)).text()); payloads.set(entry.relativePath, entry.dataUrl); }
        return;
      }
      if (command === "read_text_file" && args?.projectPath === projectPath) {
        readCount++; const value = disk.get(String(args.rel)); if (value === undefined) throw new Error("missing fixture file"); return value;
      }
      return invoke(command, args, options);
    };
    const spec: import("../src/lib/visual-editor/chatgpt-modeling").BlenderModelSpec = { name: "木のベンチ", parts: [{
      id: "seat", name: "座面", shape: "box", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [2, 0.1, 0.6], color: [0.5, 0.3, 0.1, 1], metallic: 0, roughness: 0.7,
    }] };
    const fails = async (action: () => Promise<unknown>) => { try { await action(); return false; } catch { return true; } };
    try {
      const initial = JSON.stringify(bundle.assets);
      const rejectedCommit = await fails(() => createBlenderModelAsset(bundle, spec, projectPath, { prompt: "木のベンチ", brief: "座面の高さ50cm" }));
      const originalUntouched = initial === JSON.stringify(bundle.assets) && disk.size === 0;
      failCommit = false;
      const first = await createBlenderModelAsset(bundle, spec, projectPath, { prompt: "木のベンチ", brief: "座面の高さ50cm" });
      const firstAsset = first.bundle.assets.assets[first.modelAssetId];
      if (firstAsset.kind !== "model") throw new Error("Model import failed");
      firstAsset.importSettings = { ...firstAsset.importSettings, scale: 2.5, generateColliders: false, importAnimations: false };
      const expectedImportSettings = structuredClone(firstAsset.importSettings);
      const firstAssetBeforeRevision = JSON.stringify(firstAsset);
      const original = await readBlenderModelSource(firstAsset, projectPath);
      const firstPlaced = placeChatgptObject(first.bundle, { name: spec.name, shape: "model", externalId: `project:${first.modelAssetId}`,
        position: [3, 0.2, -2], rotation: [0, 35, 0], scale: [1.2, 0.8, 1.4] }, new Map());
      const transformBeforeRevision = structuredClone(firstPlaced.bundle.scene.entities[firstPlaced.entityId].components.find(component => component.type === "transform"));
      const callsBeforeReuse = blenderCalls, writesBeforeReuse = writes.length;
      const reused = await createBlenderModelAsset(firstPlaced.bundle, structuredClone(spec), projectPath, { prompt: "同じ形をもう一度確認", previousAssetId: first.modelAssetId });
      const sameSpecReusesExisting = reused.bundle === firstPlaced.bundle && reused.modelAssetId === first.modelAssetId
        && blenderCalls === callsBeforeReuse && writes.length === writesBeforeReuse && JSON.stringify(firstAsset) === firstAssetBeforeRevision;
      const revisedSpec = structuredClone(spec);
      revisedSpec.parts[0].position[1] = 0.45;
      const second = await createBlenderModelAsset(firstPlaced.bundle, revisedSpec, projectPath, { prompt: "座面だけ少し低く", previousAssetId: first.modelAssetId });
      const revisedAsset = second.bundle.assets.assets[second.modelAssetId];
      if (revisedAsset.kind !== "model") throw new Error("Revised Model missing");
      const revisionRetainsImportSettings = JSON.stringify(revisedAsset.importSettings) === JSON.stringify(expectedImportSettings);
      const revisionOwnsImportSettings = revisedAsset.importSettings !== firstAsset.importSettings;
      const reassignedRevision = setEntityModel(second.bundle.scene, second.bundle.assets, firstPlaced.entityId, second.modelAssetId);
      const rootTransformPreserved = JSON.stringify(reassignedRevision.scene.entities[firstPlaced.entityId].components.find(component => component.type === "transform")) === JSON.stringify(transformBeforeRevision);
      const oldRevisionUnchanged = JSON.stringify(firstAsset) === firstAssetBeforeRevision;
      const reloaded = assetManifestCodec.parse(JSON.stringify(second.bundle.assets));
      if (!reloaded.ok) throw new Error(JSON.stringify(reloaded.issues));
      const nextAsset = reloaded.document.assets[second.modelAssetId];
      if (nextAsset.kind !== "model") throw new Error("Reloaded Model missing");
      const next = await readBlenderModelSource(nextAsset, projectPath);
      const saved = disk.get(nextAsset.authoring!.sourcePath)!;
      disk.set(nextAsset.authoring!.sourcePath, `${saved} `);
      const tamperingRejected = await fails(() => readBlenderModelSource(nextAsset, projectPath));
      disk.set(nextAsset.authoring!.sourcePath, saved);
      const staleGlbRejected = await fails(() => readBlenderModelSource({ ...nextAsset, sourceHash: "f".repeat(64) }, projectPath));
      const previousReads = readCount;
      const traversalRejected = await fails(() => readBlenderModelSource({ ...nextAsset, authoring: { ...nextAsset.authoring!, sourcePath: "assets/imported/../secrets.json" } }, projectPath));
      const traversalReadNothing = readCount === previousReads;
      const placed = placeChatgptObject({ ...second.bundle, assets: reloaded.document }, { name: spec.name, shape: "model",
        externalId: `project:${second.modelAssetId}`, position: [0, 0, 0], scale: [1, 1, 1] }, new Map());
      const withEntity = placed.bundle;
      const entity = withEntity.scene.entities[placed.entityId];
      const mesh = entity.components.find(component => component.type === "mesh");
      const target = await readBlenderEntityModelSource(withEntity, entity.id, projectPath, mesh?.id);
      const explicitMesh = { id: "source-mesh", type: "mesh" as const, enabled: true, geometryAssetId: second.modelAssetId,
        geometry: { kind: "asset" as const, assetId: second.modelAssetId }, materialBindings: [], castShadow: true, receiveShadow: true };
      const ambiguous = { ...withEntity, scene: { ...withEntity.scene, entities: { ...withEntity.scene.entities,
        [entity.id]: { ...withEntity.scene.entities[entity.id], components: [...withEntity.scene.entities[entity.id].components, explicitMesh, { ...explicitMesh, id: "another-mesh" }] } } } };
      const ambiguousRejected = await fails(() => readBlenderEntityModelSource(ambiguous, entity.id, projectPath));
      const prepared = await prepareHierarchyTransferFiles(createHierarchyTransfer(withEntity, [entity.id]), async path => {
        if (path.endsWith("/source.json")) return new TextEncoder().encode(disk.get(path)!);
        return new Uint8Array(await (await fetch(payloads.get(path)!)).arrayBuffer());
      });
      const imported = planHierarchyImport(createStarterVisualProject("world", "blank", "model-source-append-isolated"), prepared);
      for (const [path, content] of imported.files) disk.set(path, new TextDecoder().decode(content));
      const transferred = await readBlenderEntityModelSource(imported.bundle, imported.rootEntityIds[0], projectPath);
      const transferredAsset = imported.bundle.assets.assets[imported.assetIdMap[second.modelAssetId]];
      const transferSourcePath = transferredAsset.kind === "model" ? transferredAsset.authoring?.sourcePath : "";
      const reassigned = setEntityModel(imported.bundle.scene, imported.bundle.assets, imported.rootEntityIds[0], imported.assetIdMap[second.modelAssetId]);
      const replacedSource = await readBlenderEntityModelSource({ ...imported.bundle, scene: reassigned.scene }, imported.rootEntityIds[0], projectPath, reassigned.componentId);
      return { rejectedCommit, originalUntouched, original, next, target: target && { modelAssetId: target.modelAssetId, componentId: target.componentId },
        revisionsAreDistinct: first.modelAssetId !== second.modelAssetId && Boolean(reloaded.document.assets[first.modelAssetId]),
        allCommitsContainBoth: writes.every(paths => paths.some(path => path.endsWith(".glb")) && paths.some(path => path.endsWith("/source.json"))),
        tamperingRejected, staleGlbRejected, traversalRejected, traversalReadNothing, ambiguousRejected,
        transferPreservedSource: JSON.stringify(transferred?.source) === JSON.stringify(next),
        transferSourceNamespaced: transferSourcePath?.startsWith("assets/imported/hierarchy-"),
        lineageIsNotDependency: !prepared.bundle.assets.assets[first.modelAssetId],
        transferAllowsReplacement: Boolean(replacedSource) && reassigned.scene.entities[imported.rootEntityIds[0]].children.length === 0,
        sameSpecReusesExisting, revisionRetainsImportSettings, revisionOwnsImportSettings, rootTransformPreserved, oldRevisionUnchanged,
        expectedImportSettings, revisedImportSettings: nextAsset.importSettings,
        targetComponentId: mesh?.id };
    } finally { window.__TAURI_INTERNALS__!.invoke = invoke; }
  }, { dataUrl: `data:model/gltf-binary;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength });
  expect(result).toMatchObject({ rejectedCommit: true, originalUntouched: true, revisionsAreDistinct: true, allCommitsContainBoth: true,
    tamperingRejected: true, staleGlbRejected: true, traversalRejected: true, traversalReadNothing: true, ambiguousRejected: true,
    transferPreservedSource: true, transferSourceNamespaced: true, lineageIsNotDependency: true, transferAllowsReplacement: true,
    sameSpecReusesExisting: true, revisionRetainsImportSettings: true, revisionOwnsImportSettings: true, rootTransformPreserved: true, oldRevisionUnchanged: true });
  expect(result.revisedImportSettings).toEqual(result.expectedImportSettings);
  expect(result.revisedImportSettings).toMatchObject({ scale: 2.5, generateColliders: false, importAnimations: false });
  expect(result.original).toMatchObject({ originalPrompt: "木のベンチ", prompt: "木のベンチ", revision: 1, spec: { parts: [{ id: "seat" }] } });
  expect(result.next).toMatchObject({ originalPrompt: "木のベンチ", prompt: "座面だけ少し低く", revision: 2, brief: "座面の高さ50cm" });
  expect(result.next?.parentAssetId).toBeTruthy();
  expect(result.target).toMatchObject({ componentId: result.targetComponentId });
});
