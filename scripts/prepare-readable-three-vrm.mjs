#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript-test-api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetDirectory = path.join(root, "packages/xrift-studio-runtime/src/vendor");
const helperPattern = /^__(defNormalProp|getOwnPropSymbols)(\d*)$/;
const upstreamSha256 = "bfc0f3bd49ee5b706b3055d366759e881f20dee32be344c4c8f586600f223434";
// Only the pinned distribution's aliases that the SDK actually rejects.
const generatedClasses = new Map([
  ["VRMExpressionManager", "_VRMExpressionManager"],
  ["_VRMExpressionMaterialColorBind", "_VRMExpressionMaterialColorBind2"],
  ["_VRMExpressionTextureTransformBind", "_VRMExpressionTextureTransformBind2"],
  ["_VRMExpressionLoaderPlugin", "_VRMExpressionLoaderPlugin2"],
  ["_VRMFirstPerson", "_VRMFirstPerson2"],
  ["VRMHumanoidRig", "_VRMHumanoidRig"],
  ["VRMHumanoid", "_VRMHumanoid"],
  ["_MToonMaterialLoaderPlugin", "_MToonMaterialLoaderPlugin2"],
  ["_VRMMaterialsHDREmissiveMultiplierLoaderPlugin", "_VRMMaterialsHDREmissiveMultiplierLoaderPlugin2"],
  ["_VRMNodeConstraintLoaderPlugin", "_VRMNodeConstraintLoaderPlugin2"],
  ["_VRMSpringBoneLoaderPlugin", "_VRMSpringBoneLoaderPlugin2"],
]);

function readableName(name) {
  if (name === "__getOwnPropDescs") return "vrmOwnPropertyDescriptors";
  if (name === "__hasOwnProp2") return "vrmHasOwnProperty2";
  const match = helperPattern.exec(name);
  return match ? `${match[1] === "defNormalProp" ? "vrmDefineEnumerableProperty" : "vrmOwnPropertySymbols"}${match[2]}` : undefined;
}

function propertyOrLabelName(node) {
  const parent = node.parent;
  return (ts.isPropertyAccessExpression(parent) && parent.name === node)
    || ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)
      || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) && parent.name === node && !ts.isComputedPropertyName(parent.name))
    || (ts.isBindingElement(parent) && parent.propertyName === node)
    || ((ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node);
}

function declarationName(node) {
  const parent = node.parent;
  return ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)
    || ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isBindingElement(parent) || ts.isImportClause(parent)
    || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent)) && parent.name === node);
}

/** Rename verified private symbols only; preserve properties, exports, literals and public class names. */
export function renameThreeVrmHelpers(source) {
  const parsed = ts.createSourceFile("three-vrm.module.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (parsed.parseDiagnostics.length) throw new Error("Upstream three-vrm JavaScript could not be parsed");
  const options = { allowJs: true, checkJs: true, noLib: true, noResolve: true, target: ts.ScriptTarget.Latest };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = name => name === parsed.fileName ? parsed : undefined;
  const checker = ts.createProgram([parsed.fileName], options, host).getTypeChecker();
  const bindings = new Map();
  const edits = [];
  let classCount = 0;
  let helperBindings = 0;
  const bind = (declaration, readable) => {
    const name = declaration.text;
    if (bindings.has(name)) throw new Error(`Duplicate private binding ${name}`);
    const symbol = checker.getSymbolAtLocation(declaration);
    if (!symbol) throw new Error(`Private binding ${name} could not be resolved`);
    bindings.set(name, { declaration, readable, symbol });
  };
  for (const statement of parsed.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const name = declaration.name.text;
      const initializer = declaration.initializer;
      const expectedClass = generatedClasses.get(name);
      if (expectedClass) {
        if (!initializer || !ts.isClassExpression(initializer) || initializer.name?.text !== expectedClass || statement.declarationList.declarations.length !== 1) {
          throw new Error(`Generated class ${name} changed its declaration shape`);
        }
        for (const member of initializer.members) {
          if (ts.isClassStaticBlockDeclaration(member) || ts.isPropertyDeclaration(member)
            || (member.name && ts.isComputedPropertyName(member.name)) || ts.getDecorators(member)?.length) {
            throw new Error(`Generated class ${name} has eager members; preserving its name requires review`);
          }
        }
        for (const heritage of initializer.heritageClauses ?? []) {
          if (heritage.types.some(type => !ts.isIdentifier(type.expression) || type.expression.text !== "VRMRig")) {
            throw new Error(`Generated class ${name} has unexpected eager heritage`);
          }
        }
        let outerName = name;
        if (name.startsWith("_")) {
          const publicName = name.slice(1);
          const aliases = parsed.statements.filter(candidate => ts.isVariableStatement(candidate)
            && candidate.declarationList.declarations.some(alias => ts.isIdentifier(alias.name) && alias.name.text === publicName
              && alias.initializer && ts.isIdentifier(alias.initializer) && alias.initializer.text === name));
          if (aliases.length !== 1) throw new Error(`Generated class ${name} no longer has its public alias`);
          outerName = `vrmBinding${publicName}`;
          bind(declaration.name, outerName);
        }
        bind(initializer.name, `vrmClass${expectedClass.slice(1)}`);
        // There are no eager fields, computed keys or static blocks. Restore the
        // exact name before later static assignments and public aliases execute.
        edits.push({ start: statement.getEnd(), end: statement.getEnd(), text: `\nObject.defineProperty(${outerName}, "name", { value: ${JSON.stringify(expectedClass)}, configurable: true });` });
        classCount++;
        continue;
      }
      if (name === "_worldSpacePosition") {
        if (!initializer || !ts.isNewExpression(initializer) || !ts.isPropertyAccessExpression(initializer.expression)
          || !/^THREE\d+$/.test(initializer.expression.expression.getText(parsed))
          || initializer.expression.name.text !== "Vector3" || initializer.arguments?.length) {
          throw new Error("The private spring-bone position temporary changed shape");
        }
        bind(declaration.name, "vrmSpringBoneWorldSpacePosition");
        continue;
      }
      const readable = readableName(name);
      if (!readable) continue;
      if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) throw new Error(`Helper ${name} became public`);
      if (name.startsWith("__getOwnPropSymbols") || name === "__getOwnPropDescs" || name === "__hasOwnProp2") {
        const expected = name === "__hasOwnProp2" ? "Object.prototype.hasOwnProperty"
          : name === "__getOwnPropDescs" ? "Object.getOwnPropertyDescriptors" : "Object.getOwnPropertySymbols";
        if (!initializer || !ts.isPropertyAccessExpression(initializer) || initializer.getText(parsed) !== expected) {
          throw new Error(`Helper ${name} no longer aliases ${expected}`);
        }
      } else if (!initializer || !ts.isArrowFunction(initializer)) {
        throw new Error(`Helper ${name} is no longer the expected arrow function`);
      }
      bind(declaration.name, readable);
      helperBindings++;
    }
  }
  const readableNames = new Set([...bindings.values()].map(binding => binding.readable));
  const visit = node => {
    if (ts.isIdentifier(node)) {
      if (readableNames.has(node.text)) throw new Error(`Readable helper name ${node.text} collides with upstream code`);
      const binding = bindings.get(node.text);
      if (binding && !propertyOrLabelName(node)) {
        if (declarationName(node) && node !== binding.declaration) throw new Error(`Helper ${node.text} is shadowed in a nested scope`);
        if (ts.isShorthandPropertyAssignment(node.parent) || ts.isExportSpecifier(node.parent)) throw new Error(`Helper ${node.text} is exposed as a property or export`);
        if (checker.getSymbolAtLocation(node) !== binding.symbol) throw new Error(`Private binding ${node.text} has an unexpected symbol reference`);
        edits.push({ start: node.getStart(parsed), end: node.getEnd(), text: binding.readable });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  let code = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  return { code, bindings: [...bindings.keys()], edits: edits.length - classCount, helperBindings, classCount };
}

export async function prepareReadableThreeVrm(check = false) {
  const upstreamDirectory = path.join(root, "node_modules/@pixiv/three-vrm");
  const manifest = JSON.parse(await fs.readFile(path.join(upstreamDirectory, "package.json"), "utf8"));
  const runtime = JSON.parse(await fs.readFile(path.join(root, "packages/xrift-studio-runtime/package.json"), "utf8"));
  if (manifest.version !== "3.5.5" || runtime.dependencies["@pixiv/three-vrm"] !== manifest.version) throw new Error("Readable vendor source requires the pinned @pixiv/three-vrm 3.5.5 package");
  const original = await fs.readFile(path.join(upstreamDirectory, "lib/three-vrm.module.js"), "utf8");
  const license = await fs.readFile(path.join(upstreamDirectory, "LICENSE"), "utf8");
  const normalized = original.replace(/\r\n/g, "\n");
  const hash = createHash("sha256").update(normalized).digest("hex");
  if (hash !== upstreamSha256) throw new Error("The pinned three-vrm distribution changed; review its source before regenerating");
  const renamed = renameThreeVrmHelpers(normalized);
  if (renamed.helperBindings !== 6 || renamed.classCount !== 11 || renamed.bindings.length !== 26
    || !renamed.bindings.includes("__defNormalProp2") || !renamed.bindings.includes("__getOwnPropSymbols2")) throw new Error("The upstream private bindings changed; review the vendor generation before updating it");
  // The original inline map describes pre-rename positions, so it must not ship.
  const code = renamed.code.replace(/\n\/\/# sourceMappingURL=data:application\/json;base64,[A-Za-z0-9+/=]+\n?$/, "\n");
  const content = `/*!\n * @pixiv/three-vrm ${manifest.version}; generated by scripts/prepare-readable-three-vrm.mjs.\n * Original lib/three-vrm.module.js SHA-256: ${hash}\n * Verified private compiler bindings have descriptive names; constructor names are retained.\n * Rendering, loading, public exports, and third-party license notices are unchanged.\n * Compiler raw source only; the shared runtime imports the official npm package.\n *\n${license.replace(/\r\n/g, "\n").trim().split("\n").map(line => ` * ${line}`).join("\n")}\n */\n${code}`;
  const files = new Map([
    ["three-vrm-readable.js", content],
    ["three-vrm-readable.d.ts", "/** Public types remain those of the pinned official package. */\nexport * from \"@pixiv/three-vrm\";\n"],
    ["three-vrm-readable.LICENSE", license.replace(/\r\n/g, "\n")],
  ]);
  if (!check) await fs.mkdir(targetDirectory, { recursive: true });
  for (const [name, source] of files) {
    const target = path.join(targetDirectory, name);
    if (check) {
      if ((await fs.readFile(target, "utf8")).replace(/\r\n/g, "\n") !== source) throw new Error(`Readable three-vrm source is out of date: ${name}`);
    } else await fs.writeFile(target, source);
  }
  return { version: manifest.version, helperBindings: renamed.helperBindings, classAliases: renamed.classCount,
    privateBindings: renamed.bindings.length, identifierEdits: renamed.edits, upstreamSha256: hash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareReadableThreeVrm(process.argv.includes("--check"));
  console.log(JSON.stringify({ status: "passed", ...result }));
}
