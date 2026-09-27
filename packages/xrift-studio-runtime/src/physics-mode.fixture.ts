import { resolveXriftRuntimePhysicsMode } from "./physics-mode.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function runRuntimePhysicsModeFixtureAssertions(): void {
  assert(
    resolveXriftRuntimePhysicsMode("inherit", "world") === "inherit",
    "Published worlds must use the XRift player's Physics world",
  );
  assert(
    resolveXriftRuntimePhysicsMode(undefined, "world") === "local" &&
      resolveXriftRuntimePhysicsMode(true, "world") === "local",
    "Standalone world previews must keep their own Physics provider",
  );
  assert(
    resolveXriftRuntimePhysicsMode(false, "world") === "off" &&
      resolveXriftRuntimePhysicsMode(undefined, "item") === "off",
    "Physics disabled and default items must not mount collider bodies",
  );
}
