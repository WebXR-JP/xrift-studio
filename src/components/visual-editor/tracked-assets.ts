/**
 * An Asset manifest that remembers which Assets were read from it.
 *
 * Every Entity in the Scene View is handed the whole manifest, because what an
 * Entity needs from it is decided deep inside its visuals: a Mesh looks up its
 * Material, the Material its textures, a Model its own Materials, a trigger its
 * graph. The manifest is replaced on every Asset edit, so dragging one
 * Material's roughness re-rendered every Entity in the Scene — twice per
 * pointer move — including the ones that never touch that Material.
 *
 * Listing each visual's Asset dependencies by hand would fix that until the
 * next visual forgot one, and the failure would be a stale picture with no
 * error. This records the dependencies instead. Each Entity gets its own view
 * of the manifest; the view notes every Asset id looked up through it, and the
 * value it returned. When the manifest changes, the view is replaced only if
 * one of those values did. Otherwise the same object is kept — so `memo`,
 * `useMemo` and effect dependencies all see "nothing changed" — and it simply
 * starts answering from the new manifest.
 *
 * What makes this safe is that it cannot under-report: a visual that depends on
 * an Asset has to read it, and every read is recorded, whether it happens while
 * rendering, in an effect or in a callback. Enumerating the manifest
 * (`Object.values`, `for…in`, a spread) counts as depending on all of it.
 *
 * The view is read-only and is not the manifest itself: it must not be written
 * to, compared with the manifest by identity, or passed to `postMessage` /
 * `structuredClone`. Code that edits or saves Assets takes the real manifest.
 */
import { useRef } from "react";

import type { AssetManifest, SceneAsset } from "../../lib/visual-editor";

const READ_ONLY = "Scene Viewのアセット参照は読み取り専用です";

class AssetReadTracker {
  private manifest: AssetManifest;
  /** Asset id → the value the view returned for it, `undefined` if missing. */
  private readonly readAssets = new Map<string, SceneAsset | undefined>();
  /** Set once the Assets were enumerated: any change is then relevant. */
  private readEveryAsset = false;
  private readFolders = false;
  readonly view: AssetManifest;

  constructor(manifest: AssetManifest) {
    this.manifest = manifest;

    const readAsset = (id: string): SceneAsset | undefined => {
      const asset = this.manifest.assets[id];
      this.readAssets.set(id, asset);
      return asset;
    };

    // Both proxies sit on an empty object. A Proxy has to agree with its
    // target about non-configurable properties, and the manifest behind the
    // view is swapped as the project changes, so the target cannot be it.
    const assets = new Proxy({} as Record<string, SceneAsset>, {
      get: (_target, key) =>
        typeof key === "string"
          ? readAsset(key)
          : Reflect.get(this.manifest.assets, key),
      has: (_target, key) => {
        if (typeof key === "string") readAsset(key);
        return Reflect.has(this.manifest.assets, key);
      },
      ownKeys: () => {
        this.readEveryAsset = true;
        return Reflect.ownKeys(this.manifest.assets);
      },
      getOwnPropertyDescriptor: (_target, key) => {
        if (typeof key === "string") readAsset(key);
        const descriptor = Reflect.getOwnPropertyDescriptor(
          this.manifest.assets,
          key,
        );
        return descriptor ? { ...descriptor, configurable: true } : undefined;
      },
      set: () => {
        throw new TypeError(READ_ONLY);
      },
      defineProperty: () => {
        throw new TypeError(READ_ONLY);
      },
      deleteProperty: () => {
        throw new TypeError(READ_ONLY);
      },
    });

    this.view = new Proxy({} as AssetManifest, {
      get: (_target, key) => {
        if (key === "assets") return assets;
        if (key === "folders") this.readFolders = true;
        return Reflect.get(this.manifest, key);
      },
      has: (_target, key) => {
        if (key === "folders") this.readFolders = true;
        return Reflect.has(this.manifest, key);
      },
      ownKeys: () => {
        this.readFolders = true;
        return Reflect.ownKeys(this.manifest);
      },
      getOwnPropertyDescriptor: (_target, key) => {
        if (key === "folders") this.readFolders = true;
        const descriptor = Reflect.getOwnPropertyDescriptor(this.manifest, key);
        if (!descriptor) return undefined;
        return {
          ...descriptor,
          ...(key === "assets" ? { value: assets } : {}),
          configurable: true,
        };
      },
      set: () => {
        throw new TypeError(READ_ONLY);
      },
      defineProperty: () => {
        throw new TypeError(READ_ONLY);
      },
      deleteProperty: () => {
        throw new TypeError(READ_ONLY);
      },
    });
  }

  /**
   * Moves the view on to `next` if nothing it has read differs there.
   *
   * Returns false when something did, in which case the caller needs a fresh
   * view: the old one has to keep its identity only while it is still true.
   */
  adopt(next: AssetManifest): boolean {
    const current = this.manifest;
    if (next === current) return true;
    if (this.readFolders && next.folders !== current.folders) return false;
    if (next.assets !== current.assets) {
      if (this.readEveryAsset) return false;
      for (const [id, asset] of this.readAssets) {
        if (next.assets[id] !== asset) return false;
      }
    }
    this.manifest = next;
    return true;
  }
}

/**
 * A view of `manifest` that keeps its identity until an Asset read through it
 * changes. Give each consumer its own: the reads of one Entity must not decide
 * when another re-renders.
 */
export function useTrackedAssets(manifest: AssetManifest): AssetManifest {
  const tracker = useRef<AssetReadTracker | null>(null);
  if (!tracker.current || !tracker.current.adopt(manifest)) {
    tracker.current = new AssetReadTracker(manifest);
  }
  return tracker.current.view;
}

/** For tests: the same tracker without a component around it. */
export function createTrackedAssets(manifest: AssetManifest): {
  view: AssetManifest;
  adopt: (next: AssetManifest) => boolean;
} {
  const tracker = new AssetReadTracker(manifest);
  return { view: tracker.view, adopt: (next) => tracker.adopt(next) };
}
