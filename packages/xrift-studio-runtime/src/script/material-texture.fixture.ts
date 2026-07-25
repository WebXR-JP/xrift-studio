import { Texture } from "three";

import {
  normalizeScriptTextureOptions,
  ScriptMaterialTextureClonePool,
} from "./host.js";

/**
 * Exercises the clone lifecycle without mounting React Three Fiber.
 *
 * The CLI fixture runner can import this function through the same Vite
 * TypeScript path used by the other shared runtime contract fixtures.
 */
export function runScriptMaterialTextureFixtureAssertions(): void {
  const safeDefaults = normalizeScriptTextureOptions(undefined);
  assert(
    safeDefaults.colorSpace === "auto" &&
      safeDefaults.wrapS === "clamp-to-edge" &&
      safeDefaults.wrapT === "clamp-to-edge" &&
      safeDefaults.magFilter === "linear" &&
      safeDefaults.minFilter === "linear-mipmap-linear" &&
      safeDefaults.generateMipmaps &&
      safeDefaults.flipY,
    "Three-safe Texture defaults changed",
  );
  const mergedOptions = normalizeScriptTextureOptions(
    {
      colorSpace: "srgb",
      wrapS: "repeat",
      wrapT: "mirrored-repeat",
      magFilter: "nearest",
      minFilter: "nearest-mipmap-nearest",
      generateMipmaps: false,
      flipY: false,
    },
    {
      wrapS: "clamp-to-edge",
      flipY: true,
    },
  );
  assert(
    mergedOptions.colorSpace === "srgb" &&
      mergedOptions.wrapS === "clamp-to-edge" &&
      mergedOptions.wrapT === "mirrored-repeat" &&
      mergedOptions.magFilter === "nearest" &&
      mergedOptions.minFilter === "linear" &&
      !mergedOptions.generateMipmaps &&
      mergedOptions.flipY,
    "Texture options did not merge safe, Asset, and Script values in order",
  );

  const source = new Texture();
  source.offset.set(0.1, 0.2);
  source.repeat.set(2, 3);
  source.center.set(0.25, 0.75);
  source.rotation = 0.4;
  source.updateMatrix();
  const originalSourceTransform = readTransform(source);

  const pool = new ScriptMaterialTextureClonePool();
  const first = pool.resolve("0:baseColor", source, {
    offset: [0.5, 0.6],
    rotation: 1.2,
  });
  assert(first !== source, "Material transform mutated the shared source");
  assert(
    equalTransform(readTransform(source), originalSourceTransform),
    "Material transform changed the shared source values",
  );
  assert(
    first.offset.x === 0.5 &&
      first.offset.y === 0.6 &&
      first.repeat.x === 2 &&
      first.repeat.y === 3 &&
      first.center.x === 0.25 &&
      first.center.y === 0.75 &&
      first.rotation === 1.2,
    "Owned clone did not combine source values and the partial override",
  );

  const firstVersion = first.version;
  source.offset.set(0.7, 0.8);
  source.repeat.set(4, 5);
  const reused = pool.resolve("0:baseColor", source, {
    center: [0.3, 0.4],
  });
  assert(reused === first, "Same source identity did not reuse its clone");
  assert(
    reused.version === firstVersion,
    "Transform-only update requested an unnecessary Texture re-upload",
  );
  assert(
    reused.offset.x === 0.7 &&
      reused.offset.y === 0.8 &&
      reused.repeat.x === 4 &&
      reused.repeat.y === 5 &&
      reused.center.x === 0.3 &&
      reused.center.y === 0.4 &&
      reused.rotation === source.rotation,
    "Reused clone did not reset transform fields from the source",
  );

  let firstDisposeCount = 0;
  first.addEventListener("dispose", () => {
    firstDisposeCount += 1;
  });
  const replacementSource = new Texture();
  const replacement = pool.resolve(
    "0:baseColor",
    replacementSource,
    { repeat: [3, 3] },
  );
  assert(replacement !== first, "Changed source identity reused a stale clone");
  assert(
    firstDisposeCount === 1,
    "Changed source identity did not dispose the previous clone",
  );

  let replacementDisposeCount = 0;
  replacement.addEventListener("dispose", () => {
    replacementDisposeCount += 1;
  });
  pool.releaseUnused(new Set());
  assert(
    replacementDisposeCount === 1 && pool.size === 0,
    "Reset or owner removal did not dispose an unused clone",
  );

  const stopClone = pool.resolve("1:metallicRoughness", source, {});
  let stopDisposeCount = 0;
  stopClone.addEventListener("dispose", () => {
    stopDisposeCount += 1;
  });
  pool.dispose();
  assert(
    stopDisposeCount === 1 && pool.size === 0,
    "Play Stop did not dispose every owned clone",
  );
}

function readTransform(texture: Texture): readonly number[] {
  return [
    texture.offset.x,
    texture.offset.y,
    texture.repeat.x,
    texture.repeat.y,
    texture.center.x,
    texture.center.y,
    texture.rotation,
  ];
}

function equalTransform(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
