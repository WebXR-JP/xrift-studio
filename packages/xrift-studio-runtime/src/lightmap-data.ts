/**
 * ライトマップ用UV（UV2）の保存形式。
 *
 * ライトマップ本体は画像（EXR）で、こちらは「どのMeshのどの頂点が、画像の
 * どこを読むか」を持つ。エディターがベイク時に書き、エディターの描画と公開した
 * ワールドが同じこの関数で読む。公開のときに作り直すことはしない。
 *
 * 並びは、先頭に固定長のヘッダー、次にJSONの目次、最後に数値の本体。
 * 本体は4バイト境界に揃え、読む側は写しを作らずに型付き配列として参照する。
 */

const MAGIC = 0x4d4c5258; // "XRLM"
export const XRIFT_LIGHTMAP_DATA_VERSION = 1;

/** UVは画像全体に対する 0..65535 の固定小数で持つ。4096pxの画像でも1pxを16分割できる。 */
const UV_SCALE = 65535;

export type XriftLightmapMesh = {
  /** このMeshを描くEntity。 */
  entityId: string;
  /** Entityの中で何番目のMeshか。Entity配下を深さ優先で数えた順。 */
  mesh: number;
  /**
   * ベイクしたときの頂点数と索引数。読み込んだMeshと合わなければ、形が変わって
   * いるので適用しない。別の形へUVを貼ると、でたらめな模様になる。
   */
  vertexCount: number;
  indexCount: number;
  /**
   * 追加する頂点が、元のどの頂点の写しか。
   *
   * 向きの違う面の境目では、同じ頂点が画像の別々の場所を読む。そこだけ頂点を
   * 増やし、位置・法線などは元の頂点から写す。
   */
  appended: Uint32Array;
  /** 差し替える索引。（索引の位置, 新しい頂点番号）の組を並べたもの。 */
  patches: Uint32Array;
  /** 頂点ごとのUV。追加した頂点のぶんまで含む。0..65535。 */
  uv: Uint16Array;
};

export type XriftLightmapData = {
  version: number;
  /** ライトマップ画像の一辺（ピクセル）。 */
  atlasSize: number;
  meshes: XriftLightmapMesh[];
};

type MeshHeader = {
  e: string;
  m: number;
  v: number;
  i: number;
  /** 追加頂点と索引差し替えの組の番号。同じ形のMeshは同じ組を使い回す。 */
  t: number;
  /** UVの位置（本体の先頭からのバイト数）。 */
  u: number;
};

type TopologyHeader = {
  /** 追加頂点の位置と個数。 */
  a: number;
  ac: number;
  /** 索引差し替えの位置と要素数。 */
  p: number;
  pc: number;
};

type Header = {
  atlasSize: number;
  meshes: MeshHeader[];
  topologies: TopologyHeader[];
};

function align4(value: number): number {
  return (value + 3) & ~3;
}

function fnv1a(values: Uint32Array, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < values.length; index += 1) {
    hash ^= values[index]!;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sameArray(left: Uint32Array, right: Uint32Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** 0..1 のUVを保存用の固定小数へ。 */
export function quantizeXriftLightmapUv(value: number): number {
  const scaled = Math.round(value * UV_SCALE);
  return scaled < 0 ? 0 : scaled > UV_SCALE ? UV_SCALE : scaled;
}

export function encodeXriftLightmapData(data: XriftLightmapData): Uint8Array {
  // 同じModelを同じ大きさで並べたMeshは、頂点の増やし方が一致する。
  // 一致するものは1回だけ書く。
  const topologies: { appended: Uint32Array; patches: Uint32Array }[] = [];
  const buckets = new Map<number, number[]>();
  const meshTopology: number[] = [];
  for (const mesh of data.meshes) {
    const key = fnv1a(mesh.patches, fnv1a(mesh.appended, 2166136261));
    const candidates = buckets.get(key) ?? [];
    let found = -1;
    for (const candidate of candidates) {
      const topology = topologies[candidate]!;
      if (sameArray(topology.appended, mesh.appended) && sameArray(topology.patches, mesh.patches)) {
        found = candidate;
        break;
      }
    }
    if (found < 0) {
      found = topologies.length;
      topologies.push({ appended: mesh.appended, patches: mesh.patches });
      candidates.push(found);
      buckets.set(key, candidates);
    }
    meshTopology.push(found);
  }

  let cursor = 0;
  const topologyHeaders: TopologyHeader[] = topologies.map((topology) => {
    const a = cursor;
    cursor += topology.appended.length * 4;
    const p = cursor;
    cursor += topology.patches.length * 4;
    return { a, ac: topology.appended.length, p, pc: topology.patches.length };
  });
  const meshHeaders: MeshHeader[] = data.meshes.map((mesh, index) => {
    const u = cursor;
    cursor = align4(cursor + mesh.uv.length * 2);
    return {
      e: mesh.entityId,
      m: mesh.mesh,
      v: mesh.vertexCount,
      i: mesh.indexCount,
      t: meshTopology[index]!,
      u,
    };
  });
  const payloadLength = cursor;

  const header: Header = {
    atlasSize: data.atlasSize,
    meshes: meshHeaders,
    topologies: topologyHeaders,
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const payloadStart = align4(12 + json.length);
  const bytes = new Uint8Array(payloadStart + payloadLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, XRIFT_LIGHTMAP_DATA_VERSION, true);
  view.setUint32(8, json.length, true);
  bytes.set(json, 12);
  for (let index = 0; index < topologies.length; index += 1) {
    const topology = topologies[index]!;
    const offsets = topologyHeaders[index]!;
    new Uint32Array(bytes.buffer, payloadStart + offsets.a, topology.appended.length).set(
      topology.appended,
    );
    new Uint32Array(bytes.buffer, payloadStart + offsets.p, topology.patches.length).set(
      topology.patches,
    );
  }
  for (let index = 0; index < data.meshes.length; index += 1) {
    const mesh = data.meshes[index]!;
    new Uint16Array(bytes.buffer, payloadStart + meshHeaders[index]!.u, mesh.uv.length).set(
      mesh.uv,
    );
  }
  return bytes;
}

/**
 * 保存したUV2データを読む。壊れたファイルは例外にして、でたらめなUVを
 * Meshへ貼らない。
 */
export function parseXriftLightmapData(input: ArrayBuffer | Uint8Array): XriftLightmapData {
  // 4バイト境界で参照するため、先頭が揃っていないバイト列は写してから読む。
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const aligned =
    bytes.byteOffset % 4 === 0
      ? bytes
      : new Uint8Array(bytes);
  const buffer = aligned.buffer as ArrayBuffer;
  const start = aligned.byteOffset;
  if (aligned.byteLength < 12) throw new Error("ライトマップのUVデータが短すぎます。");
  const view = new DataView(buffer, start, aligned.byteLength);
  if (view.getUint32(0, true) !== MAGIC) {
    throw new Error("ライトマップのUVデータではありません。");
  }
  const version = view.getUint32(4, true);
  if (version !== XRIFT_LIGHTMAP_DATA_VERSION) {
    throw new Error(`ライトマップのUVデータの版（${version}）に対応していません。`);
  }
  const jsonLength = view.getUint32(8, true);
  const payloadStart = align4(12 + jsonLength);
  if (payloadStart > aligned.byteLength) {
    throw new Error("ライトマップのUVデータの目次が壊れています。");
  }
  const header = JSON.parse(
    new TextDecoder().decode(aligned.subarray(12, 12 + jsonLength)),
  ) as Header;
  const payloadLength = aligned.byteLength - payloadStart;
  const within = (offset: number, byteLength: number) =>
    Number.isInteger(offset) &&
    offset >= 0 &&
    offset % 4 === 0 &&
    byteLength >= 0 &&
    offset + byteLength <= payloadLength;

  const topologies = header.topologies.map((topology) => {
    if (!within(topology.a, topology.ac * 4) || !within(topology.p, topology.pc * 4) || topology.pc % 2 !== 0) {
      throw new Error("ライトマップのUVデータの頂点情報が壊れています。");
    }
    return {
      appended: new Uint32Array(buffer, start + payloadStart + topology.a, topology.ac),
      patches: new Uint32Array(buffer, start + payloadStart + topology.p, topology.pc),
    };
  });
  const meshes = header.meshes.map((mesh): XriftLightmapMesh => {
    const topology = topologies[mesh.t];
    if (!topology) throw new Error("ライトマップのUVデータの参照が壊れています。");
    const uvLength = (mesh.v + topology.appended.length) * 2;
    if (!within(mesh.u, uvLength * 2)) {
      throw new Error("ライトマップのUVデータのUVが壊れています。");
    }
    return {
      entityId: mesh.e,
      mesh: mesh.m,
      vertexCount: mesh.v,
      indexCount: mesh.i,
      appended: topology.appended,
      patches: topology.patches,
      uv: new Uint16Array(buffer, start + payloadStart + mesh.u, uvLength),
    };
  });
  return { version, atlasSize: header.atlasSize, meshes };
}

/** 保存した固定小数のUVを 0..1 へ戻す。 */
export function decodeXriftLightmapUv(uv: Uint16Array): Float32Array {
  const decoded = new Float32Array(uv.length);
  for (let index = 0; index < uv.length; index += 1) {
    decoded[index] = uv[index]! / UV_SCALE;
  }
  return decoded;
}
