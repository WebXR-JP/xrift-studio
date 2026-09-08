# 画面に出てくる用語

画面に表示される名前を、そのまま検索できるようにまとめています。すべて覚えてから使い始める必要はありません。

## Entity

シーンに配置したもの。床、モデル、ライトなどを指します。[配置の操作](./objects.md)へ進みます。

## Hierarchy

配置したEntityの一覧と親子関係を表示するパネル。[画面の見方](./editor-basics.md)へ進みます。

## Inspector

選んだEntityや素材の設定を編集するパネル。何を選んでいるかによって表示が変わります。

## Assets

モデル、画像、音声、マテリアルなどを管理するパネル。素材がここにあることと、シーンに配置されていることは別です。

## Component・Components

Entityに追加する個別の機能がComponent、追加メニューはAdd Componentです。音源、ライト、衝突判定などがあります。

## マテリアル・テクスチャ

**マテリアル**は表面の色や反射を決める素材、**テクスチャ**は色や凹凸などに使う画像です。[マテリアル](./materials.md)と[テクスチャ](./textures.md)で分けて説明しています。

## Base Color・Metallic・Roughness

Base Colorは色、Metallicは金属かどうか、Roughnessは反射のぼけ方を調整します。[三つの基本設定](./materials.md)へ進みます。

## Normal Map

陰影で細かな凹凸を表す画像です。形状の輪郭や衝突判定は変えません。[テクスチャの説明](./textures.md#normal-mapで細かな凹凸を表す)へ進みます。

## Skybox・IBL

Skyboxは背景、IBLは環境画像を照明や反射に使う設定です。[空と照明の違い](./sky-and-water.md#背景と照明を分けて設定する)へ進みます。

## Emissive・Bloom

Emissiveは表面自体の明るさ、Bloomは明るい部分をにじませる画面効果です。周囲を照らすライトとは別です。[光の設定](./lighting.md#emissiveとbloomの違い)へ進みます。

## Collider・Spawn Point

Colliderは衝突判定、Spawn Pointはプレイヤーの開始位置です。[歩ける床](./collision.md)へ進みます。

## プレハブ・ノードグラフ

プレハブはEntityの組み合わせを再利用する素材、ノードグラフは処理を線でつなぐ仕組みです。[プレハブ](./prefabs.md)と[仕掛け](./interactivity.md)へ進みます。

## Play・Stop

Playは動作確認の開始、Stopは編集へ戻る操作です。[Playの使い方](./play-mode.md)へ進みます。
