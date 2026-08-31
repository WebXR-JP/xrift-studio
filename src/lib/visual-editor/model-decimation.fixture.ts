import { Document } from "@gltf-transform/core";
import { decimatePrimitive } from "./model-decimation";

/**
 * 間引きが「動いたように見えて減らない」のを防ぐ。
 *
 * 書き出されたGLBは平面シェーディングやUVの島で頂点が分裂していて、
 * meshoptimizerはその状態では三角形どうしを繋がっていないと見なす。実測でも
 * 海岸の地面は 78,166 → 78,162 三角形にしかならなかった。位置で結合してから
 * 詰め直す手順が抜けると同じ症状へ戻るので、分裂した入力で確かめる。
 */
export async function runModelDecimationFixtureAssertions(): Promise<void> {
  const document = new Document();
  const buffer = document.createBuffer();
  const grid = buildSplitVertexGrid(12);
  const primitive = document
    .createPrimitive()
    .setAttribute(
      "POSITION",
      document.createAccessor().setType("VEC3").setArray(grid.positions).setBuffer(buffer),
    )
    .setAttribute(
      "NORMAL",
      document.createAccessor().setType("VEC3").setArray(grid.normals).setBuffer(buffer),
    )
    .setAttribute(
      "TEXCOORD_0",
      document.createAccessor().setType("VEC2").setArray(grid.uvs).setBuffer(buffer),
    )
    .setIndices(
      document.createAccessor().setType("SCALAR").setArray(grid.indices).setBuffer(buffer),
    );
  document.createMesh().addPrimitive(primitive);

  const vertexCount = grid.positions.length / 3;
  const uniquePositions = new Set<string>();
  for (let index = 0; index < vertexCount; index += 1) {
    uniquePositions.add(
      `${grid.positions[index * 3]},${grid.positions[index * 3 + 1]},${grid.positions[index * 3 + 2]}`,
    );
  }
  assert(
    uniquePositions.size < vertexCount,
    "Decimation fixture needs an input whose vertices are split across faces",
  );

  const sourceTriangles = grid.indices.length / 3;
  const result = await decimatePrimitive(document, primitive, 0.5);
  assert(
    result.skipped === undefined,
    `Decimation skipped a plain triangle mesh: ${result.skipped}`,
  );
  assert(
    result.before === sourceTriangles,
    "Decimation reported the wrong starting triangle count",
  );
  assert(
    result.after <= sourceTriangles * 0.6,
    `Split vertices blocked decimation: ${result.before} -> ${result.after}`,
  );

  const indices = primitive.getIndices();
  assert(
    indices !== null && indices.getCount() === result.after * 3,
    "Decimated indices do not match the reported triangle count",
  );
  const semantics = primitive.listSemantics().sort();
  assert(
    JSON.stringify(semantics) === JSON.stringify(["NORMAL", "POSITION", "TEXCOORD_0"]),
    `Decimation dropped vertex attributes: ${semantics.join(",")}`,
  );
  const position = primitive.getAttribute("POSITION")!;
  const element: number[] = [0, 0, 0];
  for (let index = 0; index < position.getCount(); index += 1) {
    position.getElement(index, element);
    assert(
      element.every((value) => Number.isFinite(value)),
      "Decimation produced a non-finite position",
    );
  }
  let maxIndex = 0;
  for (let index = 0; index < indices!.getCount(); index += 1) {
    maxIndex = Math.max(maxIndex, indices!.getScalar(index));
  }
  assert(
    maxIndex < position.getCount(),
    "Decimated indices point past the packed vertex buffer",
  );

  // Morph targetは頂点の並びに依存するので、詰め直さず素通しにする。
  const morphed = document
    .createPrimitive()
    .setAttribute("POSITION", primitive.getAttribute("POSITION"))
    .setIndices(primitive.getIndices());
  morphed.addTarget(
    document
      .createPrimitiveTarget()
      .setAttribute(
        "POSITION",
        document
          .createAccessor()
          .setType("VEC3")
          .setArray(new Float32Array(position.getCount() * 3))
          .setBuffer(buffer),
      ),
  );
  const morphResult = await decimatePrimitive(document, morphed, 0.5);
  assert(
    morphResult.skipped === "morph-targets" &&
      morphResult.after === morphResult.before,
    "A Primitive with morph targets must be left alone",
  );
}

/** 面ごとに頂点を分けた格子。書き出されたGLBの平面シェーディングと同じ形。 */
function buildSplitVertexGrid(size: number): {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
} {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const height = (x: number, z: number) => Math.sin(x * 0.7) * Math.cos(z * 0.7) * 0.2;
  for (let x = 0; x < size; x += 1) {
    for (let z = 0; z < size; z += 1) {
      const corners = [
        [x, z],
        [x + 1, z],
        [x + 1, z + 1],
        [x, z + 1],
      ];
      for (const [first, second, third] of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        for (const corner of [first, second, third]) {
          const [cx, cz] = corners[corner];
          positions.push(cx, height(cx, cz), cz);
          // 面ごとの法線とUVで頂点を分ける。bitwiseの結合では一つにならない。
          normals.push(0, 1, (x + z) % 2 === 0 ? 0.01 : -0.01);
          uvs.push(cx / size, cz / size);
          indices.push(indices.length);
        }
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Model decimation fixture failed: ${message}`);
}
