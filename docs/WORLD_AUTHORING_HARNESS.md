# ワールド制作ハーネス

AI client に MCP で XRift のワールドを作らせると、何も手を打たない場合は「Terrain preset の上に草を敷き、木のレシピを複製し、草の密度や色を調整する」という形に収束する。この文書は、その原因をリポジトリの中身に照らして整理し、どの層にどんな手すり（ハーネス）を置いたか、そして何をあえてハーネスに入れなかったかを記録したものだ。手すりを足したり直したりするときは、ここで原因と対応の組み合わせを保つこと。

## 目的

目的は 2 つある。1 つは、時間を無駄にする行き詰まり（tool の偏りに流されること、画像を見ないまま直し続けること）を取り除くこと。もう 1 つは、何度も許可を求めなくてもワールドを 1 本作り切れるようにすることだ。

何を作るか、どの品質にするか、Terrain・草・ポストエフェクト・外部素材・重いモデルを使うかどうかは、設計図（blueprint）に書いて決める。ハーネスの文言は「使うな」「この順で作れ」ではなく、「使う場合は設計図のどこに理由を書くか」という形で書く。高品質を求める依頼には重い手段を使えること、軽さを求める依頼には削れること。その両方に同じ文言で対応できることが、モデルの力の測り方としても必要だ。

## ハーネスとは何か

AI エージェントは「モデル」と「ハーネス」でできている。モデルは判断と文章を作り出す。ハーネスは、モデルの周りに置く環境のすべてを指す。何を読ませるか（instructions、スキル、文書）、何を持たせるか（tool の名前・説明・引数・戻り値）、何を返すか（エラー、`note`、警告）、どこで止めるか（承認 gate）、何を見せるか（capture、metrics）、どう確かめるか（検証ループ）だ。同じモデルでも、ハーネスが違えば作るものが変わる。モデルが同じ失敗を繰り返すときは、モデルを説得するのではなく、失敗を起こしている環境の側を直す。それがハーネスの仕事だ。

XRift Studio の場合、AI client から見える世界は次の層でできている。上の層ほど毎回必ず読まれ、下の層ほど読まれるかどうかが client の設定に左右される。

| 層 | 場所 | 読む相手 |
| --- | --- | --- |
| MCP server の `instructions` | `src-tauri/src/mcp.rs` | 接続したすべての client が最初に読む |
| tool の名前・説明・引数 | `src-tauri/src/mcp.rs` の `tool_definitions()` | すべての client。tool を選ぶ根拠になる |
| tool の戻り値（`note`、`harness` 警告） | `src/lib/visual-editor/mcp-editor-tools.ts` と React shell | 呼び出した直後に読む |
| カタログの中身（preset、レシピ、スターター） | `terrain-presets.ts`、`scene-recipe-catalog.ts`、`starter-templates.ts` | 一覧系の tool を呼んだときに読む |
| スキル | `.agents/skills/`、`.claude/skills/` | このリポジトリで動く client だけが読む |
| 文書 | `docs/`、`AGENT.md`、`docs/wiki/` | 人と、探しに来た client が読む |
| 検証の道具 | `capture_scene_view`、`capture_scene_debug`、Play | 使うよう指示されたときだけ使う |

利用者のプロジェクトで動く client が読むのは、上の 4 層だけだ。だから制作の手順は instructions と description に書き、スキルはその詳しい版として置く。

## 原因

同じ MCP でワールドを 10 件ほど作らせると、大半が Terrain preset の上に草を敷き、木のレシピを複製し、草の密度・色・高さを何度も往復する形になった。独創性が出ず、時間の多くが草の調整に使われる。原因は次の 9 つだ。

### 1. tool の数が Terrain と草に偏っている

`mcp-tool-registry.ts` の 127 tool のうち、Terrain と草の tool は 14 本ある（`get_terrain`、`sample_terrain_point`、`list_terrain_presets`、`create_terrain`、`create_terrain_from_preset`、`apply_terrain_surface`、`sculpt_terrain`、`update_terrain`、草 6 本）。それに対して、床や壁を作る `create_primitive` は 1 本、出来合いのセットは `list_scene_recipes` と `apply_scene_recipe` の 2 本しかない。tool 一覧は client にとって「できることの地図」なので、地図の 1 割が地形なら、地形が世界の中心に見えてしまう。

### 2. description が Terrain を出発点として売っていた

`list_terrain_presets` の説明は「create_terrain only makes a flat plate; these are what a shaped, planted, textured Terrain starts from」、`create_terrain_from_preset` は「already sculpted and planted」と書いていた。`docs/MCP_EDITOR_TOOLS.md` も「create_terrain が作るのは平らな板で、出発点としては間違っている」と書く。どれも Terrain を使う前提で「平らな板より preset」を勧めており、「そもそも Terrain を使うかどうか」の分岐がなかった。一方で `create_primitive` の説明は 1 文だけで、床・壁・舞台の材料になることが書かれていなかった。

### 3. Terrain preset はすべて草付きで、風景しかない

`terrain-presets.ts` の 8 preset（草原、なだらかな丘、谷、乾いた台地、島、尾根、湖のくぼ地、砂丘）はすべて屋外の風景で、それぞれ既定の草セットを持っている。`create_terrain_from_preset` は `grassPresetId` を省くと草を敷くため、「地形を置く＝草が生える」が既定になっていた。

### 4. スキルが土台を固定していた

旧 `.agents/skills/xrift-vegetation-upgrade/SKILL.md` は、発動条件に「新規プロジェクトの録画制作で自然物が絡む場合」を含み、工程 0 で `create_terrain_from_preset` → `apply_terrain_surface` → `apply_terrain_grass_preset` → 木のレシピを「土台」として指示していた。さらに「検証ループ（自律改善）」として Blender と `capture_scene_view` の往復を促していた。植生をよくするためのスキルが、ワールド全体の出発点を決めてしまっていた。

### 5. 構想を決める工程がどこにもなかった

`AGENT.md` と各スキルは Studio 自体の開発手順で、ワールドを「作る」側の手順は書かれていなかった。MCP の instructions も revision、承認 gate、Script の手順など仕組みの説明だけで、「何を作るか」には触れていなかった。手順がないとき、モデルは学習データの平均に戻る。3D ワールドの平均は「地形と木と草」だ。

### 6. スターターが屋外の板だった

`starter-templates.ts` の新規 world は 8 × 8 m の地面の板、太陽、スポーンから始まる。屋外の板を見た client は、それを Terrain に置き換えるのが自然な次の一手だと考えてしまう。

### 7. 草は手応えを感じやすく、調整が止まらなくなる

`capture_scene_view` で撮ると、草は画面の大半を占める。密度や色を 1 つ変えれば必ず絵が変わり、「進んだ」ように見える。看板やライトを 1 つ置くより、草を 1 回いじるほうが変化が大きい。評価が「前より変わったか」であるかぎり、草の調整は止まらない。

### 8. 木の供給がなかった

「木」レシピは幹と葉の塊 3 つの 1 モデルで、`note` も「複製して大きさと向きを変えて」と書いている。Poly Haven の木は写真スキャンで、もっとも軽い `tree_small_02` でも 40 万三角形、`pine_tree_01` は 1,700 万三角形あり、Web ワールドには入れられない。よい木がほしい client は Blender で作るしかなく、そこで時間を使ってしまう。

### 9. 外部モデルの重さが見えなかった

`search_external_assets` の結果に三角形数がなく、client は重さを知らないまま取り込むか、怖がって使わないかのどちらかになっていた。Poly Haven には軽い CC0 モデルも多く、家具・小物・岩・低木はここで足りる。

## 対応

### instructions と description（`src-tauri/src/mcp.rs`）

- `instructions` の先頭に制作の手順を置いた。内容は、設計図（用途、雰囲気、品質の水準、地面の種類、主役、入れないもの、予算、確認せずに決めた前提）を先に書くこと、許可を求めずに進めること、Terrain・草・ポストエフェクト・外部素材・重いモデルを使うかどうかは設計図が決めること、行き詰まりを避ける順番（土台 → 主役 → 空と光 → 小物 → 検証）だ。動き・繰り返し・生成的な構造は Script で作る。完了報告の前に、スポーン位置と iso の `capture_scene_view` を撮る。
- `create_primitive` を「ブロックアウトの道具」として説明し直した。床・壁・舞台・浮遊構造の材料であること、初期の灰色の Material のまま出荷しないことを書いた。
- `list_terrain_presets`、`create_terrain_from_preset`、`create_terrain` に「選ぶ基準」と「行き詰まりやすい点」、それから `grassPresetId: null` で草なしにできることを書いた。
- `apply_terrain_grass_preset`、`list_terrain_grass_types`、`update_terrain_grass_layer` に「草をどれだけ使うかは設計図が決める」「調整は画像に映った欠点から始める」を書いた。回数の上限は書かない。`update_scene_settings` にも、ポストエフェクトを使うかどうかは設計図の品質の水準で決め、有効にする前後の画像で判断する旨を書いた。
- `search_external_assets` と `install_external_asset` に、モデルの種類、`polycount` と `dimensionsMm` を自分の予算と見比べること、Poly Haven の木が重い理由を書いた。
- `place_asset` に、原点と床の高さの合わせ方、複製するときに向きと大きさをばらつかせることを書いた。

### 戻り値（`src-tauri/src/external_store.rs`、`src/lib/tauri.ts`）

Poly Haven の一覧 API が返す `polycount` と `dimensions` を `ExternalStoreAsset` に載せ、`search_external_assets` の結果にそのまま出す。重さを見てから取り込めるようにした。

### 連続編集の警告（`src/lib/visual-editor/mcp-harness-guard.ts`）

同じ種類（Terrain、草、同じ Entity の位置、同じ Material、Scene 設定）の書き込みが、`capture_scene_view` を挟まずに 3 回続いたら、tool の戻り値に `harness` を付けて警告し、画像を撮って見直すよう促す。書き込み自体は止めない。数え方はセッション内のメモリだけで行い、project には何も保存しない。これはハーネスの中で唯一の数値で、「画像を見ないまま直し続ける」という行動だけを止める。何回まで直してよいかは決めない。

### スキル

- `.agents/skills/xrift-world-direction/` を新設した。設計図の書式、行き詰まりを避ける工程の順番、画像を見てから直す作法、完成の確かめ方、素材の入手先の並列な一覧、Script の使いどころを持つ。テーマ、床の種類、素材の候補一覧、入手先の順位付け、数値の上限、コードの雛形は持たない。案は原則 1 つに絞り、過去のワールドは参照しない。`.claude/skills/` に同じものを置いた。
- `.agents/skills/xrift-vegetation-upgrade/` を廃止した。木や形が必要なら、既存の `xrift-mcp-blender-modeling` と `xrift-blender-world` の作法で Blender MCP からその場で作る。

### 文書

- `AGENT.md` に 3 点を足した。ワールドを作る作業は設計図から始めること。tool の description には「何をするか」に加えて「選ぶ基準」「使ったあと何をするか」「行き詰まりやすい点」を書くこと。ハーネスに数値の上限とコードの雛形を入れないこと。
- `docs/wiki/ai-connection.md` に、利用者向けの頼み方を足した。
- `docs/MCP_EDITOR_TOOLS.md` に、description と instructions の役割分担、`harness` 警告、外部モデルの三角形数の扱いを足した。

## ハーネスに入れないもの

| 入れないもの | 理由 |
| --- | --- |
| 数値の上限（回数、ライト数、三角形数） | 適切な値はモデルの性能と特性で変わる。上限は設計図の予算として作る側が自分で決め、ハーネスは「決めたか」「守ったか」だけを見る |
| コードの雛形（Blender の生成スクリプト、Script のサンプル） | 今のモデルの癖が固定され、次のモデルもそれに引っ張られる。形と動きはその場で設計する |
| テーマ、床の種類、素材の候補一覧 | 候補を並べると AI もユーザーもその中から選ぶようになり、選択肢が狭まる |
| 過去のワールドの記録と比較 | ハーネスは状態を持たずに保つ。判断材料は今の依頼文、今の Scene、今の画像だけにする |
| 複数案の提示と選択の工程 | 案は原則 1 つに絞って作り、設計図を最初の報告に入れて途中で直せるようにする |
| 「使うな」「この順で」の文言 | 選択を禁じたり入手先に順位を付けたりすると、ハーネスが表現の上限になる。依頼文が決めることと、行き詰まりの気づき方だけを書く |
| 途中の許可要求 | ユーザーにしかできない承認・ログイン・公開だけお願いし、それ以外は前提に書いて進める |

## 運用の決まり

- tool を足す・直すときは、「何をするか」に加えて「選ぶ基準」「使ったあと何をするか」「行き詰まりやすい点」を description に書く。代わりになる tool があるなら名前を挙げる。
- カタログを足すときは、種類の偏りを見る。自然物を 1 つ足したら、屋内・都市・抽象の側にも 1 つ足せないかを考える。
- モデルの失敗を見つけたら、モデルへの説得（プロンプトの強調）ではなく、失敗を起こしている層を直す。description の一文、戻り値の警告、スキルの順番、カタログの偏りの順に疑う。
- 上の「ハーネスに入れないもの」を、便利さのために入れ直さない。値や雛形を入れたくなったら、その値や雛形をモデルが自分で決められるようにする方法を先に考える。

## まだやっていないこと

- 屋内・都市・抽象のセット（レシピ）を足す。`docs/WORLD_CONTENT_PLAN.md` の B に並ぶ候補のうち、建物と家具の側を優先する。
- 空 preset に合わせた Light preset（`WORLD_CONTENT_PLAN.md` の A-2）。空だけ変えて光が残る事故を tool 側で止める。
- 設計図を project metadata として保存し、`get_editor_context` で返す。今はスキルの作法として記録に残すだけで、client をまたいで引き継げない。
- 木と岩をまく Scatter Component（`WORLD_CONTENT_PLAN.md` の C-6）。
