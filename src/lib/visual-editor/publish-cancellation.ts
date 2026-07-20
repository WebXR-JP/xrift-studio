/**
 * Owns one upload attempt and keeps progress reporting separate from explicit
 * cancellation. Updating `cancelSafe` never aborts the active controller.
 */
export class VisualPublishCancellationController {
  private activeController: AbortController | null = null;
  private cancelSafe = false;

  get active(): boolean {
    return this.activeController !== null;
  }

  begin(): AbortController {
    if (this.activeController) {
      throw new Error("An upload attempt is already running");
    }
    const controller = new AbortController();
    this.activeController = controller;
    this.cancelSafe = true;
    return controller;
  }

  isCurrent(controller: AbortController): boolean {
    return this.activeController === controller;
  }

  update(controller: AbortController, cancelSafe: boolean): void {
    if (!this.isCurrent(controller)) return;
    this.cancelSafe = cancelSafe;
  }

  requestCancel(): boolean {
    if (!this.activeController || !this.cancelSafe) return false;
    this.activeController.abort();
    return true;
  }

  abortOnUnmount(): boolean {
    return this.requestCancel();
  }

  finish(controller: AbortController): void {
    if (!this.isCurrent(controller)) return;
    this.activeController = null;
    this.cancelSafe = false;
  }
}
