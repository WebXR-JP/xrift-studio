import {
  BufferAttribute,
  BufferGeometry,
  Material,
  type InterleavedBufferAttribute,
  type Mesh,
  type Object3D,
  type Texture,
} from "three";
import {
  decodeXriftLightmapUv,
  type XriftLightmapData,
  type XriftLightmapMesh,
} from "./lightmap-data.js";

/**
 * 焼いたライトマップをMeshへ貼る。
 *
 * エディターのScene View、Play、公開したワールドの三つが、同じこの処理を使う。
 * エディターで見えている陰影と公開後の陰影が同じになるのは、同じ画像と同じ
 * UV2を、同じコードで貼るからである。
 *
 * Meshの元のgeometryとMaterialは書き換えない。UV2を足したgeometryと、
 * ライトマップを持たせたMaterialの写しを作って差し替え、外すときに戻す。
 * 同じModelやMaterialを、ベイクしていない別のEntityも使っているためである。
 */

/** Meshコンポーネントの描画物をまとめる親に付ける印。この配下のMeshだけが対象になる。 */
export const XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY = "xriftLightmapScope";

type AnyMesh = Mesh & {
  isInstancedMesh?: boolean;
  isSkinnedMesh?: boolean;
};

type LightmappableMaterial = Material & {
  lightMap?: Texture | null;
  lightMapIntensity?: number;
  isMeshStandardMaterial?: boolean;
  isMeshPhysicalMaterial?: boolean;
  isMeshLambertMaterial?: boolean;
  isMeshPhongMaterial?: boolean;
  isMeshToonMaterial?: boolean;
};

/**
 * ライトマップを表示できるMaterialか。
 *
 * ライトを受けないMaterial（Unlit）、MToon、カスタムシェーダーは対象外にする。
 * 自前の陰影を持つMaterialへライトマップを足すと、作者の決めた見た目が変わる。
 */
export function canXriftMaterialShowLightmap(material: Material): boolean {
  const candidate = material as LightmappableMaterial;
  return Boolean(
    candidate.isMeshStandardMaterial ||
      candidate.isMeshPhysicalMaterial ||
      candidate.isMeshLambertMaterial ||
      candidate.isMeshPhongMaterial ||
      candidate.isMeshToonMaterial,
  );
}

/** ライトベイクが扱うMeshか。編集補助、輪郭線、スキンや変形のあるMeshは扱わない。 */
export function isXriftLightmapMeshCandidate(object: Object3D): object is Mesh {
  const mesh = object as AnyMesh;
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh) return false;
  if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0) return false;
  const userData = mesh.userData;
  if (userData.editorHelper || userData.xriftMToonOutline || userData.xriftColliderExclude) {
    return false;
  }
  const geometry = mesh.geometry as BufferGeometry | undefined;
  return Boolean(geometry && geometry.getAttribute("position"));
}

export type XriftLightmapSceneMesh = {
  entityId: string;
  /** Entityの中で何番目のMeshか。 */
  mesh: number;
  object: Mesh;
};

/**
 * 印の付いた親の配下にあるMeshを、Entityごとに番号を振って集める。
 *
 * ベイクするときと貼るときが同じ順番で数えるので、この関数を両方が使う。
 * 順番はシーングラフの深さ優先で、エディターと公開物で同じになる。
 */
export function collectXriftLightmapMeshes(
  root: Object3D,
  entityKey: string,
): XriftLightmapSceneMesh[] {
  const found: XriftLightmapSceneMesh[] = [];
  const counters = new Map<string, number>();
  const visit = (object: Object3D, entityId: string | undefined, scoped: boolean) => {
    const marker = object.userData[entityKey];
    const owner = typeof marker === "string" ? marker : entityId;
    // 別のEntityへ入ったら、印は引き継がない。子のEntityは自分の印で決まる。
    const inScope =
      (scoped && owner === entityId) ||
      object.userData[XRIFT_LIGHTMAP_SCOPE_USER_DATA_KEY] === true;
    if (inScope && owner !== undefined && isXriftLightmapMeshCandidate(object)) {
      const index = counters.get(owner) ?? 0;
      counters.set(owner, index + 1);
      found.push({ entityId: owner, mesh: index, object });
    }
    const children = object.children;
    for (let index = 0; index < children.length; index += 1) {
      visit(children[index]!, owner, inScope);
    }
  };
  visit(root, undefined, false);
  return found;
}

/** UV2を足した写しから、元のgeometryを引く。 */
const patchedGeometrySources = new WeakMap<BufferGeometry, BufferGeometry>();

/**
 * ライトマップを貼ったMeshのgeometryから、貼る前のgeometryを返す。
 *
 * 焼き直すときは、写しではなく元の形を読む必要がある。保存するUV2は元の形に
 * 対する差分で、次に貼るときも元の形へ適用するためである。
 */
export function xriftLightmapSourceGeometry(geometry: BufferGeometry): BufferGeometry {
  return patchedGeometrySources.get(geometry) ?? geometry;
}

/** geometryが空いているUVの番号を選ぶ。Modelが元から持つUV2を上書きしない。 */
function freeUvChannel(geometry: BufferGeometry): number {
  for (let channel = 1; channel <= 3; channel += 1) {
    if (!geometry.getAttribute(`uv${channel}`)) return channel;
  }
  return 1;
}

function copyAttribute(
  attribute: BufferAttribute | InterleavedBufferAttribute,
  appended: Uint32Array,
): BufferAttribute {
  const count = attribute.count;
  const itemSize = attribute.itemSize;
  const total = count + appended.length;
  const interleaved = (attribute as InterleavedBufferAttribute).isInterleavedBufferAttribute;
  if (interleaved) {
    // 他の属性と一つの配列を分け合っている。値を読み出して単独の配列にする。
    const array = new Float32Array(total * itemSize);
    for (let vertex = 0; vertex < total; vertex += 1) {
      const source = vertex < count ? vertex : appended[vertex - count]!;
      for (let component = 0; component < itemSize; component += 1) {
        array[vertex * itemSize + component] = attribute.getComponent(source, component);
      }
    }
    return new BufferAttribute(array, itemSize, false);
  }
  const sourceArray = (attribute as BufferAttribute).array as Float32Array;
  const Constructor = sourceArray.constructor as Float32ArrayConstructor;
  const array = new Constructor(total * itemSize);
  array.set(sourceArray.subarray(0, count * itemSize));
  for (let index = 0; index < appended.length; index += 1) {
    const source = appended[index]! * itemSize;
    const target = (count + index) * itemSize;
    for (let component = 0; component < itemSize; component += 1) {
      array[target + component] = sourceArray[source + component]!;
    }
  }
  const copy = new BufferAttribute(array, itemSize, attribute.normalized);
  copy.gpuType = (attribute as BufferAttribute).gpuType;
  return copy;
}

type PatchedGeometry = {
  geometry: BufferGeometry;
  channel: number;
  /** 元のgeometryと共有している属性名。破棄するとき元のGPUバッファを巻き込まない。 */
  shared: string[];
  sharedIndex: boolean;
};

/**
 * 元のgeometryにUV2を足した写しを作る。形が保存時と違えば null を返す。
 *
 * 頂点を増やす必要がなければ、位置や法線の配列は元のものをそのまま共有する。
 */
function patchGeometry(
  source: BufferGeometry,
  record: XriftLightmapMesh,
): PatchedGeometry | null {
  const position = source.getAttribute("position");
  const index = source.getIndex();
  if (!position || position.count !== record.vertexCount) return null;
  if ((index ? index.count : 0) !== record.indexCount) return null;
  if (Object.keys(source.morphAttributes).length > 0) return null;

  const geometry = new BufferGeometry();
  geometry.name = source.name;
  const shared: string[] = [];
  let sharedIndex = false;
  if (record.appended.length === 0) {
    for (const name of Object.keys(source.attributes)) {
      geometry.setAttribute(name, source.attributes[name]!);
      shared.push(name);
    }
    if (index) {
      geometry.setIndex(index);
      sharedIndex = true;
    }
  } else {
    if (!index) return null;
    for (const name of Object.keys(source.attributes)) {
      geometry.setAttribute(
        name,
        copyAttribute(
          source.attributes[name] as BufferAttribute | InterleavedBufferAttribute,
          record.appended,
        ),
      );
    }
    const total = record.vertexCount + record.appended.length;
    const indices =
      total > 65535 ? new Uint32Array(index.count) : new Uint16Array(index.count);
    indices.set(index.array as Uint16Array);
    const patches = record.patches;
    for (let entry = 0; entry < patches.length; entry += 2) {
      const corner = patches[entry]!;
      if (corner >= indices.length) return null;
      indices[corner] = patches[entry + 1]!;
    }
    geometry.setIndex(new BufferAttribute(indices, 1));
  }
  for (const group of source.groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  // 位置は変わらないので、境界も元のものを写す。
  if (source.boundingBox) geometry.boundingBox = source.boundingBox.clone();
  if (source.boundingSphere) geometry.boundingSphere = source.boundingSphere.clone();
  geometry.userData = source.userData;

  const channel = freeUvChannel(source);
  geometry.setAttribute(
    `uv${channel}`,
    new BufferAttribute(decodeXriftLightmapUv(record.uv), 2),
  );
  patchedGeometrySources.set(geometry, source);
  return { geometry, channel, shared, sharedIndex };
}

function disposePatchedGeometry(patched: PatchedGeometry): void {
  // 共有している配列を先に外す。そのまま破棄すると、元のgeometryのGPUバッファも
  // 一緒に消えて、次の描画で作り直しになる。
  for (const name of patched.shared) patched.geometry.deleteAttribute(name);
  if (patched.sharedIndex) patched.geometry.setIndex(null);
  patched.geometry.dispose();
}

/** 写しへコピーしない項目。写しだけが持つ値と、Material一つごとに固有の値。 */
const UNSYNCED_MATERIAL_KEYS = new Set([
  "uuid",
  "name",
  "version",
  "lightMap",
  "lightMapIntensity",
  "userData",
  "clone",
]);

type Syncable = { equals?: (other: unknown) => boolean; copy?: (other: unknown) => unknown };

/**
 * 元のMaterialの変更を写しへ届ける。
 *
 * 作者がエディターでMaterialを編集したとき、またPlayや公開先でトリガーが
 * Materialを書き換えたとき、ライトマップを貼ったMeshだけ古い見た目のままに
 * ならないようにする。
 */
function syncMaterial(source: Material, clone: Material, state: { version: number }): void {
  const from = source as unknown as Record<string, unknown>;
  const to = clone as unknown as Record<string, unknown>;
  let recompile = state.version !== source.version;
  state.version = source.version;
  for (const key in from) {
    if (UNSYNCED_MATERIAL_KEYS.has(key)) continue;
    const value = from[key];
    const current = to[key];
    if (value === current || typeof value === "function") continue;
    if (value !== null && typeof value === "object") {
      const target = current as Syncable | null | undefined;
      const origin = value as Syncable & { isTexture?: boolean };
      if (!origin.isTexture && target && typeof target.equals === "function" && typeof target.copy === "function") {
        // 色やベクトルは、参照を共有せず値を写す。
        if (!target.equals(value)) target.copy(value);
        continue;
      }
      to[key] = value;
      recompile = true;
      continue;
    }
    to[key] = value;
    // 0との間を行き来する数値と、数値以外は、シェーダーの組み立てに関わりうる。
    if (typeof value !== "number" || value === 0 || current === 0) recompile = true;
  }
  if (recompile) clone.needsUpdate = true;
}

/** 元のMaterial一つと、UVの番号一つにつき一つだけ作る、ライトマップ付きの写し。 */
type SharedMaterial = {
  source: Material;
  channel: number;
  material: Material;
  state: { version: number };
  /** この写しを使っているMeshの数。0になったら破棄する。 */
  users: number;
};

type AppliedMaterial = {
  source: Material;
  /** Meshへ渡すMaterial。表示できないMaterialは元のものをそのまま使う。 */
  material: Material;
  shared: SharedMaterial | null;
};

type AppliedMesh = {
  mesh: Mesh;
  record: XriftLightmapMesh;
  sourceGeometry: BufferGeometry;
  patched: PatchedGeometry;
  materials: AppliedMaterial[];
  usesArray: boolean;
};

export type XriftLightmapSkipReason = "geometry-changed" | "material-unsupported";

export type XriftLightmapApplier = {
  /** シーングラフを調べ直し、貼り直しや取り外しを行う。Modelの遅い読み込みにも追従する。 */
  update(): void;
  /** 元のMaterialの変更を写しへ届ける。毎フレーム呼ぶ。差し替えられたMeshがあれば true。 */
  sync(): boolean;
  dispose(): void;
  /** ライトマップを貼ったMeshの数。 */
  readonly appliedCount: number;
  /** ライトマップ用に作ったMaterialの写しの数。 */
  readonly materialCount: number;
  /** 保存データにあるのに貼れなかったMesh。 */
  readonly skipped: ReadonlyMap<string, XriftLightmapSkipReason>;
};

export function createXriftLightmapApplier(options: {
  root: Object3D;
  /** Entityのidを持つ userData の名前。エディターと公開物で名前が違う。 */
  entityKey: string;
  data: XriftLightmapData;
  texture: Texture;
  intensity?: number;
}): XriftLightmapApplier {
  const { root, entityKey, data, texture } = options;
  const intensity = options.intensity ?? 1;
  const records = new Map<string, XriftLightmapMesh>();
  for (const record of data.meshes) records.set(`${record.entityId}\n${record.mesh}`, record);

  const applied = new Map<Mesh, AppliedMesh>();
  const skipped = new Map<string, XriftLightmapSkipReason>();
  /** UVの番号ごとのライトマップ。画像は共有し、読むUVの番号だけ変える。 */
  const channelTextures = new Map<number, Texture>();
  /**
   * 元のMaterialごとの写し。同じMaterialを使うMeshは、同じ写しを使う。
   * Meshごとに写しを作ると、ベイクした数だけMaterialが増えて描画が重くなる。
   */
  const sharedMaterials = new Map<Material, Map<number, SharedMaterial>>();
  /** 自分が作った写しから元のMaterialを引く。写しを元と取り違えないために使う。 */
  const cloneSources = new WeakMap<Material, Material>();
  const patchedGeometries = new WeakSet<BufferGeometry>();

  const textureForChannel = (channel: number): Texture => {
    let variant = channelTextures.get(channel);
    if (!variant) {
      variant = texture.clone();
      variant.channel = channel;
      variant.needsUpdate = true;
      channelTextures.set(channel, variant);
    }
    return variant;
  };

  const acquireMaterial = (source: Material, channel: number): AppliedMaterial => {
    if (!canXriftMaterialShowLightmap(source)) {
      return { source, material: source, shared: null };
    }
    let byChannel = sharedMaterials.get(source);
    if (!byChannel) {
      byChannel = new Map();
      sharedMaterials.set(source, byChannel);
    }
    let shared = byChannel.get(channel);
    if (!shared) {
      const clone = source.clone() as LightmappableMaterial;
      // clone() が写さない、インスタンスに直接付けた差し込みを引き継ぐ。
      if (source.onBeforeCompile !== Material.prototype.onBeforeCompile) {
        clone.onBeforeCompile = source.onBeforeCompile;
      }
      if (source.customProgramCacheKey !== Material.prototype.customProgramCacheKey) {
        clone.customProgramCacheKey = source.customProgramCacheKey;
      }
      if (source.onBeforeRender !== Material.prototype.onBeforeRender) {
        clone.onBeforeRender = source.onBeforeRender;
      }
      clone.lightMap = textureForChannel(channel);
      clone.lightMapIntensity = intensity;
      // この写しをさらに複製する処理には、ライトマップの付いていない元の複製を渡す。
      // ライトマップを外した後まで、複製の中にライトマップが残るのを防ぐ。
      clone.clone = () => source.clone() as typeof clone;
      clone.needsUpdate = true;
      cloneSources.set(clone, source);
      shared = { source, channel, material: clone, state: { version: source.version }, users: 0 };
      byChannel.set(channel, shared);
    }
    shared.users += 1;
    return { source, material: shared.material, shared };
  };

  const releaseMaterial = (material: AppliedMaterial): void => {
    const shared = material.shared;
    if (!shared) return;
    shared.users -= 1;
    if (shared.users > 0) return;
    shared.material.dispose();
    const byChannel = sharedMaterials.get(shared.source);
    byChannel?.delete(shared.channel);
    if (byChannel && byChannel.size === 0) sharedMaterials.delete(shared.source);
  };

  const release = (entry: AppliedMesh, restore: boolean): void => {
    const mesh = entry.mesh;
    if (restore) {
      if (mesh.geometry === entry.patched.geometry) mesh.geometry = entry.sourceGeometry;
      const current = mesh.material;
      const ours = entry.usesArray
        ? Array.isArray(current) &&
          current.length === entry.materials.length &&
          current.every((material, index) => material === entry.materials[index]!.material)
        : current === entry.materials[0]?.material;
      if (ours) {
        mesh.material = entry.usesArray
          ? entry.materials.map((material) => material.source)
          : entry.materials[0]!.source;
      }
    }
    disposePatchedGeometry(entry.patched);
    for (const material of entry.materials) releaseMaterial(material);
    applied.delete(mesh);
  };

  /** Meshが今持っているMaterialから、元のMaterialを取り出す。 */
  const sourceMaterials = (mesh: Mesh): { materials: Material[]; array: boolean } => {
    const current = mesh.material;
    const list = Array.isArray(current) ? current : [current];
    return {
      materials: list.map((material) => cloneSources.get(material) ?? material),
      array: Array.isArray(current),
    };
  };

  const apply = (mesh: Mesh, record: XriftLightmapMesh, key: string): void => {
    const existing = applied.get(mesh);
    const currentGeometry = mesh.geometry as BufferGeometry;
    const geometryIsOurs = existing !== undefined && currentGeometry === existing.patched.geometry;
    // 他の処理がgeometryを差し替えた場合は、新しいものを元として貼り直す。
    const sourceGeometry = geometryIsOurs ? existing.sourceGeometry : currentGeometry;
    if (!geometryIsOurs && patchedGeometries.has(currentGeometry)) {
      // 別のMesh用に作った写しが回ってきた。元が分からないので触らない。
      return;
    }
    const { materials: sources, array } = sourceMaterials(mesh);
    if (
      existing &&
      geometryIsOurs &&
      existing.record === record &&
      existing.usesArray === array &&
      existing.materials.length === sources.length &&
      existing.materials.every((material, index) => material.source === sources[index])
    ) {
      // 何も変わっていない。写しが外されていたら付け直す。
      const expected = array
        ? existing.materials.map((material) => material.material)
        : existing.materials[0]!.material;
      const current = mesh.material;
      const attached = Array.isArray(current)
        ? Array.isArray(expected) && current.every((material, index) => material === expected[index])
        : current === expected;
      if (!attached) mesh.material = expected;
      return;
    }
    if (existing) release(existing, false);

    if (!sources.some(canXriftMaterialShowLightmap)) {
      skipped.set(key, "material-unsupported");
      if (existing && mesh.geometry !== sourceGeometry) mesh.geometry = sourceGeometry;
      if (existing) mesh.material = array ? sources : sources[0]!;
      return;
    }
    const patched = patchGeometry(sourceGeometry, record);
    if (!patched) {
      skipped.set(key, "geometry-changed");
      if (mesh.geometry !== sourceGeometry) mesh.geometry = sourceGeometry;
      if (existing) mesh.material = array ? sources : sources[0]!;
      return;
    }
    skipped.delete(key);
    patchedGeometries.add(patched.geometry);
    const materials = sources.map((source) => acquireMaterial(source, patched.channel));
    mesh.geometry = patched.geometry;
    mesh.material = array
      ? materials.map((material) => material.material)
      : materials[0]!.material;
    applied.set(mesh, {
      mesh,
      record,
      sourceGeometry,
      patched,
      materials,
      usesArray: array,
    });
  };

  return {
    update() {
      const seen = new Set<Mesh>();
      for (const entry of collectXriftLightmapMeshes(root, entityKey)) {
        const key = `${entry.entityId}\n${entry.mesh}`;
        const record = records.get(key);
        if (!record) continue;
        seen.add(entry.object);
        apply(entry.object, record, key);
      }
      // シーンから外れたMeshと、対象から外されたMeshを元へ戻す。
      for (const entry of [...applied.values()]) {
        if (!seen.has(entry.mesh)) release(entry, true);
      }
    },
    sync() {
      let replaced = false;
      for (const entry of applied.values()) {
        const mesh = entry.mesh;
        if (mesh.geometry !== entry.patched.geometry) replaced = true;
        const current = mesh.material;
        if (entry.usesArray) {
          if (
            !Array.isArray(current) ||
            current.length !== entry.materials.length ||
            current.some((material, index) => material !== entry.materials[index]!.material)
          ) {
            replaced = true;
          }
        } else if (current !== entry.materials[0]!.material) {
          replaced = true;
        }
      }
      for (const byChannel of sharedMaterials.values()) {
        for (const shared of byChannel.values()) {
          syncMaterial(shared.source, shared.material, shared.state);
        }
      }
      return replaced;
    },
    dispose() {
      for (const entry of [...applied.values()]) release(entry, true);
      for (const variant of channelTextures.values()) variant.dispose();
      channelTextures.clear();
      skipped.clear();
    },
    get appliedCount() {
      return applied.size;
    },
    get materialCount() {
      let count = 0;
      for (const byChannel of sharedMaterials.values()) count += byChannel.size;
      return count;
    },
    skipped,
  };
}
