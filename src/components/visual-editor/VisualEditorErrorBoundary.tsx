import {
  Component,
  Fragment,
  createRef,
  type ReactNode,
} from "react";
import {
  Library,
  PanelsTopLeft,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

export type VisualEditorErrorBoundaryProps = {
  children: ReactNode;
  onBack: () => void;
  featureName?: string;
  projectName?: string;
  backLabel?: string;
};

type VisualEditorErrorBoundaryState = {
  failed: boolean;
  resetKey: number;
};

/**
 * Isolates render failures to the visual editor route.
 * Exception messages, stacks, component stacks, and local paths are never
 * rendered into the recovery UI.
 */
export class VisualEditorErrorBoundary extends Component<
  VisualEditorErrorBoundaryProps,
  VisualEditorErrorBoundaryState
> {
  state: VisualEditorErrorBoundaryState = {
    failed: false,
    resetKey: 0,
  };

  private readonly headingRef = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(): Partial<VisualEditorErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(): void {
    // Keep development diagnostics free of authoring data and local paths.
    console.error("[VisualEditor] A render failure was isolated.");
  }

  componentDidUpdate(
    _previousProps: VisualEditorErrorBoundaryProps,
    previousState: VisualEditorErrorBoundaryState,
  ): void {
    if (!previousState.failed && this.state.failed) {
      this.headingRef.current?.focus();
    }
  }

  private readonly resetEditor = (): void => {
    this.setState((current) => ({
      failed: false,
      resetKey: current.resetKey + 1,
    }));
  };

  render(): ReactNode {
    const {
      backLabel = "プロジェクトライブラリへ戻る",
      children,
      featureName = "ビジュアルエディター",
      onBack,
      projectName,
    } = this.props;

    if (!this.state.failed) {
      return <Fragment key={this.state.resetKey}>{children}</Fragment>;
    }

    return (
      <main
        className="flex min-h-screen items-center justify-center bg-zinc-50 px-5 py-10 text-zinc-900"
        role="alert"
        aria-live="assertive"
      >
        <section className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-7 shadow-[0_18px_55px_rgba(24,24,27,0.08)] sm:p-9">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <TriangleAlert size={22} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">
                Visual Editor
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-500">
                <PanelsTopLeft size={15} strokeWidth={1.8} aria-hidden="true" />
                {featureName}
              </p>
            </div>
          </div>

          <h1
            ref={this.headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight text-zinc-950 outline-none"
          >
            {featureName}を表示できませんでした
          </h1>
          {projectName ? (
            <p className="mt-2 text-sm font-medium text-zinc-700">
              対象プロジェクト: {projectName}
            </p>
          ) : null}
          <p className="mt-4 text-sm leading-7 text-zinc-600">
            制作データはそのまま保持されています。Editorの表示を再試行するか、前の画面へ戻ってプロジェクトを開き直してください。
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={this.resetEditor}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              <RotateCcw size={17} strokeWidth={1.9} aria-hidden="true" />
              Editorを再試行
            </button>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            >
              <Library size={17} strokeWidth={1.9} aria-hidden="true" />
              {backLabel}
            </button>
          </div>

          <p className="mt-6 border-t border-zinc-100 pt-5 text-xs leading-5 text-zinc-500">
            同じ状態が続く場合は、一度前の画面へ戻ってからEditorを開き直してください。
          </p>
        </section>
      </main>
    );
  }
}
