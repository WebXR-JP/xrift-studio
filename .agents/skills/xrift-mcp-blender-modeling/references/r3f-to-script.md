# R3F / Three.js コード → XRift TSX Script 変換ガイド

XRift StudioのTSX Scriptでは、`Render`をnamed exportしてR3Fを記述できます。`useFrame`は使えないため、フレームごとの処理は`start(ctx)`が返す`update(delta)`に書いてください。次の表でThree.js / R3Fからの変換方法を確認できます。

## 制約の要約

- `useFrame`拒否: 代わりに`start(ctx)`から`{ update(delta) {} }`を返す。`delta`は秒。
- アセット参照は宣言制: `ctx.assets.url(assetId)`は`assetReferences`に含まれるIDのみ。
- Entity参照は宣言制: `ctx.find(entityId)`は`entityReferences`に含まれるIDのみ。
- `dynamic import`不可: 静的importのみ。
- プレイヤー/アバターは`ctx.find`で取得不可。
- Play中の書き込みは停止で消える: 永続化したい設定はMCPの永続ツールで保存。

## 変換表

| Three.js / R3F | XRift TSX Script |
|---|---|
| `useFrame((state) => { obj.rotation.x += 0.01 })` | `start(ctx) { return { update(delta) { ctx.object3d.rotation.x += 1 * delta } } }` |
| `<mesh ref={meshRef}>` + `useEffect`で操作 | `update(delta)`内で`ctx.object3d`を直接操作 |
| `useGLTF('/path.glb')` | `const gltf = useGLTF(ctx.assets.url(declaredModelId)!)` |
| `<primitive object={gltf.scene}>` | `<Clone object={gltf.scene} />`（`@react-three/drei`） |
| `<meshStandardMaterial color="red">` | 既存Mesh Entityなら`ctx.materials.setColor('#ff0000')` |
| `pointLight.color = new Color('#fff')` | `ctx.lights.setColor('#ffffff')` |
| `object.position.set(1, 2, 3)` | `ctx.object3d.position.set(1, 2, 3)`を`update`内で |
| `Math.random()`初期化 | `start(ctx)`内で1回だけ設定 |

## Render と配置

型付きのRenderとモデル表示は [変換例](r3f-to-studio-example.md) を参照する。
`useGLTF`は条件分岐のない子コンポーネント内で呼び、URLがない場合は親で描画を分岐する。
静的な配置はEntityにするとEditorで個別編集できる。動的・手続き的な描画にRenderを使う。

## `update(delta)` を使ったアニメーション例

```tsx
import { defineScript } from "xrift:script";

export default defineScript({
  name: "浮遊+回転",
  start(ctx) {
    const baseY = ctx.object3d.position.y;
    let t = 0;
    return {
      update(delta: number) {
        t += delta;
        ctx.object3d.position.y = baseY + Math.sin(t * 2) * 0.2;
        ctx.object3d.rotation.y += delta;
      },
    };
  },
});
```

## 注意

- `useFrame`を使わない。型エラー/実行時拒否になる。
- 宣言されていないアセット/Entityは解決しない。`assetReferences` / `entityReferences`を
  `update_script_component`で必ず更新する。
- プリミティブを多用するなら、`Render`のJSXで組むより`create_primitive`で配置し、
  `start(ctx)`でアニメする方が、Editor上で選択・編集できる（推奨）。
- `Render`は「動的/手続き的な描画」向き。静的な配置はEntity + コンポーネントで組む。
