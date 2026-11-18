import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  ClampToEdgeWrapping,
  FileLoader,
  LinearFilter,
  LinearSRGBColorSpace,
  type DataTexture,
  type Group,
  type Object3D,
} from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import {
  createXriftLightmapApplier,
  type XriftLightmapApplier,
  type XriftLightmapSkipReason,
} from "../lightmap-apply.js";
import { parseXriftLightmapData, type XriftLightmapData } from "../lightmap-data.js";

/**
 * 保存したライトマップ画像（EXR）をテクスチャにする。
 *
 * エディターも公開したワールドもこの関数で読む。補間の設定や色空間が片方だけ
 * 違うと、同じ画像でも陰影の縁の見え方が変わるためである。
 */
export function createXriftLightmapTexture(bytes: ArrayBuffer): DataTexture {
  const texture = new EXRLoader().createDataTexture(bytes) as DataTexture;
  // ライトマップは光の量そのもので、色として変換しない。
  texture.colorSpace = LinearSRGBColorSpace;
  // 縮小版（ミップマップ）は作らない。小さくすると、隣り合うチャートの色が混ざる。
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

export type XriftLightmapStatus = {
  /** ライトマップを貼ったMeshの数。 */
  applied: number;
  /** 保存データにあるMeshの数。 */
  total: number;
  /** 貼れなかったMeshと、その理由。キーは「Entity id、改行、Mesh番号」。 */
  skipped: ReadonlyMap<string, XriftLightmapSkipReason>;
};

/**
 * 読み込み済みのライトマップを、Sceneの対象Meshへ貼り続ける。
 *
 * Modelは後から読み込まれ、Materialは作者の編集やトリガーで差し替わる。
 * 一度貼って終わりにせず、0.5秒ごとにシーンを調べ直して追従する。
 */
export function XriftLightmapView({
  texture,
  data,
  entityKey = "xriftEntityId",
  root,
  intensity = 1,
  onStatus,
}: {
  texture: DataTexture;
  data: XriftLightmapData;
  entityKey?: string;
  root?: Object3D;
  intensity?: number;
  onStatus?: (status: XriftLightmapStatus) => void;
}) {
  const anchor = useRef<Group>(null);
  const applier = useRef<XriftLightmapApplier | null>(null);
  const elapsed = useRef(0);
  const reported = useRef("");
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;

  useEffect(() => {
    const target = root ?? anchor.current?.parent;
    if (!target) return;
    const current = createXriftLightmapApplier({
      root: target,
      entityKey,
      data,
      texture,
      intensity,
    });
    applier.current = current;
    current.update();
    elapsed.current = 0;
    reported.current = "";
    return () => {
      applier.current = null;
      current.dispose();
    };
  }, [data, entityKey, intensity, root, texture]);

  useFrame((_, delta) => {
    const current = applier.current;
    if (!current) return;
    const replaced = current.sync();
    elapsed.current += delta;
    if (!replaced && elapsed.current < 0.5) return;
    elapsed.current = 0;
    current.update();
    const report = statusRef.current;
    if (!report) return;
    const signature = `${current.appliedCount}:${[...current.skipped.entries()].join("|")}`;
    if (signature === reported.current) return;
    reported.current = signature;
    report({
      applied: current.appliedCount,
      total: data.meshes.length,
      skipped: new Map(current.skipped),
    });
  });

  return <group ref={anchor} />;
}

/**
 * 公開したワールドで、ライトマップの画像とUV2データを読み込んで貼る。
 *
 * 読み込みに失敗した場合は何も貼らず、理由をコンソールへ残す。別の陰影で
 * 置き換えて成功したようには見せない。
 */
export function XriftSceneLightmap({
  atlasUrl,
  dataUrl,
  entityKey = "xriftEntityId",
  intensity = 1,
}: {
  atlasUrl: string;
  dataUrl: string;
  entityKey?: string;
  intensity?: number;
}) {
  const [loaded, setLoaded] = useState<{
    texture: DataTexture;
    data: XriftLightmapData;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let texture: DataTexture | null = null;
    // three.jsのローダーで読む。ワールド自身のコードが通信APIを直接呼ぶと、
    // 同じ場所のファイルを読むだけでも、公開時の検査で拒否される。
    const read = async (url: string): Promise<ArrayBuffer> => {
      const loader = new FileLoader();
      loader.setResponseType("arraybuffer");
      return (await loader.loadAsync(url)) as ArrayBuffer;
    };
    Promise.all([read(atlasUrl), read(dataUrl)])
      .then(([atlasBytes, dataBytes]) => {
        if (!active) return;
        const data = parseXriftLightmapData(dataBytes);
        texture = createXriftLightmapTexture(atlasBytes);
        setLoaded({ texture, data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("[XRift Studio] ライトマップを読み込めませんでした。", error);
        setLoaded(null);
      });
    return () => {
      active = false;
      texture?.dispose();
      setLoaded(null);
    };
  }, [atlasUrl, dataUrl]);

  if (!loaded) return null;
  return (
    <XriftLightmapView
      texture={loaded.texture}
      data={loaded.data}
      entityKey={entityKey}
      intensity={intensity}
    />
  );
}
