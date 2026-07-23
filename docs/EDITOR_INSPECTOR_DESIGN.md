# Inspector デザインガイド

XRift Studio の Inspector は、Unity と同じく「選択した対象を、短い視線移動で編集できる」ことを優先する。説明画面にはせず、値・状態・操作だけを高密度に並べる。

## 並び順

1. Entity の Enabled と名前
2. Prefab など編集元への参照
3. Transform
4. Renderer、Light、Collider などの Component
5. 追加 Component

Component 自身の Enabled は見出しの先頭に置く。Entity 全体の Enabled と混同させない。

## 密度

- 見出しは 32px 前後、通常フィールドは 28px 前後を基準にする。
- Component 内の間隔は 8px、関連するラベルと値は 4px を基準にする。
- 長い説明、重複する種別名、内部用語は常設しない。補足は `title` と読み上げ名へ移す。
- エラー、参照切れ、未設定のため次へ進めない状態だけは短い文で常設する。

## 枠と階層

- Inspector パネルを第一の外枠、Component を第二の外枠とする。
- Component 内の Material slot やプロパティ群へカード枠を重ねない。区切り線、余白、薄い背景で階層を示す。
- 通常の Component に影を使わない。選択、警告、モーダルなど前後関係が必要な箇所だけに使う。
- 角丸は小さく統一し、枠線と強い背景色を同じ階層へ同時に重ねすぎない。

## 参照フィールド

Material、Texture、Model など視覚的な Asset は、左から次の順に一行へ置く。

1. 色またはサムネイルのプレビュー
2. Asset の選択欄
3. 選択中 Asset を開くアイコン

名前だけに識別を依存させない。Material のスウォッチは Base Color と透明度を表示し、Base Color Texture がある場合は Texture アイコンを重ねる。アイコンだけの操作には必ず tooltip と読み上げ名を付ける。

## 状態

- Enabled はチェック状態と無効時の濃淡で示す。
- 選択中、hover、focus、disabled を別の見た目にする。focus ring は削らない。
- 色だけで状態を伝えず、チェック、アイコン、読み上げ名のいずれかを併用する。
- Play 中に編集できない値は同じ配置のまま無効化し、レイアウトを動かさない。

## レビュー項目

- [ ] 最初の一画面に主要な状態と値が収まる。
- [ ] 同じ情報を見出し、ラベル、説明文で三重に表示していない。
- [ ] Component 内にカード枠が入れ子になっていない。
- [ ] 視覚的な Asset にプレビューがあり、その横で選択できる。
- [ ] Component ごとの Enabled が見出しから操作できる。
- [ ] アイコン操作を hover とキーボード focus の両方で理解できる。
- [ ] エラー以外のガイド文を tooltip へ移せるか確認した。
