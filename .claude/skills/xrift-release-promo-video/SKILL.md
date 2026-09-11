---
name: xrift-release-promo-video
description: XRift Studio のリリース紹介動画を作成・編集するときに使う。差分からの企画、台本承認、実画面収録、Remotion 実装、音の調整を扱う。
---

# XRift Studio リリース紹介動画

利用者が何をできるようになったかを、対象バージョンの実画面と差分で示す。標準は1本につき更新1つ、16:9・1920×1080・30fps・約30秒。ユーザーの指定を優先する。

## 制作と承認

- 差分の抽出には `scripts/extract-release-diff.mjs --from <ref> --to <ref> --output <path>` を使う。未コミット変更を含める場合は `--worktree`。ファイルの差分まで読み、未確認の機能・性能・公開日を主張しない。
- 台本には全体の時間配分、画面内の文、操作、ポインター・ズーム、差分と素材の根拠を含め、ひとまとまりで提示する。
- `scriptApproval.status` は明示承認まで `pending`。承認後に `approved` とし、Remotion の実装・レンダリングへ進む。台本を変えたら全体を再提示して承認を得る。承認済み台本の映像・音の調整だけなら、その範囲で進める。
- 標準の流れは、0〜2秒に「XRift Studio アップデート情報」、2〜6秒に変更と利点、6〜22秒に実画面の主操作1つ、22〜27秒に結果、27〜30秒に公開状況を示す。楽曲の小節に合わせる場合は実際の尺を台本に記載する。
- 公開済みなら締めは「XRift Studio アップデート公開中」。公開前は `releaseStatus: upcoming` とし、公開済みと誤認させない。
- 実装されていない画面を架空の UI で補わない。素材が足りなければ必要な収録を明示する。表示イメージはその旨を画面に示す。
- 無音でも意味が伝わる字幕にする。ナレーションは明示依頼と承認済み台本がある場合だけ追加する。

## 必要な資料だけを読む

| 作業 | 参照 |
|---|---|
| 台本の日本語 | [short-video-copy.md](references/short-video-copy.md) |
| 雛形・実装・書き出し | [kit.md](references/kit.md) |
| JSON のフィールド | [storyboard.md](references/storyboard.md) |
| シーン・演出の指定 | [scenes.md](references/scenes.md) |
| 実画面の収録・座標取得 | [capture.md](references/capture.md) |
| BGM・効果音の調整 | [audio.md](references/audio.md) |
| キット自体の拡張 | [extending.md](references/extending.md) |

## 完了条件

承認済み台本と実画面の主張が一致し、字幕・操作対象・CTA が読めること。ポインター、クリック波紋、ズームは同じ対象へ合わせ、主操作は1つ、ズームは最大2回を基本とする。指定された縦横それぞれの静止画と通し再生で、黒画面・ちらつき・音ずれ・字幕切れを確認する。

成果物、storyboard、差分の根拠、素材の出典、未検証事項を報告する。Git に残すのは明示依頼されたソース・台本・根拠だけとし、生成動画・連番・音素材・依存ディレクトリを一緒に追加しない。対象パスを指定してステージする。公開・外部送信の判断は `AGENT.md` に従う。
