import type { Document, Primitive } from "@gltf-transform/core";

/**
 * Primitive一枚のポリゴン数を減らす。
 *
 * meshoptimizerの簡略化は、位置が同じ頂点が結合されていることを前提にする。
 * 書き出されたGLBは平面シェーディングやUVの島で頂点が分裂しているのが普通で、
 * 分裂したままだと三角形どうしが繋がっていないと見なされ、まったく減らない。
 * 実測では海岸の地面が 78,166 → 78,162 三角形にしかならなかった。
 *
 * そのため、まず位置で頂点を結合して連番の頂点バッファへ詰め直し、そのうえで
 * 簡略化する。同じ 50% 指定が 78,166 → 39,082 三角形（誤差0.01%）になる。
 * 代わりに継ぎ目の法線とUVは片側へ寄るので、これは元へ戻せる操作として扱う。
 */

export type DecimatePrimitiveResult = {
  before: number;
  after: number;
  /** 減らせなかった理由。減った場合はundefined。 */
  skipped?: "not-triangles" | "no-indices" | "morph-targets" | "too-small";
};

const TRIANGLES_MODE = 4;

export async function decimatePrimitive(
  document: Document,
  primitive: Primitive,
  ratio: number,
): Promise<DecimatePrimitiveResult> {
  const { MeshoptSimplifier } = await import("meshoptimizer");
  await MeshoptSimplifier.ready;

  const position = primitive.getAttribute("POSITION");
  const indexAccessor = primitive.getIndices();
  const before = indexAccessor
    ? indexAccessor.getCount() / 3
    : (position?.getCount() ?? 0) / 3;
  if (primitive.getMode() !== TRIANGLES_MODE) {
    return { before, after: before, skipped: "not-triangles" };
  }
  if (!position) return { before, after: before, skipped: "no-indices" };
  // Morph targetは頂点の並びに依存するので、詰め直すと崩れる。
  if (primitive.listTargets().length > 0) {
    return { before, after: before, skipped: "morph-targets" };
  }
  if (before < 8) return { before, after: before, skipped: "too-small" };

  const vertexCount = position.getCount();
  const positions = new Float32Array(vertexCount * 3);
  const vector: number[] = [0, 0, 0];
  for (let index = 0; index < vertexCount; index += 1) {
    position.getElement(index, vector);
    positions[index * 3] = vector[0];
    positions[index * 3 + 1] = vector[1];
    positions[index * 3 + 2] = vector[2];
  }
  const sourceIndices = indexAccessor
    ? Uint32Array.from(indexAccessor.getArray() ?? [])
    : Uint32Array.from({ length: vertexCount }, (_, index) => index);

  // 位置が同じ頂点を一つへ寄せ、参照される順に連番を振り直す。meshoptimizerは
  // 疎な頂点バッファを渡されると全ての三角形を孤立扱いにする。
  const canonicalOf = MeshoptSimplifier.generatePositionRemap(positions, 3);
  const denseIndexOf = new Int32Array(vertexCount).fill(-1);
  const sourceOfDense: number[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const canonical = canonicalOf[index];
    if (denseIndexOf[canonical] === -1) {
      denseIndexOf[canonical] = sourceOfDense.length;
      sourceOfDense.push(canonical);
    }
  }
  const denseCount = sourceOfDense.length;
  const denseIndices = new Uint32Array(sourceIndices.length);
  for (let index = 0; index < sourceIndices.length; index += 1) {
    denseIndices[index] = denseIndexOf[canonicalOf[sourceIndices[index]]];
  }
  const densePositions = new Float32Array(denseCount * 3);
  for (let index = 0; index < denseCount; index += 1) {
    const source = sourceOfDense[index];
    densePositions[index * 3] = positions[source * 3];
    densePositions[index * 3 + 1] = positions[source * 3 + 1];
    densePositions[index * 3 + 2] = positions[source * 3 + 2];
  }

  const targetIndexCount = Math.max(3, Math.floor((before * ratio) | 0) * 3);
  const shading = collectShadingAttributes(primitive, sourceOfDense);
  const [simplified] = shading
    ? MeshoptSimplifier.simplifyWithAttributes(
        denseIndices,
        densePositions,
        3,
        shading.values,
        shading.stride,
        shading.weights,
        null,
        targetIndexCount,
        // 比率を優先する。誤差で早く止まると「半分にしたのに減らない」に見える。
        1,
        [],
      )
    : MeshoptSimplifier.simplify(
        denseIndices,
        densePositions,
        3,
        targetIndexCount,
        1,
        [],
      );

  const after = simplified.length / 3;
  if (after >= before) return { before, after: before };

  // 使われなくなった頂点を落として、もう一度連番へ詰める。compactMeshは
  // 渡したindexをその場で新しい番号へ書き換えるので、戻り値のremapは
  // 頂点データを並べ替えるためだけに使う。indexへ再度当てると範囲外になる。
  const [vertexRemap, keptCount] = MeshoptSimplifier.compactMesh(simplified);
  const finalIndices = simplified;
  const keptSourceIndex = new Int32Array(keptCount).fill(-1);
  for (let index = 0; index < vertexRemap.length; index += 1) {
    const target = vertexRemap[index];
    if (target < keptCount && index < denseCount) {
      keptSourceIndex[target] = sourceOfDense[index];
    }
  }

  const buffer =
    position.getBuffer() ?? document.getRoot().listBuffers()[0] ?? null;
  for (const semantic of primitive.listSemantics()) {
    const source = primitive.getAttribute(semantic);
    if (!source) continue;
    const elementSize = source.getElementSize();
    const sourceArray = source.getArray();
    if (!sourceArray) continue;
    const ArrayConstructor = sourceArray.constructor as new (
      length: number,
    ) => typeof sourceArray;
    const packed = new ArrayConstructor(keptCount * elementSize);
    const element: number[] = new Array(elementSize).fill(0);
    for (let index = 0; index < keptCount; index += 1) {
      const origin = keptSourceIndex[index];
      if (origin < 0) continue;
      source.getElement(origin, element);
      for (let channel = 0; channel < elementSize; channel += 1) {
        packed[index * elementSize + channel] = element[channel];
      }
    }
    const accessor = document
      .createAccessor(`${semantic}_decimated`)
      .setType(source.getType())
      .setNormalized(source.getNormalized())
      .setArray(packed);
    if (buffer) accessor.setBuffer(buffer);
    primitive.setAttribute(semantic, accessor);
  }
  const indices = document
    .createAccessor("indices_decimated")
    .setType("SCALAR")
    .setArray(
      keptCount > 65535 ? finalIndices : Uint16Array.from(finalIndices),
    );
  if (buffer) indices.setBuffer(buffer);
  primitive.setIndices(indices);

  return { before, after };
}

/**
 * 法線とUVを簡略化へ渡す。位置だけで畳むと、継ぎ目や陰影の変化が大きいところが
 * 真っ先に潰れる。重みは meshoptimizer の推奨どおり正規化済み属性の 1.0 前後。
 */
function collectShadingAttributes(
  primitive: Primitive,
  sourceOfDense: readonly number[],
): { values: Float32Array; stride: number; weights: number[] } | null {
  const normal = primitive.getAttribute("NORMAL");
  const uv = primitive.getAttribute("TEXCOORD_0");
  if (!normal && !uv) return null;
  const stride = (normal ? 3 : 0) + (uv ? 2 : 0);
  const weights = [
    ...(normal ? [1, 1, 1] : []),
    ...(uv ? [1, 1] : []),
  ];
  const values = new Float32Array(sourceOfDense.length * stride);
  const normalElement: number[] = [0, 0, 0];
  const uvElement: number[] = [0, 0];
  for (let index = 0; index < sourceOfDense.length; index += 1) {
    const source = sourceOfDense[index];
    let offset = index * stride;
    if (normal) {
      normal.getElement(source, normalElement);
      values[offset] = normalElement[0];
      values[offset + 1] = normalElement[1];
      values[offset + 2] = normalElement[2];
      offset += 3;
    }
    if (uv) {
      uv.getElement(source, uvElement);
      values[offset] = uvElement[0];
      values[offset + 1] = uvElement[1];
    }
  }
  return { values, stride, weights };
}
