# ワールドにItemを配置する

公開済みのアイテムを、ワールドの一部として配置できます。自作のアイテムか、自分のライブラリに追加したアイテムを使ってください。Item IDは、マイアイテムやマーケットのURL末尾にあるUUIDです。

## ビジュアルエディターで配置する

[Itemを配置する手順](./objects.md#xriftのitemを配置する)に沿って、InspectorでItem IDを設定してください。公開用の`world.items`は、シーンの内容から自動で生成されます。

## コードエディターで配置する

### 1. Itemをコードへ追加する

`src/World.tsx`で公式の`Item`を読み込み、既存の`World`の中に追加します。下のItem IDは例なので、自分が利用できるアイテムのIDに置き換えてください。

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

`itemId`には使うアイテムのID、`placementId`には配置ごとの識別名を指定します。同じアイテムを2つ以上置く場合は、それぞれ別のPlacement IDを付けてください。共有状態の識別に使うため、配置を動かしたりアイテムを更新したりしても、Placement IDは変えないようにします。回転はラジアン、`scale`は1つの数値で指定します。

### 2. ワールド設定へItem IDを登録する

コードエディターで`xrift.json`を選び、「配置するItem」の「Item ID（world.items）」に1行1件でUUIDを入力して保存してください。重複するIDは保存時に自動で1つにまとまります。コードからItemを削除した場合は、この一覧も合わせて見直してください。

JSONを直接編集する場合は、既存の`world`設定に次の項目を追加します。タイトルや公開先など、元の設定はそのまま残してください。

```json
"items": ["12345678-1234-1234-1234-123456789abc"]
```

一覧にないIDは、公開先でもローカルプレビューでも読み込まれません。CLIのアップロード前検査でも登録漏れをチェックします。

登録できるItem IDは50種類までです。同じアイテムを複数配置しても、一覧には1度だけ登録すれば足ります。

### 3. ローカルで確認する

Itemに対応した`@xrift/world-components`と`@xrift/sdk` 0.2.0以降が必要です。現在のXRift Studioでは`@xrift/world-components` 0.64.0を使っています。古いコードプロジェクトでは依存パッケージを更新してください。

`vite.config.ts`の既存の`plugins`に、`xriftDev()`を追加します。

```ts
import { xriftDev } from '@xrift/sdk/vite';
// 既存のreact()やfederation(...)と一緒に指定する
plugins: [react(), xriftDev(), federation({ /* 既存の設定 */ })]
```

XRiftにログインしてからPlayで確認します。公式テンプレートの`DevEnvironment`を使うと、配信済みのItemを読み込んで表示できます。`world.items`を追加した後は、プレビューページを再読み込みしてください。

未公開のItemを同時に開発している場合は、`DevEnvironment`の`items`にローカルのComponentを渡せます。この場合も、同じIDを`world.items`に登録してください。詳しくは[公式Itemドキュメント](https://docs.xrift.net/world-components/components/#item)を参照してください。

## 読み込めない場合

Itemが表示されず仮の箱が出るときは、次の点を確認してください。

- Item IDに誤りがないか
- `world.items`にIDを登録し忘れていないか
- XRiftにログインしているか
- そのアイテムを利用できる権限があるか（自作、またはライブラリ追加済みか）
- アイテムが審査中でないか

表示される仮の箱は読み込みできなかったときの代わりであり、Itemの本体ではありません。

ワールドに配置したItemでは、`useItem().placedBy`が`null`になります。設置者だけに操作を許可しているItemでは、この条件も確認してください。複数人での操作や同期はXRift上で確認します。
