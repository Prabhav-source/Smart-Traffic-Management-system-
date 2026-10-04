import type { JunctionId } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Binary min-heap (priority queue) for Dijkstra's algorithm
 * ---------------------------------------------------------------------------
 *
 * Written by hand rather than pulled from a library, because the assignment is
 * to demonstrate the algorithm. This is a classic array-backed binary heap with
 * sift-up / sift-down, giving O(1) push, O(log n) pop-min and O(1) peek-min.
 *
 * The heap stores `(node, priority)` pairs. Because a node's priority can be
 * improved after it was first inserted, `push` allows duplicates - the same
 * approach the textbook pseudocode uses ("insert neighbour into priorityQueue").
 * Outdated entries are detected on pop by comparing the stored priority against
 * the node's current best distance (see `dijkstra.ts`, `stale` steps).
 */
export class MinHeap {
  /** Parallel arrays keep the heap allocation-light and easy to inspect. */
  private nodes: JunctionId[] = [];
  private priorities: number[] = [];

  /** Number of live entries currently in the heap. */
  get size(): number {
    return this.nodes.length;
  }

  /** True when there is nothing left to process. */
  get isEmpty(): boolean {
    return this.nodes.length === 0;
  }

  /** Lowest-priority entry without removing it. */
  peek(): { node: JunctionId; priority: number } | null {
    if (this.nodes.length === 0) return null;
    return { node: this.nodes[0], priority: this.priorities[0] };
  }

  /** Inserts an entry in O(log n). */
  push(node: JunctionId, priority: number): void {
    this.nodes.push(node);
    this.priorities.push(priority);
    this.siftUp(this.nodes.length - 1);
  }

  /** Removes and returns the lowest-priority entry in O(log n). */
  pop(): { node: JunctionId; priority: number } | null {
    if (this.nodes.length === 0) return null;

    const node = this.nodes[0];
    const priority = this.priorities[0];
    const lastIndex = this.nodes.length - 1;

    // Move the last entry into the root, then restore the heap property.
    this.nodes[0] = this.nodes[lastIndex];
    this.priorities[0] = this.priorities[lastIndex];
    this.nodes.pop();
    this.priorities.pop();

    if (this.nodes.length > 0) {
      this.siftDown(0);
    }

    return { node, priority };
  }

  /**
   * Snapshot of the live entries, sorted by priority.
   * Only used to render the priority queue in the status panel.
   */
  toSortedArray(): Array<{ node: JunctionId; priority: number }> {
    return this.nodes
      .map((node, index) => ({ node, priority: this.priorities[index] }))
      .sort((a, b) =>
        a.priority === b.priority ? a.node.localeCompare(b.node) : a.priority - b.priority,
      );
  }

  /** Restores the heap property after inserting at `index`. */
  private siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = (current - 1) >> 1; // integer division by 2
      if (this.priorities[current] >= this.priorities[parent]) break;
      this.swap(current, parent);
      current = parent;
    }
  }

  /** Restores the heap property after replacing the root. */
  private siftDown(index: number): void {
    const length = this.nodes.length;
    let current = index;

    for (;;) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;

      if (left < length && this.priorities[left] < this.priorities[smallest]) {
        smallest = left;
      }
      if (right < length && this.priorities[right] < this.priorities[smallest]) {
        smallest = right;
      }
      if (smallest === current) break;

      this.swap(current, smallest);
      current = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const node = this.nodes[a];
    const priority = this.priorities[a];
    this.nodes[a] = this.nodes[b];
    this.priorities[a] = this.priorities[b];
    this.nodes[b] = node;
    this.priorities[b] = priority;
  }
}