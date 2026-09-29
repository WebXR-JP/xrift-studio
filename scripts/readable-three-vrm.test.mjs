import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareReadableThreeVrm, renameThreeVrmHelpers } from "./prepare-readable-three-vrm.mjs";
import { withReadableVrmAlias } from "./world-runtime-shell-vendor.mjs";

const helperSource = `
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __defNormalProp = (object, key, value) => key in object
  ? Object.defineProperty(object, key, { enumerable: true, configurable: true, writable: true, value }) : object[key] = value;
// __defNormalProp and __getOwnPropSymbols are preserved in comments.
const literal = "__defNormalProp";
const dictionary = { __getOwnPropSymbols: "preserved property" };
const property = dictionary.__getOwnPropSymbols;
const accessors = { get __defNormalProp() { return 13; }, set __defNormalProp(value) {} };
const symbol = Symbol("fixture");
const output = {};
__defNormalProp(output, "__proto__", 7);
__defNormalProp(output, symbol, 11);
({ literal, property, value: output.__proto__, own: Object.getOwnPropertyDescriptor(output, "__proto__"), symbols: __getOwnPropSymbols(output).length, symbolValue: output[symbol] });
`;

test("known helper binding renames preserve properties, strings, symbols, and spread semantics", () => {
  const result = renameThreeVrmHelpers(helperSource);
  assert.deepEqual(result.bindings.sort(), ["__defNormalProp", "__getOwnPropSymbols"]);
  assert.equal(result.edits, 5);
  assert.match(result.code, /const literal = "__defNormalProp"/);
  assert.match(result.code, /dictionary\.__getOwnPropSymbols/);
  assert.match(result.code, /get __defNormalProp\(\)/);
  assert.match(result.code, /set __defNormalProp\(value\)/);
  assert.match(result.code, /\{ __getOwnPropSymbols:/);
  assert.match(result.code, /\/\/ __defNormalProp and __getOwnPropSymbols/);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext(result.code))), JSON.parse(JSON.stringify(vm.runInNewContext(helperSource))));
});

test("a helper shadow, public export, name collision, or unexpected initializer stops generation", () => {
  for (const source of [
    `${helperSource}\nfunction nested(__defNormalProp) { return __defNormalProp; }`,
    `${helperSource}\nexport { __defNormalProp };`,
    `${helperSource}\nconst vrmOwnPropertySymbols = 4;`,
    "const __getOwnPropSymbols = unrelatedFunction;",
  ]) assert.throws(() => renameThreeVrmHelpers(source));
});

test("unrelated identifiers that security checks must still inspect are unchanged", () => {
  const source = `${helperSource}\nvar _suspiciousUnrelatedVariable = 1;`;
  assert.match(renameThreeVrmHelpers(source).code, /var _suspiciousUnrelatedVariable = 1/);
});

test("browser shell aliases only the pinned VRM import and preserves other template settings", () => {
  const source = `import path from 'node:path';
export default defineConfig({ build: { target: 'esnext', minify: false },
  resolve: { alias: { '~': path.resolve(__dirname, './src') } }, plugins: [federation({shared: ['react', 'three']})] });`;
  const alias = " '@pixiv/three-vrm': path.resolve(__dirname, './src/xrift-studio/three-vrm-readable.js'),";
  const patched = withReadableVrmAlias(source);
  assert.equal(patched.replace(alias, ""), source);
  const legacyPathImport = source.replace("'node:path'", "'path'");
  assert.equal(withReadableVrmAlias(legacyPathImport).replace(alias, ""), legacyPathImport);
  for (const unsupported of [patched, "export default defineConfig({})", source.replace("'node:path'", "'unrelated'")]) {
    assert.throws(() => withReadableVrmAlias(unsupported));
  }
});

test("committed readable source and license reproduce the installed pinned package", async () => {
  const result = await prepareReadableThreeVrm(true);
  assert.equal(result.version, "3.5.5");
  assert.equal(result.helperBindings, 6);
  assert.equal(result.classAliases, 11);
  assert.equal(result.privateBindings, 26);
  assert.ok(result.identifierEdits > 4);
});

test("known class aliases preserve public names, descriptors, clone self references and static identity", () => {
  const source = `
var _VRMFirstPerson = class _VRMFirstPerson2 {
  clone() { return new _VRMFirstPerson2(); }
  static get self() { return _VRMFirstPerson2; }
};
_VRMFirstPerson[Symbol.for("fixture-class")] = _VRMFirstPerson;
_VRMFirstPerson.beforePublicAliasName = _VRMFirstPerson.name;
var VRMFirstPerson = _VRMFirstPerson;
var VRMExpressionManager = class _VRMExpressionManager {
  clone() { return new _VRMExpressionManager(); }
};
const snapshot = Class => ({ name: Class.name, descriptor: Object.getOwnPropertyDescriptor(Class, "name"),
  clone: new Class().clone().constructor.name, instance: new Class().clone() instanceof Class,
  keys: Reflect.ownKeys(Class).map(key => String(key)),
  staticSelf: !Class.self || Class.self === Class,
  symbolSelf: !Class[Symbol.for("fixture-class")] || Class[Symbol.for("fixture-class")] === Class,
  beforePublicAliasName: Class.beforePublicAliasName });
[snapshot(VRMFirstPerson), snapshot(VRMExpressionManager)];`;
  const renamed = renameThreeVrmHelpers(source);
  assert.equal(renamed.classCount, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInNewContext(renamed.code))), JSON.parse(JSON.stringify(vm.runInNewContext(source))));
  for (const eager of ["static observed = this.name;", "[captureName()]() {}", "static {}", "value = 1;"]) {
    assert.throws(() => renameThreeVrmHelpers(`var VRMExpressionManager = class _VRMExpressionManager { ${eager} };`));
  }
  assert.throws(() => renameThreeVrmHelpers("var VRMHumanoidRig = class _VRMHumanoidRig extends makeBase() {};"));
  assert.throws(() => renameThreeVrmHelpers("var _VRMFirstPerson = class _VRMFirstPerson2 {};"));
});

test("official and readable materials and native VRM0/1 loaders behave identically", () => {
  const result = execFileSync(process.execPath, [fileURLToPath(new URL("./readable-three-vrm.fixture.cjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(JSON.parse(result.trim().split("\n").at(-1)).status, "passed");
});
