# 素材とマテリアル

**Assets**では、3Dモデル、画像、音声、マテリアルなどを管理します。素材を選ぶと**Inspector**で編集できます。

## マテリアルで色と質感を変える

マテリアルは、表面の色や光の反射を決める素材です。Entityを選び、**Inspector → メッシュの描画**で割り当てます。同じマテリアルを使うEntityには、変更がまとめて反映されます。

まずは**Base Color・Metallic・Roughness**を調整してください。項目名はglTFを基準にし、読み方を見出しに添えています。

| 項目 | 読み方・意味 | 調整するとどうなるか |
| --- | --- | --- |
| Base Color | ベースカラー | 非金属では表面色、金属では反射色を変えます。 |
| Metallic | メタリック | 0で非金属、1で金属になります。 |
| Roughness | ラフネス | 0で反射がくっきりし、1でぼやけます。 |
| Normal Map | ノーマルマップ | 陰影で細かな凹凸を表します。メッシュの形や輪郭は変わりません。 |
| Occlusion Map | オクルージョンマップ | 隙間やくぼみに陰影を付けます。 |
| Emissive / Emissive Strength | 発光色 / 発光の強さ | 表面を明るくします。周囲を照らすにはライトが必要です。 |
| Double Sided | 両面表示 | 裏から見た面も表示します。葉や布などに使います。 |

### 透明にする方法を選ぶ

**半透明にするAlpha**と、**光を通すTransmission**は別の設定です。Alpha Mode・Alpha・Alpha Cutoff・Opacity Mapは同じ欄にまとめています。

| したいこと | 設定 |
| --- | --- |
| 全体を薄く表示する | Alpha Modeを**Blend**にして、**Alpha**を下げます。 |
| 葉やフェンスの輪郭を切り抜く | Alpha Modeを**Mask**にします。**Alpha Cutoff**未満の部分を切り抜きます。 |
| 透けない面にする | Alpha Modeを**Opaque**にします。BlendingがNormalならAlphaを使いません。 |
| ガラスのように、反射を残して背景を透かす | **Transmission**を有効にします。基本設定はAlpha 1・Alpha Mode Opaque・Metallic 0です。 |
| 光の曲がり方を変える | **IOR**で素材の屈折率を調整します。 |
| 厚みのある色ガラスにする | **Volume**で厚みと光の減衰を調整します。閉じたメッシュを使ってください。 |

**Opacity Map**は不透明度用の画像です。指定したチャンネルをAlphaとBase Color MapのAに掛け合わせます。黒で透明、白で変化なし。Opaqueのマテリアルへ追加するとBlendに切り替わります。これはXRift Studioの追加設定で、glTFコアの独立したテクスチャ項目ではありません。

**Alpha to Coverage**は切り抜きの縁を滑らかにする設定です。MSAAが有効な環境で使えます。**Blending**をNormal以外にすると、Alpha Modeにかかわらず半透明として描きます。

### 質感を追加する

必要な項目だけ有効にします。見出しの下には、効果と入力条件を短く表示します。

| 項目 | 読み方 | 用途 |
| --- | --- | --- |
| Clearcoat | クリアコート | 塗装やニスのような、透明な光沢の層を重ねます。 |
| Anisotropy | アニソトロピー | 筋のある金属のように、反射を一方向へ伸ばします。 |
| Sheen | シーン | ベルベットのような柔らかな光沢を加えます。 |
| Specular | スペキュラー | 非金属の反射の強さと色を調整します。 |
| Transmission | トランスミッション | ガラスのように光を通します。 |
| IOR | 屈折率 | 素材本体の屈折率です。 |
| Volume | ボリューム | 材質の厚みと、通過する光の減衰を調整します。 |
| Dispersion | ディスパージョン | プリズムのように透過光を色ごとに分けます。VolumeとTransmissionも有効になります。 |
| Iridescence | イリデッセンス | シャボン玉のように、薄膜の反射色が角度で変わります。 |
| Unlit | アンリット | ライトの影響を受けずに表示します。有効にすると、併用できない反射・透過の設定を解除します。 |

**Iridescence → Thickness Min / Max**は薄膜の厚みで、単位はnmです。マップを使わない場合はMaxが適用されます。**Volume → Thickness**はメッシュ内の距離で、薄膜の厚みとは異なります。**Iridescence → IOR**も、素材本体のIORとは別の値です。

**Attenuation Color**は、Volume内を指定した距離だけ通った後の光の色です。「吸収される光の色」ではありません。**Attenuation Distance**を短くするほど、短い距離でその色へ変わります。白では色も明るさも変わりません。

**外部から追加 → 3Dセット → マテリアル見本**では、質感を比較する見本を配置できます。

### 他のツールの表記との関係

BlenderやUnityと、名前や数値の意味がすべて同じとは限りません。移植時は次を確認してください。

- **Base ColorをDiffuse Colorに読み替えない。** Base Colorは金属の反射色も扱います。
- **RoughnessとSmoothnessは増減の向きが逆。** UnityのHDRP LitではSmoothnessを使います。同じ値をそのままコピーせず、使用するシェーダーと画像のチャンネルを確認してください。
- **ClearcoatとCoat、IridescenceとThin Filmは対応を確認する手掛かり。** BlenderのPrincipled BSDFにはCoatとThin Filmがありますが、各値の単純な置換や同じ描画結果を保証するものではありません。

## テクスチャで模様を付ける

テクスチャは色や凹凸などに使う画像です。PNG、JPG、WebP、KTX2を**Assets**へ読み込み、マテリアルの対応する欄で選びます。

**Base Color Map**はRGBを色、AをAlphaに使います。**Metallic Roughness Map**はGをRoughness、BをMetallicに使います。値に使うマップはリニア色空間、色のマップは欄に指定された色空間で用意してください。

画像を選ぶと、**Color Space**、繰り返し方、フィルターも設定できます。**Mipmaps**は縮小表示用の画像を作り、遠くの模様のちらつきを抑えます。マテリアル側では、貼る位置、繰り返し、回転を調整します。

### Normal Mapで凹凸の見え方を変える

**Normal Map**はメッシュを変形せず、陰影で細かな凹凸を表します。輪郭や衝突判定は変わりません。**Tangent Space（接線空間）**の画像を使います。Normal Mapの欄では、色補正なし（Linear）で読み込みます。

**Normal Scale**は0で効果なし、1が標準です。負の値で凹凸の向きを反転します。Clearcoat内のNormal Mapは、上塗りの層にだけ使う別の設定です。

**Occlusion Map**は画像を使って溝や隙間を暗くする設定です。Normal Mapとは役割が違います。シーン設定の**SSAO**も陰影を加えますが、こちらは画面に映った形状をもとに処理します。

光をにじませたい場合は、Emissiveだけでなく[シーン設定のBloom](./visual-editor.md#画面の効果を調整する)も確認してください。

## パーティクルで煙や雪を作る

パーティクルは、小さな粒を放出して煙・火花・雪などを表現する素材です。

**Assets**でパーティクルを作り、放出数、消えるまでの時間、速さ、時間による色や大きさの変化を設定します。作成した素材を**シーン**へドラッグすると、放出用のEntityとして配置されます。

## プレハブで組み合わせを再利用する

プレハブは、Entityとその子をまとめた素材です。シーン内のEntityをプレハブとして保存すると、同じ構成を何度でも配置できます。

動作中だけ色や音を変える場合は、素材そのものの編集ではなく[ノードグラフ](./interactivity.md)を使います。

## 表記と仕様の参考

- [glTF 2.0のマテリアル](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials) / [マテリアル拡張](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos)
- [Three.js: Normal Mapの仕様](https://threejs.org/docs/pages/MeshStandardMaterial.html#normalMap)
- [Blender: Principled BSDF](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html)
- [Unity HDRP: Lit Material Inspector](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.3/manual/lit-material-inspector-reference.html)
