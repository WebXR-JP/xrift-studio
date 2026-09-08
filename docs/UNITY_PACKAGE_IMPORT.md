# UnityPackage import

XRift Studio のビジュアルエディターは、`.unitypackage`、text serialization の `.unity` シーン、`.prefab` を素材の読み込むまたはドラッグ＆ドロップから読み込む。

## 変換処理の流れ

1. `.unitypackage` を gzip として展開する。tar 内の `<GUID>/pathname`、`asset`、`asset.meta` を対応付ける。
2. `pathname` を相対パスとして検証する。絶対パス、空 segment、`.`、`..` は拒否する。
3. Unity YAML を object document 単位で解析する。class ID、fileID、GUID 参照を保持する。
4. 対応 3Dモデル / テクスチャを既存の素材 import plan へ渡す。content-addressed 元データと thumbnail を生成する。
5. Unity マテリアルを XRift の glTF PBR マテリアルへ近似する。テクスチャ GUID を素材 ID へ解決する。
6. GameObject と位置・回転・大きさの fileID 参照からオブジェクト一覧を再構築する。対応コンポーネントを付ける。
7. Unity シーン / プレハブごとに XRift プレハブ document を作る。現在のシーンにも root hierarchy を追加する。
8. 全 binary 元データを一つの native 素材 transaction で commit する。その後にシーン / AssetManifest / プレハブ set を一つの Editor history へ反映する。

## 対応範囲

| Unity入力 | XRift Studioでの扱い |
| --- | --- |
| GameObject、位置・回転・大きさ / RectTransform | 名前、有効、親子関係、local position / rotation / scale を再構築する。左手系から右手系へ変換する。 |
| GLB、glTF、OBJ、VRM | 3Dモデルの素材として既存 import pipeline へ渡す。外部 URI を必要とする glTF や OBJ の外部 MTL は既存診断に従う。 |
| PNG、JPG、WebP、KTX2 | テクスチャとして取り込み、可能なら thumbnail を生成する。 |
| Unity マテリアル | 基本色、金属感、Smoothness、主要テクスチャ、法線マップ、放出、不透明度、Cull を glTF PBR へ近似する。 |
| メッシュ Filter、メッシュの描画、Skinned メッシュの描画 | GUID で対応 3Dモデル / マテリアルを解決する。Unity built-in Cube / Sphere / Cylinder / Plane も XRift primitive へ割り当てる。 |
| 直方体の衝突判定、メッシュの衝突判定 | XRift 衝突判定へ変換する。 |
| Sphere 衝突判定、Capsule 衝突判定 | 直方体の衝突判定へ保守的に近似し warning を残す。 |
| ライト | Point / Spot / Directional / Area、色、強度、距離、shadow を変換する。 |
| 音源 | 音量、loop、autoplay、spatial、距離を保持する。AudioClip binary は URL へ自動変換しないため元データ URL は未設定で残す。 |
| Render Settings、Camera | Fog、Ambient、手前 / 奥、FOV をシーン settings へ反映する。Camera GameObject 自体の位置・回転・大きさはオブジェクト一覧に残る。 |
| MonoBehaviour / C# | class ID、件数、元データ生成元の記録だけを記録する。JavaScript へのコード変換は行わない。 |
| FBX、DAE、Blend、音声、PSD / TGA | package 内の参照と件数を診断するが、実行環境素材には変換しない。 |
| プレハブ Variant、nested PrefabInstance、地形、Animation Controllerなど | 明示的な GameObject は読み取る。Unity 固有の継承・実行時意味は未対応 class ID としてプレハブ生成元の記録と読み込む診断へ残す。 |

## 安全性と上限

- compressed 元データは 256 MB、展開後は 768 MB とする。tar 開始ファイルは解析用上限を設ける。
- package 内 pathname をそのまま filesystem 出力先にしない。対応素材は既存の `assets/imported/` 配下へ content-addressed path で保存する。
- binary write は最大 512 件とする。native transaction 全体 320 MB という既存の素材 commit 制約にも従う。
- シーン / AssetManifest / プレハブ document は binary commit 成功後だけ更新する。失敗時は last-good document set を保つ。
- 同じ元データ SHA の素材は既存素材を再利用する。

## 形式上の根拠

- Unity の text serialized シーンは object ごとの YAML document である。document header の class ID と fileID、および `{fileID: ...}` 参照で GameObject とコンポーネントを結ぶ。
- 外部素材参照は GUID と fileID の組で表す。GUID は対応する `.meta` と素材を識別する。
- `.unitypackage` は元の素材構造と metadata を保持する圧縮素材 package である。

参考:

- [Unity: Format of text serialized files](https://docs.unity3d.com/Manual/FormatDescription.html)
- [Unity: Direct reference asset management](https://docs.unity3d.com/Manual/assets-direct-reference.html)
- [Unity: Asset packages](https://docs.unity3d.com/Manual/AssetPackages.html)
- [Unity: YAML class ID reference](https://docs.unity3d.com/Manual/ClassIDReference.html)

## 今後の拡張候補

- FBX を GLB へ変換する明示的な native toolchain を用意する。自動導入ではなく、version 固定、license、texture 探索、deterministic output を含む別境界にする。
- nested PrefabInstance / Variant の GUID 依存 graph 解決と Unity property modification 適用を行う。
- 地形 / TerrainData からメッシュ、splat texture、collider への変換を行う。
- AnimationClip / Animator Controller から XRift 側の将来の animation authoring schema への変換を行う。
- AudioClip を実行環境向け元データへ取り込む。音源の URL を project-relative に解決する素材 kind を用意する。
- import 前 preview でシーン / プレハブ単位の選択、除外、座標 scale、未対応要素を確認する。二段階 commit UI を用意する。
