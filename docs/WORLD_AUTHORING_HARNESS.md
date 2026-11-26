# ワールド制作の実行経路

Studio 内の制作チャットは [Pi SDK による Studio 制作](./CHATGPT_AUTHORING.md) を使います。旧来の一括 JSON プランと独自ハーネスは廃止しました。

外部 MCP クライアント向けの `begin_world_authoring`、`review_world_authoring`、`complete_world_authoring` は引き続き正式ツールとして提供しています。作品内に保存された設計図・上限・保存結果・撮影画像・完成条件を検証する仕組みであり、この外部クライアント用の実行記録は Studio 内の Pi ループとは別に管理します。

ツールと権限の仕様は [MCP Editor tools](./MCP_EDITOR_TOOLS.md) を参照してください。
