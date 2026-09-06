import { useEffect, useState } from "react";
import type { PublishReviewRequest, PublishReviewResponse, PublishReviewResult } from "./publish-review";

type CompletedReview = {
  request: PublishReviewRequest;
  result?: PublishReviewResult;
  failed?: boolean;
};

/** Never compile during render. Each immutable snapshot owns a cancellable worker. */
export function usePublishReview(request: PublishReviewRequest | null) {
  const [completed, setCompleted] = useState<CompletedReview | null>(null);
  useEffect(() => {
    if (!request) {
      setCompleted(null);
      return;
    }
    let active = true;
    let worker: Worker | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const finish = (response: PublishReviewResponse) => {
      if (!active) return;
      active = false;
      clearTimeout(deadline);
      worker?.terminate();
      setCompleted({ request, ...response });
    };
    // Let the dialog paint, and coalesce metadata typing before cloning the scene.
    const start = setTimeout(() => {
      try {
        worker = new Worker(new URL("./publish-review.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }: MessageEvent<PublishReviewResponse>) => finish(data);
        worker.onerror = (event) => {
          event.preventDefault();
          finish({ failed: true });
        };
        worker.onmessageerror = () => finish({ failed: true });
        deadline = setTimeout(() => finish({ failed: true }), 120_000);
        worker.postMessage(request);
      } catch {
        finish({ failed: true });
      }
    }, 120);
    return () => {
      active = false;
      clearTimeout(start);
      clearTimeout(deadline);
      worker?.terminate();
    };
  }, [request]);

  // Effects run after render: never expose an older snapshot as ready meanwhile.
  const current = request && completed?.request === request ? completed : null;
  return { checking: Boolean(request && !current), result: current?.result, failed: current?.failed ?? false };
}
