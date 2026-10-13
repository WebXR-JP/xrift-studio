# ワールドにItemを配置する

公開済みのアイテムを、ワールドの一部として配置できます。自作のアイテム、または自分のライブラリに追加したアイテムを使ってください。Item IDはマイアイテムやマーケットのURL末尾のUUIDです。

## ビジュアルエディターで配置する

[Itemを配置する手順](./objects.md#xriftのitemを配置する)に従って、InspectorでItem IDを設定してください。公開用の`world.items`はSceneから自動で生成します。

## コードエディターで配置する

### 1. Itemをコードへ追加する

`src/World.tsx`で公式のItemを読み込み、既存のWorldの中へ追加します。下のItem IDは説明用です。自分が利用できるアイテムのIDへ置き換えてください。

```tsx
import { Item } from '@xrift/world-components';

export const World = () => (
  <group>
    <Item
      itemId="12345678-1234-1234-1234-123456789abc"
      placementId="entrance-item"
      position={[2, 0, -3]}
      rotation={[0, Math.PI / 2, 0]}
      scale={1.5}
    />
  </group>
);
```

`itemId`は使うアイテム、`placementId`は配置ごとの識別名です。同じアイテムを二つ置く場合は、異なるPlacement IDを付けてください。共有状態の識別に使うため、配置を移動したりアイテムを更新したりしても、Placement IDは変えません。回転はラジアン、scaleは一つの数値で指定します。

### 2. ワールド設定へItem IDを登録する

コードエディターで`xrift.json`を選び、「配置するItem」の「Item ID（world.items）」へ1行に1つのUUIDを入力して保存してください。重複するIDは保存時に一つへまとめます。コードのItemを削除した場合は、この一覧も確認してください。

JSONで編集する場合は、既存の`world`設定に次の項目を追加します。タイトルや公開先など、既存の設定は残してください。

```json
"items": ["12345678-1234-1234-1234-123456789abc"]
```

一覧にないIDは、公開後もローカルプレビューでも読み込まれません。CLIのアップロード前検査でも宣言漏れを確認します。

登録できるItem IDは50種類までです。同じアイテムを何個置いても、一覧には一度だけ登録します。

### 3. ローカルで確認する

Itemを含むworld-componentsとSDK 0.2.0以降が必要です。Studioの現行構成はworld-components 0.57.1です。古いコードプロジェクトでは依存関係を更新してください。

`vite.config.ts`で、既存のpluginsに`xriftDev()`を追加します。

```ts
import { xriftDev } from '@xrift/sdk/vite';
// 既存のreact()やfederation(...)と一緒に指定する
plugins: [react(), xriftDev(), federation({ /* 既存の設定 */ })]
```

XRiftへログインしてからPlayで確認します。公式テンプレートの`DevEnvironment`が、配信されたItemを読み込みます。`world.items`を追加したら、プレビューページを再読み込みしてください。

未公開のItemを同時に開発している場合は、`DevEnvironment`の`items`にローカルのComponentを渡せます。この場合も同じIDを`world.items`へ宣言してください。詳しくは[公式Itemドキュメント](https://docs.xrift.net/world-components/components/#item)を確認してください。

## 読み込めない場合

Item IDの誤り、一覧への宣言漏れ、未ログイン、利用権の不足、審査中などを確認してください。表示される仮の箱は、Itemの本体ではありません。

ワールドに配置したItemの`useItem().placedBy`は`null`です。設置者だけに操作を許可するItemでは、その条件も確認してください。多人数での操作や同期はXRift上で確認します。
