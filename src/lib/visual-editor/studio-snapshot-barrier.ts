/** Wait for actual background document writers, then save one unchanged version. */
export async function prepareStableEditorSnapshot<T>(editor: {
  currentBundle(): T;
  saveNow(): Promise<string | undefined>;
  backgroundPending(): boolean;
  stillCurrent(): boolean;
}, options: { timeoutMs?: number; now?: () => number; wait?: () => Promise<void> } = {}) {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? (() => new Promise<void>(resolve => setTimeout(resolve, 25)));
  const deadline = now() + (options.timeoutMs ?? 30000);
  const timedOut = () => new Error('編集データの準備が時間内に完了しませんでした。保存状態を確認してから、もう一度会話に渡してください');
  while (true) {
    if (!editor.stillCurrent()) throw new Error('編集中の作品が切り替わりました。もう一度実行してください');
    if (now() >= deadline) throw timedOut();
    if (!editor.backgroundPending()) {
      const bundle = editor.currentBundle();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadlineReached = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(timedOut()), Math.max(0, deadline - now()));
        });
        // A late local save may finish safely, but it cannot authorize an upload.
        if (!(await Promise.race([editor.saveNow(), deadlineReached]))) throw new Error('最新の編集を保存できませんでした');
      } finally { if (timer !== undefined) clearTimeout(timer); }
      if (now() >= deadline) throw timedOut();
      if (!editor.stillCurrent()) throw new Error('編集中の作品が切り替わりました。もう一度実行してください');
      if (!editor.backgroundPending() && editor.currentBundle() === bundle) return;
    }
    await wait();
  }
}
