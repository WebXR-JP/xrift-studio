#!/usr/bin/env node
/** Uses the project's shipped Rapier WASM, not a mock physics engine. */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const ts = require(process.env.XRIFT_TYPESCRIPT_PATH || "typescript");
const repo = path.resolve(__dirname, "..");

(async () => {
  const fileName = path.join(repo, "packages/xrift-studio-runtime/src/mesh-collider-geometry.ts");
  const source = ts.transpileModule(fs.readFileSync(fileName, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
  const { bakeXriftColliderGeometry } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const shell = path.join(repo, "public/xrift-runtime-shell");
  const candidates = fs.readdirSync(shell).filter((name) => /^rapier-.*\.js$/.test(name));
  if (candidates.length !== 1) throw new Error("Expected exactly one bundled Rapier WASM module in public/xrift-runtime-shell");
  const R = (await import(pathToFileURL(path.join(shell, candidates[0])).href)).default;
  await R.init();
  let assertions = 0; const cases = [];
  const assert = (condition, message) => { assertions++; if (!condition) throw new Error(message); };
  const identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const rect = (x1, z1, x2, z2, y = 0) => [x1,y,z1, x1,y,z2, x2,y,z1, x1,y,z2, x2,y,z2, x2,y,z1];
  const bake = (values, matrix = identity, mirrored = false) => bakeXriftColliderGeometry({ count: values.length / 3, getX: (i) => values[i*3], getY: (i) => values[i*3+1], getZ: (i) => values[i*3+2] }, null, matrix, mirrored);
  const floor = (world, geometry, sensor = false) => {
    if (!geometry) throw new Error("Test collision geometry is empty");
    return world.createCollider(R.ColliderDesc.trimesh(geometry.vertices, geometry.indices).setSensor(sensor).setFriction(0.8).setRestitution(0));
  };
  const capsule = (world, x, y, z) => {
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,y,z).setCanSleep(false).setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.capsule(0.6,0.3).setRestitution(0), body);
    return body;
  };
  const step = (world, frames = 300) => { for (let i=0; i<frames; i++) world.step(); };
  const run = (name, fn, gravity = -9.81) => { const world = new R.World({x:0,y:gravity,z:0}); try { fn(world); cases.push(name); } finally { world.free(); } };
  run("solid-trimesh-landing-and-removal", (world) => {
    const ground = floor(world,bake(rect(-5,-5,5,5))); const player = capsule(world,0,4,0); step(world);
    assert(Math.abs(player.translation().y-0.9)<0.08, "capsule must land on solid trimesh");
    world.removeCollider(ground,true); step(world,120);
    assert(player.translation().y < -5, "removing the floor must remove collision, not leave a ghost floor");
  });
  run("trigger-is-not-a-walkable-floor", (world) => {
    floor(world,bake(rect(-5,-5,5,5)),true); const player = capsule(world,0,4,0); step(world,120);
    assert(player.translation().y < -5, "sensor floor must allow traversal");
  });
  run("trigger-reenabled-as-solid", (world) => {
    const ground = floor(world,bake(rect(-5,-5,5,5)),true); ground.setSensor(false);
    const player = capsule(world,0,4,0); step(world);
    assert(Math.abs(player.translation().y-0.9)<0.08, "clearing Trigger restores walking collision");
  });
  run("translated-scaled-imported-floor", (world) => {
    floor(world,bake(rect(-1,-1,1,1), [3,0,0,0,0,2,0,0,0,0,2,0,7,2,-4,1]));
    const inside = capsule(world,7,6,-4), outside = capsule(world,0,6,0); step(world);
    assert(Math.abs(inside.translation().y-2.9)<0.08, "transformed mesh catches capsule at visible floor height");
    assert(outside.translation().y < -5, "no phantom collision at original untransformed location");
  });
  run("mirrored-floor", (world) => {
    floor(world,bake(rect(-4,-4,4,4), [-2,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], true));
    const player = capsule(world,-3,4,0); step(world);
    assert(Math.abs(player.translation().y-0.9)<0.08, "negative-scale triangles remain walkable");
  });
  run("concave-floor-keeps-hole", (world) => {
    floor(world,bake([...rect(-5,-5,-1,5),...rect(1,-5,5,5),...rect(-1,-5,1,-1),...rect(-1,1,1,5)]));
    const outsideHole = capsule(world,3,4,0), inHole = capsule(world,0,4,0); step(world);
    assert(Math.abs(outsideHole.translation().y-0.9)<0.08, "rim stays solid");
    assert(inHole.translation().y < -5, "trimesh does not fill holes like a convex hull");
  });
  run("late-load-and-shape-replacement", (world) => {
    assert(world.colliders.len()===0, "empty/loading models must have no placeholder collider");
    let ground;
    for (let i=0; i<8; i++) {
      if (ground) world.removeCollider(ground,true);
      ground = floor(world,bake(rect(-4,-4,4,4,i===7?2:0)));
      assert(world.colliders.len()===1, "refresh keeps one live floor collider");
    }
    const player = capsule(world,0,6,0); step(world);
    assert(Math.abs(player.translation().y-2.9)<0.08, "replacement floor height is used, not stale geometry");
  });
  run("wall-contact", (world) => {
    floor(world,bake([0,0,-5,0,5,-5,0,0,5, 0,5,-5,0,5,5,0,0,5]));
    const left = capsule(world,-2,2,0), right = capsule(world,2,2,2);
    left.setLinvel({x:4,y:0,z:0},true); right.setLinvel({x:-4,y:0,z:0},true); step(world,120);
    assert(left.translation().x <= -0.25 && right.translation().x >= 0.25, "wall blocks approach from both sides");
  }, 0);
  run("kinematic-character-controller-grounded", (world) => {
    floor(world,bake(rect(-5,-5,5,5)));
    const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,3,0));
    const shape = world.createCollider(R.ColliderDesc.capsule(0.6,0.3),body);
    const controller = world.createCharacterController(0.01);
    for(let i=0;i<180;i++) {
      world.step(); controller.computeColliderMovement(shape,{x:0,y:-0.05,z:0});
      const pos=body.translation(),move=controller.computedMovement();
      body.setNextKinematicTranslation({x:pos.x+move.x,y:pos.y+move.y,z:pos.z+move.z});
    }
    world.step();
    assert(controller.computedGrounded(), "Rapier character controller must detect floor");
    assert(Math.abs(body.translation().y-0.91)<0.08, "character controller stands on surface");
    world.removeCharacterController(controller);
  });
  console.log(JSON.stringify({status:"passed",engine:`Rapier ${R.version()} (bundled WASM)`,typescript:ts.version,cases,assertions},null,2));
})().catch((error)=>{ console.error(error); process.exitCode=1; });
