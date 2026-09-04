# XRift Studio 対応範囲と段階

設計は [ビジュアルエディター設計](./VISUAL_EDITOR_ARCHITECTURE.md) に置く。この文書は、その設計のどこまでが実際に動き、各段階を何をもって完了とするかを示す。

## 目標

World / Item の作成から Upload までを、XRift Studio だけで進められる制作環境にする。素材の取り込み、Scene 編集、Play、保存、検査、XRift 向け変換を含む。

Visual project はコードを隠す画面ではなく、Scene、Asset、Material、Prefab などの型付きデータを正本として保存する。Classic export CLI は、その制作データを通常の XRift コードプロジェクトへ一方向に引き渡す。

## 状態の定義

| 状態 | 意味 |
| --- | --- |
| **利用可能** | デスクトップ版の主要導線に接続している。 |
| **検証中** | 実装はある。対応データや実機での受け入れを続けている。 |
| **開発版** | repository 内では動く。配布物としては提供していない。 |
| **計画中** | 仕様または実装順序を整理している段階だ。 |

## 制作領域ごとの対応状況

| 制作領域 | 状態 | できること |
| --- | --- | --- |
| Visual project | 利用可能 | World / Item の作成、保存、再読込、autosave、reference validation。 |
| Scene編集 | 利用可能 | Hierarchy、Scene View、Inspector、Assets、選択、transform、親子関係、複製、削除、Undo / Redo。 |
| Model import | 利用可能 | GLB、自己完結 glTF、OBJ、VRM 0.x / 1.x をそのまま Model Asset として取り込む。FBX、COLLADA、STL、PLY、USD、Rhino 3DM など Three.js Editor が読む形式は取り込み時に自己完結 GLB へ変換する。変換後は同じ経路に載せる。対応形式の正本は `asset-format-registry.ts` の `ASSET_FORMATS.model` だ。 |
| Avatar pose | 利用可能 | 取り込んだボーンの XYZ 回転と shape key の値を Entity ごとに保存する。保存した値を Scene View と生成コードへ反映する。 |
| Model Animation 再生 | 利用可能 | Animation を含む GLB / glTF を配置したときは Animation Component を追加する。選択した clip を Play と生成物で再生する。Autoplay、Loop、再生速度は Inspector と MCP から設定する。 |
| Texture / Material | 利用可能 | PNG、JPG、WebP、AVIF、GIF、BMP、SVG、KTX2 を取り込む。PBR Material、slot binding、alpha、描画順、thumbnail を編集する。Classic import では静的に検査できる ShaderMaterial を変換する。Texture uniform と mesh 別 variant を保った Custom Material にする。 |
| Audio | 利用可能 | MP3 / WAV / Ogg / FLAC / AAC / WebM を Audio Asset として取り込む。Audio Source へ割り当てる。割り当てた内容を Scene と生成物へ保存する。 |
| Lighting | 利用可能 | Directional / Point / Spot / Area の Light を配置する。色、強度、影、距離を設定する。公式シェーダーの陰影も Scene の Light で付ける。Light が無い Scene も既定光で表示する。 |
| 色味の調整 | 利用可能 | 露出、コントラスト、彩度などを一つの compositor で調整する。既定ではオフにしている。 |
| Terrain authoring | 利用可能 | Create メニューから高さサンプル Terrain を追加する。Inspector または MCP の Raise / Lower / Flatten / Smooth / Hole ブラシで編集する。草を層で塗る。Scene の Wind で揺らす。static Trimesh Collider、Play、compile、runtime manifest には同じ Terrain を渡す。 |
| 空と水 | 利用可能 | GLSL で描く Skybox Shader と水面 Material を公式カタログから追加する。Uniform values で調整する。どちらも Scene の Wind と Light を共通入力にする。 |
| 外部リソース | 利用可能 | Poly Haven と ambientCG の CC0 素材、XRift 公式の Shader / Terrain / 照明 / Component をアプリ内から追加する。作者とライセンスは Asset と生成物に記載する。 |
| 表現と再利用 | 利用可能 | Primitive、Material、Particle、Prefab、Collider、XRift Component を作成・配置する。 |
| Interactivity | 利用可能 | KHR_interactivity 準拠のグラフをノードエディターで編集する。開始時・毎フレーム・イベント・インタラクトをきっかけに動かす。待機、順次実行、繰り返し、合流、分岐、変数、算術は単一の実行エンジンで動かす。Play と公開先のどちらでも同じく実行する。Entity の表示、Transform、Animation、Material、Particle、Audio Source、Light、Scene の露出とフェードへ書き込む。1 つの Asset に複数のグラフを置く。イベントで結合する。時間軸のタイムラインで、何秒に何が起きるかを確認する。canonical JSON と validation を UI と MCP で共有する。 |
| Scripting | 検証中 | Script Asset を TypeScript で書く。Script Component として Entity へ付ける。property と reference を宣言して Play で実行する。未承認 source は内容 hash の確認を経てから実行する。同じ Script を公開ワールドへ静的 import として出力する。対応範囲は [Scripting Contract](./SCRIPTING.md) に記載する。 |
| Play | 利用可能 | 編集データと分離した Play Window で Play / Stop する。World は公式プレイヤー（Rapier の重力・Collider・一人称 controller・掴み・クロスヘアのインタラクト）で確認する。Item は単体表示を確認する。Transform / Collider / Animation 変更は対象 Entity だけ再実行する。runtime 受け入れは続けている。 |
| Compile / Upload | 利用可能 | Visual document の保存、検査、XRift 向け TSX 生成、staging、World / Item の Upload 導線を扱う。生成コードは公開テンプレートと同じ tsc で検査する。 |
| Open Brush | 検証中 | Open Brush / Tilt Brush 由来の glTF を判定する。`three-icosa` でブラシ表現を読み込む。ブラシごとの受け入れ確認を続けている。 |
| Unity import | 検証中 | UnityPackage、`.unity`、`.prefab` を解析する。対応する Scene、Prefab、Model、Texture へ変換する。Unity 固有機能の完全互換は扱っていない。 |
| AI connection | 検証中 | アプリ内の接続パネルから MCP server を登録する。Scene 読取・編集の限定 tool を呼び出す。sidecar 同梱を含む配布確認を続けている。 |
| Classic source graph から Visual への取り込み | 開発版 | local folder または HTTPS / git SSH Repository を検査する。World / Item entry から `src` の relative import を再帰解決する。静的 R3F、Rapier、XRift Component、Model / Texture / Audio、Skybox、ShaderMaterial をコード実行なしで lossy 変換する。確定前 review と確定後 Play へ接続する。`group`、wrapper、local Component の親子境界を維持する。動的分岐 / collection は診断対象にする。 |
| Visual から通常開発への書き出し | 開発版 | project JSON と Assets 一式を指定する。Runtime JSON 付きの新規 Classic project へ安全に書き出す。 |
| Animation timeline | 計画中 | ボーンと shape key の keyframe、再生、補間、clip 保存、XRift runtime への出力を扱う。時間軸に沿った演出の組み立ては Interactivity のグラフ側で行う。 |

## 対応範囲の境界

ここに挙げるものは、設計上の未対応であり不具合ではない。UI でも同じ内容を表示する。

- OBJ の外部 MTL / Texture は disk 上から自動探索しない。同じ import batch に含めた分だけ解決する。
- sidecar を参照する glTF / OBJ は依存ファイルを同じ import batch へ含めたときだけ自己完結 GLB へ正規化する。単体で選んだ場合は不足依存として止まる。
- VRM の静的ポーズは保存できる。keyframe、clip、補間、timeline 編集は扱っていない。
- Model Animation は clip 選択、Autoplay、Loop、再生速度に対応する。開始タイミングの指定、複数 clip の同時再生、clip 間の遷移は扱っていない。
- Interactivity のきっかけは開始時、毎フレーム、イベント受信、インタラクトの四つだ。視線や近接に反応するトリガーは無い。視線や近接への反応は XRift Component または Scripting と組み合わせる。
- Interactivity から次の Scene へ進むことはできない。compiler は entry scene だけを変換する。遷移の受け皿が公開側にない。`event/send` で名前付きイベントを送るところまでを扱う。
- Interactivity の実行エンジンは operation 単位で実装する。未対応 operation は canonical JSON に保持したまま no-op になる。その node と、そこから先の flow は実行されない。対象と理由は Editor と公開側の診断に同じ内容で出す。glTF Object Model pointer を解決する host がまだない。`pointer/*` は未対応として扱う。
- Skybox Shader は Scene View には描画しない。編集中の背景は単色のままだ。見え方は Play で確認する。
- Unity 固有 Component、Shader、Script、Animation を完全には移植しない。対応内容と未対応内容は import 前に示す。
- Open Brush は brush ごとの描画差の検証を続けている。通常の Material override とは扱いを分ける。
- Script の Play はアプリと同一 realm で動く。module scope の遮蔽は緩和だ。完全な sandbox ではない。
- Web プレビューは制作体験のデモだ。ローカルファイル操作、CLI 実行、Upload はデスクトップ版だけで行う。

## 段階

| Phase | 到達点 | 状態 | 次の完了条件 |
| --- | --- | --- | --- |
| 1 | Visual document 基盤 | 利用可能・継続改善 | migration fixture と参照修復を増やす。旧 project も決定的に開ける。 |
| 2 | Editor shell / command | 利用可能・継続改善 | 複数選択、検索、shortcut 設定、panel restore を実用水準にする。 |
| 3 | Asset import | 利用可能・検証中 | sidecar 付き glTF、reimport 差分、欠落参照、Open Brush、Unity import の実データ受け入れを完了する。 |
| 4 | Material / Texture / Audio | 利用可能・継続改善 | Inspector、thumbnail、Scene View、生成コードの見え方と音を一致させる。 |
| 5 | XRift Component / Play | 利用可能・検証中 | World の character、静的 Collider、spawn、camera と Item preview を実 runtime で受け入れる。動的 Rigid Body と XRift Component adapter は未完了警告を維持する。 |
| 6 | Save / Compile / Upload | 利用可能・堅牢化中 | 診断元への移動、認証、再試行、staging provenance、正式 result 表示を一つの流れにする。 |
| 7 | Static avatar pose | 利用可能・継続改善 | humanoid 名、一般 bone、shape key の保存、再読込、生成コードを fixture と実 VRM で一致させる。 |
| 8 | 環境表現（Terrain / 空 / 水 / 光） | 利用可能・継続改善 | 草の密度と LOD、Wind の共有、公式シェーダーの陰影を大規模 Scene で受け入れる。 |
| 9 | Interactivity | 利用可能・検証中 | canonical graph の編集、検証、保存を行う。未対応 operation の表示を Editor と公開側でそろえる。ノードバッジ・レシピ一覧・Diagnostics と公開側の compile diagnostics に同じ内容を出す。`event`、`flow`、`variable`、`animation`、`math`、`type`、`XRIFT_studio_interaction` の operation を単一エンジンで実行する。8 種の対象へ書き込む。Scene 遷移と `pointer/*` の host は未対応として残す。 |
| 10 | Scripting | 利用可能・検証中 | Script Asset、Script Component、承認 gate、Play 実行、静的 import 出力までを接続している。実 XRift runtime で Play と公開の挙動一致を受け入れる。[Scripting Contract](./SCRIPTING.md) が未対応とする typed loader、pointer / player 参照、非同期例外の帰属に対応する。 |
| 11 | Animation authoring | 計画中 | timeline 上で bone / shape key keyframe を編集・再生し、clip として保存できる。 |
| 12 | Classic export UI / CLI / Runtime | 開発版 | Editor からの既存 Classic 追加と CLI は公開時と同じ `classic-jsx` ソースを書き出す。公式テンプレートの依存関係だけでビルドできる。dependency plan、dry-run、衝突検知、Asset / decoder / font copy、provenance は実装している。Runtime JSON はブラウザ版アップロードの shell 専用だ。`xrift-studio-runtime` の npm 公開は未完了だ。 |
| 13 | Production readiness | 計画中 | 大規模 Scene 性能、accessibility、失敗回復、security、release checklist を満たす。 |

## 通常の XRift 開発へ渡す CLI

Visual project の manifest または project root を指定する。新しい XRift Classic project へ一方向に書き出す。

```bash
xrift-studio convert ./my-visual-project --to classic --out ./my-xrift-world
```

repository 内では公開時と同じ TypeScript / R3F ソースの書き出し、dry-run、未改変 export の update を扱う。Visual Editor から既存 Classic project を選ぶ導線まで接続している。書き出し先では公式テンプレートの依存関係だけで `npm install` と `npm run dev` が通る。Runtime JSON と `xrift-studio-runtime` の npm 公開は [Visual Project Classic Export CLI](./VISUAL_PROJECT_MIGRATION_CLI.md) に記載する。

## 次に満たす条件

1. Open Brush、UnityPackage、OBJ、VRM を実データで受け入れる。保存後の再読込と compile まで一致させる。
2. Model 再 import へ別 source 選択、sidecar 付き glTF、変更差分、消失 slot 参照一覧を追加する。
3. VRM / skinned model の静的ポーズを実機で磨く。timeline 用の pose / clip data contract を先に固定する。
4. AI connection の認証境界、timeout、sidecar 同梱、失敗後の再接続を release 環境で確認する。
5. `xrift-studio-runtime` の Audio、Particle、動的 Rigid Body、XRift 固有 Component adapter を追加する。Classic と Editor Preview の結果を一致させる。静的 Collider / Spawn Point は実 runtime へ接続している。
6. Interactivity へ Scene 遷移と `pointer/*` を解決する host を追加する。書き込み対象は Transform、Animation、Material、Particle、Scene まで接続している。未対応 operation の表示は Editor と公開で一致する。
7. Material、Play、XRift Component、Upload を同じ Visual document から通しで受け入れる。

## 完了判定

ファイルや button の存在だけでは完了としない。各機能は、実データによる操作、保存後の再読込、Undo / Redo、失敗時の復帰、compiler 出力まで一致した時に完了とする。CLI 移植の完了条件には、dry-run の内容が決定的であること、手書きファイルを既定で上書きしないこと、同じ入力を再実行しても不要な差分を出さないことを含める。
