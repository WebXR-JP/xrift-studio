export * as THREE from "three";
export { XriftThreeLoader, disposeXriftLoadResult } from "../packages/xrift-studio-runtime/src/three/index";
export { updateMToonMaterials } from "../packages/xrift-studio-runtime/src/mtoon-runtime";
export { React, createRoot, extend, XRiftProvider } from "./classic-mtoon-export.fixture";
export { Physics } from "@react-three/rapier";

/** XRift's player supplies these actual shared modules to a federated World. */
export async function loadBuiltShellWorld(url: string) {
  const [remote, react, reactDom, reactDomClient, jsx, three, gltf, draco, ktx, fiber, rapier, drei, uikit, components] = await Promise.all([
    import(/* @vite-ignore */ url), import("react"), import("react-dom"), import("react-dom/client"), import("react/jsx-runtime"), import("three"),
    import("three/addons/loaders/GLTFLoader.js"), import("three/addons/loaders/DRACOLoader.js"), import("three/addons/loaders/KTX2Loader.js"),
    import("@react-three/fiber"), import("@react-three/rapier"), import("@react-three/drei"), import("@react-three/uikit"), import("@xrift/world-components"),
  ]);
  const modules: Record<string, [string, unknown]> = {
    react: ["19.2.8", react], "react-dom": ["19.2.8", reactDom], "react-dom/client": ["19.2.8", reactDomClient], "react/jsx-runtime": ["19.2.8", jsx],
    three: ["0.185.1", three], "three/addons/loaders/GLTFLoader.js": ["0.185.1", gltf], "three/addons/loaders/DRACOLoader.js": ["0.185.1", draco], "three/addons/loaders/KTX2Loader.js": ["0.185.1", ktx],
    "@react-three/fiber": ["9.7.0", fiber], "@react-three/rapier": ["2.2.0", rapier], "@react-three/drei": ["10.7.7", drei],
    "@react-three/uikit": ["1.0.76", uikit], "@xrift/world-components": ["0.55.0", components],
  };
  remote.init(Object.fromEntries(Object.entries(modules).map(([name, [version, module]]) => [name, { [version]: { get: async () => () => module, loaded: true } }])));
  const factory = await remote.get("./World");
  return factory().World;
}
