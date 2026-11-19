import { useFrame, useThree } from "@react-three/fiber";
import {
  createContext,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { DoubleSide, Mesh, MeshBasicMaterial, type DataTexture, type Scene } from "three";
import {
  collectXriftLightmapMeshes,
} from "../../../packages/xrift-studio-runtime/src/lightmap-apply";
import {
  parseXriftLightmapData,
  type XriftLightmapData,
} from "../../../packages/xrift-studio-runtime/src/lightmap-data";
import {
  createXriftLightmapTexture,
  XriftLightmapView,
  type XriftLightmapStatus,
} from "../../../packages/xrift-studio-runtime/src/script/lightmap";
import type { LightmapAsset } from "../../lib/visual-editor/asset-manifest";
import { EDITOR_HELPER_USER_DATA } from "../../lib/visual-editor/gizmo-focus";
import {
  collectLightBakeInput,
  type CollectedLightBake,
} from "../../lib/visual-editor/light-bake/collect-scene";
import { readLightmapAssetFiles } from "../../lib/visual-editor/light-bake/light-bake-asset";

/** Scene Viewが描くEntityのidを持つ userData の名前。 */
export const EDITOR_LIGHTMAP_ENTITY_KEY = "renderedEntityId";

/** ライトマップへ直接光まで焼いてあり、描画では消すLightコンポーネント。 */
export const SceneBakedLightContext = createContext<ReadonlySet<string>>(new Set<string>());

/** Scene Viewの外から、今描いているシーンをベイク用に読むための窓口。 */
export type LightBakeSceneBridge = {
  /**
   * Scene Viewが今ベイクの対象として描いているEntity。
   *
   * 対象を変えた直後は、描画への反映が1フレーム遅れる。ベイクの前にこれを見て、
   * 文書の対象が描画に出そろうのを待つ。
   */
  targetEntityIds(): Set<string>;
  collect(bakedLightComponentIds: ReadonlySet<string>): CollectedLightBake;
};

/**
 * Lightmap Assetのファイルを読み、Scene Viewの対象Meshへ貼る。
 *
 * 貼る処理は公開したワールドと同じ `XriftLightmapView` で、読むのも公開物へ
 * コピーされるのと同じ2つのファイルである。エディターだけの近道は通さない。
 */
export function EditorSceneLightmap({
  asset,
  projectPath,
  onStatus,
  onShownChange,
}: {
  asset: LightmapAsset;
  projectPath: string;
  onStatus?: (status: XriftLightmapStatus | { error: string }) => void;
  /**
   * ライトマップを貼れる状態になった、またはそうでなくなったときに呼ばれる。
   *
   * 焼いたライトを消すのは、ライトマップが出てからにする。読み込みの間に先に
   * 消すと、Sceneが一瞬まっ暗になる。
   */
  onShownChange?: (shown: boolean) => void;
}) {
  const [loaded, setLoaded] = useState<{
    texture: DataTexture;
    data: XriftLightmapData;
  } | null>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const shownChangeRef = useRef(onShownChange);
  shownChangeRef.current = onShownChange;
  const imagePath = asset.source.relativePath;
  const dataPath = asset.lightmap.dataPath;
  const imageHash = asset.sourceHash;
  const dataHash = asset.lightmap.dataHash;

  useEffect(() => {
    let active = true;
    readLightmapAssetFiles(projectPath, asset)
      .then(({ image, data }) => {
        if (!active) return;
        const parsed = parseXriftLightmapData(data);
        const texture = createXriftLightmapTexture(
          image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength) as ArrayBuffer,
        );
        // 焼き直しでは、新しい画像が読めるまで前の陰影を出し続ける。
        setLoaded({ texture, data: parsed });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoaded(null);
        // 別の陰影で置き換えず、読めなかったことをそのまま伝える。
        statusRef.current?.({
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      active = false;
    };
    // パスとハッシュが同じなら、同じファイルを読み直さない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, imagePath, dataPath, imageHash, dataHash]);

  // 表示しなくなった画像を破棄する。差し替えの後と、取り外しのとき。
  const shown = useRef<typeof loaded>(null);
  useEffect(() => {
    const previous = shown.current;
    shown.current = loaded;
    if (previous && previous !== loaded) previous.texture.dispose();
    shownChangeRef.current?.(loaded !== null);
  }, [loaded]);
  useEffect(
    () => () => {
      shown.current?.texture.dispose();
      shown.current = null;
      shownChangeRef.current?.(false);
    },
    [],
  );

  if (!loaded) return null;
  return (
    <XriftLightmapView
      texture={loaded.texture}
      data={loaded.data}
      entityKey={EDITOR_LIGHTMAP_ENTITY_KEY}
      onStatus={(status) => statusRef.current?.(status)}
    />
  );
}

/** 描画中のシーンをベイク用に読む関数を、Canvasの外へ渡す。 */
export function LightBakeSceneBridgeBinding({
  bridgeRef,
}: {
  bridgeRef: MutableRefObject<LightBakeSceneBridge | null>;
}) {
  const scene = useThree((state) => state.scene);
  const renderer = useThree((state) => state.gl);
  useEffect(() => {
    const bridge: LightBakeSceneBridge = {
      targetEntityIds: () =>
        new Set(
          collectXriftLightmapMeshes(scene, EDITOR_LIGHTMAP_ENTITY_KEY).map(
            (entry) => entry.entityId,
          ),
        ),
      collect: (bakedLightComponentIds) =>
        collectLightBakeInput({
          scene: scene as Scene,
          renderer,
          entityKey: EDITOR_LIGHTMAP_ENTITY_KEY,
          bakedLightComponentIds,
        }),
    };
    bridgeRef.current = bridge;
    return () => {
      if (bridgeRef.current === bridge) bridgeRef.current = null;
    };
  }, [bridgeRef, renderer, scene]);
  return null;
}

/**
 * ベイクの対象になっているMeshへ、薄い色を重ねて見せる。
 *
 * 対象を選んでいる間だけ出す編集補助で、作品のMaterialには触らない。
 * 同じgeometryを共有する板を重ねるだけなので、形の込み入ったModelでも
 * 面のとおりに色が付く。
 */
export function LightBakeTargetOverlay() {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const overlays = useRef(new Map<Mesh, Mesh>());
  const material = useRef<MeshBasicMaterial | null>(null);
  const elapsed = useRef(1);

  useEffect(() => {
    const overlayMaterial = new MeshBasicMaterial({
      color: "#f59e0b",
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: DoubleSide,
      toneMapped: false,
    });
    material.current = overlayMaterial;
    const current = overlays.current;
    return () => {
      for (const overlay of current.values()) overlay.removeFromParent();
      current.clear();
      overlayMaterial.dispose();
      material.current = null;
      invalidate();
    };
  }, [invalidate]);

  useFrame((_, delta) => {
    const overlayMaterial = material.current;
    if (!overlayMaterial) return;
    elapsed.current += delta;
    if (elapsed.current < 0.2) return;
    elapsed.current = 0;
    const current = overlays.current;
    const seen = new Set<Mesh>();
    for (const entry of collectXriftLightmapMeshes(scene, EDITOR_LIGHTMAP_ENTITY_KEY)) {
      const source = entry.object;
      seen.add(source);
      let overlay = current.get(source);
      if (!overlay) {
        overlay = new Mesh(source.geometry, overlayMaterial);
        overlay.name = "Editor light bake target";
        overlay.userData = { ...EDITOR_HELPER_USER_DATA };
        overlay.raycast = () => {};
        overlay.castShadow = false;
        overlay.receiveShadow = false;
        overlay.renderOrder = source.renderOrder + 1;
        source.add(overlay);
        current.set(source, overlay);
      } else if (overlay.geometry !== source.geometry) {
        overlay.geometry = source.geometry;
      }
    }
    for (const [source, overlay] of current) {
      if (seen.has(source) && overlay.parent === source) continue;
      overlay.removeFromParent();
      current.delete(source);
    }
  });

  return null;
}
