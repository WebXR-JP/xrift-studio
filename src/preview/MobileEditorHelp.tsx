import { useEffect, useRef } from "react";
import { useEditorDevice } from "../components/visual-editor/useEditorDevice";

/** Mounted inside Suspense, so the editor is present before the introduction. */
export function MobileEditorHelp({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { viewportHeight } = useEditorDevice();
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => dialog.current?.showModal());
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      dialog.current?.close();
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby="mobile-editor-help-title"
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-black/20"
    style={{ maxHeight: viewportHeight ? viewportHeight - 32 : "calc(100dvh - 2rem)" }}
    onKeyDown={(event) => event.stopPropagation()}
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <h2 id="mobile-editor-help-title" className="text-base font-semibold">スマホでの編集操作</h2>
    <p className="mt-3 text-sm leading-6">シーン内のEntityをタップして選択し、Inspectorで位置や色などを調整できます。Hierarchy・Assets・Inspectorは画面を切り替えて開き、「シーン」を選ぶと3D表示に戻ります。</p>
    <p className="mt-2 text-sm leading-6">3D画面では、1本指のドラッグで視点を回転、2本指のドラッグで移動、ピンチ操作で拡大・縮小できます。</p>
    <p className="mt-2 text-sm leading-6">編集内容はブラウザに自動保存されます。「ファイル」の「プロジェクトを書き出す」から.xriftstudioファイルを保存すれば、iPadやパソコンへ引き継ぐこともできます。</p>
    <button type="button" autoFocus onClick={onClose} className="mt-4 min-h-11 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">編集を始める</button>
  </dialog>;
}
