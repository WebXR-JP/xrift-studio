# 地形と衝突判定

ビジュアルエディターでは、地形（Terrain）を作成してブラシで編集したり、Entity に衝突判定（Collider）を設定したりできます。

## 地形（Terrain）

地形は、高さサンプル（heightmap）で表現されるメッシュです。ブラシで形を整えられます。

### 作成する

1. **Create メニュー** を開きます。
2. **地形** を選びます。高さサンプル Terrain が Scene に追加されます。

### 編集する

地形を選択すると、Inspector でブラシを使って編集できます。

| ブラシ | 説明 |
| --- | --- |
| **盛り上げる（Raise）** | 指定した強さで高さを上げます。 |
| **掘る（Lower）** | 指定した強さで高さを下げます。 |
| **高さを設定（Flatten / Set Height）** | 指定した高さに平らにします。 |
| **滑らかにする（Smooth）** | 高さを滑らかにブレンドします。 |
| **穴を開ける（Hole）** | 実際のランタイムメッシュに穴を開けます。 |

ブラシの半径、強さ、フォールオフを調整できます。

### 地形の設定

Inspector で次の設定を編集できます。

- **サイズ**: 幅と奥行き
- **解像度**: サンプル数
- **マテリアル**: 地形に使うマテリアル

地形は、Scene View、static Trimesh Collider、生成コードで同じ三角形を使います。

## 衝突判定（Collider）

Collider は、Entity の物理的な衝突判定を定義します。

### 初期設定

- **Primitive** には **Box Collider** が初期設定されます。
- インポートした **Model** には **Mesh Collider** が初期設定されます。

### 設定する

Collider を選択して Inspector で次の設定を編集します。

- **形状**: Box、Sphere、Capsule、Mesh など
- **Center / Half Extents**: 中心とサイズ
- **自動フィット**: メッシュに合わせて自動調整

### Rigid Body（剛体）

物理挙動を追加するには、Entity に **Rigid Body** を追加します。重力、質量、速度などを設定できます。

## 次のステップ

- [Entity に振る舞いを与える（Scripting）](./scripting.md)
- [Play で動作を確認する](./play-mode.md)
