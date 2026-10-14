import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = promisify(execFile);
const nativeTest = "chatgpt::tests::frontend_resource_context_contract";
const temporaryRoot = resolve(tmpdir());
const fixturePrefix = "xrift-chatgpt-resource-contract-";
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === "--generate-only"), "Usage: node scripts/chatgpt-resource-contract.test.mjs [--generate-only <output.json>]");
const generateOnlyPath = args.length ? resolve(args[1]) : undefined;

// Generate the exact JSON sent by the Editor, then pass it to the native
// validators. No account, network request, running app or project file is used.
test(generateOnlyPath ? "generate real frontend Scene and resource contract fixtures" : "real frontend Scene and resource snapshots satisfy the native contract", { timeout: 600_000 }, async context => {
  const server = await createServer({
    root, configFile: false, cacheDir: "node_modules/.vite-chatgpt-resource-contract-test",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Resource contract fixtures must remain offline"); };
  let fixtureDirectory;
  try {
    const load = name => server.ssrLoadModule(`/src/lib/visual-editor/${name}.ts`);
    const { listChatgptBuiltinCandidates } = await load("chatgpt-builtin-catalog");
    const { collectChatgptSceneContext, collectChatgptSceneResources } = await load("chatgpt-scene-resources");
    const { createStarterVisualProject } = await load("starter-templates");
    const { createEmptyEntity } = await load("editor-session");
    const { createAudioSourceComponent } = await load("scene-document");
    const fixtures = [];
    const starter = kind => createStarterVisualProject(kind, kind === "world" ? "blank" : "basic-item", "resource-contract-fixture");

    function snapshot(name, bundle, candidates, selectedEntityId, conversation) {
      const before = JSON.stringify(bundle);
      const sceneContext = collectChatgptSceneContext(bundle, selectedEntityId, conversation);
      const resourceContext = collectChatgptSceneResources(bundle, sceneContext.entities.map(entity => entity.id), candidates);
      assert.equal(JSON.stringify(bundle), before, "Snapshot collection must preserve the open Scene");
      const fixture = { name, sceneContext, resourceContext };
      fixtures.push(fixture);
      return fixture;
    }

    for (const kind of ["world", "item"]) {
      const bundle = starter(kind);
      const selected = Object.values(bundle.scene.entities)[0].id;
      const all = listChatgptBuiltinCandidates(kind);
      assert.ok(all.some(candidate => candidate.candidateId.startsWith("builtin:xrift-glow-materials:") && candidate.candidateId.includes("/")), "Use the real Glow fixture keys that caused this regression");
      for (const query of ["", "発光 ネオン 光るチューブ", "ＳＫＹＢＯＸ の空を作って", `${all.at(-1).name}を追加してください`]) {
        snapshot(`${kind}: query ${JSON.stringify(query)}`, bundle, listChatgptBuiltinCandidates(kind, query), selected);
      }

      // A normal prompt sends only a bounded prefix. Walk the remaining real
      // catalog through the same collector so every current and future key is
      // checked without constructing an oversized native request.
      const covered = [];
      for (let offset = 0; offset < all.length;) {
        const pending = all.slice(offset, offset + 128);
        const fixture = snapshot(`${kind}: catalog from ${offset}`, bundle, pending, selected);
        const emitted = fixture.resourceContext.builtinCandidates.map(candidate => candidate.candidateId);
        assert.ok(emitted.length > 0, `The collector must retain a catalog candidate at ${offset}`);
        assert.deepEqual(emitted, pending.slice(0, emitted.length).map(candidate => candidate.candidateId));
        covered.push(...emitted);
        offset += emitted.length;
      }
      assert.deepEqual(covered, all.map(candidate => candidate.candidateId), "Every trusted catalog key must reach native validation");
      context.diagnostic(`${kind}: ${covered.length} real builtin candidates covered`);
    }

    const audioBundle = starter("world");
    const audioEntity = Object.values(audioBundle.scene.entities)[0];
    const emptyAudio = createAudioSourceComponent("contract-empty-audio");
    assert.ok(emptyAudio);
    assert.equal(emptyAudio.audioAssetId, "", "Exercise the real unassigned Audio Source default");
    audioEntity.components.push(emptyAudio);
    const audioFixture = snapshot("unassigned Audio Source", audioBundle, listChatgptBuiltinCandidates("world"), audioEntity.id);
    const emittedAudio = audioFixture.resourceContext.components.find(component => component.componentId === emptyAudio.id);
    assert.ok(emittedAudio, "An unassigned Audio Source must still be editable");
    assert.ok(!Object.hasOwn(JSON.parse(JSON.stringify(emittedAudio.audio)), "audioAssetId"), "An unassigned audio asset must use the optional native field");

    for (let index = 0; index < 80; index++) {
      const component = createAudioSourceComponent(`contract-audio-${index}`);
      assert.ok(component);
      audioEntity.components.push(component);
    }
    snapshot("Entity with more than 32 Components", audioBundle, listChatgptBuiltinCandidates("world", "発光"), audioEntity.id);

    const assignedBundle = starter("world");
    const assignedEntity = Object.values(assignedBundle.scene.entities).find(entity => entity.components.some(component => component.type === "mesh"));
    assert.ok(assignedEntity);
    assignedEntity.components.find(component => component.type === "mesh").geometryAssetId = "contract-assigned-model";
    assignedBundle.assets.assets["contract-assigned-model"] = { id: "contract-assigned-model", name: "使用中のモデル", kind: "model", status: "ready" };
    assignedBundle.assets.assets["contract-assigned-audio"] = { id: "contract-assigned-audio", name: "使用中の音声", kind: "audio", status: "ready" };
    const assignedAudio = createAudioSourceComponent("contract-assigned-source", "contract-assigned-audio");
    assert.ok(assignedAudio);
    assignedEntity.components.push(assignedAudio);
    const assignedFixture = snapshot("assigned project Model and Audio", assignedBundle, [], assignedEntity.id);
    assert.ok(assignedFixture.resourceContext.components.some(component => component.modelAssetId === "contract-assigned-model"));
    assert.ok(assignedFixture.resourceContext.components.some(component => component.audio?.audioAssetId === "contract-assigned-audio"));

    const largeBundle = starter("world");
    largeBundle.project.metadata.title = "日本語の大きなScene".repeat(100);
    let lastEntityId;
    for (let index = 0; index < 180; index++) {
      const added = createEmptyEntity(largeBundle.scene, null, "日本語のEntity名".repeat(30));
      assert.ok(added);
      largeBundle.scene = added.scene;
      lastEntityId = added.entityId;
    }
    for (let index = 0; index < 500; index++) {
      const id = `contract-model-${index}`;
      largeBundle.assets.assets[id] = { id, kind: "model", name: "日本語の素材名".repeat(100), status: "ready" };
    }
    const largeFixture = snapshot("large Japanese Scene and Assets", largeBundle, listChatgptBuiltinCandidates("world"), lastEntityId,
      [{ prompt: "配置を調整してください", result: "既存のEntityと素材を確認します" }]);
    assert.equal(largeFixture.sceneContext.selectedEntityId, lastEntityId, "The selected Entity must survive Scene budgeting");
    assert.ok(largeFixture.sceneContext.entities.length < 180, "Exercise the bounded Scene snapshot");
    assert.ok(largeFixture.resourceContext.projectAssets.length > 0 && largeFixture.resourceContext.projectAssets.length < 500, "Exercise the bounded resource snapshot");

    // Integral JavaScript Transform values become f64 decimals in Rust's
    // reserialization. A dense Scene near the JS budget exercises that gap.
    const denseBundle = starter("world");
    const template = Object.values(denseBundle.scene.entities).find(entity => entity.components.some(component => component.type === "collider"));
    assert.ok(template);
    denseBundle.scene.entities = {};
    denseBundle.scene.rootEntityIds = [];
    for (let index = 0; index < 120; index++) {
      const entity = structuredClone(template);
      entity.id = `compact-${String(index).padStart(3, "0")}`;
      entity.name = "Integer Transform Entity";
      for (const [componentIndex, component] of entity.components.entries()) {
        component.id = `${entity.id}-component-${componentIndex}`;
        if (component.type === "transform") {
          component.position = [0, 0, 0]; component.rotation = [0, 0, 0]; component.scale = [1, 1, 1];
        }
      }
      denseBundle.scene.entities[entity.id] = entity;
      denseBundle.scene.rootEntityIds.push(entity.id);
    }
    const denseFixture = snapshot("dense Scene with integral Transform values", denseBundle, [], "compact-119");
    assert.equal(denseFixture.sceneContext.selectedEntityId, "compact-119");
    assert.ok(Buffer.byteLength(JSON.stringify(denseFixture.sceneContext)) > 13 * 1024, "Reach the Scene byte budget where f64 formatting matters");

    if (generateOnlyPath) {
      await mkdir(dirname(generateOnlyPath), { recursive: true });
      await writeFile(generateOnlyPath, JSON.stringify(fixtures), "utf8");
      context.diagnostic(`${fixtures.length} frontend snapshots saved to ${generateOnlyPath}; native validation was not run`);
      return;
    }

    // Only this test-owned temporary directory is removed after cargo finishes.
    fixtureDirectory = await mkdtemp(join(temporaryRoot, fixturePrefix));
    const fixturePath = join(fixtureDirectory, "frontend-contexts.json");
    await writeFile(fixturePath, JSON.stringify(fixtures), "utf8");
    const result = await run("cargo", ["test", "--offline", "--lib", "--manifest-path", join(root, "src-tauri", "Cargo.toml"), nativeTest, "--", "--exact"], {
      cwd: root, env: { ...process.env, XRIFT_CHATGPT_RESOURCE_CONTRACT: fixturePath },
      maxBuffer: 8 * 1024 * 1024, signal: context.signal,
    });
    assert.match(result.stdout, /test chatgpt::tests::frontend_resource_context_contract \.\.\. ok/, "The native contract test must run; zero matching tests is not a pass");
    context.diagnostic(`${fixtures.length} frontend snapshots accepted by the native Scene and resource validators`);
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
    if (fixtureDirectory) {
      const cleanupDirectory = resolve(fixtureDirectory);
      assert.equal(dirname(cleanupDirectory), temporaryRoot, "Only remove a directory directly inside the configured temporary root");
      assert.ok(basename(cleanupDirectory).startsWith(fixturePrefix), "Only remove this test's mkdtemp directory");
      await rm(cleanupDirectory, { recursive: true, force: true });
    }
  }
});
