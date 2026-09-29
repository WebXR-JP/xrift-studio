import { tauri } from "../lib/tauri";
import { useToast } from "./Toast";

/** Keep browser user gestures and report desktop opener failures. */
export function useExternalLink(): (url: string) => void {
  const toast = useToast();
  return (url) => {
    void tauri.openUrl(url).catch((error: unknown) => {
      toast({ kind: "error", title: "リンクを開けませんでした", description: String(error) });
    });
  };
}
