# 色と質感を変える

**マテリアル**は、物の表面の色や光の反射を決める素材です。最初は**Base Color・Metallic・Roughness**の三つだけ使いましょう。

**始める前に：** シーンに球などを一つ配置し、Play中なら**Stop**で編集に戻ってください。

![Sphere Blueを選択し、Base Colorに青色を設定した状態](./media/materials.png)

*Assetsでマテリアルを選ぶと、右のInspectorにBase Colorが表示されます。*

## 作って割り当てる

1. **Assets**の追加メニュー、または空いている場所の右クリックから**新規マテリアル**を選びます。
2. 作ったマテリアルをAssetsで選び、Inspectorの**Base Color**を変えます。
3. **Hierarchy**で色を付けたいEntityを選びます。
4. **Inspector → Mesh Renderer → マテリアル**で、作ったものを選びます。Assetsからこの欄へドラッグしても割り当てられます。

**色が変わったら、割り当ては完了です。** 作っただけで反映されない場合は、四つ目の操作を確認してください。複数のスロットがあるモデルでは、対象の面に対応するスロットへ割り当てます。

## MToon：マンガのような陰影と輪郭線を付ける

1. **Assets**でマテリアルを選びます。
2. **Inspector → Shading → マテリアルの種類**で**MToon 0.x**または**MToon 1.0**を選びます。
3. **Base Color**で明るい面の色、**MToon → Shade Color**で暗い面の色を変えます。
4. **Outline → Outline Color**で輪郭線の色、**Outline Width**で太さを変えます。

最初は黒い輪郭線が**0.003 m（3 mm）**で付きます。モデルの大きさに合わせて幅を調整してください。輪郭線を消すには**Outline Width Mode → None（なし）**を選びます。

素材のプレビューと見本カードでは、斜めからの**Directional Light**と弱い環境光で、Base Colorの明るい面とShade Colorの暗い面を確認できます。シーンへ割り当てた後は、そのシーンの照明に合わせて見た目を調整してください。

MToon 0.xはVRM 0.xの陰影と互換性のある描画、MToon 1.0は新しい陰影の描画を使います。0.xと1.0の切り替えでは、色・陰影・輪郭線・テクスチャの設定を保ちます。初めてMToonへ切り替えるときは、Base ColorのRGBを0.8倍した色をShade Colorに使い、Base Color MapもShade Multiply Mapへ引き継ぎます。照明への反応が変わるため、切り替え後の見た目も確認してください。

見本から始めたい場合は、**外部から追加 → glTFマテリアル**で**MToon 0.x アウトライン**または**MToon 1.0 アウトライン**を選びます。標準マテリアルと並べて比較し、シーンへ追加できます。

| 設定 | 値を変えたときの見え方 |
| --- | --- |
| Shading Shift | 大きいほど明るい面が広がります。 |
| Shading Toony | 1に近いほど陰影の境界がくっきりします。 |
| GI Equalization | 1に近いほど環境光による明暗が均等になります。 |
| Outline Lighting Mix | 0では設定した輪郭線の色、1ではライトの影響を受ける色になります。 |

追加の表現は、同じInspectorの次の項目で調整します。

| 項目 | 調整できること |
| --- | --- |
| Shading Shift Map | R（赤）で場所ごとに陰影の境界をずらします。Scaleはずらす量で、負の値では明暗の変化が反転します。 |
| Matcap | 見る向きに合わせた映り込みをMatcap MapとMatcap Colorで加えます。 |
| Rim Lighting | 縁に加える色・画像と広がりを調整します。Fresnel Powerを大きくすると縁に集中し、Liftを大きくすると広い面に現れます。Lighting Mixでライトの影響を変えます。 |
| UV Animation | 画像をX・Y方向へスクロールし、回転させます。速度0で停止、負の値で逆方向です。回転速度の単位はrad/秒。Mask MapのB（青）で場所ごとの速さを変えます。 |
| MToon Rendering | 半透明の深度書き込みと描画順を調整します。Render Queue Offsetは−9〜9で、大きいほど後に描画します。 |

**Outline Width Mode**は、**World（m）**ではモデルと同じ空間の幅、**Screen**では画面の高さに対する割合です。輪郭線の幅を画像で変える場合は**Outline Width Multiply Map**のG（緑）を使います。

Base Color、Alpha、Normal Map、Emissive、Double SidedはMToonでも使えます。半透明にするには**Alpha Mode → Blend**を選びます。**Transparent With ZWrite**は、**Rendering → Depth Write**が自動のときに半透明の面の深度を書き込みます。

MToonを使う間、Metallic・Roughnessや反射・透過の拡張は表示されません。**Standard (PBR)**へ戻すと、保持していたPBR設定を再び編集できます。もう一度MToonを選ぶと、Shade Colorや輪郭線、MToon専用のテクスチャ設定も戻ります。切り替えと色・幅の変更は**元に戻す**で戻せます。

| 切り替え時に引き継ぐ設定 | 扱い |
| --- | --- |
| Base Color / Diffuseと対応する画像 | Base ColorとBase Color Mapで保ちます。 |
| Normal・Emissiveと対応する画像 | 同じ色・強さ・画像を使います。 |
| Alpha / Opacityと対応する画像 | Alpha Mode、Opacity MapとChannelを保ちます。 |
| テクスチャのUV・位置・拡大率・回転 | 画像ごとの設定を保ちます。 |
| Metallic・RoughnessなどPBR専用の設定 | 保持し、Standard (PBR)へ戻すと使います。 |

### 複数のマテリアルをまとめて編集する

**Assets**でCtrlまたはShiftを使って複数のマテリアルを選び、**Inspector → マテリアルの一括変更 → マテリアルの種類**からStandard (PBR)、MToon 0.x、MToon 1.0を選びます。色や画像を全素材で同じにする操作ではなく、各素材の設定を保ったまま種類を切り替えます。同じマテリアルを使うすべての面に反映され、一度の**元に戻す**でまとめて戻せます。

モデルや画像も選択している場合は、選択中のマテリアルだけを変更します。カスタムシェーダーを使う素材は種類の一括変更の対象外です。

対象の種類が同じなら、Base Color、Alpha、Normal Map、Emissive、Renderingと、その種類の全設定もまとめて編集できます。MToon 0.x同士、またはMToon 1.0同士では、陰影・輪郭線・Matcap・Rim Lighting・UV Animationも表示します。種類が異なる場合は、先に種類をそろえてください。

値が異なる項目は**一部異なる**と表示し、変更した項目だけを各素材へ反映します。たとえばShade ColorのRだけを変えると、G・Bは各素材の値を保ちます。画像だけの変更ではUVを保ち、UVの変更は画像を割り当て済みの素材へ反映します。一度の**元に戻す**で、その変更をまとめて戻せます。

[VRM 0.x・VRM 1.0のアバターを取り込んだ場合](./assets.md#vrmアバターを取り込む)も、モデルの**Materials**から同じMToonの項目を編集できます。

編集したMToonは、[.xriftstudioでの受け渡しとコードエディターへの書き出し](./save-and-open.md#バックアップする)にも含まれます。Entityだけを別の作品へ渡す場合は、[Hierarchyから書き出します](./hierarchy-transfer.md#mtoonvrmモデルを渡す)。

## Base Color：色を決める

Base Color（基本色）は、非金属では表面の色、金属では反射の色を変えます。

まずはMetallicを0にして、Base Colorを変えてみてください。画像も割り当てられている場合は、画像の色とBase Colorが掛け合わされます。画像の色をそのまま使う出発点は白です。

![Base Colorの色欄とRGB値](./media/materials.png "Base Color")

*RGBの右にある色の欄から変更します。*

## Metallic：金属かどうかを決める

Metallic（金属度）は、**0で非金属、1で金属**です。プラスチックや塗装面ならまず0、金属の露出した面ならまず1を試します。

値を上げれば何でもきれいになる設定ではありません。金属が暗く見える場合は、値だけでなく[照明とIBL](./lighting.md#金属が暗い反射が見えない)を確認してください。

![Metallic 0、Roughness 0.5の数値とスライダー](./media/material-values.png "Metallic / Roughness")

*左の説明と右の数値を確認して、一つずつ調整します。*

## Roughness：反射のぼけ方を決める

Roughness（表面の粗さ）は、**0に近いほど反射がくっきり、1に近いほど反射がぼやける**設定です。形状をでこぼこにするものではありません。

同じ色の球で、まず**0.15**と**0.8**を比べてみてください。反射する環境やライトによって見え方が変わるため、これは調整を始めるための例です。

### 設定の出発点

**つやのあるプラスチック：** Metallic 0、Roughness 0.2から試します。

**つやを抑えた面：** Metallic 0、Roughness 0.8から試します。

**磨いた金属：** Metallic 1、Roughness 0.15から試し、IBLなど反射する環境も用意します。

これらの数値だけで特定の素材を完全に再現できるわけではありません。模様や細かな凹凸は[テクスチャ](./textures.md)で加えます。

## 一つだけ色を変える

**同じマテリアルを使うEntityは、変更がまとめて反映されます。** Inspectorの使用箇所を確認してから編集してください。

一つだけ変える場合は、新しいマテリアルを作り、そのEntityにだけ割り当てます。Entityを複製しただけでは、マテリアルが独立するとは限りません。

## 質感が変わらないとき

まず**Stop**していること、編集したマテリアルを対象に割り当てたこと、変更したいスロットを選んだことを確認します。

それでも違いが分かりにくい場合は、表示モードを**シーン**に戻し、ライトやIBLを確認します。**Unlit**が有効なマテリアルはライトの影響を受けません。

## 基本の次に進む

模様は[テクスチャ](./textures.md)、ガラスや半透明は[透明な素材](./transparent-materials.md)、ClearcoatやIridescenceは[マテリアルの拡張](./material-extensions.md)で扱います。最初からすべての項目を変更する必要はありません。
