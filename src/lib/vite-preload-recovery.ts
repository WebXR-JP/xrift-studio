const PRELOAD_RECOVERY_STORAGE_KEY =
  "xrift-studio:vite-preload-recovery-at";
const PRELOAD_RECOVERY_COOLDOWN_MS = 15_000;

function readLastRecoveryAt(): number {
  try {
    const storedValue = window.sessionStorage.getItem(
      PRELOAD_RECOVERY_STORAGE_KEY,
    );
    const parsedValue = storedValue ? Number(storedValue) : 0;
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  } catch {
    return 0;
  }
}

function rememberRecoveryAt(recoveryAt: number): boolean {
  try {
    window.sessionStorage.setItem(
      PRELOAD_RECOVERY_STORAGE_KEY,
      String(recoveryAt),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Recovers once when Vite can no longer serve a dynamically imported module.
 * A second failure inside the cooldown is allowed to reach the existing error
 * boundary so an unavailable server cannot cause an automatic reload loop.
 */
export function installVitePreloadRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    const recoveryAt = Date.now();
    const lastRecoveryAt = readLastRecoveryAt();
    if (recoveryAt - lastRecoveryAt < PRELOAD_RECOVERY_COOLDOWN_MS) {
      return;
    }

    if (!rememberRecoveryAt(recoveryAt)) {
      return;
    }

    event.preventDefault();
    window.location.reload();
  });
}
