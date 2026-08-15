import {
  applyTimeUniformValue,
  detectTimeUniforms,
  resolveTimeUniformValue,
  type TimeUniformSpec,
  type MutableUniformValue,
} from "./shader-time.js";

/** Assertions for Classic R3F time-uniform auto-detection and feeding. */
export function runShaderTimeFixtureAssertions(): void {
  assert(
    JSON.stringify(
      detectTimeUniforms({
        fragmentShader: "uniform float uTime; uniform float uColor;\n",
      }),
    ) === JSON.stringify([{ name: "uTime", glslType: "float" }]),
    "detectTimeUniforms must find a declared uTime float",
  );

  const vec4 = detectTimeUniforms({
    fragmentShader:
      "uniform vec4 _UTime;\nuniform float _Random; uniform vec4 uTime;\n",
  });
  assert(
    vec4.length === 2 &&
      vec4[0]?.name === "_UTime" &&
      vec4[0]?.glslType === "vec4" &&
      vec4[1]?.name === "uTime" &&
      vec4[1]?.glslType === "vec4",
    "detectTimeUniforms must detect _UTime and uTime vec4 uniforms",
  );

  assert(
    detectTimeUniforms({
      fragmentShader: "uniform float uTime;\n",
      animatedTimeUniform: "uTime",
    }).length === 1,
    "a manual animatedTimeUniform must be merged (deduplicated)",
  );

  assert(
    JSON.stringify(
      detectTimeUniforms({
        fragmentShader: "uniform float uIntensity;\n",
        animatedTimeUniform: "uIntensity",
      }),
    ) === JSON.stringify([{ name: "uIntensity", glslType: "float" }]),
    "a manual animatedTimeUniform may override with a non-time-named uniform",
  );

  assert(
    detectTimeUniforms({
      vertexShader: "uniform float time;\n",
      fragmentShader: "uniform float _Time;\n",
    }).length === 2,
    "detection must cover both vertex and fragment stages",
  );

  const floatSpec: TimeUniformSpec = { name: "uTime", glslType: "float" };
  assert(
    resolveTimeUniformValue(floatSpec, 2.5) === 2.5,
    "float time resolves to elapsed seconds",
  );

  const vec4Spec: TimeUniformSpec = { name: "_UTime", glslType: "vec4" };
  const resolved = resolveTimeUniformValue(vec4Spec, 2) as number[];
  assert(
    resolved[0] === 2 / 20 &&
      resolved[1] === 2 &&
      resolved[2] === 4 &&
      resolved[3] === 6,
    "vec4 time resolves to Unity-style (t/20, t, t*2, t*3)",
  );

  const floatUniform: MutableUniformValue = { value: 0 };
  applyTimeUniformValue(floatUniform, floatSpec, 7);
  assert(floatUniform.value === 7, "float uniform is set to elapsed seconds");

  const arrayUniform: MutableUniformValue = { value: [0, 0, 0, 0] };
  applyTimeUniformValue(arrayUniform, vec4Spec, 1);
  assert(
    JSON.stringify(arrayUniform.value) === JSON.stringify([0.05, 1, 2, 3]),
    "array vec4 uniform is updated in place",
  );

  let setValue: number[] | null = null;
  const vectorUniform: MutableUniformValue = {
    value: {
      set: (x: number, y: number, z: number, w: number) => {
        setValue = [x, y, z, w];
      },
    },
  };
  applyTimeUniformValue(vectorUniform, vec4Spec, 4);
  assert(
    JSON.stringify(setValue) === JSON.stringify([0.2, 4, 8, 12]),
    "three.js vector uniform is updated via .set()",
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
