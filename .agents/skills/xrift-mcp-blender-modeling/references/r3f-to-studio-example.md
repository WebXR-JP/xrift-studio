# 動作例: R3F ワールドを Studio に変換して配置する

`ComponentCodeImportDialog`（コード貼り付け）と TSX Script `Render` を使った、実際に動く
「R3F → Xrift Studio」の手順とサンプルコード。

## シナリオ: 既存 R3F の World.tsx を XRift ワールドへ取り込む

### 手順

1. 変換したい R3F コード（`@xrift/world-components` + R3F の JSX）を用意。
2. Studio の「コードから作成」(`ComponentCodeImportDialog`) に貼り付ける。
   - 内部で `analyzeComponentCode` → `applyComponentCodeImportPlan` が走る。
3. モデル・テクスチャ参照は Asset として取り込まれる。不足は `import_model_asset` /
   `import_texture_asset` で補う。
4. Entity 構造が生成されたら、`update_transform` で配置を微調整。
5. 動的な動き（回転・浮遊）は TSX Script に切り出す（下のサンプル）。

### 変換でつまずきやすい点

- **`useFrame`** → `start(ctx)` の `update(delta)` に置き換え。
- **`useGLTF(url)`** → `ctx.assets.url(declaredModelId)`。アセットIDは `update_script_component` の
  `assetReferences` に必ず宣言。
- **`@xrift/world-components` の Component**（`Portal`, `Mirror`, `SpawnPoint` 等）は
  `place_builtin_prefab` か `add_component`(id: `xrift.portal` 等) で置く。
- **プリミティブ**（`<Box>`, `<mesh>`）は Entity + `core.mesh` になる。

## TSX Script サンプル（`model-display` テンプレート準拠）

外部 GLB を Render で表示し、回転させる最小の動く形。

```tsx
import {
  defineScript,
  prop,
  type ScriptRenderProps,
} from "xrift:script";
import { Clone, useGLTF } from "@react-three/drei";

type Props = {
  model: { kind: "asset"; assetKind: "model" };
  scale: { kind: "number" };
  rotationSpeed: { kind: "number" };
};

export default defineScript({
  name: "回転するモデル",
  props: {
    model: prop.asset({ label: "Model", kind: "model" }),
    scale: prop.number({ label: "表示倍率", default: 1, min: 0.01, max: 100 }),
    rotationSpeed: prop.number({ label: "回転速度", default: 0.5, min: -20, max: 20 }),
  },
  start(ctx) {
    return {
      update(delta) {
        ctx.object3d.rotation.y += ctx.props.rotationSpeed * delta;
      },
    };
  },
});

export function Render({ ctx }: ScriptRenderProps<Props>) {
  const url = ctx.assets.url(ctx.props.model);
  return url ? <Clone object={useGLTF(url).scene} scale={ctx.props.scale} /> : null;
}
```

> これを `create_script_asset(language: "tsx")` で作り、`update_script_component` で
> `assetReferences: [モデルアセットID]` を宣言する。モデルアセットは先に `import_model_asset` +
> `place_asset` で用意しておく。

## プリミティブだけのシーン例（コード中心の極み）

`ComponentCodeImportDialog` に貼るだけで、Entity 群に変換できるシンプルな例。

```tsx
export function Scene() {
  return (
    <group position={[0, 0, 0]}>
      {/* 床 */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[10, 0.1, 10]} />
        <meshStandardMaterial color="#c8b8a0" />
      </mesh>
      {/* テーブル天板 */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[1.2, 0.06, 0.6]} />
        <meshStandardMaterial color="#8a6d3b" />
      </mesh>
      {/* ランプ */}
      <pointLight position={[0, 2, 0]} intensity={10} color="#fff2cc" />
    </group>
  );
}
```

> 変換後は各 `<mesh>` が Entity + `core.mesh` になり、`update_transform` や `set_material` で
> 個別に編集できる。`@xrift/world-components` の Component も同様に変換される。

## 配置からアニメまでの最短ルート

1. `import_model_asset`（GLB）→ `place_asset`。
2. `create_script_asset(language: "tsx")` で上記サンプルを作成。
3. `add_component(id: "scripting.script", scriptAssetId)` で Entity に付与。
4. `update_script_component` で `assetReferences` / プロパティを設定。
5. `set_play_mode(mode: "play")` → Studio で承認 → 確認。
