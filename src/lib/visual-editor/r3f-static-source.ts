import { R3F_SOURCE_MAX_BYTES } from "./r3f-scene-source";

type TypeScriptApi = typeof import("typescript-test-api");
/** Share an in-flight compiler load, but let a later request retry a failed
 * attempt instead of keeping its rejected Promise for the entire session. */
export function createR3fCompilerCache(load: () => Promise<TypeScriptApi>): () => Promise<TypeScriptApi> {
  let compiler: Promise<TypeScriptApi> | undefined;
  return () => compiler ??= Promise.resolve().then(load).catch(error => { compiler = undefined; throw error; });
}
const loadCompiler = createR3fCompilerCache(() => import("monaco-editor/esm/vs/language/typescript/lib/typescriptServices.js")
  .then(module => module.typescript as unknown as TypeScriptApi));
const supportedDrei = new Set(["Box", "Sphere", "Cylinder", "Cone", "Plane", "Extrude", "Text", "Billboard", "Reflector", "Sky"]);
const elements = new Set(["group", "mesh", "boxGeometry", "sphereGeometry", "cylinderGeometry", "coneGeometry", "planeGeometry", "extrudeGeometry",
  "meshStandardMaterial", "meshPhysicalMaterial", "meshBasicMaterial", "ambientLight", "directionalLight", "hemisphereLight", "pointLight", "spotLight", "rectAreaLight"]);
const denied = new Set(["window", "document", "globalThis", "global", "process", "require", "eval", "Function", "fetch", "XMLHttpRequest", "WebSocket", "Worker",
  "setTimeout", "setInterval", "requestAnimationFrame", "useFrame", "useEffect", "useLayoutEffect", "useState", "useMemo", "Canvas", "constructor", "__proto__", "prototype"]);

/** Parse with the already bundled compiler. No generated JavaScript is evaluated. */
export async function validateR3fStaticSource(source: string): Promise<void> {
  if (typeof source !== "string" || !source.trim() || new TextEncoder().encode(source).byteLength > R3F_SOURCE_MAX_BYTES) throw new Error("R3Fのコードは48,000バイト以内で指定してください");
  const ts = await loadCompiler();
  const file = ts.createSourceFile("World.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const diagnostics = (file as typeof file & { parseDiagnostics?: import("typescript-test-api").Diagnostic[] }).parseDiagnostics;
  if (diagnostics?.length) {
    const first = diagnostics[0];
    const point = file.getLineAndCharacterOfPosition(first.start ?? 0);
    throw new Error(`${point.line + 1}:${point.character + 1} ${ts.flattenDiagnosticMessageText(first.messageText, " ")}`);
  }
  const imports = new Set<string>();
  const locals = new Set<string>();
  const shapeNames = new Set<string>();
  const shapeConstructors = new Set(["Shape", "Vector2", "THREE.Shape", "THREE.Vector2"]);
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) locals.add(statement.name.text);
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      if (declaration.initializer && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) locals.add(declaration.name.text);
    }
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleName = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "";
    const clause = statement.importClause;
    if (!clause || !["three", "@react-three/drei", "@xrift/world-components", "@react-three/fiber", "react"].includes(moduleName)) throw new Error("R3Fでは同梱のThree・Drei・XRift Componentだけを使ってください");
    if (clause.isTypeOnly) continue;
    if (clause.name || moduleName === "react" || moduleName === "@react-three/fiber") throw new Error("R3Fは静的なComponentとして記述し、ReactやR3Fの実行時フックは使わないでください");
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      if (moduleName !== "three") throw new Error("Three以外は名前付きimportを使ってください");
      shapeConstructors.add(`${clause.namedBindings.name.text}.Shape`);
      shapeConstructors.add(`${clause.namedBindings.name.text}.Vector2`);
      continue;
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const binding of clause.namedBindings.elements) {
      if (binding.isTypeOnly) continue;
      const name = binding.propertyName?.text ?? binding.name.text;
      if (moduleName === "three") {
        if (!["Shape", "Vector2"].includes(name)) throw new Error(`Three.${name}はこの静的制作経路に対応していません`);
        shapeConstructors.add(binding.name.text);
      } else {
        if (moduleName === "@react-three/drei" && !supportedDrei.has(name)) throw new Error(`Drei.${name}はこの静的制作経路に対応していません`);
        imports.add(binding.name.text);
      }
    }
  }
  let count = 0;
  const fail = (node: import("typescript-test-api").Node, message: string): never => {
    const point = file.getLineAndCharacterOfPosition(node.getStart(file));
    throw new Error(`${point.line + 1}:${point.character + 1} ${message}`);
  };
  const binds = (name: import("typescript-test-api").BindingName, wanted: string): boolean => ts.isIdentifier(name)
    ? name.text === wanted : name.elements.some(element => ts.isBindingElement(element) && binds(element.name, wanted));
  const localBinding = (node: import("typescript-test-api").Identifier): boolean => {
    for (let scope: import("typescript-test-api").Node | undefined = node.parent; scope; scope = scope.parent) {
      if ((ts.isFunctionDeclaration(scope) || ts.isFunctionExpression(scope) || ts.isArrowFunction(scope))
        && scope.parameters.some(parameter => binds(parameter.name, node.text))) return true;
      if (ts.isSourceFile(scope) || ts.isBlock(scope)) for (const statement of scope.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === node.text) return true;
        if (ts.isVariableStatement(statement) && statement.pos <= node.pos
          && statement.declarationList.declarations.some(declaration => binds(declaration.name, node.text))) return true;
      }
    }
    return false;
  };
  const propertyName = (node: import("typescript-test-api").Identifier): boolean => {
    const parent = node.parent;
    return ts.isPropertyAccessExpression(parent) && parent.name === node
      || (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isJsxAttribute(parent)) && parent.name === node
      || ts.isBindingElement(parent) && parent.propertyName === node;
  };
  function visit(node: import("typescript-test-api").Node) {
    if (++count > 24_000) fail(node, "コードが複雑すぎます。Componentと繰り返しを整理してください");
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isNewExpression(node.initializer)
      && /(?:^|\.)Shape$/u.test(node.initializer.expression.getText(file))) shapeNames.add(node.name.text);
    if (ts.isIdentifier(node) && denied.has(node.text) && !propertyName(node) && !localBinding(node)) fail(node, `${node.text}はグローバルAPIとして使えません。静的な値か、props・mapのローカル変数を使ってください`);
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(file);
      const allowed = expression === "Array.from" || ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map"
        || ts.isPropertyAccessExpression(node.expression) && shapeNames.has(node.expression.expression.getText(file)) && ["moveTo", "lineTo", "closePath"].includes(node.expression.name.text);
      if (!allowed) fail(node, `${expression}の実行には対応していません。静的な値、map、Shapeの直線輪郭を使ってください`);
    }
    if (ts.isNewExpression(node) && !shapeConstructors.has(node.expression.getText(file))) fail(node, "作成できるThreeオブジェクトはShapeとVector2です");
    if (ts.isIfStatement(node) || ts.isConditionalExpression(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)
      || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isTryStatement(node) || ts.isThrowStatement(node) || ts.isAwaitExpression(node)
      || ts.isClassDeclaration(node) || ts.isSwitchStatement(node) || ts.isDeleteExpression(node) || ts.isPostfixUnaryExpression(node)
      || ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) fail(node, "制御処理は使わず、静的なComponentと配列のmapで構成してください");
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      || [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind))) fail(node, "代入や条件付きの描画は、この静的制作経路では使えません");
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(file);
      if (!elements.has(name) && !imports.has(name) && !locals.has(name)) fail(node, `${name}は使えるComponentに含まれていません。部品関数はWorldの中に定義せず、ファイル直下に置いてください`);
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxSpreadAttribute(attribute)) fail(attribute, "propsの展開は使わず、属性を明示してください");
        if (!ts.isJsxAttribute(attribute)) continue;
        const key = attribute.name.getText(file);
        if (key === "ref" || /^on[A-Z]/u.test(key) || key === "visible") fail(attribute, `${key}の実行時動作は通常のComponent設定で追加してください`);
        if (/Material$/u.test(name) && !["color", "metalness", "roughness", "side"].includes(key)) fail(attribute, `Material.${key}を保持できません。対応するPBR値だけを使ってください`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}
