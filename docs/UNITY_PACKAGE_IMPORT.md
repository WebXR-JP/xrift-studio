# UnityPackage import

XRift Studio のビジュアルエディターでは、`.unitypackage`、テキスト形式で保存した `.unity` シーン、および `.prefab` を読み込める。取り込みは、素材の読み込みメニューまたはドラッグ＆ドロップから行う。

## 変換処理の流れ

1. `.unitypackage` を gzip として展開し、tar 内の `<GUID>/pathname`、`asset`、`asset.meta` を対応付ける。
2. `pathname` を相対パスとして検証する。絶対パス、空のセグメント、`.`、`..` は拒否する。
3. Unity YAML をオブジェクトドキュメント単位で解析し、class ID・fileID・GUID 参照を保持する。
4. 対応する 3D モデルとテクスチャを既存の素材取り込み計画へ渡し、内容のハッシュから元データの保存先を決めてサムネイルを生成する。
5. Unity マテリアルを XRift の glTF PBR マテリアルへ近似し、テクスチャの GUID を素材 ID へ解決する。
6. GameObject と Transform の fileID 参照からオブジェクトの親子関係を再構築し、対応するコンポーネントを付与する。
7. Unity のシーンやプレハブごとに XRift のプレハブドキュメントを作成し、現在のシーンにもルート階層を追加する。
8. すべてのバイナリ元データを 1 つのネイティブ素材トランザクションで書き込んだあと、シーン・`AssetManifest`・プレハブ群を 1 件の編集履歴として反映する。

## 対応範囲

| Unity入力 | XRift Studioでの扱い |
| --- | --- |
| GameObject、Transform / RectTransform | 名前、有効状態、親子関係、ローカルの位置・回転・スケールを再構築し、左手系から右手系へ変換する。 |
| GLB、glTF、OBJ、VRM | 3D モデル素材として既存の取り込みパイプラインへ渡す。外部 URI を必要とする glTF や OBJ の外部 MTL は既存の診断ルールに従う。 |
| PNG、JPG、WebP、KTX2 | テクスチャとして取り込み、可能であればサムネイルを生成する。 |
| Unityマテリアル | 基本色、金属感、Smoothness、主要テクスチャ、法線マップ、発光、不透明度、Cull を glTF PBR へ近似する。 |
| MeshFilter、MeshRenderer、SkinnedMeshRenderer | GUID で対応する 3D モデルとマテリアルを解決する。Unity 組み込みの Cube / Sphere / Cylinder / Plane も XRift プリミティブへ割り当てる。 |
| BoxCollider、MeshCollider | XRift の衝突判定へ変換する。 |
| SphereCollider、CapsuleCollider | 元の形状を包む直方体の衝突判定に近似し、警告を残す。 |
| ライト | Point / Spot / Directional / Area、色、強度、距離、影（Shadow）を変換する。 |
| 音源 | 音量、ループ、自動再生、立体音響、距離を引き継ぐ。AudioClip のバイナリは URL へ自動変換しないため、元データ URL は未設定のまま残す。 |
| Render Settings、Camera | Fog、Ambient、手前 / 奥、FOV をシーン設定へ反映する。Camera の GameObject 自体の位置・回転・大きさはオブジェクト一覧に残る。 |
| MonoBehaviour / C# | class ID、件数、元データの出典だけを記録する。JavaScript へのコード変換は行わない。 |
| FBX、DAE、Blend、音声、PSD / TGA | パッケージ内の参照と件数を診断に記録するが、ランタイム用素材には変換しない。 |
| Prefab Variant、ネストされた PrefabInstance、地形、Animation Controllerなど | 明示的な GameObject は読み取る。Unity 固有の継承や実行時の挙動は未対応の class ID としてプレハブ生成元の記録と取り込み診断へ残す。 |

## 安全性と上限

- 圧縮された元データは 256 MB、展開後は 768 MB を上限とし、tar のエントリー数にも解析用の上限を設ける。
- パッケージ内の `pathname` はそのままファイルシステムの出力先には使わず、対応素材は既存の `assets/imported/` 配下へ内容ハッシュに基づくパスで保存する。
- バイナリファイルの書き込みは最大 512 件とし、ネイティブトランザクション全体で 320 MB という既存の素材保存制約にも従う。
- シーン・`AssetManifest`・プレハブドキュメントは、バイナリの書き込みが成功したあとにだけ更新する。失敗した場合は直前に正常だったドキュメント群をそのまま残す。
- 同じ元データ SHA を持つ素材は、既存の素材を再利用する。

## 形式上の根拠

- Unity のテキスト形式でシリアライズされたシーンは、オブジェクトごとの YAML ドキュメントで構成される。ドキュメントヘッダーの class ID・fileID と `{fileID: ...}` 参照によって、GameObject とコンポーネントが結び付く。
- 外部素材への参照は GUID と fileID の組で表され、GUID によって対応する `.meta` と素材を識別する。
- `.unitypackage` は、元の素材構造とメタデータを保持した圧縮アセットパッケージである。

参考資料は次のとおりである。

- [Unity: Format of text serialized files](https://docs.unity3d.com/Manual/FormatDescription.html)
- [Unity: Direct reference asset management](https://docs.unity3d.com/Manual/assets-direct-reference.html)
- [Unity: Asset packages](https://docs.unity3d.com/Manual/AssetPackages.html)
- [Unity: YAML class ID reference](https://docs.unity3d.com/Manual/ClassIDReference.html)

## 今後の拡張候補

- FBX を GLB へ変換するネイティブツールチェーンの整備。自動導入は行わず、バージョン固定、ライセンス、テクスチャの探索方法、同じ入力から同じ出力を得る手順を別途定める。
- ネストされた PrefabInstance / Variant に対する GUID 依存グラフの解決と、Unity のプロパティ上書き（property modification）の適用。
- 地形 / TerrainData からメッシュ、スプラットテクスチャ、コライダーへの変換。
- AnimationClip / Animator Controller から、XRift 側の将来のアニメーションオーサリングスキーマへの変換。
- AudioClip のランタイム向け元データへの取り込みと、音源 URL をプロジェクト相対パスで解決できる素材種別の追加。
- 取り込み前のプレビューでシーン・プレハブ単位の選択、除外、座標スケール、未対応要素を確認できる二段階確定 UI の追加。
