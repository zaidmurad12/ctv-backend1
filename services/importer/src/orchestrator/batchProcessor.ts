/**
 * Processes `items` with at most `concurrency` handlers in flight at once,
 * preserving each result's original index. A shared cursor (rather than
 * chunking into fixed-size batches) keeps every worker busy even when
 * individual items take very different amounts of time.
 */
export async function processInBatches<T, R>(
  items: readonly T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await handler(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
