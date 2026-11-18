import { createElement } from "react";

import {
  ASSET_MANIFEST_SCHEMA_VERSION,
  type AssetManifest,
  type SceneAsset,
} from "../../lib/visual-editor/asset-manifest";
import { contentEqual } from "./content-equal";
import { createTrackedAssets } from "./tracked-assets";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Render isolation: ${message}`);
}

function asset(id: string, revision = 0): SceneAsset {
  return { id, kind: "material", name: id, revision } as unknown as SceneAsset;
}

function manifest(assets: Record<string, SceneAsset>): AssetManifest {
  return { schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION, assets };
}

function assertContentEquality(): void {
  assert(contentEqual({ phase: "idle" }, { phase: "idle" }, 2), "equal plain objects must compare equal");
  assert(!contentEqual({ phase: "idle" }, { phase: "busy" }, 2), "a changed field must be noticed");
  assert(!contentEqual({ a: 1 }, { a: 1, b: undefined }, 2), "an added key must be noticed");
  assert(contentEqual([{ id: "a", label: "A" }], [{ id: "a", label: "A" }], 2), "a list of small records must compare equal");
  assert(!contentEqual([{ id: "a", nested: { x: 1 } }], [{ id: "a", nested: { x: 1 } }], 2), "content below the depth limit must not be assumed equal");
  assert(!contentEqual([1, 2], [1, 2, 3], 2), "a longer list must be noticed");
  assert(contentEqual(Number.NaN, Number.NaN, 0), "identical values are equal at any depth");
  assert(!contentEqual(new Map(), new Map(), 2), "a Map is equal only to itself");
  assert(!contentEqual(() => 1, () => 1, 2), "a function is equal only to itself");
  assert(
    !contentEqual(createElement("div"), createElement("div"), 2),
    "a React element is equal only to itself, or a changed child could be skipped",
  );
  const large = Array.from({ length: 65 }, (_, index) => index);
  assert(!contentEqual(large, [...large], 2), "a large collection must not be walked");
}

function assertTrackedAssets(): void {
  const materialA = asset("material-a");
  const materialB = asset("material-b");
  const initial = manifest({ "material-a": materialA, "material-b": materialB });

  // An Entity that reads one Material keeps its view when another one changes.
  const tracked = createTrackedAssets(initial);
  assert(tracked.view.assets["material-a"] === materialA, "the view must return the manifest's own Asset");
  const editedB = asset("material-b", 1);
  const afterB = manifest({ "material-a": materialA, "material-b": editedB });
  assert(tracked.adopt(afterB), "editing an Asset that was never read must keep the view");
  assert(tracked.view.assets["material-b"] === editedB, "a kept view must answer from the newest manifest");

  // …and gives it up when the Material it reads changes.
  const editedA = asset("material-a", 1);
  assert(
    !tracked.adopt(manifest({ "material-a": editedA, "material-b": editedB })),
    "editing an Asset that was read must replace the view",
  );

  // Looking for an Asset that is not there is a dependency on it appearing.
  const missing = createTrackedAssets(initial);
  assert(missing.view.assets["texture-c"] === undefined, "a missing Asset reads as undefined");
  assert(
    !missing.adopt(manifest({ ...initial.assets, "texture-c": asset("texture-c") })),
    "an Asset that was looked up and later added must replace the view",
  );
  const viaIn = createTrackedAssets(initial);
  assert(!("texture-c" in viaIn.view.assets), "`in` must report the manifest's contents");
  assert(
    !viaIn.adopt(manifest({ ...initial.assets, "texture-c": asset("texture-c") })),
    "an `in` check is a read",
  );

  // Enumerating depends on everything.
  const enumerated = createTrackedAssets(initial);
  assert(
    Object.keys(enumerated.view.assets).join() === "material-a,material-b",
    "the view must enumerate like the manifest",
  );
  assert(!enumerated.adopt(afterB), "after enumerating, any Asset change must replace the view");
  const spread = createTrackedAssets(initial);
  assert(Object.values({ ...spread.view.assets }).length === 2, "a spread must copy every Asset");
  assert(!spread.adopt(afterB), "a spread is an enumeration");

  // Folders are their own dependency.
  const withFolders: AssetManifest = { ...initial, folders: {} };
  const ignoresFolders = createTrackedAssets(withFolders);
  void ignoresFolders.view.assets["material-a"];
  assert(ignoresFolders.adopt({ ...withFolders, folders: {} }), "folders that were never read must not replace the view");
  const readsFolders = createTrackedAssets(withFolders);
  void readsFolders.view.folders;
  assert(!readsFolders.adopt({ ...withFolders, folders: {} }), "folders that were read must replace the view");

  // The same manifest again is never a change, and the view is read-only.
  const unchanged = createTrackedAssets(initial);
  void Object.keys(unchanged.view.assets);
  assert(unchanged.adopt(initial), "the same manifest must keep the view");
  assert(unchanged.view.schemaVersion === ASSET_MANIFEST_SCHEMA_VERSION, "plain fields must pass through");
  assert(
    JSON.stringify(unchanged.view) === JSON.stringify(initial),
    "the view must serialise exactly like the manifest",
  );
  let rejected = false;
  try {
    (unchanged.view.assets as Record<string, SceneAsset>)["material-z"] = asset("material-z");
  } catch {
    rejected = true;
  }
  assert(rejected, "writing through the view must fail loudly");
  assert(initial.assets["material-z"] === undefined, "a rejected write must not reach the manifest");
}

export function runRenderIsolationFixtureAssertions(): void {
  assertContentEquality();
  assertTrackedAssets();
}
