import { analyzePublishReview, type PublishReviewRequest, type PublishReviewResponse } from "./publish-review";

self.onmessage = ({ data }: MessageEvent<PublishReviewRequest>) => {
  let response: PublishReviewResponse;
  try {
    response = { result: analyzePublishReview(data) };
  } catch {
    // Compiler errors may contain local paths; only send a safe failure state.
    response = { failed: true };
  }
  self.postMessage(response);
};
