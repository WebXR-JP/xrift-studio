import type { Object3D } from "three";
import { installMirrorReflectionInterval } from "./mirror-reflection.js";

export function runMirrorReflectionFixtureAssertions(): void {
  assertFrames(undefined, [2, 4, 6]);
  assertFrames(1, [1, 2, 3, 4, 5, 6]);
  assertFrames(3, [3, 6]);
  assertFrames(3.8, [3, 6]);
}

function assertFrames(interval: number | undefined, expected: number[]): void {
  const renderer = { info: { render: { frame: 0 } } };
  const args = [renderer, {}, {}, {}, {}, {}] as unknown as Parameters<
    Object3D["onBeforeRender"]
  >;
  const updated: number[] = [];
  let logicalFrame = 0;
  const reflector: Pick<Object3D, "onBeforeRender"> = {
    onBeforeRender(...received) {
      assert(this === reflector, "Reflector callback lost its receiver");
      assert(received.every((value, index) => value === args[index]), "Render arguments changed");
      updated.push(logicalFrame);
      // Reflection recursively renders the scene; this is not a new R3F frame.
      renderer.info.render.frame += 2;
    },
  };
  const advanceFrame = installMirrorReflectionInterval(reflector, interval);
  for (logicalFrame = 1; logicalFrame <= 6; logicalFrame += 1) {
    advanceFrame();
    // Both XR eyes must make the same update decision, even though renderer
    // passes (and nested reflections) increment renderer.info.render.frame.
    for (let eye = 0; eye < 2; eye += 1) {
      renderer.info.render.frame += 1;
      reflector.onBeforeRender(...args);
    }
  }
  assert(
    JSON.stringify(updated) === JSON.stringify(expected.flatMap((frame) => [frame, frame])),
    `Mirror interval ${interval ?? "default"} did not preserve frame/eye updates`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Mirror reflection fixture failed: ${message}`);
}
