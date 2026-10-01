# 色と質感を変える

マテリアルでは、表面の色や光の反射を設定します。最初はBase Color、Metallic、Roughnessの三つから試してください。

シーンに球などを一つ置いてから始めます。Play中なら、Stopで編集に戻ってください。

![Sphere Blueを選択し、Base Colorに青色を設定した状態](./media/materials.png)

*Assetsでマテリアルを選ぶと、InspectorにBase Colorが表示されます。*

## 作って割り当てる

Assetsの追加メニューか、空いている場所の右クリックメニューで「新規マテリアル」を選んでください。作ったマテリアルを選び、InspectorでBase Colorを変えます。

次にHierarchyで色を付けたいEntityを選び、「Inspector → Mesh Renderer → マテリアル」で、作ったマテリアルを指定してください。Assetsからこの欄へドラッグしても割り当てられます。

色が変われば、割り当ては完了です。変わらない場合は、Mesh Rendererの設定を確認してください。複数のスロットがあるモデルでは、変えたい面に対応するスロットに割り当てます。

## MToon：マンガのような陰影と輪郭線を付ける

Assetsでマテリアルを選び、「Inspector → Shading → マテリアルの種類」でMToon 0.xかMToon 1.0を選んでください。明るい面の色はBase Color、暗い面の色は「MToon → Shade Color」で変えられます。輪郭線の色は「Outline → Outline Color」、太さはOutline Widthで調整します。

初期状態の輪郭線は黒色で、幅は0.003 m、つまり3 mmです。モデルの大きさに合わせて調整してください。線を消すには、「Outline Width Mode → None（なし）」を選びます。

素材のプレビューや見本カードには、斜めからのDirectional Lightと弱い環境光が使われます。Base Colorの明るい面とShade Colorの暗い面を見比べられます。シーンに割り当てたあとは、そのシーンの照明で見た目を確認してください。

MToon 0.xはVRM 0.xと互換性のある陰影、MToon 1.0は新しい方式の陰影を使います。0.xと1.0を切り替えても、色、陰影、輪郭線、テクスチャの設定は保たれます。初めてMToonに切り替えるときは、Base ColorのRGBを0.8倍した色がShade Colorに入り、Base Color MapがShade Multiply Mapにも引き継がれます。照明への反応は変わるため、切り替え後の見た目を確認してください。

見本を使う場合は、「外部から追加 → glTFマテリアル」で「MToon 0.x アウトライン」か「MToon 1.0 アウトライン」を選んでください。標準マテリアルと並べて比べ、シーンへ追加できます。

| 設定 | 値を変えたときの見え方 |
| --- | --- |
| Shading Shift | 大きくすると、明るい面が広がります。 |
| Shading Toony | 1に近づけると、陰影の境界がくっきりします。 |
| GI Equalization | 1に近づけると、環境光による明暗が均等になります。 |
| Outline Lighting Mix | 0では設定した輪郭線の色を使い、1ではライトの影響を受けた色になります。 |

同じInspectorで、次の表現も調整できます。

| 項目 | 調整できること |
| --- | --- |
| Shading Shift Map | Rチャンネルの値で、場所ごとに陰影の境界をずらします。Scaleで量を調整し、負の値にすると明暗の変化が反転します。 |
| Matcap | Matcap MapとMatcap Colorで、見る向きに応じた映り込みを加えます。 |
| Rim Lighting | 縁の色、画像、広がりを調整します。Fresnel Powerを大きくすると縁に集中し、Liftを大きくすると広い面に現れます。Lighting Mixでライトの影響を変えられます。 |
| UV Animation | 画像をX・Y方向にスクロールしたり回転したりできます。速度0で止まり、負の値では逆向きに動きます。回転速度の単位はrad/秒です。Mask MapのBチャンネルで、場所ごとの速さを変えられます。 |
| MToon Rendering | 半透明の深度書き込みと描画順を調整します。Render Queue Offsetは−9〜9で、大きいほどあとに描画されます。 |

Outline Width ModeのWorld（m）では、輪郭線の幅をモデルと同じ空間の単位で設定します。Screenでは、画面の高さに対する割合で設定します。画像で幅を変える場合は、Outline Width Multiply MapのGチャンネルを使ってください。

MToonでも「Base Color → 頂点カラーを使用」を切り替えられます。有効にすると、モデルの頂点カラーが基本色に掛け合わされます。無効にすると、頂点カラーは使われません。モデルに頂点カラーがない場合は、有効にしても見た目は変わりません。設定は保存され、Playと公開後にも反映されます。

Base Color、Alpha、Normal Map、Emissive、Double Sidedは、MToonでも使えます。半透明にするには「Alpha Mode → Blend」を選んでください。Transparent With ZWriteを有効にすると、「Rendering → Depth Write」が自動の場合に、半透明の面の深度が書き込まれます。

MToonを選んでいる間は、Metallic、Roughness、反射や透過の拡張設定が表示されません。Standard (PBR)に戻すと、保持されていたPBR設定を編集できます。もう一度MToonに切り替えると、Shade Color、輪郭線、MToon専用のテクスチャ設定も戻ります。種類の切り替えや色、幅の変更は「元に戻す」で取り消せます。

| 切り替え時に引き継ぐ設定 | 扱い |
| --- | --- |
| Base Color / Diffuseと対応する画像 | Base ColorとBase Color Mapとして保持されます。 |
| Normal・Emissiveと対応する画像 | 同じ色、強さ、画像が使われます。 |
| Alpha / Opacityと対応する画像 | Alpha Mode、Opacity Map、Channelが保持されます。 |
| テクスチャのUV・位置・拡大率・回転 | 画像ごとの設定が保持されます。 |
| Metallic・RoughnessなどPBR専用の設定 | 保持され、Standard (PBR)に戻すと使われます。 |

### 複数のマテリアルをまとめて編集する

AssetsでCtrlかShiftを使って複数のマテリアルを選んでください。「Inspector → マテリアルの一括変更 → マテリアルの種類」から、Standard (PBR)、MToon 0.x、MToon 1.0にまとめて切り替えられます。各マテリアルの色や画像の設定は保たれます。同じマテリアルを使うすべての面に反映され、一回の「元に戻す」で取り消せます。

モデルや画像を一緒に選んでいても、変更されるのはマテリアルだけです。カスタムシェーダーを使うマテリアルは、種類の一括変更から除外されます。

選んだマテリアルの種類が同じなら、Base Color、Alpha、Normal Map、Emissive、Renderingと、その種類の全設定をまとめて編集できます。MToon 0.x同士かMToon 1.0同士なら、陰影、輪郭線、Matcap、Rim Lighting、UV Animationも表示されます。種類が異なる場合は、先にそろえてください。

値が異なる項目には「一部異なる」と表示されます。変更した項目だけが、各マテリアルに反映されます。たとえばShade ColorのRだけを変えると、GとBは各マテリアルの値が保たれます。画像だけを変えてもUVは変わりません。UVの変更は、画像を割り当て済みのマテリアルに反映されます。一回の「元に戻す」で、変更をまとめて取り消せます。

[VRM 0.xやVRM 1.0を取り込んだ場合](./assets.md#vrmアバターを取り込む)も、モデルのMaterialsでマテリアルを選ぶと、同じMToonの設定を編集できます。

編集したMToonは、[.xriftstudioでの受け渡しやコードエディターへの書き出し](./save-and-open.md#バックアップする)にも含まれます。Entityだけを別の作品へ渡すには、[Hierarchyから書き出してください](./hierarchy-transfer.md#mtoonvrmモデルを渡す)。

## Base Color：色を決める

Base Colorは、非金属では表面の色、金属では反射の色を設定します。

まずMetallicを0にして、Base Colorを変えてみてください。画像を割り当てている場合は、画像の色にBase Colorが掛け合わされます。画像の色をそのまま使うには、Base Colorを白にします。

![Base Colorの色欄とRGB値](./media/materials.png "Base Color")

*RGBの右にある色の欄から変更できます。*

## Metallic：金属かどうかを決める

Metallicは金属度です。0で非金属、1で金属になります。プラスチックや塗装面は0、金属が露出した面は1から試してください。

目的の素材に合わせて値を選びます。金属が暗く見える場合は、[照明とIBL](./lighting.md#金属が暗い反射が見えない)も確認してください。

![Metallic 0、Roughness 0.5の数値とスライダー](./media/material-values.png "Metallic / Roughness")

*説明と数値を見ながら、一つずつ調整してください。*

## Roughness：反射のぼけ方を決める

Roughnessは表面の粗さです。0に近いほど反射がくっきりし、1に近いほどぼやけます。モデルの形に凹凸を付ける設定ではありません。

同じ色の球で、0.15と0.8を比べてみてください。反射する環境やライトによって見え方が変わるため、実際のシーンで調整します。

### 設定の出発点

| 作りたい表面 | 最初に試す設定 |
| --- | --- |
| つやのあるプラスチック | Metallic 0、Roughness 0.2 |
| つやを抑えた面 | Metallic 0、Roughness 0.8 |
| 磨いた金属 | Metallic 1、Roughness 0.15。IBLなど、反射する環境も用意します。 |

素材の見た目は、これらの数値に加えて画像や照明でも変わります。模様や細かな凹凸は、[テクスチャ](./textures.md)で加えてください。

## 一つだけ色を変える

マテリアルを編集すると、そのマテリアルを使うすべてのEntityに反映されます。Inspectorで使用箇所を確認してから変更してください。

一つのEntityだけを変えるには、新しいマテリアルを作って、そのEntityに割り当ててください。Entityを複製しただけでは、同じマテリアルを使い続ける場合があります。

## 質感が変わらないとき

Stopで編集に戻っているか、マテリアルを対象に割り当てているか、変えたい面のスロットを選んでいるか確認してください。

違いが分かりにくい場合は、表示モードを「シーン」に戻し、ライトとIBLを確認します。Unlitが有効なマテリアルは、ライトの影響を受けません。

## 基本の次に進む

模様は[テクスチャ](./textures.md)、ガラスや半透明は[透明な素材](./transparent-materials.md)、ClearcoatやIridescenceは[マテリアルの拡張](./material-extensions.md)で説明します。作りたい表面に合う設定から試してください。
