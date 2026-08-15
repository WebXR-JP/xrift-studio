# Entity に振る舞いを与える（Scripting）

ビジュアルエディターでは、Entity に **Script** を付けて、TypeScript で振る舞いを定義できます。Script は Editor の Play で実行し、同じ Script を公開ワールドへも出力して実 XRift 上で動かします。

## 基本の流れ

1. **Script Asset** を作成し、TypeScript でコードを書きます。
2. **Script Component** として Entity へ付けます。
3. プロパティと参照を宣言します。
4. **Play** で実行します。

## Script Asset を作成する

Assets パネルで **Script** を作成します。組み込みのテンプレートから始めることも、カスタムコードを書くこともできます。

## コードを書く

Script は `xrift:script` から `defineScript` と `prop` を import して書きます。

```ts
import { defineScript, prop } from "xrift:script";
import { Vector3 } from "three";

export default defineScript({
  name: "Spinner",
  props: {
    speed: prop.number({ default: 1, min: 0, max: 20 }),
    axis: prop.vec3({ default: [0, 1, 0] }),
  },
  start(ctx) {
    const axis = new Vector3(...ctx.props.axis);
    return {
      update(dt) {
        ctx.object3d.rotateOnAxis(axis, ctx.props.speed * dt);
      },
      stop() {},
      dispose() {},
    };
  },
});
```

### ライフサイクル

- **start(ctx)**: Script の開始時に呼ばれます。`update`、`stop`、`dispose` を返します。
- **update(dt)**: 毎フレーム呼ばれます。`dt` はデルタタイム（秒）です。
- **stop()**: 停止時に呼ばれます。
- **dispose()**: 破棄時に呼ばれます。

### 宣言的な見た目（Render）

React Three Fiber で宣言的な見た目を追加したい場合は、同じ module から `Render` を export します。Entity の group の子として mount されます。

```tsx
import type { ScriptRenderProps } from "xrift:script";

export const Render = ({ ctx }: ScriptRenderProps) => {
  return (
    <mesh name={`script-${ctx.entity.id}`} position={[0, 1, 0]}>
      <sphereGeometry args={[0.15]} />
      <meshStandardMaterial color="#38bdf8" />
    </mesh>
  );
};
```

## Script Component を付ける

1. Entity を選択します。
2. **Create メニュー** または Inspector から **Script Component** を追加します。
3. 参照する Script Asset を選びます。

## プロパティと参照を宣言する

Script Component では、次の参照を宣言します。

- **プロパティ**: Script の `props` に定義した値。Inspector で編集できます。
- **Asset 参照**: Script が `ctx.assets` で使う Asset の ID の許可リスト。
- **Entity 参照**: Script が `ctx.find` で使う Entity の ID の許可リスト。

## Play で実行する

**Play** に切り替えると、Script が実行されます。Play 中のプロパティ変更は、次のフレームから反映されます。

### 承認ゲート

Script の実行は、プロジェクトスコープの**内容ハッシュ承認ゲート**で保護されています。未承認のソースは、Studio UI で確認・承認してから実行されます。承認されていない Script を Play で実行しようとすると、`SCRIPT_APPROVAL_REQUIRED` が返ります。

## ScriptContext

`ctx` には次のものが含まれます。

| 名前 | 内容 |
| --- | --- |
| `entity` | `id`、`name`、`enabled` |
| `object3d` | この Entity の group |
| `scene` / `camera` / `renderer` | 実行中の Three.js オブジェクト |
| `props` | 宣言したプロパティの値 |
| `time` | `elapsed` と `delta` |
| `find(entityId)` | 宣言した Entity を引く |
| `assets` | 宣言した Asset の URL 解決、Texture 読み込み、Audio 再生 |
| `audioSources` | この Entity が所有する Audio Source を Play 中だけ再生・調整 |
| `materials` | この Entity が所有する Mesh の Material を Play 中だけ変更 |
| `lights` | この Entity が所有する Light を Play 中だけ変更 |
| `particles` | この Entity が所有する Particle Emitter を Play 中だけ再生・調整 |
| `on` / `emit` | Script 間のイベント |
| `log` | Script Console へ出力 |

## 詳細

Scripting の詳細な契約は [Scripting Contract](../SCRIPTING.md) を参照してください。
