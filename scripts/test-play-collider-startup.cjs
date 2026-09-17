#!/usr/bin/env node
/**
 * Real bundled Rapier + the production readiness state machine.
 * Delays and mount events are simulated; this is not a React/Tauri E2E test.
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ts = require(process.env.XRIFT_TYPESCRIPT_PATH || "typescript");
const repo = path.resolve(__dirname, "..");
async function sourceModule(relative) {
  const fileName = path.join(repo, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(fileName, "utf8"), {
    fileName,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
function clock() {
  let now = 0;
  const timers = new Set();
  return {
    schedule(callback, delay) {
      const timer = { callback, at: now + delay };
      timers.add(timer);
      return () => timers.delete(timer);
    },
    advance(delay) {
      now += delay;
      for (const timer of [...timers]) {
        if (timer.at <= now && timers.delete(timer)) timer.callback();
      }
    },
  };
}
(async () => {
  const { createSceneModelLoadTracker, waitForSceneReady, PLAY_SCENE_SETTLE_MS } = await sourceModule("src/components/visual-editor/scene-load-state.ts");
  const { bakeXriftColliderGeometry } = await sourceModule("packages/xrift-studio-runtime/src/mesh-collider-geometry.ts");
  const { WORLD_PLAY_PLAYER_HALF_HEIGHT, WORLD_PLAY_PLAYER_RADIUS, WORLD_PLAY_CAPSULE_GROUND_OFFSET } = await sourceModule("src/components/visual-editor/world-play-spawn.ts");
  const shell = path.join(repo, "public/xrift-runtime-shell");
  const bundles = fs.readdirSync(shell).filter((name) => /^rapier-.*\.js$/.test(name));
  if (bundles.length !== 1) throw new Error("Expected exactly one shipped Rapier WASM module");
  const R = (await import(pathToFileURL(path.join(shell, bundles[0])).href)).default;
  await R.init();
  let assertions = 0;
  const cases = [];
  const assert = (condition, message) => { assertions++; if (!condition) throw new Error(message); };
  const points = [-5,0,-5, -5,0,5, 5,0,-5, -5,0,5, 5,0,5, 5,0,-5];
  const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const groundGeometry = bakeXriftColliderGeometry({
    count: points.length / 3,
    getX: (i) => points[i * 3], getY: (i) => points[i * 3 + 1], getZ: (i) => points[i * 3 + 2],
  }, null, identity, false);
  assert(groundGeometry !== null, "Production geometry baking yields a floor");

  // Run three separate Play sessions. The third has no floor, so any collision
  // carried across Stop would make it incorrectly grounded.
  for (let session = 0; session < 3; session++) {
    const withFloor = session < 2;
    const world = new R.World({ x: 0, y: -9.81, z: 0 });
    const scheduler = clock();
    const tracker = createSceneModelLoadTracker({ waitForSceneMount: true });
    let ready = false;
    const stopWaiting = waitForSceneReady(tracker, () => { ready = true; }, scheduler);
    let unmountScene;
    let model;
    let colliderLoad;
    let controller;
    try {
      scheduler.advance(30_000);
      assert(!ready, "Suspended Physics must not mistake zero registered models for ready");
      assert(world.bodies.len() === 0, "No player exists before the scene commits");
      unmountScene = tracker.mountScene();
      model = tracker.register();
      colliderLoad = tracker.register();
      scheduler.advance(30_000);
      assert(!ready, "Slow loading must not time out into Play");
      model.update({ status: "ready" });
      scheduler.advance(PLAY_SCENE_SETTLE_MS * 2);
      assert(!ready, "A visible model without committed collision cannot start Play");
      let floor;
      if (withFloor) {
        floor = world.createCollider(R.ColliderDesc.trimesh(groundGeometry.vertices, groundGeometry.indices));
        assert(world.getCollider(floor.handle) !== null, "A real Rapier collider was registered");
      }
      colliderLoad.update({ status: "ready" });
      scheduler.advance(PLAY_SCENE_SETTLE_MS - 1);
      assert(!ready, "The quiet interval is not skipped");
      scheduler.advance(1);
      assert(ready, "The prepared scene becomes ready after the quiet interval");
      assert(world.bodies.len() === 0, "Player still waits for the warmup physics step");
      // This models WorldPlayPhysicsWarmup's useAfterPhysicsStep notification.
      world.step();
      const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 3, 0));
      const player = world.createCollider(R.ColliderDesc.capsule(WORLD_PLAY_PLAYER_HALF_HEIGHT, WORLD_PLAY_PLAYER_RADIUS), body);
      controller = world.createCharacterController(0.01);
      const walk = (frames) => {
        for (let i = 0; i < frames; i++) {
          world.step();
          controller.computeColliderMovement(player, { x: 0, y: -0.05, z: 0 });
          const position = body.translation(), movement = controller.computedMovement();
          body.setNextKinematicTranslation({ x: position.x + movement.x, y: position.y + movement.y, z: position.z + movement.z });
        }
        world.step();
      };
      walk(150);
      if (withFloor) {
        assert(controller.computedGrounded(), "The player-sized character controller is grounded");
        assert(Math.abs(body.translation().y - WORLD_PLAY_CAPSULE_GROUND_OFFSET - 0.01) < 0.08, "Standing height matches the Play capsule dimensions");
        world.removeCollider(floor, true);
        walk(100);
        assert(!controller.computedGrounded() && body.translation().y < -2, "Removing the actual floor removes walking collision");
      } else {
        assert(!controller.computedGrounded() && body.translation().y < -2, "A fresh Play world has no stale floor from a previous run");
      }
      cases.push(withFloor ? `play-${session + 1}:delayed-mount-to-grounded-to-removed` : "play-3:no-ghost-floor-after-stop");
    } finally {
      stopWaiting(); model?.dispose(); colliderLoad?.dispose(); unmountScene?.();
      if (controller) world.removeCharacterController(controller);
      world.free();
    }
  }
  const failedTracker = createSceneModelLoadTracker({ waitForSceneMount: true });
  const scheduler = clock();
  const unmount = failedTracker.mountScene();
  const broken = failedTracker.register();
  let starts = 0;
  const stop = waitForSceneReady(failedTracker, () => { starts++; }, scheduler);
  broken.update({ status: "error", message: "Collision model missing" });
  scheduler.advance(60_000);
  assert(starts === 0 && failedTracker.getErrors().length === 1, "A broken collision model never counts as ready");
  stop(); broken.dispose(); unmount();
  broken.update({ status: "ready" });
  scheduler.advance(60_000);
  assert(starts === 0, "Completion after Stop cannot start the stopped player");
  cases.push("failed-collision-model-and-late-completion-blocked");
  console.log(JSON.stringify({ status: "passed", engine: `Rapier ${R.version()} (bundled WASM)`, typescript: ts.version, scope: "Production readiness core + real physics; simulated lifecycle, not React/Tauri E2E", cases, assertions }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
