import { EDITOR_ICONS } from "./editor-icons";
import { SlidersHorizontal } from "lucide-react";

export function EditorUtilityRail({ sceneSettingsOpen, onToggleSceneSettings, onOpenSettings, onOpenChatgpt, touch }: {
  sceneSettingsOpen: boolean;
  onToggleSceneSettings: () => void;
  onOpenSettings?: () => void;
  onOpenChatgpt?: () => void;
  touch?: boolean;
}) {
  return <nav aria-label="エディターのヘルプと設定" className="editor-utility-rail flex shrink-0 items-center gap-0.5 bg-editor-surface p-1">
    {onOpenChatgpt ? <button type="button" aria-label="ChatGPTを開く" title="ChatGPTのタブを開く" onClick={onOpenChatgpt}
      className={`flex ${touch ? "size-11" : "size-8"} items-center justify-center rounded-md text-editor-muted hover:bg-editor-subtle hover:text-editor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`}>
      <EDITOR_ICONS.ai size={17} strokeWidth={1.8} aria-hidden="true" />
    </button> : null}
    {onOpenSettings ? <button type="button" aria-label="設定" title="XRift Studioの設定を開く" onClick={onOpenSettings}
      className={`flex ${touch ? "size-11" : "size-8"} items-center justify-center rounded-md text-editor-muted hover:bg-editor-subtle hover:text-editor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400`}>
      <EDITOR_ICONS.settings size={17} strokeWidth={1.8} aria-hidden="true" />
    </button> : null}
    <button type="button" aria-label={sceneSettingsOpen ? "シーン設定を閉じる" : "シーン設定を開く"}
      title={sceneSettingsOpen ? "シーン設定を閉じる" : "シーン設定を開く"} aria-pressed={sceneSettingsOpen} onClick={onToggleSceneSettings}
      className={`flex ${touch ? "size-11" : "size-8"} items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${sceneSettingsOpen ? "bg-brand-600 text-white" : "text-editor-muted hover:bg-editor-subtle hover:text-editor-text"}`}>
      <SlidersHorizontal size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  </nav>;
}
