import {
  Color,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RawShaderMaterial,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  type Material,
} from "three";

import { createScriptResources, type ScriptResources } from "./host.js";

/**
 * Exercises `ctx.materials.setUniform` through the Script host's own resource
 * object, without mounting React Three Fiber or a WebGL renderer. What the
 * renderer would read is the `value` of each entry in the drawn Material's
 * `uniforms`, so that is what every check below looks at.
 */
export function runScriptMaterialUniformFixtureAssertions(): void {
  assertOverridesStayOnTheClone();
  assertEveryAcceptedForm();
  assertWrongValuesAreRefused();
  assertClockUniform();
  assertScriptsComposeInComponentOrder();
  assertSelectedHandles();
  assertOnlyCustomShadersAreTargeted();
  assertLateMeshesAndExistingSetters();
}

function assertOverridesStayOnTheClone(): void {
  const { root, mesh, shared, standardMesh, standard, childMesh, childShared } =
    createScene();
  const script = createResources(root, "script-a", 10);
  const authoredHolders = { ...shared.uniforms };
  const authoredWalker = shared.uniforms.uWalker!.value as Vector3;

  assert(
    script.materials.setUniform("uMissing", 1) === 0 &&
      mesh.material === shared,
    "a name no Material declares replaced the Material or was counted",
  );
  assert(
    script.materials.setUniform("uGain", 2) === 1,
    "setUniform did not count the one custom shader that declares the name",
  );
  assert(
    mesh.material !== shared && read(mesh, "uGain") === 2,
    "the override did not reach this Entity's own runtime Material",
  );
  assert(
    shared.uniforms.uGain!.value === 1 &&
      shared.uniforms.uGain === authoredHolders.uGain,
    "the shared Material was changed by a runtime override",
  );
  assert(
    standardMesh.material === standard,
    "a Material without uniforms was replaced although nothing applies to it",
  );
  assert(
    childMesh.material === childShared &&
      childShared.uniforms.uGain!.value === 1,
    "a child Entity's Material was reached from its parent's Script",
  );

  // three.js keeps the uniforms object of the first draw. The table must stay
  // the same object through later writes and through a full re-apply, or the
  // renderer would go on drawing the first values.
  const table = drawn(mesh).uniforms;
  const clone = mesh.material;
  const version = drawn(mesh).version;
  script.materials.setUniform("uWalker", [1, 2, 3]);
  const walker = read(mesh, "uWalker");
  script.materials.setUniform("uWalker", [4, 5, 6]);
  script.materials.setOpacity(0.5);
  script.materials.setUniform("uGain", 3);
  assert(
    mesh.material === clone && drawn(mesh).uniforms === table,
    "a later write replaced the clone or the uniforms object the renderer reads",
  );
  assert(
    drawn(mesh).version === version,
    "changing a uniform value asked for the shader program to be rebuilt",
  );
  assert(
    read(mesh, "uWalker") === walker &&
      walker instanceof Vector3 &&
      walker.toArray().join() === "4,5,6",
    "a repeated write did not reuse the override's own storage",
  );
  assert(
    walker !== authoredWalker && authoredWalker.toArray().join() === "0,0,0",
    "the override wrote into the value object the shared Material owns",
  );
  assert(
    read(mesh, "uGain") === 3 && drawn(mesh).opacity === 0.5,
    "a uniform override and another override did not coexist",
  );

  assert(
    script.materials.resetUniform("uWalker") === 1 &&
      drawn(mesh).uniforms.uWalker === shared.uniforms.uWalker,
    "resetUniform did not return the uniform to the Material's own value",
  );
  assert(
    script.materials.resetUniform("uMissing") === 0,
    "resetUniform counted a Material that does not declare the name",
  );
  script.materials.reset();
  assert(
    mesh.material === shared,
    "reset() left the Script's Material in place",
  );
  script.materials.setUniform("uGain", 9);
  script.dispose();
  assert(
    mesh.material === shared && shared.uniforms.uGain!.value === 1,
    "Stop did not put the shared Material back unchanged",
  );
  assert(
    script.materials.setUniform("uGain", 4) === 0 && mesh.material === shared,
    "a stopped Script could still override a uniform",
  );
}

function assertEveryAcceptedForm(): void {
  const { root, mesh, shared } = createScene();
  const script = createResources(root, "script-a", 10);
  const { materials } = script;

  const passed = new Vector3(7, 8, 9);
  materials.setUniform("uWalker", passed);
  passed.set(0, 0, 0);
  assert(
    numbers(read(mesh, "uWalker")) === "7,8,9",
    "the override kept the caller's object instead of its numbers",
  );
  materials.setUniform("uWalker", "#ffffff");
  assert(
    numbers(read(mesh, "uWalker")) === "1,1,1",
    "a colour string did not fill a three-component uniform",
  );
  materials.setUniform("uUv", new Vector2(0.25, 0.5));
  materials.setUniform("uPlane", [1, 2, 3, 4]);
  assert(
    read(mesh, "uUv") instanceof Vector2 &&
      numbers(read(mesh, "uUv")) === "0.25,0.5" &&
      read(mesh, "uPlane") instanceof Vector4 &&
      numbers(read(mesh, "uPlane")) === "1,2,3,4",
    "Vector2 or Vector4 values did not keep the Material's own value type",
  );
  materials.setUniform("uPlane", new Vector4(5, 6, 7, 8));
  assert(
    numbers(read(mesh, "uPlane")) === "5,6,7,8",
    "a Vector4 was not accepted for a four-component uniform",
  );

  materials.setUniform("uTint", "#ff0000");
  assert(
    read(mesh, "uTint") instanceof Color &&
      numbers(read(mesh, "uTint")) === "1,0,0",
    "a colour string did not become a Color",
  );
  materials.setUniform("uTint", 0x00ff00);
  assert(
    numbers(read(mesh, "uTint")) === "0,1,0",
    "a hexadecimal number was not read as a colour on a Color uniform",
  );
  materials.setUniform("uTint", new Color(0, 0, 1));
  assert(
    numbers(read(mesh, "uTint")) === "0,0,1",
    "a Color was not accepted",
  );
  materials.setUniform("uTint", [0.25, 0.5, 0.75]);
  assert(
    numbers(read(mesh, "uTint")) === "0.25,0.5,0.75",
    "an array on a Color uniform was converted instead of passed through",
  );
  materials.setUniform("uTint", "#808080");
  assert(
    numbers(read(mesh, "uTint")) === numbers(new Color("#808080")),
    "a colour string was not converted the way the Material's own colour is",
  );
  // The same string every frame is read once; a different one is read again.
  materials.setUniform("uTint", "#808080");
  materials.setUniform("uTint", "#0000ff");
  materials.setUniform("uTint", "#0000ff");
  assert(
    numbers(read(mesh, "uTint")) === "0,0,1",
    "a repeated colour string kept the numbers of an earlier one",
  );
  materials.setUniform("uTint", [0.5, 0.5, 0.5]);
  materials.setUniform("uTint", "#0000ff");
  assert(
    numbers(read(mesh, "uTint")) === "0,0,1",
    "a colour string after another form reused numbers that were not its own",
  );

  const matrix = new Matrix4().makeTranslation(1, 2, 3);
  materials.setUniform("uMatrix", matrix);
  assert(
    read(mesh, "uMatrix") instanceof Matrix4 &&
      read(mesh, "uMatrix") !== matrix &&
      numbers(read(mesh, "uMatrix")) === matrix.elements.join(),
    "a Matrix4 was not copied into the override",
  );
  const flat = new Matrix4().makeScale(2, 3, 4).elements;
  materials.setUniform("uMatrix", flat);
  assert(
    numbers(read(mesh, "uMatrix")) === flat.join(),
    "sixteen numbers did not fill a Matrix4 uniform",
  );
  materials.setUniform("uNormal", new Matrix3().set(1, 2, 3, 4, 5, 6, 7, 8, 9));
  assert(
    read(mesh, "uNormal") instanceof Matrix3 &&
      numbers(read(mesh, "uNormal")) === "1,4,7,2,5,8,3,6,9",
    "a Matrix3 was not accepted",
  );

  const weights = [1, 2, 3, 4];
  materials.setUniform("uWeights", weights);
  assert(
    Array.isArray(read(mesh, "uWeights")) &&
      read(mesh, "uWeights") !== weights &&
      numbers(read(mesh, "uWeights")) === "1,2,3,4",
    "a flat array uniform was not filled from a copy of the numbers",
  );
  materials.setUniform("uWeights", new Float32Array([4, 3, 2, 1]));
  assert(
    numbers(read(mesh, "uWeights")) === "4,3,2,1",
    "a typed array was not accepted for a flat array uniform",
  );
  materials.setUniform("uPoints", [1, 2, 3, 4, 5, 6]);
  assert(
    numbers(read(mesh, "uPoints")) === "1,2,3,4,5,6",
    "an array of vectors did not take its numbers as one flat list",
  );
  materials.setUniform("uBuffer", [0.5, 1.5, 2.5, 3.5]);
  assert(
    read(mesh, "uBuffer") instanceof Float32Array &&
      numbers(read(mesh, "uBuffer")) === "0.5,1.5,2.5,3.5",
    "a typed array uniform did not keep its own type",
  );

  const texture = new Texture();
  assert(
    materials.setUniform("uMap", texture) === 1 &&
      read(mesh, "uMap") === texture,
    "a texture was not accepted for a sampler that had none",
  );
  materials.setUniform("uMap", null);
  assert(read(mesh, "uMap") === null, "null did not clear a sampler uniform");
  materials.setUniform("uFilled", null);
  assert(
    read(mesh, "uFilled") === null &&
      shared.uniforms.uFilled!.value !== null,
    "null did not clear a sampler on the clone alone",
  );

  script.dispose();
  assert(
    snapshot(shared) === snapshot(createShaderMaterial()),
    "an accepted form changed a value of the shared Material",
  );
}

function assertWrongValuesAreRefused(): void {
  const { root, mesh, shared } = createScene();
  const script = createResources(root, "script-a", 10);
  const { materials } = script;
  const refused = (name: unknown, value: unknown, ...parts: string[]) => {
    let message = "";
    try {
      materials.setUniform(name as string, value as number);
    } catch (error) {
      assert(
        error instanceof TypeError,
        `setUniform(${String(name)}) did not throw a TypeError`,
      );
      message = error.message;
    }
    assert(
      message.includes("ctx.materials.setUniform") &&
        parts.every((part) => message.includes(part)),
      `setUniform(${String(name)}, ${String(value)}) was not refused with a clear message: ${message}`,
    );
  };

  refused(
    "uWalker",
    [1, 2],
    '"uWalker"',
    "数値3個",
    "数値2個",
    "meshIndex 0、materialIndex 0",
  );
  assert(
    mesh.material === shared,
    "a refused first call still replaced the Material",
  );
  materials.setUniform("uWalker", [1, 2, 3]);
  refused("uWalker", 5, "数値3個", "数値1個");
  refused("uWalker", new Vector2(1, 2), "数値3個", "数値2個");
  refused("uWalker", null, "数値3個", "null");
  refused("uWalker", new Texture(), "数値3個", "テクスチャ");
  assert(
    numbers(read(mesh, "uWalker")) === "1,2,3",
    "a refused call changed the override that was already in place",
  );
  refused("uGain", [1], "数値1個");
  refused("uGain", "#ffffff", "数値1個", "数値3個");
  refused("uMap", 1, "テクスチャかnull", "数値1個");
  refused("uTint", [1, 2, 3, 4], "色か数値3個", "数値4個");
  refused("uMatrix", [1, 2, 3], "数値16個", "数値3個");
  refused("uWeights", [1, 2, 3], "数値4個", "数値3個");
  refused("uPoints", [1, 2, 3], "数値6個", "数値3個");
  refused("uStruct", 1, "扱えない種類");

  refused("uGain", true, "真偽値");
  refused("uGain", Number.NaN, "有限の数値");
  refused("uGain", Number.POSITIVE_INFINITY, "有限の数値");
  refused("uWalker", [1, Number.NaN, 3], "有限の数値");
  refused("uWalker", [1, "2", 3], "有限の数値");
  refused("uWalker", new Vector3(1, Number.NaN, 3), "有限の数値");
  refused("uWalker", [], "空の配列");
  refused("uTint", "no-such-colour", "色として読めません");
  refused("uGain", undefined, "いずれかを渡してください");
  refused("uGain", { x: 1 }, "いずれかを渡してください");
  refused("", 1, "uniformの名前");
  refused(7, 1, "uniformの名前");
  assert(
    read(mesh, "uGain") === 1 && numbers(read(mesh, "uWalker")) === "1,2,3",
    "a refused value reached the drawn Material",
  );
  script.dispose();
  assert(mesh.material === shared, "Stop did not restore the Material");
}

function assertClockUniform(): void {
  const { root, mesh, shared } = createScene();
  const script = createResources(root, "script-a", 10);
  const { materials } = script;

  // Any override puts the Script's clone on the Mesh. The clock a surface
  // writes into the shared Material has to keep reaching that clone.
  materials.setUniform("uGain", 2);
  shared.uniforms.uTime!.value = 3.5;
  (shared.uniforms.u_time!.value as Vector4).set(1, 2, 3, 4);
  assert(
    read(mesh, "uTime") === 3.5 && numbers(read(mesh, "u_time")) === "1,2,3,4",
    "the clock stopped on a Material a Script had overridden",
  );

  assert(
    materials.setUniform("uTime", 10) === 1 &&
      materials.setUniform("u_time", [9, 9, 9, 9]) === 1,
    "a clock uniform could not be overridden like any other",
  );
  shared.uniforms.uTime!.value = 4;
  assert(
    read(mesh, "uTime") === 10,
    "the clock overwrote the Script's value for the same uniform",
  );
  // The published world drives an Open Brush clock through whichever
  // Material is on the Mesh, by assignment or by mutating the vector.
  drawn(mesh).uniforms.uTime!.value = 99;
  (drawn(mesh).uniforms.u_time!.value as Vector4).set(5, 6, 7, 8);
  drawn(mesh).uniforms.u_time!.value = [5, 6, 7, 8];
  assert(
    read(mesh, "uTime") === 10 && numbers(read(mesh, "u_time")) === "9,9,9,9",
    "a write through the drawn Material replaced the Script's value",
  );
  assert(
    shared.uniforms.uTime!.value === 4,
    "a write through the drawn Material reached the shared Material",
  );

  assert(
    materials.resetUniform("uTime") === 1 && read(mesh, "uTime") === 4,
    "the clock did not resume from the Material's current time after reset",
  );
  shared.uniforms.uTime!.value = 5;
  assert(read(mesh, "uTime") === 5, "the resumed clock stopped again");
  assert(
    mesh.material !== shared && read(mesh, "uGain") === 2,
    "resetting one uniform removed the Script's other override",
  );

  // A surface may hand the Material a new holder or a new table.
  shared.uniforms.uGain2 = { value: 6 };
  shared.uniforms.uTime = { value: 7 };
  script.update();
  assert(
    read(mesh, "uTime") === 7 && read(mesh, "uGain2") === 6,
    "the clone did not follow a replaced uniform holder",
  );
  script.dispose();
}

function assertScriptsComposeInComponentOrder(): void {
  const { root, mesh, shared } = createScene();
  const earlier = createResources(root, "script-earlier", 10);
  const later = createResources(root, "script-later", 20);

  earlier.materials.setUniform("uGain", 2);
  later.materials.setUniform("uGain", 5);
  earlier.materials.setUniform("uGain", 3);
  assert(
    read(mesh, "uGain") === 5,
    "an earlier Script Component overrode a later one",
  );
  earlier.materials.setUniform("uWalker", [1, 2, 3]);
  assert(
    read(mesh, "uGain") === 5 && numbers(read(mesh, "uWalker")) === "1,2,3",
    "two Scripts' overrides of different uniforms were not composed",
  );
  assert(
    later.materials.resetUniform("uGain") === 1 && read(mesh, "uGain") === 3,
    "removing the later override did not reveal the earlier one",
  );
  later.materials.setUniform("uGain", 6);
  later.dispose();
  assert(
    read(mesh, "uGain") === 3 && mesh.material !== shared,
    "stopping one Script removed another Script's override",
  );
  earlier.dispose();
  assert(
    mesh.material === shared,
    "the Material was not restored when the last Script stopped",
  );
}

function assertSelectedHandles(): void {
  const { root, mesh, shared } = createScene();
  const second = new Mesh(undefined, [
    createShaderMaterial("Leaf"),
    createShaderMaterial("Stem"),
  ]);
  second.name = "Plant";
  root.add(second);
  const script = createResources(root, "script-a", 10);
  const grass = script.materials.select({ meshName: "Grass" });
  const stem = script.materials.select({ meshName: "Plant", materialIndex: 1 });

  assert(
    script.materials.setUniform("uGain", 2) === 3,
    "the root handle did not count every custom shader Material",
  );
  assert(
    grass.setUniform("uGain", 7) === 1 && read(mesh, "uGain") === 7,
    "a selected handle did not override its own Material",
  );
  assert(
    read(second, "uGain", 0) === 2 && read(second, "uGain", 1) === 2,
    "a selected handle reached a Material it does not match",
  );
  script.materials.setUniform("uGain", 8);
  assert(
    read(mesh, "uGain") === 8,
    "the latest write inside one Script did not win between its handles",
  );
  grass.setUniform("uGain", 9);
  assert(
    stem.setUniform("uGain", 4) === 1 &&
      read(second, "uGain", 0) === 8 &&
      read(second, "uGain", 1) === 4,
    "a Material slot index did not narrow the override to one slot",
  );
  assert(
    grass.resetUniform("uGain") === 1 && read(mesh, "uGain") === 8,
    "resetting a selected handle did not reveal the root override",
  );
  stem.reset();
  assert(
    read(second, "uGain", 1) === 8,
    "resetting a selected handle removed the root override as well",
  );
  assert(
    script.materials.select({ meshName: "Nothing" }).setUniform("uGain", 1) ===
      0,
    "a handle that matches no Mesh reported a changed Material",
  );
  script.dispose();
  assert(
    mesh.material === shared && Array.isArray(second.material),
    "Stop did not restore every Material",
  );
}

function assertOnlyCustomShadersAreTargeted(): void {
  class DerivedShaderMaterial extends ShaderMaterial {}
  const root = entityObject("entity-root");
  const raw = new RawShaderMaterial({ uniforms: { uGain: { value: 1 } } });
  const derived = new DerivedShaderMaterial({
    uniforms: { uGain: { value: 1 } },
  });
  const standard = new MeshStandardMaterial();
  const rawMesh = new Mesh(undefined, raw);
  const derivedMesh = new Mesh(undefined, derived);
  const standardMesh = new Mesh(undefined, standard);
  root.add(rawMesh, derivedMesh, standardMesh);
  const script = createResources(root, "script-a", 10);

  assert(
    script.materials.setUniform("uGain", 2) === 1 &&
      read(rawMesh, "uGain") === 2,
    "a RawShaderMaterial was not treated as a custom shader",
  );
  assert(
    derivedMesh.material === derived && derived.uniforms.uGain!.value === 1,
    "a ShaderMaterial subclass with its own properties was changed by name",
  );
  assert(
    standardMesh.material === standard,
    "a standard Material was replaced by a uniform override",
  );
  assert(
    script.materials.setUniform("constructor", 1) === 0 &&
      script.materials.setUniform("toString", 1) === 0,
    "a property every object inherits was mistaken for a uniform",
  );
  script.dispose();
  assert(rawMesh.material === raw, "Stop did not restore the Material");
}

function assertLateMeshesAndExistingSetters(): void {
  const { root, mesh, shared } = createScene();
  const script = createResources(root, "script-a", 10);
  script.materials.setUniform("uGain", 2);

  // A Model that finishes loading after the Script started.
  const lateShared = createShaderMaterial("Late");
  const late = new Mesh(undefined, lateShared);
  const mismatchedShared = new ShaderMaterial({
    name: "Mismatched",
    uniforms: { uGain: { value: new Vector3(1, 1, 1) } },
  });
  const mismatched = new Mesh(undefined, mismatchedShared);
  root.add(late, mismatched);
  script.update();
  assert(
    late.material !== lateShared && read(late, "uGain") === 2,
    "a Mesh that arrived later did not receive the override",
  );
  assert(
    drawn(mismatched).uniforms.uGain === mismatchedShared.uniforms.uGain,
    "an override that does not fit a later Material was forced onto it",
  );

  // Another override re-applies the whole clone from the shared Material.
  script.materials.setOpacity(0.25);
  script.materials.setOpacity(0.75);
  assert(
    read(mesh, "uGain") === 2 && drawn(mesh).opacity === 0.75,
    "re-applying another override dropped the uniform override",
  );
  script.materials.resetUniform("uGain");
  assert(
    mesh.material !== shared &&
      drawn(mesh).uniforms.uGain === shared.uniforms.uGain &&
      drawn(mesh).opacity === 0.75,
    "removing the uniform override disturbed the other override",
  );
  script.dispose();
  assert(
    mesh.material === shared && late.material === lateShared,
    "Stop did not restore every Material",
  );
}

function createScene(): {
  root: Object3D;
  mesh: Mesh;
  shared: ShaderMaterial;
  standardMesh: Mesh;
  standard: MeshStandardMaterial;
  childMesh: Mesh;
  childShared: ShaderMaterial;
} {
  const root = entityObject("entity-root");
  const shared = createShaderMaterial("Grass");
  const mesh = new Mesh(undefined, shared);
  mesh.name = "Grass";
  const standard = new MeshStandardMaterial({ name: "Trunk" });
  const standardMesh = new Mesh(undefined, standard);
  standardMesh.name = "Trunk";
  const child = entityObject("entity-child");
  const childShared = createShaderMaterial("Child");
  const childMesh = new Mesh(undefined, childShared);
  child.add(childMesh);
  root.add(mesh, standardMesh, child);
  return { root, mesh, shared, standardMesh, standard, childMesh, childShared };
}

function createShaderMaterial(name = "Grass"): ShaderMaterial {
  const material = new ShaderMaterial({
    name,
    uniforms: {
      uGain: { value: 1 },
      uTime: { value: 0 },
      u_time: { value: new Vector4() },
      uWalker: { value: new Vector3() },
      uUv: { value: new Vector2() },
      uPlane: { value: new Vector4() },
      uTint: { value: new Color("#336699") },
      uMatrix: { value: new Matrix4() },
      uNormal: { value: new Matrix3() },
      uWeights: { value: [0, 0, 0, 0] },
      uPoints: { value: [new Vector3(), new Vector3()] },
      uBuffer: { value: new Float32Array(4) },
      uMap: { value: null },
      uFilled: { value: new Texture() },
      uStruct: { value: { position: new Vector3() } },
    },
  });
  material.userData.xriftTimeUniforms = [
    { name: "uTime", glslType: "float" },
    { name: "u_time", glslType: "vec4" },
  ];
  return material;
}

function createResources(
  root: Object3D,
  componentId: string,
  order: number,
): ScriptResources {
  return createScriptResources({
    object3d: root,
    entityId: "entity-root",
    componentId,
    order,
    resolveAsset: () => null,
  });
}

function entityObject(entityId: string): Object3D {
  const object = new Object3D();
  object.userData.renderedEntityId = entityId;
  return object;
}

function drawn(mesh: Mesh, materialIndex = 0): ShaderMaterial {
  const material: Material | undefined = Array.isArray(mesh.material)
    ? mesh.material[materialIndex]
    : mesh.material;
  assert(material, "the Mesh has no Material in that slot");
  return material as ShaderMaterial;
}

/** The value the renderer would upload for one uniform of the drawn Material. */
function read(mesh: Mesh, name: string, materialIndex = 0): unknown {
  return drawn(mesh, materialIndex).uniforms[name]?.value;
}

function numbers(value: unknown): string {
  const source = value as {
    elements?: number[];
    toArray?: () => number[];
  };
  if (source.elements) return source.elements.join();
  if (typeof source.toArray === "function") return source.toArray().join();
  return Array.from(value as ArrayLike<number>).join();
}

function snapshot(material: ShaderMaterial): string {
  return JSON.stringify(
    Object.entries(material.uniforms).map(([name, uniform]) => {
      const value: unknown = uniform.value;
      if (typeof value === "number" || value === null) return [name, value];
      if (value instanceof Texture) return [name, "texture"];
      if (Array.isArray(value)) {
        return [
          name,
          value.map((entry: unknown) =>
            typeof entry === "number" ? entry : numbers(entry),
          ),
        ];
      }
      if ((value as { position?: Vector3 }).position) {
        return [name, numbers((value as { position: Vector3 }).position)];
      }
      return [name, numbers(value)];
    }),
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Script Material uniform fixture failed: ${message}`);
  }
}
