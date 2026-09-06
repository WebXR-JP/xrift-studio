export type PendingTimer = {
  readonly id: number;
  readonly dueAt: number;
  readonly node: number;
  readonly socket: string;
};

function precedes(left: PendingTimer, right: PendingTimer): boolean {
  return left.dueAt < right.dueAt || (left.dueAt === right.dueAt && left.id < right.id);
}

/**
 * Earliest deadline first, with creation order breaking ties. Indexed removal
 * releases cancelled timers immediately: they must not occupy the engine's
 * pending-work budget or accumulate behind a far-future deadline.
 */
export class TimerQueue {
  private readonly heap: PendingTimer[] = [];
  private readonly positions = new Map<number, number>();
  private readonly idsByNode = new Map<number, Set<number>>();

  get size(): number { return this.heap.length; }

  peek(): PendingTimer | undefined { return this.heap[0]; }

  push(timer: PendingTimer): void {
    const index = this.heap.length;
    this.heap.push(timer);
    this.positions.set(timer.id, index);
    let ids = this.idsByNode.get(timer.node);
    if (!ids) {
      ids = new Set();
      this.idsByNode.set(timer.node, ids);
    }
    ids.add(timer.id);
    this.siftUp(index);
  }

  pop(): PendingTimer | undefined {
    const timer = this.peek();
    if (timer) this.remove(timer.id);
    return timer;
  }

  remove(id: number): void {
    const index = this.positions.get(id);
    if (index === undefined) return;
    const timer = this.heap[index]!;
    const last = this.heap.pop()!;
    this.positions.delete(id);
    const ids = this.idsByNode.get(timer.node)!;
    ids.delete(id);
    if (ids.size === 0) this.idsByNode.delete(timer.node);
    if (index === this.heap.length) return;
    this.heap[index] = last;
    this.positions.set(last.id, index);
    const parent = (index - 1) >> 1;
    if (index > 0 && precedes(last, this.heap[parent]!)) this.siftUp(index);
    else this.siftDown(index);
  }

  removeNode(node: number): void {
    const ids = this.idsByNode.get(node);
    if (!ids) return;
    // Set iteration permits removing the current item.
    for (const id of ids) this.remove(id);
  }

  clear(): void {
    this.heap.length = 0;
    this.positions.clear();
    this.idsByNode.clear();
  }

  private swap(left: number, right: number): void {
    const a = this.heap[left]!;
    const b = this.heap[right]!;
    this.heap[left] = b;
    this.heap[right] = a;
    this.positions.set(a.id, right);
    this.positions.set(b.id, left);
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!precedes(this.heap[index]!, this.heap[parent]!)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    while (index * 2 + 1 < this.heap.length) {
      const left = index * 2 + 1;
      const right = left + 1;
      const child = right < this.heap.length && precedes(this.heap[right]!, this.heap[left]!) ? right : left;
      if (!precedes(this.heap[child]!, this.heap[index]!)) break;
      this.swap(index, child);
      index = child;
    }
  }
}
