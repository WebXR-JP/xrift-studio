import type { MeshComponent, SceneDocument } from "./scene-document";

/**
 * 動かないMeshをMaterialごとに1つへまとめて、公開物のdraw callを減らす。
 *
 * 海岸のワールドで測ると、草414・葉315・海藻254・潮だまり95のNodeが、合わせて
 * 6,150三角形しかないのに983回のdraw callを占めていた。三角形は問題ではなく、
 * 1本6三角形の草に1回ずつ描画命令を出していることが重い。静的なNodeを
 * Materialごとにまとめると、このModelは1,586 draw callが26になる。
 *
 * 原本のGLBは書き換えない。読み込んだ後のthreeのScene上でまとめるので、
 * EditorはNodeごとの選択・表示・Collider・Materialをそのまま扱える。
 * まとめると個別のfrustum cullingは効かなくなるため、既定では実行しない。
 */

/**
 * まとめてはいけないsource node index。
 *
 * Nodeごとに何かを持たせてある時点で、そのNodeは他と混ぜられない。動くNodeと
 * Skinは実行時にしか分からないので、生成したコードの側で外す。
 */
export function collectStaticMergeExclusions(
  scene: SceneDocument,
  modelEntityId: string,
  mesh: MeshComponent,
): number[] {
  const excluded = new Set<number>();
  for (const key of Object.keys(mesh.modelPose?.nodes ?? {})) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0) excluded.add(index);
  }
  for (const binding of mesh.materialBindings) {
    if (binding.sourceNodeIndex !== undefined) excluded.add(binding.sourceNodeIndex);
  }
  for (const entity of Object.values(scene.entities)) {
    const modelNode = entity.modelNode;
    if (!modelNode || modelNode.modelEntityId !== modelEntityId) continue;
    const authored =
      !entity.enabled ||
      entity.components.some((component) => component.type !== "transform") ||
      entity.children.some((childId) => !scene.entities[childId]?.modelNode);
    if (authored) excluded.add(modelNode.sourceNodeIndex);
  }
  return [...excluded].sort((left, right) => left - right);
}

/**
 * 生成したWorldへ埋め込む結合処理。Modelを読み込んだ直後に一度だけ走る。
 *
 * 型注釈を差し込むかどうかだけを変えて、生成Worldがstrictな TypeScript で
 * 通す形と、fixtureがJavaScriptとして評価する形の両方を1つの雛形から出す。
 * 写しを二つ持つと必ずずれる。
 */
export function modelStaticMergeRuntimeSource(options: {
  typed: boolean;
}): string {
  const typed = options.typed;
  const object3d = typed ? ": Object3D" : "";
  const parserJson = typed
    ? ": { animations?: { channels?: { target?: { node?: number } }[] }[]; nodes?: { children?: number[] }[] } | undefined"
    : "";
  const numberArray = typed ? ": readonly number[]" : "";
  const returnsVoid = typed ? ": void" : "";
  const num = typed ? ": number" : "";
  const numberSet = typed ? "<number>" : "";
  const numberMap = typed ? "<number, number>" : "";
  const groupMap = typed ? "<string, { material: Material; meshes: Mesh[] }>" : "";
  const meshArray = typed ? ": Mesh[]" : "";
  const geometryArray = typed ? ": BufferGeometry[]" : "";
  const maybeNumber = typed ? ": number | undefined" : "";
  const maybeObject = typed ? ": Object3D | null" : "";
  const meshCast = typed
    ? " as Mesh & { isMesh?: boolean; isSkinnedMesh?: boolean; morphTargetInfluences?: number[] }"
    : "";
  const materialCast = typed ? " as Material" : "";
  const geometryCast = typed ? " as BufferGeometry" : "";
  const maybeGeometryCast = typed ? " as BufferGeometry | undefined" : "";
  return [
    `/**`,
    ` * 動かないMeshをMaterialごとに1つへまとめる。Modelの読み込み後に一度だけ走り、`,
    ` * 元のNodeは取り除く。動くNode、Skin、Morph、作者がNode単位で設定したものは`,
    ` * 触らない。`,
    ` */`,
    `function xriftMergeStaticModelMeshes(`,
    `  root${object3d},`,
    `  parserJson${parserJson},`,
    `  excludedNodeIndices${numberArray},`,
    `)${returnsVoid} {`,
    `  const excluded = new Set${numberSet}(excludedNodeIndices);`,
    `  // 動くNodeは位置が変わる。その子孫も一緒に動くので、まとめて外す。`,
    `  const nodes = parserJson?.nodes ?? [];`,
    `  const parentOf = new Map${numberMap}();`,
    `  nodes.forEach((node, index) => {`,
    `    for (const child of node?.children ?? []) parentOf.set(child, index);`,
    `  });`,
    `  const excludeBranch = (index${num}) => {`,
    `    let current${maybeNumber} = index;`,
    `    const seen = new Set${numberSet}();`,
    `    while (current !== undefined && !seen.has(current)) {`,
    `      seen.add(current);`,
    `      excluded.add(current);`,
    `      current = parentOf.get(current);`,
    `    }`,
    `    const pending = [index];`,
    `    const visited = new Set${numberSet}();`,
    `    while (pending.length > 0) {`,
    `      const next = pending.pop();`,
    `      if (next === undefined || visited.has(next)) continue;`,
    `      visited.add(next);`,
    `      excluded.add(next);`,
    `      for (const child of nodes[next]?.children ?? []) pending.push(child);`,
    `    }`,
    `  };`,
    `  for (const animation of parserJson?.animations ?? []) {`,
    `    for (const channel of animation?.channels ?? []) {`,
    `      const target = channel?.target?.node;`,
    `      if (typeof target === "number") excludeBranch(target);`,
    `    }`,
    `  }`,
    ``,
    `  root.updateMatrixWorld(true);`,
    `  const rootInverse = new Matrix4().copy(root.matrixWorld).invert();`,
    `  const candidates${meshArray} = [];`,
    `  root.traverse((object) => {`,
    `    const mesh = object${meshCast};`,
    `    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.morphTargetInfluences) return;`,
    `    if (!mesh.visible || Array.isArray(mesh.material)) return;`,
    `    // 除外Nodeが自分か祖先にあれば触らない。祖先が動けば一緒に動く。`,
    `    let current${maybeObject} = mesh;`,
    `    while (current && current !== root) {`,
    `      const nodeIndex = current.userData.xriftSourceNodeIndex;`,
    `      if (typeof nodeIndex === "number" && excluded.has(nodeIndex)) return;`,
    `      current = current.parent;`,
    `    }`,
    `    const geometry = mesh.geometry${maybeGeometryCast};`,
    `    if (!geometry || !geometry.getAttribute("position")) return;`,
    `    candidates.push(mesh);`,
    `  });`,
    ``,
    `  const groups = new Map${groupMap}();`,
    `  for (const mesh of candidates) {`,
    `    const material = mesh.material${materialCast};`,
    `    const geometry = mesh.geometry${geometryCast};`,
    `    // 属性の組み合わせが違うgeometryは結合できない。materialと一緒に鍵にする。`,
    `    const key =`,
    `      material.uuid +`,
    `      "|" +`,
    `      Object.keys(geometry.attributes).sort().join(",") +`,
    `      "|" +`,
    `      String(mesh.castShadow) +`,
    `      String(mesh.receiveShadow) +`,
    `      String(mesh.renderOrder);`,
    `    const group = groups.get(key) ?? { material, meshes: [] };`,
    `    group.meshes.push(mesh);`,
    `    groups.set(key, group);`,
    `  }`,
    ``,
    `  for (const group of groups.values()) {`,
    `    if (group.meshes.length < 2) continue;`,
    `    const baked${geometryArray} = [];`,
    `    for (const mesh of group.meshes) {`,
    `      const geometry = (mesh.geometry${geometryCast}).clone();`,
    `      geometry.applyMatrix4(`,
    `        new Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld),`,
    `      );`,
    `      baked.push(geometry);`,
    `    }`,
    `    const merged = mergeGeometries(baked, false);`,
    `    for (const geometry of baked) geometry.dispose();`,
    `    if (!merged) continue;`,
    `    const sample = group.meshes[0];`,
    `    const mesh = new Mesh(merged, group.material);`,
    `    mesh.castShadow = sample.castShadow;`,
    `    mesh.receiveShadow = sample.receiveShadow;`,
    `    mesh.renderOrder = sample.renderOrder;`,
    `    mesh.name = "xrift-merged-" + group.material.name;`,
    `    mesh.userData.xriftMergedFrom = group.meshes.length;`,
    `    root.add(mesh);`,
    `    for (const source of group.meshes) {`,
    `      source.removeFromParent();`,
    `      (source.geometry${geometryCast}).dispose();`,
    `    }`,
    `  }`,
    `}`,
  ].join("\n");
}
