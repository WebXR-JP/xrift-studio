import type { NativeRoomCapabilities } from "./native-room";

export type RoomImportDevice = "quest" | "pico" | "other";
export type RoomImportFeedback = { title: string; action: string; details: string };

/** A runtime name helps choose instructions; it never proves headset support. */
export function roomRuntimeGuidance(capabilities: NativeRoomCapabilities, device: RoomImportDevice): string {
  if (device === "pico") return "PICO 4 Ultra＋PICO Connectからの部屋取得は現在未対応です。通常のシーン編集はそのまま使えます。";
  if (capabilities.available) return "部屋取得に必要な機能を確認しました。ヘッドセットの接続・許可・保存済みの部屋は、取り込み時に確認します。";
  if (device === "quest") return "PCのMeta接続アプリで、MetaのOpenXR Runtimeと空間データの利用設定を確認し、接続を確認し直してください。SteamVR経由でも同じ機能が必要です。";
  return "現在のOpenXR Runtimeには部屋取得に必要な機能がありません。接続アプリの対応状況を確認してください。";
}

/** Preserve diagnostics for reporting while keeping the next action readable. */
export function roomImportErrorFeedback(cause: unknown, device: RoomImportDevice): RoomImportFeedback {
  const details = cause instanceof Error ? cause.message : String(cause);
  const message = details.replace(/^Error:\s*/, "");
  const code = message.split(":", 1)[0];
  const feedback = (title: string, action: string) => ({ title, action, details });
  if (code === "UNSUPPORTED_PLATFORM") return feedback("Windows版で利用できます", "この部屋取り込みはWindows版のXRift Studioで開いてください。");
  if (code === "LOADER_UNAVAILABLE" || /ERROR_RUNTIME_UNAVAILABLE/.test(message)) return feedback("OpenXRの接続環境を確認できませんでした", "PCの接続アプリを起動し、使用するOpenXR Runtimeを確認してから「接続を確認し直す」を押してください。");
  if (code === "UNSUPPORTED_RUNTIME") return feedback("現在の接続環境では部屋を取得できません", device === "quest" ? "PCのMeta接続アプリでOpenXR Runtimeと空間データの利用設定を確認してください。" : "接続アプリの部屋取得への対応状況を確認してください。PICO Connectからの部屋取得は現在未対応です。");
  if (/ERROR_FORM_FACTOR_UNAVAILABLE|ERROR_SESSION_NOT_RUNNING/.test(message)) return feedback("ヘッドセットを確認してください", "PCとの接続を確認し、ヘッドセットを装着して接続アプリの画面を開いてから、もう一度取り込んでください。");
  if (code === "NO_ROOM") return feedback("保存済みの部屋を取得できませんでした", device === "quest" ? "Linkを切断し、Quest本体でRoom Setupと空間データの利用許可を確認してから、PCへ接続し直してください。" : "ヘッドセット側の部屋設定と空間データの利用許可を確認して、接続し直してください。");
  if (code === "TIMEOUT") return feedback("部屋の取得を完了できませんでした", "ヘッドセットを装着し、PCとの接続・空間データの利用許可・部屋設定を確認してから、もう一度取り込んでください。");
  if (["SESSION_STOPPED", "SESSION_LOST", "RUNTIME_LOST"].includes(code) || /ERROR_SESSION_LOST|ERROR_INSTANCE_LOST/.test(message)) return feedback("ヘッドセットとの接続が終了しました", "PCの接続アプリで接続し直し、「接続を確認し直す」を押してください。");
  if (code === "REFERENCE_SPACE_UNAVAILABLE") return feedback("床の位置を確認できませんでした", "ヘッドセット本体で床の高さと境界を設定してから、もう一度取り込んでください。");
  if (code === "REFERENCE_SPACE_CHANGED") return feedback("取得中に基準位置が変わりました", "位置合わせを終えてから、もう一度取り込んでください。");
  if (/ERROR_PERMISSION_INSUFFICIENT/.test(message)) return feedback("空間データの利用が許可されていません", "ヘッドセットとPCの接続アプリで空間データの利用許可を確認してから、もう一度取り込んでください。");
  if (code === "GRAPHICS_ERROR") return feedback("ヘッドセット用の描画環境を準備できませんでした", "PCの接続アプリでヘッドセットが使えることを確認してください。改善しない場合は、下の詳細を確認してください。");
  if (["DATA_LIMIT", "INVALID_DATA"].includes(code)) return feedback("取得した部屋データを取り込めませんでした", "データの大きさや形状に問題があります。下の詳細を確認してください。");
  if (code === "BUSY") return feedback("別の接続確認・取り込みが進行中です", "進行中の処理が終わってから、接続を確認し直してください。");
  // Local importer errors already explain saving, scene changes and invalid geometry.
  if (!/^[A-Z_]+:/.test(message)) return feedback(message, "内容を確認してから、もう一度取り込んでください。");
  return feedback("部屋の取り込みを続けられませんでした", "接続環境を確認して再試行してください。改善しない場合は、下の詳細を確認してください。");
}
