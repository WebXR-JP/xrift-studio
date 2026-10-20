# ワールド制作の実行経路

Studio内の制作チャットは[Pi SDKによるStudio制作](./CHATGPT_AUTHORING.md)を使います。旧一括JSONプランと独自ハーネスは廃止しました。

外部MCPクライアント向けの`begin_world_authoring`、`review_world_authoring`、`complete_world_authoring`は引き続き正式ツールです。作品に保存した設計図・上限・保存結果・撮影・完成条件を検証します。この外部クライアント用の実行記録は、Studio内のPiループへ重ねません。

ツールと権限の契約は[MCP Editor tools](./MCP_EDITOR_TOOLS.md)を参照してください。
