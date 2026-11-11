import { expect, test } from "@playwright/test";
import type { StableCloneFixtureControl } from "../src/release-e2e/stable-model-clone.fixture";
declare global { interface Window { __STABLE_CLONE_FIXTURE__?: StableCloneFixtureControl } }

test.describe("StableModelClone", () => {
  for (const strict of [false, true]) test(`preserves skinned clones through rerenders and cleanup (StrictMode=${strict})`, async ({ page }) => {
    await page.goto("/e2e.html?scenario=ready");
    await page.evaluate(async (enabled) => {
      const path = "/src/release-e2e/stable-model-clone.fixture.tsx";
      const fixture = await import(/* @vite-ignore */ path);
      (window as typeof window & { __CLEAN_STABLE_CLONE__?: () => void }).__CLEAN_STABLE_CLONE__ = fixture.mountStableCloneFixture(enabled);
    }, strict);
    await expect.poll(() => page.evaluate(() => {
      const f = window.__STABLE_CLONE_FIXTURE__;
      return !!f && f.fallbackMounts > 0 && f.staticFound && [0,1,2].every(id => f.actors[id]?.rigCount === 1 && f.actors[id].mtoon && f.actors[id].outline && f.actors[id].morph > .02);
    }), { timeout: 30000 }).toBe(true);
    const inspect = () => page.evaluate(() => {
      const f = window.__STABLE_CLONE_FIXTURE__!, a = f.actors[0], b = f.actors[1];
      return {
        a: { tick: a.tick, rigCount: a.rigCount, hipParent: a.hipParent, hipAngle: a.hipAngle, mtoon: a.mtoon, outline: a.outline, outlineShared: a.outlineShared, castShadow: a.castShadow, receiveShadow: a.receiveShadow },
        b: { tick: b.tick, rigCount: b.rigCount, hipParent: b.hipParent, mtoon: b.mtoon, outline: b.outline, outlineShared: b.outlineShared },
        staticPose: { tick: f.actors[2].tick, hipAngle: f.actors[2].hipAngle, morph: f.actors[2].morph },
        sharedBones: a.bones.some(bone => b.bones.includes(bone)), sharedSkeleton: a.skeleton === b.skeleton,
        sharedMorph: a.morphArray === b.morphArray, sharedMaterial: a.mesh.material === b.mesh.material,
      };
    });
    const before = await inspect();
    expect(before).toMatchObject({ a: { rigCount: 1, hipParent: "LegRig", mtoon: true, outline: true, outlineShared: true, castShadow: true, receiveShadow: true }, b: { rigCount: 1, hipParent: "LegRig", mtoon: true, outline: true, outlineShared: true }, sharedBones: false, sharedSkeleton: false, sharedMorph: false, sharedMaterial: false });
    expect(before.staticPose.hipAngle).toBeCloseTo(.25); expect(before.staticPose.morph).toBeCloseTo(.25);
    for (let tick = 1; tick <= 3; tick++) {
      await page.evaluate(() => window.__STABLE_CLONE_FIXTURE__!.tick());
      await expect.poll(() => page.evaluate(() => window.__STABLE_CLONE_FIXTURE__!.actors[1]?.tick)).toBe(tick);
      expect(await inspect()).toMatchObject({ a: { tick, rigCount: 1, hipParent: "LegRig", mtoon: true, outline: true, outlineShared: true }, b: { tick, rigCount: 1, hipParent: "LegRig", mtoon: true, outline: true, outlineShared: true }, sharedBones: false, sharedSkeleton: false, sharedMorph: false, sharedMaterial: false });
      const posed = await inspect(); expect(posed.staticPose.hipAngle).toBeCloseTo(.25); expect(posed.staticPose.morph).toBeCloseTo(.25);
    }
    const initial = await page.evaluate(() => {
      const a = window.__STABLE_CLONE_FIXTURE__!.actors[0], v = a.mesh.getVertexPosition(0, a.root.position.clone()).applyMatrix4(a.mesh.matrixWorld);
      a.root.position.x += 1; return v.x;
    });
    await expect.poll(() => page.evaluate((x) => {
      const a = window.__STABLE_CLONE_FIXTURE__!.actors[0], v = a.mesh.getVertexPosition(0, a.root.position.clone()).applyMatrix4(a.mesh.matrixWorld);
      return Math.abs(v.x - x - 1) < 1e-4;
    }, initial)).toBe(true);
    await page.evaluate(() => window.__STABLE_CLONE_FIXTURE__!.swapFirst());
    await expect.poll(() => page.evaluate(() => {
      const f = window.__STABLE_CLONE_FIXTURE__!, a = f.actors[0], b = f.actors[1];
      const inTree = new Set<unknown>(); a.root.traverse(node => inTree.add(node));
      return a.modelRevision === 1 && a.rigCount === 1 && a.hipParent === "LegRig" && a.mtoon && a.outline && a.outlineShared
        && a.skeleton !== f.previousSkeleton && b.skeleton === f.otherSkeleton
        && !!f.previousBones && f.previousBones.every(bone => !inTree.has(bone)) && f.previousBones[0].parent === null
        && a.skeleton.bones.every(bone => inTree.has(bone) && !f.previousBones!.includes(bone));
    }), { timeout: 5000 }).toBe(true);
    await page.evaluate(() => window.__STABLE_CLONE_FIXTURE__!.pause(0));
    const frozen = await page.evaluate(() => ({ a: window.__STABLE_CLONE_FIXTURE__!.actors[0].morph, b: window.__STABLE_CLONE_FIXTURE__!.actors[1].morph }));
    await expect.poll(() => page.evaluate((prior) => {
      const f = window.__STABLE_CLONE_FIXTURE__!;
      return Math.abs(f.actors[0].morph - prior.a) < 1e-6 && Math.abs(f.actors[1].morph - prior.b) > .05;
    }, frozen), { timeout: 5000 }).toBe(true);
    const firstUnmounts = await page.evaluate(() => window.__STABLE_CLONE_FIXTURE__!.unmountedActors.filter(id => id === 0).length);
    await page.evaluate(() => window.__STABLE_CLONE_FIXTURE__!.removeFirst());
    await expect.poll(() => page.evaluate(() => window.__STABLE_CLONE_FIXTURE__!.unmountedActors.filter(id => id === 0).length)).toBe(firstUnmounts + 1);
    await page.waitForTimeout(100);
    await expect.poll(() => page.evaluate(() => {
      const b = window.__STABLE_CLONE_FIXTURE__!.actors[1];
      return b.rigCount === 1 && b.hipParent === "LegRig" && b.mtoon && b.outline && b.outlineShared;
    })).toBe(true);
    await page.evaluate(() => (window as typeof window & { __CLEAN_STABLE_CLONE__?: () => void }).__CLEAN_STABLE_CLONE__?.());
  });
});

test("the original Drei Clone loses its hip on a parent rerender (regression control)", async ({ page }) => {
  await page.goto("/e2e.html?scenario=ready");
  await page.evaluate(async () => {
    const path = "/src/release-e2e/stable-model-clone.fixture.tsx";
    const fixture = await import(/* @vite-ignore */ path);
    (window as typeof window & { __CLEAN_STABLE_CLONE__?: () => void }).__CLEAN_STABLE_CLONE__ = fixture.mountStableCloneFixture(false, true);
  });
  await expect.poll(() => page.evaluate(() => {
    const a = window.__STABLE_CLONE_FIXTURE__?.actors[0];
    return a?.rigCount === 1 && a.hipParent === "LegRig" && a.mtoon && a.outline;
  }), { timeout: 30000 }).toBe(true);
  await page.evaluate(() => window.__STABLE_CLONE_FIXTURE__!.tick());
  await expect.poll(() => page.evaluate(() => {
    const a = window.__STABLE_CLONE_FIXTURE__?.actors[0];
    return a?.tick === 1 && a.rigCount === 0 && a.hipParent === null;
  })).toBe(true);
  await page.evaluate(() => (window as typeof window & { __CLEAN_STABLE_CLONE__?: () => void }).__CLEAN_STABLE_CLONE__?.());
});
