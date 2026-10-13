/** Run a bounded number of independent tasks and preserve the input order. */
export async function mapWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  limit: number,
  transform: (input: Input, index: number) => Promise<Output>,
  signal?: AbortSignal,
): Promise<Output[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Concurrency must be a positive integer");
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
  const results = new Array<Output>(inputs.length);
  let nextIndex = 0;
  let failed = false;
  const worker = async () => {
    while (!failed) {
      if (signal?.aborted) {
        failed = true;
        throw new DOMException("The operation was aborted", "AbortError");
      }
      const index = nextIndex++;
      if (index >= inputs.length) return;
      try {
        results[index] = await transform(inputs[index]!, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  // Promise.all also observes failures from other workers still in flight.
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
  return results;
}
