# ビジュアルエディターの概要

ビジュアルエディターでは、コードを書かずに、視覚的に Scene を組み立ててワールドやアイテムを制作できます。制作データは型付きデータとして保存され、そのまま XRift 向けのコードへ変換して公開できます。

## 画面の構成

ビジュアルエディターは、次のパネルで構成されています。

| パネル | 役割 |
| --- | --- |
| **Hierarchy** | Scene 内の Entity をツリーで一覧表示し、選択・親子関係の整理・複製・削除を行います。 |
| **Scene View** | 3D ビュー。Entity を配置し、ギズモで移動・回転・拡縮します。 |
| **Inspector** | 選択した Entity や Asset の設定を編集します。 |
| **Assets** | プロジェクト内の Asset（Model、Texture、Material、Particle、Prefab、Script など）を管理します。 |
| **Create メニュー** | Scene へ Entity や Component を追加します。 |

## 基本用語

- **Entity**: Scene 内のオブジェクト。Transform（位置・回転・スケール）を持ち、Component を追加できます。
- **Component**: Entity に機能を追加する部品。Mesh、Light、Audio Source、Collider、Script などがあります。
- **Asset**: プロジェクトで再利用できる素材。Model、Texture、Material、Particle、Prefab、Script などがあります。
- **Prefab**: Entity とその子階層を再利用可能な Asset にしたもの。

## 基本操作

### Entity を追加する

1. **Create メニュー** を開きます。
2. 次のいずれかを選びます。

| 項目 | 説明 |
| --- | --- |
| **Empty Entity** | Transform だけを持つ整理用の Entity |
| **Primitive** | Box、Sphere、Plane などの基本形状 |
| **地形** | ブラシで形を整えられる高さマップ |
| **XRift Component** | XRift 向けの配置済み機能と Component |
| **Component** | Light、Audio、Particle などの専用 Entity を作成、または選択中の Entity へ追加 |

### Entity を選択する

Hierarchy または Scene View で Entity をクリックして選択します。選択すると Inspector に設定が表示されます。

### Entity を移動・回転・拡縮する

Scene View で Entity を選択し、**ギズモ**を使って調整します。ギズモのモード（移動・回転・拡縮）を切り替えられます。

### Entity を複製・削除する

Hierarchy で Entity を右クリック（またはメニュー）して、複製・削除を行います。Undo／Redo にも対応しています。

### 親子関係を整理する

Hierarchy で Entity をドラッグして、別の Entity の下に移動できます。親子関係は、複数の Entity をまとめて扱うのに便利です。

## Inspector で設定する

選択した Entity の Component を Inspector で編集します。主な設定は次のとおりです。

- **Transform**: 位置、回転、スケール
- **Mesh Renderer**: メッシュ、マテリアル、影の設定
- **Light**: 光の種類、色、強度、距離
- **Audio Source**: 音声、音量、ループ
- **Collider**: 衝突判定の形状とサイズ
- **Rigid Body**: 物理挙動
- **Script**: Script Component のプロパティと参照

## Assets パネルで管理する

Assets パネルでは、プロジェクト内の Asset を管理します。

- **Asset の追加**: ファイルをドラッグ＆ドロップ、またはインポートメニューから追加します。
- **Asset の配置**: Asset を Scene View へドラッグして配置します。
- **Asset の編集**: Asset を選択して Inspector で編集します。
- **Asset の管理**: 名前変更、削除、フォルダ整理を行います。

詳しくは [3D 素材の取り込み](./importing-assets.md) と [アセットと表現](./assets-and-materials.md) を参照してください。

## 保存

`Ctrl/⌘ + S` で保存します。ビジュアルプロジェクトは自動保存（autosave）にも対応しています。

## 次のステップ

- [3D 素材の取り込み](./importing-assets.md)
- [アセットと表現（Texture / Material / Particle）](./assets-and-materials.md)
- [地形と衝突判定](./terrain-and-colliders.md)
- [Entity に振る舞いを与える（Scripting）](./scripting.md)
- [Play で動作を確認する](./play-mode.md)
