# スクリプトで動きを作る

ビジュアルエディターでは、Entityに **スクリプト** を付けて、TypeScript で振る舞いを定義できます。スクリプトは Editor の動作確認で実行し、同じスクリプトを公開ワールドへも出力して実 XRift 上で動かします。

## 基本の流れ

1. **スクリプト** を作成し、TypeScript でコードを書きます。
2. **スクリプトのComponent** としてEntityへ付けます。
3. プロパティと参照を宣言します。
4. **動作確認** で実行します。

## スクリプトを作成する

Assetsで **スクリプト** を作成します。組み込みのテンプレートから始めることも、カスタムコードを書くこともできます。

## コードを書く

スクリプトを開くと、シーンの横にスクリプトのタブが開きます。左の一覧から名前やパスで検索し、別のスクリプトへ切り替えられます。「新規スクリプト」から追加することもできます。

シーンやGraphのタブへ移っても、編集中のコードと元に戻す履歴は残ります。別のスクリプトを開くときやタブを閉じるときは、未保存の変更を確認します。保存はボタンかCtrl/Cmd+Sで行います。読み込みに失敗したら「再読み込み」で同じファイルを開き直せます。

スクリプトは `xrift:script` から `defineScript` と `prop` を import して書きます。

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

- **start(ctx)**: スクリプトの開始時に呼ばれます。`update`、`stop`、`dispose` を返します。
- **update(dt)**: 毎フレーム呼ばれます。`dt` はデルタタイム（秒）です。
- **stop()**: 停止時に呼ばれます。
- **dispose()**: 破棄時に呼ばれます。

### 宣言的な見た目（Render）

React Three Fiber で宣言的な見た目を追加したい場合は、同じ module から `Render` を export します。Entityの group の子として mount されます。

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

## スクリプトのComponentを付ける

1. Entityを選択します。
2. **追加メニュー** またはInspectorから **スクリプトのComponent** を追加します。
3. 参照するスクリプトを選びます。

## プロパティと参照を宣言する

スクリプトのComponentでは、次の参照を宣言します。

- **プロパティ**: スクリプトの `props` に定義した値。Inspectorで編集できます。
- **素材参照**: スクリプトが `ctx.assets` で使う素材の ID の許可リスト。
- **Entity参照**: スクリプトが `ctx.find` で使うEntityの ID の許可リスト。

## 動作確認で実行する

**動作確認** に切り替えると、スクリプトが実行されます。動作確認中のプロパティ変更は、次のフレームから反映されます。

### 承認ゲート

スクリプトの実行は、プロジェクトスコープの**内容ハッシュ承認ゲート**で保護されています。未承認のソースは、Studio UI で確認・承認してから実行されます。承認されていないスクリプトを動作確認で実行しようとすると、`SCRIPT_APPROVAL_REQUIRED` が返ります。

## ScriptContext

`ctx` には次のものが含まれます。

| 名前 | 内容 |
| --- | --- |
| `entity` | `id`、`name`、`enabled` |
| `object3d` | このEntityの group |
| `scene` / `camera` / `renderer` | 実行中の Three.js Entity |
| `props` | 宣言したプロパティの値 |
| `time` | `elapsed` と `delta` |
| `find(entityId)` | 宣言したEntityを引く |
| `assets` | 宣言した素材の URL 解決、テクスチャ読み込み、音声再生 |
| `audioSources` | このEntityが所有する音源を動作確認中だけ再生・調整 |
| `materials` | このEntityが所有するメッシュのマテリアルを動作確認中だけ変更 |
| `lights` | このEntityが所有するライトを動作確認中だけ変更 |
| `particles` | このEntityが所有するパーティクルの放出を動作確認中だけ再生・調整 |
| `on` / `emit` | スクリプト間のイベント |
| `log` | スクリプト Console へ出力 |

## 詳細

スクリプトの詳細な契約は [スクリプト Contract](../SCRIPTING.md) を参照してください。
