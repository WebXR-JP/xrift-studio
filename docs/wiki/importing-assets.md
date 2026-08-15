# 3D 素材の取り込み

ビジュアルエディターでは、3D モデルを **Model Asset** として取り込み、Scene に配置できます。

## 対応している形式

| 形式 | 説明 |
| --- | --- |
| **GLB** | 自己完結型の glTF バイナリ。推奨。 |
| **glTF** | テキストベースの glTF。sidecar を参照する場合は、依存ファイルを一緒にドロップすると自己完結 GLB へ正規化します。 |
| **OBJ** | 汎用の 3D モデル形式。外部 MTL／Texture は同じ import batch に含めた分だけ解決します。 |
| **VRM 0.x / 1.x** | アバター向けの形式。ボーンと shape key を抽出できます。 |

## 取り込む手順

1. Assets パネルで、モデルファイルをドラッグ＆ドロップするか、インポートメニューから選択します。
2. 取り込みが完了すると、Model Asset が Assets に追加されます。
3. Model Asset を Scene View へドラッグして配置します。

## 配置する

Model Asset を Scene View へドラッグすると、Entity として配置されます。配置後は、Inspector で次の設定ができます。

- **Transform**: 位置、回転、スケール
- **Mesh Renderer**: マテリアル、影の設定
- **Collider**: 衝突判定（インポート Model には Mesh Collider が初期設定されます）
- **Animation**: アニメーションの clip、Autoplay、Loop、再生速度

## アバターのポーズを保存する

VRM などのスキンメッシュモデルでは、ボーンの XYZ 回転と shape key の値を Entity ごとに保存できます。Scene View と XRift 向け生成コードへ反映されます。

## 再インポート

Model Asset のソースを変更した場合は、**再インポート** で派生メタデータを更新できます。Model Asset の ID と参照は保持されます。

## 制約

- OBJ の外部 MTL／Texture は disk 上から自動探索しません。同じ import batch へ含めた分だけ解決します。
- sidecar を参照する glTF／OBJ は、依存ファイルを同じ import batch へ含めた時だけ自己完結 GLB へ正規化します。単体で選んだ場合は不足依存として止まります。
- VRM の静的ポーズは保存できますが、keyframe、clip、補間、timeline 編集はまだありません。

## 次のステップ

- [アセットと表現（Texture / Material / Particle）](./assets-and-materials.md)
- [地形と衝突判定](./terrain-and-colliders.md)
