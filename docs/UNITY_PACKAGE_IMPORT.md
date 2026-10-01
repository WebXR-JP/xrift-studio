# UnityPackage import

XRift Studioのビジュアルエディターでは、`.unitypackage`、テキスト形式で保存した`.unity`シーン、`.prefab`を読み込める。素材の読み込みメニュー、またはドラッグ＆ドロップを使う。

## 変換処理の流れ

1. `.unitypackage`をgzipとして展開する。tar内の`<GUID>/pathname`、`asset`、`asset.meta`を対応付ける。
2. `pathname`を相対パスとして検証する。絶対パス、空segment、`.`、`..`は拒否する。
3. Unity YAMLをobject document単位で解析する。class ID、fileID、GUID参照を保持する。
4. 対応する3Dモデルとテクスチャを既存の素材import planへ渡す。内容のハッシュを使って元データの保存先を決め、サムネイルを生成する。
5. UnityマテリアルをXRiftのglTF PBRマテリアルへ近似する。テクスチャGUIDを素材IDへ解決する。
6. GameObjectとTransformのfileID参照からオブジェクトの親子関係を再構築し、対応するコンポーネントを付ける。
7. Unityシーン / プレハブごとにXRiftプレハブdocumentを作る。現在のシーンにもroot hierarchyを追加する。
8. 全binary元データを一つのnative素材transactionでcommitする。その後にシーン / AssetManifest / プレハブsetを一つのEditor historyへ反映する。

## 対応範囲

| Unity入力 | XRift Studioでの扱い |
| --- | --- |
| GameObject、Transform / RectTransform | 名前、有効状態、親子関係、local position / rotation / scaleを再構築する。左手系から右手系へ変換する。 |
| GLB、glTF、OBJ、VRM | 3Dモデルの素材として既存import pipelineへ渡す。外部URIを必要とするglTFやOBJの外部MTLは既存診断に従う。 |
| PNG、JPG、WebP、KTX2 | テクスチャとして取り込み、可能ならthumbnailを生成する。 |
| Unityマテリアル | 基本色、金属感、Smoothness、主要テクスチャ、法線マップ、発光、不透明度、CullをglTF PBRへ近似する。 |
| MeshFilter、MeshRenderer、SkinnedMeshRenderer | GUIDで対応する3Dモデルとマテリアルを解決する。Unity built-in Cube / Sphere / Cylinder / PlaneもXRift primitiveへ割り当てる。 |
| BoxCollider、MeshCollider | XRiftの衝突判定へ変換する。 |
| SphereCollider、CapsuleCollider | 元の形状を含む直方体の衝突判定に近似し、警告を残す。 |
| ライト | Point / Spot / Directional / Area、色、強度、距離、shadowを変換する。 |
| 音源 | 音量、loop、autoplay、spatial、距離を保持する。AudioClip binaryはURLへ自動変換しないため元データURLは未設定で残す。 |
| Render Settings、Camera | Fog、Ambient、手前 / 奥、FOVをシーンsettingsへ反映する。Camera GameObject自体の位置・回転・大きさはオブジェクト一覧に残る。 |
| MonoBehaviour / C# | class ID、件数、元データの出典だけを記録する。JavaScriptへのコード変換は行わない。 |
| FBX、DAE、Blend、音声、PSD / TGA | package内の参照と件数を診断するが、実行環境素材には変換しない。 |
| プレハブVariant、nested PrefabInstance、地形、Animation Controllerなど | 明示的なGameObjectは読み取る。Unity固有の継承・実行時意味は未対応class IDとしてプレハブ生成元の記録と読み込む診断へ残す。 |

## 安全性と上限

- 圧縮された元データは256 MB、展開後は768 MBを上限とする。tarのエントリー数にも解析用の上限を設ける。
- package内pathnameをそのままfilesystem出力先にしない。対応素材は既存の`assets/imported/`配下へcontent-addressed pathで保存する。
- binary writeは最大512件とする。native transaction全体320 MBという既存の素材commit制約にも従う。
- シーン / AssetManifest / プレハブdocumentはbinary commit成功後だけ更新する。失敗時はlast-good document setを保つ。
- 同じ元データSHAの素材は既存素材を再利用する。

## 形式上の根拠

- Unityのtext serializedシーンはobjectごとのYAML documentである。document headerのclass IDとfileID、および`{fileID: ...}`参照でGameObjectとコンポーネントを結ぶ。
- 外部素材参照はGUIDとfileIDの組で表す。GUIDは対応する`.meta`と素材を識別する。
- `.unitypackage`は元の素材構造とmetadataを保持する圧縮素材packageである。

参考資料は次のとおり。

- [Unity: Format of text serialized files](https://docs.unity3d.com/Manual/FormatDescription.html)
- [Unity: Direct reference asset management](https://docs.unity3d.com/Manual/assets-direct-reference.html)
- [Unity: Asset packages](https://docs.unity3d.com/Manual/AssetPackages.html)
- [Unity: YAML class ID reference](https://docs.unity3d.com/Manual/ClassIDReference.html)

## 今後の拡張候補

- FBXをGLBへ変換するnative toolchainを用意する。自動導入は行わず、バージョンの固定、ライセンス、テクスチャの探索、同じ入力から同じ出力を得る方法を別途定める。
- nested PrefabInstance / VariantのGUID依存graph解決とUnity property modification適用を行う。
- 地形 / TerrainDataからメッシュ、splat texture、colliderへの変換を行う。
- AnimationClip / Animator ControllerからXRift側の将来のanimation authoring schemaへの変換を行う。
- AudioClipを実行環境向け元データへ取り込む。音源のURLをproject-relativeに解決する素材kindを用意する。
- import前previewでシーン / プレハブ単位の選択、除外、座標scale、未対応要素を確認する。二段階commit UIを用意する。
