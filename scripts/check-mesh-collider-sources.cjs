#!/usr/bin/env node
/** Syntax and integration-wiring checks. This does not replace full typecheck/E2E. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require(process.env.XRIFT_TYPESCRIPT_PATH || "typescript");
const root = path.resolve(__dirname, "..");
const files = [
  "packages/xrift-studio-runtime/src/mesh-collider-geometry.ts",
  "packages/xrift-studio-runtime/src/mesh-colliders.tsx",
  "packages/xrift-studio-runtime/src/model-instancing.ts",
  "packages/xrift-studio-runtime/src/react-three-fiber/index.tsx",
  "src/components/visual-editor/SceneViewport.tsx",
  "src/components/visual-editor/ProjectModelVisual.tsx",
  "src/components/visual-editor/MeshCollisionControls.tsx",
  "src/components/visual-editor/scene-model-load-tracker.ts",
  "src/lib/visual-editor/mesh-collision-actions.ts",
  "src/lib/visual-editor/mesh-collision-actions.fixture.ts",
  "src/lib/visual-editor/mesh-collider-geometry.fixture.ts",
  "src/lib/visual-editor/compiler/compile.ts",
  "src/lib/visual-editor/compiler/fixture.ts",
  "packages/xrift-studio-runtime/src/mesh-collider-status.ts",
  "src/components/visual-editor/scene-load-state.ts",
  "src/components/visual-editor/WorldPlayPhysicsWarmup.tsx",
  "src/components/visual-editor/OfficialXriftComponentRenderer.tsx",
  "src/components/visual-editor/scene-load-state.fixture.ts",
];
let assertions = 0;
const assert = (condition, name) => { assertions++; if (!condition) throw new Error(name); };
for (const relative of files) {
  const fileName = path.join(root, relative);
  const result = ts.transpileModule(fs.readFileSync(fileName,"utf8"), { fileName, reportDiagnostics:true, compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX} });
  const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert(errors.length === 0, `${relative}: ${errors.map((d)=>ts.flattenDiagnosticMessageText(d.messageText,"\n")).join("\n")}`);
}
const read = (file) => fs.readFileSync(path.join(root,file),"utf8");
const host = read(files[1]), compiler = read(files[11]);
assert(host.includes("createPortal(colliders, projection.body)"), "mesh shapes must live in owner-body coordinates");
assert(compiler.includes('context.fiberImports.add("createPortal")'), "export must import collider portal dependency");
assert(compiler.includes('[meshColliderStatusSource, meshColliderGeometrySource, meshCollidersSource]'), "export must embed actual shared implementation");
assert(!compiler.includes('context.rapierImports.add("MeshCollider")'), "export must not regress to the initial-only MeshCollider");
assert(read(files[5]).includes("xriftColliderExclude: true"), "loading placeholder must not acquire a collision shape");
assert(read(files[2]).includes("batch.userData.xriftColliderExclude = true"), "render-only batches must not duplicate colliders");
assert(!read(files[7]).includes("PLAY_SCENE_WAIT_TIMEOUT_MS"), "Play must not time out into an unloaded floor");
assert(!/<MeshCollider\b/.test(read(files[4])) && !/<MeshCollider\b/.test(read(files[3])), "Play and runtime must use reactive geometry");
const viewport = read("src/components/visual-editor/SceneViewport.tsx");
const provider = read("src/components/visual-editor/OfficialXriftComponentRenderer.tsx");
const gate = read("src/components/visual-editor/scene-load-state.ts");
const warmup = read("src/components/visual-editor/WorldPlayPhysicsWarmup.tsx");
assert(viewport.includes("waitForSceneMount: true"), "Play waits for the real scene inside the Suspense boundary");
assert(viewport.indexOf("<SceneModelLoadCommit") > viewport.indexOf("<OfficialXriftPreviewProvider"), "scene commit marker must be inside Physics, not the outer Canvas");
assert(viewport.includes("<XriftColliderLoadContext.Provider value={sceneModelLoads}>"), "actual colliders report to the same tracker as the models");
assert(host.includes("world.getCollider(collider.handle)"), "ready requires live Rapier handles rather than a generated vertex array");
assert(host.includes("class XriftMeshColliderErrorBoundary"), "one invalid Rapier collider must not unmount the published world");
assert(host.includes("Mesh Colliderを物理空間に登録できませんでした"), "collider registration failures must stay local and diagnosable");
assert(host.includes("forRevision === revision.current"), "stale collider effects cannot complete a newer generation");
assert(gate.includes("tracker.getErrors().length !== 0"), "a failed model/collider blocks startup");
assert(provider.includes("paused={physicsPaused}"), "preparation pauses the simulation, not just gravity");
assert(provider.includes("key={physicsSessionKey}") && viewport.includes("physicsSessionKey={editorMode}"), "Stop/Play must recreate the physics world");
assert(warmup.includes("useAfterPhysicsStep") && viewport.includes("worldPlayActive && playRuntimeReady ?"), "player starts only after Rapier has stepped the registered colliders");
assert(viewport.includes('physicsPaused={editorMode !== "play" || (worldPlayActive && !playSceneReady)}'), "warmup must not wait on its own result to unpause (no startup deadlock)");
assert(viewport.includes("sourceNodeIndex, sourceKey, reportCollisionLoad"), "changing the shared node must reload collider geometry");
assert(viewport.includes("loaded?.key === sourceKey"), "old collision geometry must not appear under a new node");
assert(viewport.includes('const reportCollisionLoad = useSceneModelLoadReport({ status: "loading" })'), "collision models register as pending before passive loader effects");
assert(viewport.includes('status: !component.enabled || primitive || terrain ? "ready" : "loading"'), "only already-synchronous visual sources begin ready");
const runtimeScene = read("packages/xrift-studio-runtime/src/react-three-fiber/index.tsx");
assert(runtimeScene.indexOf("const dynamicBodies = useMemo") < runtimeScene.indexOf("if (!result) return fallback"), "runtime load must not change React hook order");
assert(!runtimeScene.includes("visual.scale.copy(scale);\n    source.visible = false;"), "runtime collection must not hide a loaded GLB during render");
assert(runtimeScene.includes("Keep the source visible until the replacement body has actually committed."), "runtime must defer source visibility swap until the body commits");
assert(runtimeScene.includes("useLayoutEffect(() => {") && runtimeScene.includes("entry.source.visible = false;"), "mounted runtime body owns the visibility swap");
// Execute the real support-declaration generator in isolation. This checks its
// own import sets and embedded text without pretending the app was typechecked.
const compilerAst = ts.createSourceFile("compile.ts", compiler, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = compilerAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "includeReactiveMeshColliders");
assert(!!declaration, "shared collider generator remains available");
const generated = ts.transpileModule(declaration.getText(compilerAst), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const sources = ["mesh-collider-status.ts", "mesh-collider-geometry.ts", "mesh-colliders.tsx"].map((name) => read(`packages/xrift-studio-runtime/src/${name}`));
const include = new Function("meshColliderStatusSource", "meshColliderGeometrySource", "meshCollidersSource", `${generated}; return includeReactiveMeshColliders;`)(...sources);
const context = { fiberImports: new Set(), reactValueImports: new Set(), reactTypeImports: new Set(), threeTypeImports: new Set(), rapierImports: new Set(), supportDeclarations: new Map() };
include(context);
for (const name of ["Component", "createContext", "useCallback", "useContext", "useEffect", "useLayoutEffect", "useRef", "useState"]) assert(context.reactValueImports.has(name), `generated JSX imports ${name}`);
assert(context.rapierImports.has("useRapier") && context.rapierImports.has("type RapierCollider"), "generated JSX imports its Rapier verifier and type");
const support = context.supportDeclarations.get("mesh-colliders");
assert(support.includes("type XriftColliderLoadState") && support.includes("function XriftCommittedMeshColliders"), "export embeds both readiness types and the live-shape verifier");
const output = ts.transpileModule(support, { fileName: "generated-colliders.tsx", reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } });
assert(!output.diagnostics?.some((d) => d.category === ts.DiagnosticCategory.Error), "generated support declarations parse as JSX/TypeScript");
console.log(JSON.stringify({status:"passed",kind:"syntax-and-wiring-only",typescript:ts.version,files:files.length,assertions},null,2));
