# 体験に合わせたワールド設備

画面共有、アバター確認、受付など、集まった人がすることから設備を選ぶ。交流・共同作業・発表では ScreenShareDisplay の採用を最初に検討する。必要ないと判断したら、用途に基づく理由を設計図へ残す。利用頻度の順位や固定の寸法をすべてのワールドに当てはめない。

| 体験 | 公式 Component | 配置で決めること |
| --- | --- | --- |
| 画面を見せながら会話・共同作業・発表 | ScreenShareDisplay | 客席と立ち見の範囲、発表者と操作位置、画面を横切らない通路 |
| アバター確認・鏡の前での交流 | Mirror | 複数人の居場所、反射面の向き、客席や入口との分離 |
| イベント受付で役割や興味を選択 | TagBoard | 見つけやすい受付、待機列、用途に合うタグとタイトル |
| 動画を一緒に見る | VideoScreen、VideoPlayer、LiveVideoPlayer | 映像の種類、必要な同期、客席と音の届き方 |
| 入室・会場間の移動 | SpawnPoint、Portal | 安全な床、案内の見え方、目的地への通路 |

TagBoard は参加者がタグを選ぶための部品だ。場所に任意のマーカーを付ける TagMarker として扱わない。追加の機能が必要なら既存の公式定義を確認してから設計する。

## 配置する

1. 設計図に採用する設備と利用場所を記録し、`list_component_definitions` の `worldComponents` で既存設備と公式定義を確認する。
2. `place_builtin_prefab` で配置し、応答の `componentId` と `placementGuidance` を読む。`get_entity_components` で Transform と Component の値を確認する。
3. `update_transform` で表示面を利用者へ向け、寸法と高さを調整する。Transform と Component の位置・回転を二重に適用しない。Prefab の編集可能なプロパティは `prefabEditablePropertyNames` にある。保護された寸法や反射設定を個別に指定したい場合は、`create_empty_entity` と `add_component` で通常の公式 Component を作り、`update_component` の `patch.properties` で設定する。
4. 壁面や自立フレームに収め、周囲と素材・余白を揃える。表示面や操作UIに飾りを重ねない。画面共有は映像比率で高さが変わるので、床・天井・枠との余白を確保する。
5. 観客の前列・後列・端、操作位置、受付から撮影する。必要な視点はワールドの用途に合わせて選ぶ。追加の `capture_scene_view` には `authoringView` を付けず、スポーンと俯瞰の登録を保持する。
6. 共有開始・表示・停止、タグ選択、アバターの反射など、採用した設備の動作を対応環境で確かめる。複数人への配信や同期は複数クライアントで確認する。ログイン等が必要なら未検証箇所を明記し、確認可能な配置作業を先に終える。

`instances` は文書にある公式 Component の一覧で、無効な親の下にある部品も区別する。未展開 Prefab や Script 内の描画は含まない。件数だけでは使える配置か、動作するかは判断できない。再開時は `get_world_authoring` の設計図と最新の `worldComponents` を見比べる。
