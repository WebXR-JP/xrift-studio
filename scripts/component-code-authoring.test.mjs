import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";
import { BoxGeometry, Group, Matrix4, Mesh, Vector3 } from "three";

const server = await createServer({ configFile: false, cacheDir: "node_modules/.cache/vite-component-code-authoring-test", server: { middlewareMode: true, hmr: false, ws: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
after(() => server.close());
const { analyzeComponentCode: analyze, analyzeComponentProject, applyComponentCodeImportPlan } = await server.ssrLoadModule("/src/lib/visual-editor/component-code-import.ts");
const { createPrototypeProject } = await server.ssrLoadModule("/src/lib/visual-editor/prototype-project.ts");
const { runComponentCodeImportFixtureAssertions } = await server.ssrLoadModule("/src/lib/visual-editor/component-code-import.fixture.ts");
const { runClassicProjectImportFixtureAssertions } = await server.ssrLoadModule("/src/lib/visual-editor/classic-project-import.fixture.ts");
const primitives = plan => plan.nodes.filter(node => node.kind === "primitive");
const clean = plan => assert.deepEqual(plan.diagnostics.filter(item => item.severity !== "info"), []);

test("existing import/apply/compiler/runtime fixtures are awaited", async () => {
  await runComponentCodeImportFixtureAssertions();
  await runClassicProjectImportFixtureAssertions();
});

test("nine independent maps retain all eighteen meshes and stable keys", () => {
  const rows = Array.from({ length: 9 }, (_, row) => `{[0,1].map(x => <mesh key={'row${row}-' + x} name="Row ${row}" position={[x,${row},0]}><boxGeometry /></mesh>)}`).join("");
  const plan = analyze(`export function World(){ return <group name="World">${rows}</group> }`, "world");
  clean(plan);
  assert.equal(primitives(plan).length, 18);
  assert.deepEqual(primitives(plan).slice(-2).map(node => node.transform.position), [[0,8,0],[1,8,0]]);
  assert.deepEqual(primitives(plan).slice(-2).map(node => node.sourceKey), ["row8-0", "row8-1"]);
});

test("same-module functions are templates, with props/defaults/local constants per call", () => {
  const plan = analyze(`
const BASE = 2;
function House({height = 3, color = '#ff0000', position = [0,0,0]}) {
 const half = height / BASE;
 return <mesh name="Body" position={position} scale={[1,half,1]}><boxGeometry args={[2,height,2]}/><meshStandardMaterial color={color}/></mesh>;
}
export default function World(){const xs = [0,1,2,3]; return <group name="World">{xs.map(i => <House key={i} position={[i*3,0,0]} height={i+2} color="#00ff00"/>)}<House key="default"/></group>}`,
    "world");
  clean(plan);
  const meshes = primitives(plan);
  assert.equal(meshes.length, 5, "the function implementation must not create a sixth stray mesh");
  assert.deepEqual(meshes.map(node => node.transform.position[0]), [0,3,6,9,0]);
  assert.deepEqual(meshes.map(node => node.transform.scale[1]), [2,4.5,8,12.5,4.5]);
  assert.deepEqual(meshes.map(node => node.material.color), ["#00ff00","#00ff00","#00ff00","#00ff00","#ff0000"]);
  assert.ok(plan.nodes.filter(node => node.localComponent).every(node => node.transform.position[0] === 0));
});

test("props object, destructured aliases, static spreads and module scopes stay isolated", () => {
  const plan = analyzeComponentProject({ entryFile: "World.tsx", projectKind: "world", modules: [
    { path: "World.tsx", source: `import House from './House'; const SIZE = 100; export default () => <group><House key="a" position={[7,0,0]} height={6}/><House key="b" height={2}/></group>` },
    { path: "House.tsx", source: `const SIZE = 2; export default function House(props){const {height: h = 3, position = [0,0,0]} = props; const style = {position, scale:[SIZE,h,1]};return <mesh name="Body" {...style}><boxGeometry/><meshStandardMaterial color="#abc"/></mesh>}` },
  ] });
  clean(plan);
  assert.deepEqual(primitives(plan).map(node => node.transform.position), [[7,0,0],[0,0,0]]);
  assert.deepEqual(primitives(plan).map(node => node.transform.scale), [[2,6,1],[2,2,1]]);
});

test("nested maps, callback-local consts and Array.from static length preserve values", () => {
  const plan = analyze(`const N=3; export function World(){return <group>{Array.from({length:N},(_,i)=>{const x=i*4;return <group position={[x,0,0]}>{[1,2].map(h=><mesh key={h} position={[0,h,0]}><boxGeometry/></mesh>)}</group>})}</group>}`, "world");
  clean(plan);
  assert.equal(primitives(plan).length, 6);
  assert.deepEqual(plan.nodes.filter(node => node.name === "Group").map(node => node.transform.position[0]), [0,0,4,8]);
  assert.deepEqual(primitives(plan).map(node => node.transform.position[1]), [1,2,1,2,1,2]);
});

test("unknown collections/material expressions/conditionals are explicit diagnostics", () => {
  const plan = analyze(`export function World(props){return <group>{props.items.map(i=><mesh position={[i,0,0]}><boxGeometry/><meshStandardMaterial color={props.color}/></mesh>)}{false?<mesh><boxGeometry/></mesh>:<mesh><sphereGeometry/></mesh>}</group>}`, "world");
  for (const code of ["static-collection-unresolved", "dynamic-prop-skipped", "conditional-jsx-unsupported"]) assert.ok(plan.diagnostics.some(item => item.code === code), code);
  assert.ok(plan.diagnostics.some(item => item.message.includes("meshStandardMaterial.color")));
});

test("total node and expanded-character limits fail before committing partial plans", () => {
  const nodes = analyze(`export function World(){return <group>{Array.from({length:2048},(_,i)=><group><mesh><boxGeometry/></mesh><mesh><boxGeometry/></mesh></group>)}</group>}`, "world");
  assert.equal(nodes.nodes.length, 0);
  assert.ok(nodes.diagnostics.some(item => item.severity === "error" && item.code === "static-expansion-limit"));
  const characters = analyze(`export function World(){return <group>{Array.from({length:500},(_,i)=><mesh name="${"a".repeat(5000)}"><boxGeometry/></mesh>)}</group>}`, "world");
  assert.equal(characters.nodes.length, 0);
  assert.ok(characters.diagnostics.some(item => item.code === "static-expansion-limit"));
  const oneHuge = analyze(`export function World(){return <group>{Array.from({length:1000000000},(_,i)=><mesh><boxGeometry/></mesh>)}</group>}`, "world");
  assert.equal(oneHuge.nodes.length, 0);
  assert.ok(oneHuge.diagnostics.some(item => item.code === "static-expansion-limit"));
});

test("no expression is executed and nested non-finite values are diagnosed", () => {
  globalThis.__XRIFT_IMPORT_EXECUTED__ = false;
  const plan = analyze(`const X=(()=>{globalThis.__XRIFT_IMPORT_EXECUTED__=true;return 4})();export function World(){return <mesh position={[X,0,0]} scale={[Math.pow(10,999),1,1]}><boxGeometry/></mesh>}`, "world");
  assert.equal(globalThis.__XRIFT_IMPORT_EXECUTED__, false);
  assert.ok(plan.diagnostics.filter(item => item.code === "dynamic-prop-skipped").length >= 2);
  delete globalThis.__XRIFT_IMPORT_EXECUTED__;
});

test("extrude keeps scoped profiles but blocks bevel/holes/invalid shapes", () => {
  const shape = `const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(2,0);shape.lineTo(0,2);shape.closePath();`;
  const valid = analyze(`import * as THREE from 'three'; function Roof({depth=2}){${shape}return <mesh name="Roof"><extrudeGeometry args={[shape,{depth,bevelEnabled:false}]}/></mesh>}export function World(){return <group><Roof depth={4}/><Roof/></group>}`, "world");
  clean(valid);
  assert.deepEqual(primitives(valid).map(node => node.extrude.depth), [4,2]);
  for (const options of ["{depth:2}", "{depth:2,bevelEnabled:true}", "{depth:2,bevelEnabled:false,steps:2}"]) {
    const bad = analyze(`import * as THREE from 'three';${shape}export function World(){return <mesh><extrudeGeometry args={[shape,${options}]}/></mesh>}`, "world");
    assert.equal(primitives(bad).length, 0);
    assert.ok(bad.diagnostics.some(item => item.severity === "warning"));
  }
  const hole = analyze(`import * as THREE from 'three';${shape}shape.holes.push(new THREE.Path());export function World(){return <mesh><extrudeGeometry args={[shape,{depth:2,bevelEnabled:false}]}/></mesh>}`, "world");
  assert.equal(primitives(hole).length, 0);
});

test("Basic materials retain unlit and PBR default roughness is Three's one", () => {
  const plan = analyze(`export function World(){return <group name="World"><mesh name="Unlit"><boxGeometry/><meshBasicMaterial color="#123456"/></mesh><mesh name="PBR"><boxGeometry/><meshStandardMaterial color="#123456"/></mesh><mesh name="Physical"><boxGeometry/><meshPhysicalMaterial color="#123456" roughness={0.3}/></mesh></group>}`, "world");
  clean(plan);
  const project = createPrototypeProject("world", "material-quality-fixture");
  const result = applyComponentCodeImportPlan({ scene: project.scene, assets: project.assets, projectKind: "world", plan });
  const materials = Object.fromEntries(result.entityIds.map(id => result.scene.entities[id]).filter(entity => entity.components.some(component => component.type === "mesh")).map(entity => [entity.name, result.assets.assets[entity.components.find(component => component.type === "mesh").materialBindings[0].materialAssetId]]));
  assert.ok(materials.Unlit.properties.extensions.KHR_materials_unlit);
  assert.equal(materials.PBR.properties.extensions.KHR_materials_unlit, undefined);
  assert.equal(materials.PBR.properties.roughness, 1);
  assert.equal(materials.Physical.properties.roughness, 0.3);
  assert.notEqual(materials.Unlit.id, materials.PBR.id);
});

test("fixed topology matches, while lossy geometry args and invalid dimensions warn", () => {
  for (const geometry of ['<boxGeometry args={[2,3,4,1,1,1]}/>', '<sphereGeometry args={[2,32,20,0,Math.PI*2,0,Math.PI]}/>', '<cylinderGeometry args={[2,2,4,32,1,false,0,Math.PI*2]}/>', '<coneGeometry args={[2,4,32,1,false,0,Math.PI*2]}/>', '<planeGeometry args={[2,4,1,1]}/>']) {
    clean(analyze(`export function World(){return <mesh name="Shape">${geometry}<meshStandardMaterial color="#ffffff"/></mesh>}`, "world"));
  }
  for (const geometry of ['<boxGeometry args={[0,1,1]}/>', '<boxGeometry args={[-1,1,1]}/>', '<boxGeometry args={[1001,1,1]}/>', '<boxGeometry args={[1,1,1,2]}/>', '<sphereGeometry args={[1,8,8]}/>', '<sphereGeometry args={[1,32,20,0,Math.PI]}/>', '<cylinderGeometry args={[1,2,3]}/>', '<cylinderGeometry args={[1,1,3,32,1,true]}/>', '<coneGeometry args={[1,3,32,2]}/>', '<planeGeometry args={[2,4,3,3]}/>']) {
    const plan = analyze(`export function World(){return <mesh name="Shape">${geometry}<meshStandardMaterial color="#ffffff"/></mesh>}`, "world");
    assert.ok(plan.diagnostics.some(item => item.code === "unsupported-geometry-args"), geometry);
  }
});

test("ignored native attributes and invalid placement/material values warn", () => {
  for (const jsx of ['<mesh position={[0]}><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>', '<mesh scale={0}><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>', '<mesh position={[10001,0,0]}><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>', '<mesh renderOrder={3}><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>', '<ambientLight args={["#ffffff",3]}/>', '<pointLight intensity={-2}/>', '<mesh><boxGeometry/><meshPhysicalMaterial color="#fff" transmission={1}/></mesh>', '<mesh><boxGeometry/><meshStandardMaterial color="red"/></mesh>', '<mesh><boxGeometry/><meshStandardMaterial color="#fff" roughness={2}/></mesh>', '<mesh><boxGeometry/><meshStandardMaterial color="#fff" side={1}/></mesh>']) {
    const plan = analyze(`export function World(){return ${jsx}}`, "world");
    assert.ok(plan.diagnostics.some(item => item.severity === "warning"), jsx);
  }
});

test("nested Mesh children retain constructor dimensions without inheriting them", () => {
  const plan = analyze(`export default function World(){return <mesh name="House" position={[3,1,2]} rotation={[0,0.4,0]} scale={[2,1,0.5]}><boxGeometry args={[4,3,5]}/><meshStandardMaterial color="#fff"/><mesh name="Roof" position={[0,2,0]} rotation={[0.3,0,0.2]}><boxGeometry args={[6,1,7]}/><meshStandardMaterial color="#f00"/></mesh></mesh>}`, "world");
  clean(plan);
  assert.deepEqual(plan.nodes.map(node => node.name), ["House", "House Geometry", "Roof"]);
  assert.equal(plan.nodes[1].sourceKey, "$xrift-geometry");
  const bundle = createPrototypeProject("world", "nested-mesh-dimensions");
  const result = applyComponentCodeImportPlan({ scene: bundle.scene, assets: bundle.assets, projectKind: "world", plan });
  const imported = new Map();
  for (const id of result.entityIds) {
    const entity = result.scene.entities[id], transform = entity.components.find(item => item.type === "transform"), object = new Group();
    object.position.fromArray(transform.position); object.rotation.set(...transform.rotation); object.scale.fromArray(transform.scale);
    imported.set(id, object);
    imported.get(entity.parentId)?.add(object);
  }
  const expectedHouse = new Mesh(new BoxGeometry(4,3,5));
  expectedHouse.position.set(3,1,2); expectedHouse.rotation.set(0,0.4,0); expectedHouse.scale.set(2,1,0.5);
  const expectedRoof = new Mesh(new BoxGeometry(6,1,7));
  expectedRoof.position.set(0,2,0); expectedRoof.rotation.set(0.3,0,0.2); expectedHouse.add(expectedRoof);
  expectedHouse.updateMatrixWorld(true); imported.get(result.entityIds[0]).updateMatrixWorld(true);
  const expected = new Matrix4().copy(expectedRoof.matrixWorld).scale(new Vector3(6,1,7));
  const actual = imported.get(result.entityIds[2]).matrixWorld;
  actual.elements.forEach((value, index) => assert.ok(Math.abs(value-expected.elements[index]) < 1e-10, `world matrix element ${index}`));
  const houseExpected = new Matrix4().copy(expectedHouse.matrixWorld).scale(new Vector3(4,3,5));
  imported.get(result.entityIds[1]).matrixWorld.elements.forEach((value, index) => assert.ok(Math.abs(value-houseExpected.elements[index]) < 1e-10, `surface matrix element ${index}`));
});

test("Drei primitives, Extrude and native Light retain nested Object3Ds", () => {
  for (const [opening, closing] of [[`<Box name="Outer" args={[4,3,2]}>`, "</Box>"], [`<Extrude name="Outer" args={[shape,{depth:4,bevelEnabled:false}]}>`, "</Extrude>"], [`<mesh name="Outer"><extrudeGeometry args={[shape,{depth:4,bevelEnabled:false}]}/>`, "</mesh>"]]) {
    const plan = analyze(`import {Box,Extrude} from '@react-three/drei';import {Shape} from 'three';const shape=new Shape();shape.moveTo(0,0);shape.lineTo(2,0);shape.lineTo(0,2);shape.closePath();export default function World(){return ${opening}<meshStandardMaterial color="#fff"/><group name="Detail" position={[0,2,0]}><pointLight name="Lamp"><group name="Lamp child"/></pointLight></group>${closing}}`, "world");
    clean(plan);
    assert.deepEqual(plan.nodes.map(node => node.name), ["Outer", "Outer Geometry", "Detail", "Lamp", "Lamp child"]);
    assert.equal(plan.nodes[2].parentPlanNodeId, plan.nodes[0].planNodeId);
    assert.equal(plan.nodes[4].parentPlanNodeId, plan.nodes[3].planNodeId);
    assert.deepEqual(plan.nodes[2].transform.position, [0,2,0]);
  }
});

test("Text literal, scoped expressions and repeated labels retain their displayed strings", () => {
  const plan = analyze(`import {Text} from '@react-three/drei';function Sign({label}){return <Text name="Label">Welcome {label}!</Text>}export default function World(){return <group name="World"><Text name="Literal">Welcome</Text>{['A','B'].map(label=><Sign key={label} label={label}/>)}<Text name="Number">{42}</Text></group>}`, "world");
  clean(plan);
  assert.deepEqual(plan.nodes.filter(node => node.kind === "text").map(node => node.text.text), ["Welcome", "Welcome A!", "Welcome B!", "42"]);
  const unresolved = analyze(`import {Text} from '@react-three/drei';export default function World(props){return <Text name="Label">{props.label}</Text>}`, "world");
  assert.ok(unresolved.diagnostics.some(item => item.code === "static-text-unresolved"));
});

test("unsupported local JSX children and duplicate surface attachments warn before strict authoring", () => {
  const wrappers = analyze(`function Shell({children}){return <group name="Offset" position={[10,0,0]}>{children}</group>}export default function World(){return <Shell><group name="Child"/></Shell>}`, "world");
  assert.ok(wrappers.diagnostics.some(item => item.code === "invalid-static-value" && item.message.includes("children")));
  for (const extra of ["<sphereGeometry/>", '<meshBasicMaterial color="#f00"/>']) {
    const plan = analyze(`export default function World(){return <mesh name="Surface"><boxGeometry/><meshStandardMaterial color="#fff"/>${extra}</mesh>}`, "world");
    assert.ok(plan.diagnostics.some(item => item.message.includes("複数")));
  }
});

test("React key stays an identity and is not supplied as a Component prop", () => {
  const plan = analyze(`function House({key=17,id}){return <mesh name="House" position={[key,id,0]}><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>}export default function World(){return <House key={7} id={3}/>}`, "world");
  clean(plan);
  assert.equal(plan.nodes[0].sourceKey, "7");
  assert.deepEqual(primitives(plan)[0].transform.position, [17,3,0]);
  const unresolved = analyze(`function House(props){return <mesh name="House" position={[props.key,props.id,0]}><boxGeometry/><meshStandardMaterial color="#fff"/></mesh>}export default function World(){return <House key={7} id={3}/>}`, "world");
  assert.ok(unresolved.diagnostics.some(item => item.code === "dynamic-prop-skipped"));
});
