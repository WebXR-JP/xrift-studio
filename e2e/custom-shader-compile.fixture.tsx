import { advance, createRoot, extend } from "@react-three/fiber";
import * as THREE from "three";
import { XriftCustomShaderErrorLog } from "../packages/xrift-studio-runtime/src/script/shader-compile-watch";
import { xriftShaderSourceKey } from "../packages/xrift-studio-runtime/src/shader-compile-errors";

// The Canvas does this itself; a root made by hand has to.
extend(THREE as unknown as Parameters<typeof extend>[0]);

const VERTEX = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BROKEN_FRAGMENT = `uniform vec3 uColor;
varying vec2 vUv;
#include <common>
void main() {
  gl_FragColor = vec4(uColor * missingValue, 1.0);
}`;

const WORKING_FRAGMENT = `varying vec2 vUv;
void main() {
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}`;

/**
 * Draws what a published world draws for two Custom Shader Materials - nameless
 * `<shaderMaterial>` elements, as the compiler emits them - beside the reader
 * the compiler ships with such a world, and returns what reached the console.
 *
 * One Material is used by two meshes, so the failure must still be named once.
 */
export async function renderPublishedShaderFailure(): Promise<{ errors: string[]; afterMoreFrames: number }> {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(64, 64);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  const root = createRoot(document.createElement("canvas"));
  const errors: string[] = [];
  const consoleError = console.error;
  console.error = (...values: unknown[]) => {
    errors.push(values.map(String).join(" "));
  };
  try {
    await root.configure({ gl: renderer, scene, camera, frameloop: "never", size: { width: 64, height: 64, top: 0, left: 0 }, events: undefined });
    const uniforms = { uColor: { value: new THREE.Color("#ff8800") } };
    root.render(
      <>
        <mesh position={[-1, 0, 0]}>
          <planeGeometry />
          <shaderMaterial vertexShader={VERTEX} fragmentShader={BROKEN_FRAGMENT} uniforms={uniforms} />
        </mesh>
        <mesh position={[1, 0, 0]}>
          <planeGeometry />
          <shaderMaterial vertexShader={VERTEX} fragmentShader={BROKEN_FRAGMENT} uniforms={uniforms} />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <planeGeometry />
          <shaderMaterial vertexShader={VERTEX} fragmentShader={WORKING_FRAGMENT} />
        </mesh>
        <XriftCustomShaderErrorLog
          materials={[
            { name: "看板のGlow", key: xriftShaderSourceKey(VERTEX, BROKEN_FRAGMENT) },
            { name: "床", key: xriftShaderSourceKey(VERTEX, WORKING_FRAGMENT) },
          ]}
        />
      </>,
    );
    // The reader looks once a second of the world's own clock.
    for (let frame = 0; frame < 40 && scene.children.length < 3; frame += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    for (const seconds of [0, 0.4, 1.6, 2.8]) advance(seconds);
    const reported = errors.length;
    for (const seconds of [4, 5.2, 6.4]) advance(seconds);
    return { errors: errors.slice(0, reported), afterMoreFrames: errors.length - reported };
  } finally {
    console.error = consoleError;
    root.unmount();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
