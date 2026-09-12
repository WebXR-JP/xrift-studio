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
    <p className="mt-3 text-sm leading-6">シーンをタップして選択し、Inspectorで位置や色を変えられます。Hierarchy・Assets・Inspectorは画面を切り替えて使います。「シーン」で3D表示へ戻れます。</p>
    <p className="mt-2 text-sm leading-6">1本指で視点を回し、2本指で移動・拡大縮小できます。</p>
    <p className="mt-2 text-sm leading-6">編集中のプロジェクトはブラウザに自動保存されます。「ファイル → プロジェクトを書き出す」で.xriftstudioファイルにまとめ、iPadやパソコンへ引き継げます。</p>
    <button type="button" autoFocus onClick={onClose} className="mt-4 min-h-11 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">編集を始める</button>
  </dialog>;
}
