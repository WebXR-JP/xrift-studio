import { TimerQueue, type PendingTimer } from "./timer-queue.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Timer queue: ${message}`);
}

export function runTimerQueueFixtureAssertions(): void {
  const queue = new TimerQueue();
  const reference = new Map<number, PendingTimer>();
  let state = 42;
  let nextId = 1;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const earliest = () => [...reference.values()].sort((a, b) => a.dueAt - b.dueAt || a.id - b.id)[0];

  // Compare mixed insertion, cancellation, and extraction against a simple
  // independently sorted model, including removing non-root heap entries.
  for (let i = 0; i < 6000; i++) {
    const operation = random() % 10;
    if (operation < 5) {
      const timer = { id: nextId++, dueAt: random() % 31, node: random() % 17, socket: "done" };
      queue.push(timer);
      reference.set(timer.id, timer);
    } else if (operation < 7) {
      const id = random() % nextId;
      queue.remove(id);
      reference.delete(id);
    } else if (operation === 7) {
      const node = random() % 17;
      queue.removeNode(node);
      for (const [id, timer] of reference) if (timer.node === node) reference.delete(id);
    } else {
      const expected = earliest();
      assert(queue.pop()?.id === expected?.id, "extraction disagreed with deadline and creation order");
      if (expected) reference.delete(expected.id);
    }
    assert(queue.size === reference.size, "cancelled entries still occupy the queue");
    assert(queue.peek()?.id === earliest()?.id, "earliest timer changed after a mixed operation");
  }
  queue.clear();
  assert(queue.size === 0 && queue.peek() === undefined && queue.pop() === undefined, "clear must release all pending work");

  let deadlineReads = 0;
  for (let id = 1; id <= 2000; id++) {
    queue.push({ id, node: id % 10, socket: "done", get dueAt() { deadlineReads++; return 2001 - id; } });
  }
  for (let id = 2000; id > 0; id--) assert(queue.pop()?.id === id, "reverse deadlines were not sorted");
  assert(deadlineReads < 200000, `queue read ${deadlineReads} deadlines for 2000 insertions and removals`);
  queue.push({ id: 1, node: 1, dueAt: Infinity, socket: "done" });
  queue.push({ id: 2, node: 1, dueAt: Infinity, socket: "done" });
  queue.removeNode(1);
  assert(queue.size === 0, "far-future cancellation must immediately release capacity");
}
