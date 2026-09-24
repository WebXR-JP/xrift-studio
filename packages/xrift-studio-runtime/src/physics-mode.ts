export type XriftRuntimePhysicsSetting = boolean | "inherit" | undefined;
export type XriftRuntimePhysicsMode = "local" | "inherit" | "off";

/** XRift's player already provides the Physics world used by its avatar. */
export function resolveXriftRuntimePhysicsMode(
  setting: XriftRuntimePhysicsSetting,
  projectKind: "world" | "item",
): XriftRuntimePhysicsMode {
  if (setting === "inherit") return "inherit";
  if (setting === false) return "off";
  return setting === true || projectKind === "world" ? "local" : "off";
}
