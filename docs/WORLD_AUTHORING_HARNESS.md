# ワールド制作ハーネス

AI client が MCP で XRift のワールドを作るとき、何も手当てをしないと「草原の Terrain、木のレシピ、
草の調整」へ収束する。この文書は、その原因をこのリポジトリの中身で裏付け、どの層にどの手すり
(ハーネス) を置いたか、そして何をあえてハーネスに入れないかを記録する。手すりを足す・直すときは、
ここで原因と対応の対を保つ。

## 目的

このハーネスは支援型である。子どもが大きく育つ環境を整えるのと同じで、目的は伸びる力を
縛らずに、伸びを妨げるものを取り除くことにある。具体的には 2 つ。時間を溶かす罠 (ツールの偏りに
流される、見ずに直し続ける) を除くことと、許可を何度も求めずに 1 本のワールドを最後まで作り
切れるようにすること。何を作るか、どの品質にするか、Terrain・草・ポストエフェクト・外部素材・
重いモデルを使うかは、依頼を読んでモデルが決める。文言は「使うな」「この順で」ではなく「依頼が
決める。罠はこれ」の形で書く。高品質を求める依頼にはその手段を使えること、軽さを求める依頼には
削れること、その両方に同じ文言で応えられることが、モデルの力を測る場としても要る。

## ハーネスとは何か

AI エージェントは「モデル」と「ハーネス」でできている。モデルは判断と文章を生む。ハーネスは、
モデルの周りに置く環境の全部を指す。何を読ませるか (instructions、スキル、文書)、何を持たせるか
(tool の名前・説明・引数・戻り値)、何を返すか (エラー、`note`、警告)、どこで止めるか
(承認 gate)、何を見せるか (capture、metrics)、どう確かめるか (検証ループ)。同じモデルでも、
ハーネスが違えば作るものが変わる。モデルが同じ失敗を繰り返すときは、モデルを説得するのではなく、
失敗を起こす環境の側を直す。それがハーネスの仕事である。

XRift Studio の場合、AI client から見える世界は次の層でできている。上ほど毎回必ず読まれ、下ほど
読まれるかどうかが client の設定に依る。

| 層 | 場所 | 誰が読むか |
| --- | --- | --- |
| MCP server の `instructions` | `src-tauri/src/mcp.rs` | 接続した全 client が最初に読む |
| tool の name / description / schema | `src-tauri/src/mcp.rs` の `tool_definitions()` | 全 client。tool を選ぶ根拠 |
| tool の戻り値 (`note`、`harness` 警告) | `src/lib/visual-editor/mcp-editor-tools.ts` と React shell | 呼んだ直後に読む |
| カタログの中身 (preset、レシピ、スターター) | `terrain-presets.ts`、`scene-recipe-catalog.ts`、`starter-templates.ts` | 一覧 tool を呼んだときに読む |
| スキル | `.agents/skills/`、`.claude/skills/` | このリポジトリで動く client だけ |
| 文書 | `docs/`、`AGENT.md`、`docs/wiki/` | 人と、探しに来た client |
| 検証の道具 | `capture_scene_view`、`capture_scene_debug`、Play | 使うよう促されたときだけ |

利用者のプロジェクトで動く client は、上の 4 層しか読まない。だから制作の工程は instructions と
description に入れ、スキルはその詳細版として置く。

## 観察

同じ MCP で 10 件ほどワールドを作らせると、大半が Terrain preset の上に草を敷き、木のレシピを
複製し、草の密度・色・高さを何度も往復する形になった。独創性が出ず、時間の多くが草に使われる。

## 原因

### 1. tool の語彙が Terrain と草に偏っている

`mcp-tool-registry.ts` の 127 tool のうち、Terrain と草の tool は 14 本ある (`get_terrain`、
`sample_terrain_point`、`list_terrain_presets`、`create_terrain`、`create_terrain_from_preset`、
`apply_terrain_surface`、`sculpt_terrain`、`update_terrain`、草 6 本)。対して、床や壁を作る
`create_primitive` は 1 本、出来合いのセットは `list_scene_recipes` と `apply_scene_recipe` の
2 本である。tool 一覧は client にとって「できることの地図」なので、地図の 1 割が地形なら、
地形が世界の中心に見える。

### 2. description が Terrain を「出発点」として売っている

`list_terrain_presets` は「create_terrain only makes a flat plate; these are what a shaped, planted,
textured Terrain starts from」、`create_terrain_from_preset` は「already sculpted and planted」と
書いていた。`docs/MCP_EDITOR_TOOLS.md` も「create_terrain が作るのは平らな板で、出発点としては
間違っている」と書く。どれも Terrain を使う前提で「平らな板より preset」を勧めており、
「そもそも Terrain を使うか」は問うていなかった。一方 `create_primitive` の説明は 1 文で、
床・壁・舞台の材料だとは書いていなかった。

### 3. Terrain preset は全て草付きで、風景しかない

`terrain-presets.ts` の 8 preset (草原、なだらかな丘、谷、乾いた台地、島、尾根、湖のくぼ地、砂丘)
は全て屋外の風景で、それぞれ既定の草セットを持つ。`create_terrain_from_preset` は
`grassPresetId` を省くと草を敷く。「地形を置く = 草が生える」が既定になっていた。

### 4. スキルが土台を固定していた

旧 `.agents/skills/xrift-vegetation-upgrade/SKILL.md` は、発動条件に「新規プロジェクトの録画制作で
自然物が絡む場合」を含み、工程 0 で `create_terrain_from_preset` → `apply_terrain_surface` →
`apply_terrain_grass_preset` → 木のレシピを「土台」として指示していた。さらに「検証ループ
(自律改善)」として Blender と `capture_scene_view` の往復を促していた。植生を良くする目的の
スキルが、ワールド全体の出発点を決めていた。

### 5. コンセプトを決める工程がどこにも無い

`AGENT.md` と各スキルは Studio 自体の開発ルールで、ワールドを「作る」側の工程は書いていなかった。
MCP の instructions は revision、承認 gate、Script の手順など機構の説明だけで、「何を作るか」に
触れていなかった。工程が無いとき、モデルは学習データの平均に戻る。3D ワールドの平均は
「地形と木と草」である。

### 6. スターターが屋外の板

`starter-templates.ts` の新規 world は 8 × 8 m の地面の板、太陽、スポーンから始まる。屋外の
板を見た client は、それを Terrain へ置き換えるのを自然な一手だと考える。

### 7. 草はフィードバックループの報酬になりやすい

`capture_scene_view` で撮ると、草は画面の大半を占める。密度や色を 1 つ変えれば必ず絵が変わり、
「進んだ」ように見える。看板やライトを 1 つ置くより、草を 1 回いじる方が変化量が大きい。
評価が「前より変わったか」であるかぎり、草の調整は止まらない。

### 8. 木の供給が無い

「木」レシピは幹と葉の塊 3 つの 1 モデルで、`note` も「複製して大きさと向きを変えて」と言う。
Poly Haven の木は写真スキャンで、最も軽い `tree_small_02` でも 40 万三角形、`pine_tree_01` は
1,700 万三角形あり、Web ワールドに入れられない。良い木が欲しい client は Blender で作るしかなく、
そこで時間を使う。

### 9. 外部モデルの重さが見えなかった

`search_external_assets` の結果に三角形数が無く、client は重さを知らずに install するか、
恐れて使わないかのどちらかになる。Poly Haven には軽い CC0 モデルも多く、家具・小物・岩・低木は
ここで足りる。

## 対応

### instructions と description (`src-tauri/src/mcp.rs`)

- `instructions` の先頭に制作工程を置いた。設計図 (用途、ムード、品質の水準、地面の種類、
  主役、入れないもの、予算、聞かずに決めた前提) を先に書き、許可を求めずに進める。Terrain、草、
  ポストエフェクト、外部素材、重いモデルを使うかは設計図が決めると明記し、時間を溶かす罠を
  名指しする。罠を避ける順番として土台 → 主役 → 空と光 → 小物 → 検証を示す。動き・繰り返し・
  生成的な構造は Script で作る。完了報告の前にスポーン位置と iso の `capture_scene_view` を撮る。
- `create_primitive` を「ブロックアウトの道具」として説明し直し、床・壁・舞台・浮遊構造の
  材料であること、灰色の既定 Material のまま出荷しないことを書いた。
- `list_terrain_presets`、`create_terrain_from_preset`、`create_terrain` に「何が決め手か」と「罠」と、
  `grassPresetId: null` で草無しにできることを書いた。
- `apply_terrain_grass_preset`、`list_terrain_grass_types`、`update_terrain_grass_layer` に
  「草がどれだけ大事かは設計図が決める」「調整はフレームに写った欠陥から始める」を書いた。
  回数の上限は書かない。`update_scene_settings` にも、ポストエフェクトを使うかは設計図の品質の
  水準が決め、有効前後のキャプチャで判断することを書いた。
- `search_external_assets` と `install_external_asset` に、モデルの種類、`polycount` と
  `dimensionsMm` を自分の予算と照らすこと、Poly Haven の木が重い理由を書いた。
- `place_asset` に、原点と床の高さの合わせ方と、複製の yaw・scale をばらすことを書いた。

### 戻り値 (`src-tauri/src/external_store.rs`、`src/lib/tauri.ts`)

Poly Haven の一覧 API が返す `polycount` と `dimensions` を `ExternalStoreAsset` に載せ、
`search_external_assets` の結果へそのまま出す。重さを見てから入れられる。

### 連続編集の警告 (`src/lib/visual-editor/mcp-harness-guard.ts`)

同じ分類 (Terrain、草、同じ Entity の Transform、同じ Material、Scene 設定) の書き込みが、途中で
`capture_scene_view` を挟まずに 3 回続いたら、tool の戻り値に `harness` を付けて警告し、
撮って見直すよう促す。書き込み自体は拒否しない。数え方はセッション内のメモリだけで、
project には何も保存しない。これはハーネスの中で唯一の数値で、「見ずに直し続ける」という
行動だけを止める。何回まで直してよいかは決めない。

### スキル

- `.agents/skills/xrift-world-direction/` を新設した。設計図の書式、罠を避ける工程の順番、
  見てから直す作法、完了の確かめ方、素材の調達先の並列な一覧、Script の使いどころを持つ。
  テーマ、床の種類、素材の候補一覧、調達先の順番、数値の上限、コードの雛形は持たない。案は 1 つに
  絞り、過去のワールドは参照しない。
- `.agents/skills/xrift-vegetation-upgrade/` を廃止した。木や形が必要なら、既存の
  `xrift-mcp-blender-modeling` と `xrift-blender-world` の作法で Blender MCP からその場で作る。
- `.claude/skills/` へ同じものを置いた。

### 文書

- `AGENT.md` に、ワールドを作る作業は設計図から始めること、tool の description には
  「何が決め手か」「次に何をするか」「はまりやすい罠」を書くこと、ハーネスに数値の上限とコードの雛形を
  入れないことを足した。
- `docs/wiki/ai-connection.md` に、利用者向けの頼み方を足した。
- `docs/MCP_EDITOR_TOOLS.md` に、description と instructions が担う役割、`harness` 警告、外部
  モデルの三角形数の扱いを足した。

## ハーネスに入れないもの

| 入れないもの | 理由 |
| --- | --- |
| 数値の上限 (回数、ライト数、三角形数) | 適切な値はモデルの性能と特性で変わる。上限はモデルが設計図で自分の予算として決め、ハーネスは「決めたか」「守ったか」だけを見る |
| コードの雛形 (Blender の生成スクリプト、Script のサンプル) | 今のモデルの癖が固定され、次のモデルもそれに引っ張られる。形と動きはその場で設計する |
| テーマ、床の種類、素材の候補一覧 | 候補を並べると AI もユーザーもその中から選ぶようになり、選択肢を狭める |
| 過去のワールドの記録と比較 | ハーネスはステートレスに保つ。判断材料は今の依頼、今の Scene、今のフレームだけ |
| 複数案の提示と選択の工程 | 案は 1 つに絞って作り、設計図を最初の報告に入れて途中で直せるようにする |
| 「使うな」「この順で」の文言 | 選択を禁じたり調達先を順位付けしたりすると、ハーネスが表現の上限になる。依頼が決めることと、罠の気づき方だけを書く |
| 途中の許可要求 | ユーザーにしかできない承認・ログイン・公開だけ依頼し、他は前提を書いて進める |

## 運用の決まり

- tool を足す・直すときは、「何をするか」に加えて「何が決め手か」「使ったあと何をするか」「はまりやすい罠」を
  description に書く。代替の tool があるなら名前を挙げる。
- カタログを足すときは、種類の偏りを見る。自然物を 1 つ足したら、屋内・都市・抽象の側にも
  1 つ足せないかを考える。
- モデルの失敗を見つけたら、モデルへの説得 (プロンプトの強調) ではなく、失敗を起こしている
  層を直す。description の一文、戻り値の警告、スキルの順番、カタログの偏り、の順に疑う。
- 上の「ハーネスに入れないもの」を、便利さのために入れ直さない。入れたくなったら、その値や
  雛形をモデルが自分で決められるようにする方法を先に考える。

## まだやっていないこと

- 屋内・都市・抽象のセット (レシピ) を足す。`docs/WORLD_CONTENT_PLAN.md` の B に並ぶ候補の
  うち、建物と家具の側を優先する。
- 空 preset に合わせた Light preset (`WORLD_CONTENT_PLAN.md` の A-2)。空だけ変えて光が
  残る事故を tool 側で止める。
- 設計図を project metadata として保存し、`get_editor_context` で返す。今はスキルの
  作法としてログに残すだけで、client を跨いで引き継げない。
- 木と岩を撒く Scatter Component (`WORLD_CONTENT_PLAN.md` の C-6)。
