# UnityPackage import

XRift StudioのVisual Editorは、`.unitypackage`、text serializationの`.unity` Scene、`.prefab`をAssetsのImportまたはドラッグ＆ドロップから読み込む。

## 変換フロー

1. `.unitypackage`をgzipとして展開し、tar内の`<GUID>/pathname`、`asset`、`asset.meta`を対応付ける。
2. `pathname`を相対パスとして検証し、絶対パス、空segment、`.`、`..`を拒否する。
3. Unity YAMLをobject document単位で解析し、class ID、fileID、GUID参照を保持する。
4. 対応Model / Textureを既存のAsset import planへ渡し、content-addressed sourceとthumbnailを生成する。
5. Unity MaterialをXRiftのglTF PBR Materialへ近似し、Texture GUIDをAsset IDへ解決する。
6. GameObjectとTransformのfileID参照からHierarchyを再構築し、対応Componentを付ける。
7. Unity Scene / PrefabごとにXRift Prefab documentを作り、現在のSceneにもroot hierarchyを追加する。
8. 全binary sourceを一つのnative Asset transactionでcommitしてから、Scene / AssetManifest / Prefab setを一つのEditor historyへ反映する。

## 対応範囲

| Unity入力 | XRift Studioでの扱い |
| --- | --- |
| GameObject、Transform / RectTransform | 名前、Enabled、親子関係、local position / rotation / scaleを再構築する。左手系から右手系へ変換する。 |
| GLB、glTF、OBJ、VRM | Model Assetとして既存import pipelineへ渡す。外部URIを必要とするglTFやOBJの外部MTLは既存診断に従う。 |
| PNG、JPG、WebP、KTX2 | Texture Assetとして取り込み、可能ならthumbnailを生成する。 |
| Unity Material | Base Color、Metallic、Smoothness、主要Texture、Normal、Emission、Alpha、CullをglTF PBRへ近似する。 |
| Mesh Filter、Mesh Renderer、Skinned Mesh Renderer | GUIDで対応Model / Materialを解決する。Unity built-in Cube / Sphere / Cylinder / PlaneもXRift primitiveへ割り当てる。 |
| Box Collider、Mesh Collider | XRift Colliderへ変換する。 |
| Sphere Collider、Capsule Collider | Box Colliderへ保守的に近似しwarningを残す。 |
| Light | Point / Spot / Directional / Area、色、強度、距離、shadowを変換する。 |
| Audio Source | 音量、loop、autoplay、spatial、距離を保持する。AudioClip binaryはURLへ自動変換しないためsource URLは未設定で残す。 |
| Render Settings、Camera | Fog、Ambient、Near / Far、FOVをScene settingsへ反映する。Camera GameObject自体のTransformはHierarchyに残る。 |
| MonoBehaviour / C# | class ID、件数、source provenanceだけを記録する。JavaScriptへのコード変換は行わない。 |
| FBX、DAE、Blend、音声、PSD / TGA | package内の参照と件数を診断するが、runtime Assetには変換しない。 |
| Prefab Variant、nested PrefabInstance、Terrain、Animation Controllerなど | 明示的なGameObjectは読み取る。Unity固有の継承・実行時意味は未対応class IDとしてPrefab provenanceとImport診断へ残す。 |

## 安全性と上限

- compressed sourceは256 MB、展開後は768 MB、tar entryは解析用上限を設ける。
- package内pathnameをそのままfilesystem出力先にしない。対応Assetは既存の`assets/imported/`配下へcontent-addressed pathで保存する。
- binary writeは最大512件、native transaction全体320 MBという既存のAsset commit制約にも従う。
- Scene / AssetManifest / Prefab documentはbinary commit成功後だけ更新する。失敗時はlast-good document setを保つ。
- 同じsource SHAのAssetは既存Assetを再利用する。

## 形式上の根拠

- Unityのtext serialized SceneはobjectごとのYAML documentで、document headerのclass IDとfileID、および`{fileID: ...}`参照でGameObjectとComponentを結ぶ。
- 外部Asset参照はGUIDとfileIDの組で表され、GUIDは対応する`.meta`とAssetを識別する。
- `.unitypackage`は元のAssets構造とmetadataを保持する圧縮Asset packageである。

参考:

- [Unity: Format of text serialized files](https://docs.unity3d.com/Manual/FormatDescription.html)
- [Unity: Direct reference asset management](https://docs.unity3d.com/Manual/assets-direct-reference.html)
- [Unity: Asset packages](https://docs.unity3d.com/Manual/AssetPackages.html)
- [Unity: YAML class ID reference](https://docs.unity3d.com/Manual/ClassIDReference.html)

## 今後の拡張候補

- FBXをGLBへ変換する明示的なnative toolchain。自動導入ではなく、version固定、license、texture探索、deterministic outputを含む別境界にする。
- nested PrefabInstance / VariantのGUID依存graph解決とUnity property modification適用。
- Terrain / TerrainDataからmesh、splat texture、colliderへの変換。
- AnimationClip / Animator ControllerからXRift側の将来のanimation authoring schemaへの変換。
- AudioClipをruntime向けsourceへ取り込み、Audio SourceのURLをproject-relativeに解決するAsset kind。
- import前previewでScene / Prefab単位の選択、除外、座標scale、未対応要素を確認する二段階commit UI。
