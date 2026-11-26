import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  describeXriftShaderProgramError,
  findXriftShaderMaterialsUsing,
  readXriftShaderFinalSources,
  readXriftShaderProgramError,
  takeNewFailedXriftShaderPrograms,
  xriftShaderSourceKey,
  type XriftShaderMaterialUse,
  type XriftThreeProgram,
} from "../shader-compile-errors.js";

/**
 * Reports each shader program that fails to compile or link while this is
 * mounted, together with the Materials in the scene that are drawn with it.
 *
 * The editor's Scene View and a published world both find failures here. The
 * renderer is not told to call back: a published world draws on a renderer it
 * does not own, and replacing its error callback would also silence the message
 * three.js prints for every other program. Instead the short list of programs
 * three.js keeps is read on a timer, which costs nothing a frame notices and
 * leaves the scene alone until something has actually failed.
 */
export function useXriftShaderCompileFailures(
  onFailures: (uses: XriftShaderMaterialUse[]) => void,
  intervalSeconds = 0.5,
): void {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const seen = useRef(new WeakSet<object>());
  const elapsed = useRef(intervalSeconds);
  const stopped = useRef(false);
  const callback = useRef(onFailures);
  callback.current = onFailures;
  useFrame((_state, delta) => {
    if (stopped.current) return;
    elapsed.current += delta;
    if (elapsed.current < intervalSeconds) return;
    elapsed.current = 0;
    let uses: XriftShaderMaterialUse[];
    try {
      const failed = takeNewFailedXriftShaderPrograms(gl, seen.current);
      if (failed.length === 0) return;
      uses = findXriftShaderMaterialsUsing(gl, scene, failed);
    } catch {
      // Reading diagnostics must never cost the world a frame. A renderer that
      // does not keep them the way this expects is simply not watched.
      stopped.current = true;
      return;
    }
    if (uses.length > 0) callback.current(uses);
  });
}

/** A Custom Shader Material of the world, by the key of its GLSL. */
export type XriftCustomShaderMaterialName = {
  name: string;
  /** `xriftShaderSourceKey` of the Material's vertex and fragment GLSL. */
  key: string;
};

/**
 * Names the Material in the console when one of the world's Custom Shaders does
 * not compile.
 *
 * three.js prints the compiler's log itself, but a Material drawn from generated
 * code has no name there, and its line numbers count the code three.js adds. A
 * world author reading the console of a published world gets the Material and
 * the line of their own GLSL from this instead. Nothing is shown in the world.
 */
export function XriftCustomShaderErrorLog({
  materials,
}: {
  materials: readonly XriftCustomShaderMaterialName[];
}) {
  const gl = useThree((state) => state.gl);
  useXriftShaderCompileFailures((uses) => {
    const reported = new Set<XriftThreeProgram>();
    for (const use of uses) {
      if (reported.has(use.program)) continue;
      const { vertexShader, fragmentShader } = use.material;
      if (typeof vertexShader !== "string" || typeof fragmentShader !== "string") continue;
      const key = xriftShaderSourceKey(vertexShader, fragmentShader);
      const names = materials.filter((material) => material.key === key);
      if (names.length === 0) continue;
      const error = readXriftShaderProgramError(
        use.program,
        use.material,
        readXriftShaderFinalSources(gl, use.program),
      );
      if (!error) continue;
      reported.add(use.program);
      console.error(
        `[XRift Studio] Material${names
          .map((material) => `「${material.name}」`)
          .join("")}のカスタムシェーダーをコンパイルできませんでした。\n${describeXriftShaderProgramError(error)}`,
      );
    }
  }, 1);
  return null;
}
