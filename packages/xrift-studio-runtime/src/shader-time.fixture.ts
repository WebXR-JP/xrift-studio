import {
  applyTimeUniformValue,
  detectTimeUniforms,
  resolveTimeUniformValue,
  stampMaterialTimeUniforms,
  stampObjectTimeUniforms,
  type TimeUniformSpec,
  type MutableUniformValue,
} from "./shader-time.js";

/** Assertions for Classic R3F time-uniform auto-detection and feeding. */
export function runShaderTimeFixtureAssertions(): void {
  assertOpenBrushBrushesAnimate();

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

/**
 * Open Brush brushes carry their motion in `uniform vec4 u_time`. That
 * underscore-separated spelling once fell outside the detection pattern, which
 * left every animated brush frozen in Scene View, Play and published worlds
 * while still looking correctly imported. These assertions pin both halves of
 * the path: the name is recognised, and a Material that arrives already
 * compiled gets stamped so the frame loops find it.
 */
function assertOpenBrushBrushesAnimate(): void {
  // The declaration shape three-icosa compiles into every animated brush.
  const brushFragment =
    "uniform vec4 u_time;\nuniform vec4 u_SceneLight_0_color;\nuniform float u_EmissionGain;\n";

  const specs = detectTimeUniforms({ fragmentShader: brushFragment });
  assert(
    specs.length === 1 &&
      specs[0]?.name === "u_time" &&
      specs[0]?.glslType === "vec4",
    "an Open Brush u_time uniform must be detected as a vec4 time uniform",
  );

  for (const name of ["u_time", "_u_time", "f_time", "uTime", "_Time", "time"]) {
    assert(
      detectTimeUniforms({ fragmentShader: `uniform vec4 ${name};\n` }).length === 1,
      `${name} must be recognised as a time uniform spelling`,
    );
  }
  for (const name of ["u_timeScale", "u_Cutoff", "timer", "u_EmissionGain"]) {
    assert(
      detectTimeUniforms({ fragmentShader: `uniform float ${name};\n` }).length === 0,
      `${name} must not be mistaken for a time uniform`,
    );
  }

  // A brush Material arrives from three-icosa already compiled, so there is no
  // Studio shader descriptor to stamp from at construction.
  const material = {
    fragmentShader: brushFragment,
    uniforms: { u_time: { value: [0, 0, 0, 0] } },
    userData: {} as Record<string, unknown>,
  };
  const stamped = stampMaterialTimeUniforms(material);
  assert(
    stamped.length === 1 && stamped[0]?.name === "u_time",
    "a compiled Open Brush Material must be stamped with its time uniform",
  );
  assert(
    JSON.stringify(material.userData.xriftTimeUniforms) ===
      JSON.stringify([{ name: "u_time", glslType: "vec4" }]),
    "stamping must record the specs on the shared xriftTimeUniforms contract",
  );

  // A uniform the Material never bound is not recorded, so a stamped Material
  // always means a Material the frame loop can actually drive.
  assert(
    stampMaterialTimeUniforms({
      fragmentShader: brushFragment,
      uniforms: {},
      userData: {},
    }).length === 0,
    "a time uniform the Material never bound must not be recorded",
  );

  // An authored animatedTimeUniform is more specific than anything detected
  // from source, so an existing stamp is kept.
  const authored = {
    fragmentShader: brushFragment,
    uniforms: { u_time: { value: 0 } },
    userData: {
      xriftTimeUniforms: [{ name: "u_time", glslType: "float" }],
    } as Record<string, unknown>,
  };
  assert(
    stampMaterialTimeUniforms(authored)[0]?.glslType === "float",
    "an existing stamp must win over detection",
  );

  // Stamping walks a loaded glTF tree, including multi-material meshes.
  const brushMaterial = () => ({
    fragmentShader: brushFragment,
    uniforms: { u_time: { value: [0, 0, 0, 0] } },
    userData: {} as Record<string, unknown>,
  });
  const meshes = [
    { material: brushMaterial() },
    { material: [brushMaterial(), { userData: {}, uniforms: {} }] },
    { material: undefined },
  ];
  const root = {
    traverse: (visit: (object: unknown) => void) => meshes.forEach(visit),
  };
  assert(
    stampObjectTimeUniforms(root) === 2,
    "stampObjectTimeUniforms must stamp every animated Material under the tree",
  );

  // Unity-style _Time semantics: the brushes read .x/.y/.z/.w as
  // (t/20, t, t*2, t*3).
  const uniform: MutableUniformValue = { value: [0, 0, 0, 0] };
  applyTimeUniformValue(uniform, { name: "u_time", glslType: "vec4" }, 20);
  assert(
    JSON.stringify(uniform.value) === JSON.stringify([1, 20, 40, 60]),
    "an Open Brush u_time must receive the Unity-style _Time vector",
  );
}
