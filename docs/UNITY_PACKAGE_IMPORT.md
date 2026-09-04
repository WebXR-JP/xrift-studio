# UnityPackage import

XRift Studio の Visual Editor は、`.unitypackage`、text serialization の `.unity` Scene、`.prefab` を Assets の Import またはドラッグ＆ドロップから読み込む。

## 変換フロー

1. `.unitypackage` を gzip として展開する。tar 内の `<GUID>/pathname`、`asset`、`asset.meta` を対応付ける。
2. `pathname` を相対パスとして検証する。絶対パス、空 segment、`.`、`..` は拒否する。
3. Unity YAML を object document 単位で解析する。class ID、fileID、GUID 参照を保持する。
4. 対応 Model / Texture を既存の Asset import plan へ渡す。content-addressed source と thumbnail を生成する。
5. Unity Material を XRift の glTF PBR Material へ近似する。Texture GUID を Asset ID へ解決する。
6. GameObject と Transform の fileID 参照から Hierarchy を再構築する。対応 Component を付ける。
7. Unity Scene / Prefab ごとに XRift Prefab document を作る。現在の Scene にも root hierarchy を追加する。
8. 全 binary source を一つの native Asset transaction で commit する。その後に Scene / AssetManifest / Prefab set を一つの Editor history へ反映する。

## 対応範囲

| Unity入力 | XRift Studioでの扱い |
| --- | --- |
| GameObject、Transform / RectTransform | 名前、Enabled、親子関係、local position / rotation / scale を再構築する。左手系から右手系へ変換する。 |
| GLB、glTF、OBJ、VRM | Model Asset として既存 import pipeline へ渡す。外部 URI を必要とする glTF や OBJ の外部 MTL は既存診断に従う。 |
| PNG、JPG、WebP、KTX2 | Texture Asset として取り込み、可能なら thumbnail を生成する。 |
| Unity Material | Base Color、Metallic、Smoothness、主要 Texture、Normal、Emission、Alpha、Cull を glTF PBR へ近似する。 |
| Mesh Filter、Mesh Renderer、Skinned Mesh Renderer | GUID で対応 Model / Material を解決する。Unity built-in Cube / Sphere / Cylinder / Plane も XRift primitive へ割り当てる。 |
| Box Collider、Mesh Collider | XRift Collider へ変換する。 |
| Sphere Collider、Capsule Collider | Box Collider へ保守的に近似し warning を残す。 |
| Light | Point / Spot / Directional / Area、色、強度、距離、shadow を変換する。 |
| Audio Source | 音量、loop、autoplay、spatial、距離を保持する。AudioClip binary は URL へ自動変換しないため source URL は未設定で残す。 |
| Render Settings、Camera | Fog、Ambient、Near / Far、FOV を Scene settings へ反映する。Camera GameObject 自体の Transform は Hierarchy に残る。 |
| MonoBehaviour / C# | class ID、件数、source provenance だけを記録する。JavaScript へのコード変換は行わない。 |
| FBX、DAE、Blend、音声、PSD / TGA | package 内の参照と件数を診断するが、runtime Asset には変換しない。 |
| Prefab Variant、nested PrefabInstance、Terrain、Animation Controllerなど | 明示的な GameObject は読み取る。Unity 固有の継承・実行時意味は未対応 class ID として Prefab provenance と Import 診断へ残す。 |

## 安全性と上限

- compressed source は 256 MB、展開後は 768 MB とする。tar entry は解析用上限を設ける。
- package 内 pathname をそのまま filesystem 出力先にしない。対応 Asset は既存の `assets/imported/` 配下へ content-addressed path で保存する。
- binary write は最大 512 件とする。native transaction 全体 320 MB という既存の Asset commit 制約にも従う。
- Scene / AssetManifest / Prefab document は binary commit 成功後だけ更新する。失敗時は last-good document set を保つ。
- 同じ source SHA の Asset は既存 Asset を再利用する。

## 形式上の根拠

- Unity の text serialized Scene は object ごとの YAML document である。document header の class ID と fileID、および `{fileID: ...}` 参照で GameObject と Component を結ぶ。
- 外部 Asset 参照は GUID と fileID の組で表す。GUID は対応する `.meta` と Asset を識別する。
- `.unitypackage` は元の Assets 構造と metadata を保持する圧縮 Asset package である。

参考:

- [Unity: Format of text serialized files](https://docs.unity3d.com/Manual/FormatDescription.html)
- [Unity: Direct reference asset management](https://docs.unity3d.com/Manual/assets-direct-reference.html)
- [Unity: Asset packages](https://docs.unity3d.com/Manual/AssetPackages.html)
- [Unity: YAML class ID reference](https://docs.unity3d.com/Manual/ClassIDReference.html)

## 今後の拡張候補

- FBX を GLB へ変換する明示的な native toolchain を用意する。自動導入ではなく、version 固定、license、texture 探索、deterministic output を含む別境界にする。
- nested PrefabInstance / Variant の GUID 依存 graph 解決と Unity property modification 適用を行う。
- Terrain / TerrainData から mesh、splat texture、collider への変換を行う。
- AnimationClip / Animator Controller から XRift 側の将来の animation authoring schema への変換を行う。
- AudioClip を runtime 向け source へ取り込む。Audio Source の URL を project-relative に解決する Asset kind を用意する。
- import 前 preview で Scene / Prefab 単位の選択、除外、座標 scale、未対応要素を確認する。二段階 commit UI を用意する。
