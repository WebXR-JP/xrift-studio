# ワールド部品の追加計画

初めてのワールド制作で、最初の一時間に必要になるものを並べた計画である。設計は [ビジュアルエディター設計](./VISUAL_EDITOR_ARCHITECTURE.md)、現在の対応範囲は [対応範囲と段階](./VISUAL_EDITOR_ROADMAP.md) に従う。この文書は、そこへ何を足すかだけを扱う。

## いま置けるもの

足りないものを決める前に、すでにあるものを並べる。

| 種類 | 中身 |
| --- | --- |
| Component（Core） | Transform、Mesh Renderer、Text |
| Component（Rendering） | Ambient / Directional / Hemisphere / Point / Spot / Area Light、Particle Emitter、Animation、Wind |
| Component（Physics） | Rigid Body、Box Collider、Mesh Collider |
| Component（Media） | Audio Source、Global Audio (BGM) |
| Component（World / Scripting） | Spawn Point、Script |
| XRift 公式 Component | Interactable、Grabbable、Mirror、Skybox、VideoScreen、VideoPlayer、LiveVideoPlayer、ScreenShareDisplay、SpawnPoint、TextInput、TagBoard、EntryLogBoard、Portal、BillboardY |
| 組み込み Prefab | SpawnPoint、Mirror、EntryLogBoard、Portal、TagBoard、VideoScreen、VideoPlayer、LiveVideoPlayer、ScreenShareDisplay |
| カタログ | 空 Shader 9種、Water Shader 3種、Terrain preset 6種、Terrain 表面 preset、光る照明（色4 × 形4）、Open Brush ブラシ、Poly Haven / ambientCG の CC0 素材 |
| その他 | Terrain（高さ・穴・草・表面）、Interactivity グラフ、Custom Shader、ポストエフェクト、色味 |

## 初めて使う人がぶつかるところ

1. **空・水・地形はカタログから選ぶだけでよい。一方、それ以外は白紙から作る。** 空は 9 種から選ぶとすぐに見た目が整う。Particle は空の Asset から作る。放出量、寿命、速度、色、サイズの曲線を決めるところから始める。同じアプリの中で手順の量が大きく違う。
2. **「置くだけで見栄えがする物」がほとんどない。** 焚き火を一つ置くには、炎の Particle Asset を作り、煙をもう一つ作る。Point Light を足す。音を取り込んで Audio Source に割り当て、位置を合わせる。初めての作業はここで止まる。
3. **空を変えてもライトは合わせ直す必要がある。** 夕暮れの空の下に昼間の白いライトが残る。原因の特定が難しい。
4. **人がいるワールドの部品がない。** 座れる場所、押すと開くドア、触ると光るスイッチが例だ。Interactable と Interactivity の組み合わせで作れる。初回に組むことは少ない。
5. **音が場所にならない。** BGM と 3D 音源はある。「洞窟に入ると音が変わる」は作れない。
6. **木と岩を撒けない。** 草は Terrain のブラシで塗れる。木と岩は 1 本ずつの配置になる。
7. **天気がない。** 雨も雪も、Particle を組む以外の手段がない。

## 三つの作り方

足すものによって必要な作業量が大きく違う。最初に分けておく。

| 階層 | 内容 | 必要な作業 |
| --- | --- | --- |
| **A. カタログ preset** | 既存の仕組みへ値や GLSL を足すだけ | 値の定義とサムネイル。Registry も Inspector も変えない |
| **B. 組み込み Prefab** | 既存 Component の組み合わせを 1 件として置けるようにする | レシピ定義のみ。runtime は既存のまま |
| **C. 新しい Component** | 新しい保存 schema を持つ | schema、validation、Inspector、preview adapter、world / item compiler adapter を同じ変更で揃える（[4.7](./VISUAL_EDITOR_ARCHITECTURE.md#47-component--asset-registry)） |

A と B は既存の実装を使うため速い。

## A. カタログ preset

| ID | 名前 | 内容 | なぜ要るか |
| --- | --- | --- | --- |
| A-1 | **Particle preset カタログ**（完了） | 炎、煙、魔法、雪、紙吹雪、噴水、火花、湯気、雨、桜、蛍の 11 件。「外部から追加」へ空・水と同じ並びで置き、カードは実際の Particle を動かす | Particle だけが白紙からだった。同じ導線に乗せるだけで初回の見栄えが変わる |
| A-2 | **空に合う Light preset** | 空 preset ごとに、太陽の向き・色・強さ・環境光を揃えた 1 セット。空を追加するときに同時に適用するか選べる | 夕暮れの空に昼の白いライトが残る事故を止める |
| A-3 | **Terrain 表面 preset の追加** | 雪原、岩場、砂浜、火山 | 草地と砂漠だけでは足りない |
| A-4 | **光る照明の形を追加** | ランタン、行灯、ネオン管の文字、電球の裸吊り | 色 4 × 形 4 では部屋の表情が作れない |

## B. 組み込み Prefab

すべて既存 Component の組み合わせで、新しい runtime を必要としない。A-1 が入った後は、B-1 と B-5 の作成は値を決めるだけになる。

| カテゴリー | セット |
| --- | --- |
| 火と灯り | 焚き火、松明、かがり火、提灯、街灯、石灯籠、燭台 |
| 自然 | 木、竹林、岩場、切り株、薪の山、蛍の茂み |
| 天気 | 雪を降らせる、雨を降らせる、桜吹雪、立ちこめる霧 |
| 水 | 噴水、露天風呂 |
| 建物 | 石柱、アーチ門、階段、塀、井戸、桟橋 |
| 家具 | ベンチ、テーブルと椅子 |
| 演出 | 魔法陣、ワープの柱、雪だるま |

30 件になった時点で、カテゴリーの絞り込みが付く。分ける基準は使う Component ではなく、作りたいものである。

音は同梱音源がないため、どのセットにも含まれない。Collider も入っていない。ぶつかる・上を歩くといった扱いが必要なセットでは、その旨を追加前の note に記載する。

まだ作れていないものは次のとおりである。

| 名前 | 足りないもの |
| --- | --- |
| 看板 | Text の runtime は troika なので、カードで Text を描く経路を先に決める |
| 水辺セット | Water Shader Material を recipe から参照する仕組み |
| 入口ゲート | XRift 公式 Component（Portal / Spawn Point）を recipe の部品として扱う仕組み |

## C. 新しい Component

上から順に、初回体験への効果が大きい順に並べている。

| ID | 名前 | 何をするか | 設計の要点 |
| --- | --- | --- | --- |
| C-1 | **Audio Zone** | 範囲に入ると BGM または環境音が切り替わる。境界でクロスフェードする | 範囲は Collider ではなく Component 自身の形として持つ。Play と公開で同じ判定を使う |
| C-2 | **Weather** | ワールド全体に雨・雪・落ち葉を降らせる | Wind と同じ契約にする。シーンに一つ、強さと種類は Scene Settings、対象は Component |
| C-3 | **Trigger Zone** | 入る / 出るで Interactivity へイベントを送る | Script の `proximity-event` の宣言版。コードを書かずに扉やライトへつなぐ |
| C-4 | **Sit** | 座れる場所。座る位置と向きを持つ | 公式 Component に無い。人が集まるワールドでは必須級 |
| C-5 | **Door** | 押すと開く。開き戸・引き戸・両開き | Interactable + Animation + Interactivity の定型を 1 件にまとめる |
| C-6 | **Scatter（木と岩を撒く）** | Terrain の上へ Model をブラシで撒く。密度、傾き、大きさのばらつき | 草と同じく配置ルールを保存し、座標を持たない。草の実装を一般化する |
| C-7 | **Day / Night Cycle** | 時間で空の uniform、Light、Fog を動かす | 空 Shader の uniform を時間で駆動する。実時間ではなくワールド内時間 |
| C-8 | **Reflection Probe** | 床や水面に周囲を映す | Mirror は平面 1 枚。部屋全体の映り込みには別の仕組みが要る |

## 進め方の提案

1. ~~**A-1 Particle preset カタログ**~~ 完了。11 件を「外部から追加」へ置いた。preset の一覧は `particle-system.ts` の 1 か所のままである。Asset Inspector の Quick Tools とカタログが同じ値を読む。
2. ~~**B 組み立て済みセット**~~ 完了。「セット」provider に 30 件がある。以降の追加は `SceneRecipe` へのデータ追加だけで並ぶ。
3. 次は **C-1 Audio Zone** か **C-2 Weather** である。どちらも Wind の契約にならえる。設計を新しく起こさずに済む。C-4 Sit が入れば、ベンチ・切り株・テーブルと椅子がそのまま座れる場所になる。
4. C を一つ入れるたびに、schema・Inspector・preview・compiler の 4 点が揃っていることを確認する。確認後に作成可能にする。

各項目の作成時は、[UX 原則](./UX_PRINCIPLES.md) の手順に従う。[マイクロインタラクション Wiki](./UX_INTERACTIONS.md) へ機能 ID と状態設計を先に足す。
