import type { Graph, JunctionId, RoadId, ShortestPathResult } from '@/types';
import { MinHeap } from './minHeap';

/**
 * ---------------------------------------------------------------------------
 * Dijkstra's Shortest Path Algorithm - trace-producing implementation
 * ---------------------------------------------------------------------------
 *
 * The algorithm is written out explicitly, with no routing library, following
 * the pseudocode from the brief:
 *
 *   Dijkstra(Graph, source):
 *       distance[source] = 0
 *       for each vertex v != source:  distance[v] = Infinity
 *                                    previous[v]  = null
 *       priorityQueue = empty
 *       insert source with priority 0
 *
 *       while priorityQueue is not empty:
 *           current = vertex with minimum distance
 *           for each neighbour of current:
 *               newDistance = distance[current] + weight(current, neighbour)
 *               if newDistance < distance[neighbour]:
 *                   distance[neighbour] = newDistance
 *                   previous[neighbour]  = current
 *                   insert neighbour into priorityQueue
 *           mark current as visited
 *
 *       return distance, previous
 *
 * Instead of returning only the final distances, every observable state change
 * is emitted as a {@link DijkstraStep}. The UI replays those steps, which keeps
 * the animation deterministic and free of interleaved async state.
 */

/** What triggered a step. Drives colour and copy in the visualisation. */
export type StepKind =
  | 'init'
  | 'select'
  | 'stale'
  | 'relax'
  | 'no-relax'
  | 'settle'
  | 'done';

/** One observable state change of the algorithm. */
export interface DijkstraStep {
  /** Zero-based position in the trace. */
  index: number;
  kind: StepKind;
  /** Short verb shown on the step badge, e.g. "Examine". */
  action: string;
  /** Junction currently being processed, if any. */
  current: JunctionId | null;
  /** Neighbour being examined (relax steps only). */
  neighbor: JunctionId | null;
  /** Road being traversed (relax steps only). */
  roadId: RoadId | null;
  /** Weight of that road. */
  weight: number | null;
  /** `distance[current] + weight(current, neighbour)`. */
  candidate: number | null;
  /** Best-known distance to every junction at this point in the run. */
  distances: Record<string, number>;
  /** `previous` pointers at this point in the run. */
  previous: Record<string, JunctionId | null>;
  /** Junctions already finalised, in settlement order. */
  settled: JunctionId[];
  /** Contents of the priority queue, sorted by priority. */
  queue: Array<{ node: JunctionId; priority: number }>;
  /** Status-panel lines, already formatted for display. */
  lines: string[];
}

/** Full trace plus the final answer. */
export interface DijkstraRun {
  source: JunctionId;
  steps: DijkstraStep[];
  result: ShortestPathResult;
}

/** Human-friendly formatting of a distance, used inside trace lines. */
function minutes(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Runs Dijkstra from `source` and records a step for every state change.
 *
 * @param graph Live weighted adjacency list.
 * @param source Junction where the emergency vehicle starts (distance 0).
 */
export function runDijkstraWithTrace(graph: Graph, source: JunctionId): DijkstraRun {
  const junctions = [...graph.keys()];

  // --- Initialisation: distance[source] = 0, everything else is Infinity. -----
  const distance = new Map<JunctionId, number>();
  const previous = new Map<JunctionId, JunctionId | null>();
  for (const junction of junctions) {
    distance.set(junction, junction === source ? 0 : Number.POSITIVE_INFINITY);
    previous.set(junction, null);
  }

  const settled: JunctionId[] = [];
  const settledSet = new Set<JunctionId>();
  const steps: DijkstraStep[] = [];
  let maxHeapSize = 0;

  const heap = new MinHeap();
  heap.push(source, 0);
  maxHeapSize = heap.size;

  const snapshot = (
    kind: StepKind,
    action: string,
    lines: string[],
    extra: Partial<DijkstraStep> = {},
  ): void => {
    steps.push({
      index: steps.length,
      kind,
      action,
      current: extra.current ?? null,
      neighbor: extra.neighbor ?? null,
      roadId: extra.roadId ?? null,
      weight: extra.weight ?? null,
      candidate: extra.candidate ?? null,
      distances: Object.fromEntries(distance),
      previous: Object.fromEntries(previous),
      settled: [...settled],
      queue: heap.toSortedArray(),
      lines,
    });
  };

  snapshot(
    'init',
    'Initialise',
    [
      `Set distance[${source}] = 0`,
      `Set every other junction to ∞ (${junctions.length - 1} of them)`,
      'Set previous[v] = null for all junctions',
      `Insert ${source} into the priority queue with priority 0`,
    ],
    { current: source },
  );

  // ---------------------------- Main loop -----------------------------------
  while (!heap.isEmpty) {
    // Step 4: select the unvisited junction with the smallest distance.
    const popped = heap.pop()!;
    const current = popped.node;
    const poppedDistance = popped.priority;

    // Lazy-deletion guard. A node is re-inserted every time its distance
    // improves, so an older, heavier entry can still be sitting in the heap.
    // The entry is only meaningful if its priority still equals the best
    // distance we know for that junction.
    if (poppedDistance > (distance.get(current) ?? Number.POSITIVE_INFINITY)) {
      snapshot(
        'stale',
        'Discard',
        [
          `Popped ${current} with outdated priority ${minutes(poppedDistance)}`,
          `distance[${current}] is already ${minutes(distance.get(current) ?? Number.POSITIVE_INFINITY)}`,
          'Stale queue entries are skipped (lazy deletion)',
        ],
        { current },
      );
      continue;
    }

    snapshot(
      'select',
      'Select',
      [
        `Select the unvisited junction with the smallest distance`,
        `current = ${current}`,
        `distance[${current}] = ${minutes(distance.get(current) ?? 0)}`,
        `Priority queue size: ${heap.size + 1}`,
      ],
      { current },
    );

    // Steps 5-8: examine every neighbour and relax when it helps.
    const neighbours = graph.get(current) ?? [];
    for (const neighbour of neighbours) {
      const from = neighbour.to;
      const roadId = neighbour.roadId;
      const weight = neighbour.weight;
      const base = distance.get(current) ?? Number.POSITIVE_INFINITY;
      const candidate = base + weight;
      const best = distance.get(from) ?? Number.POSITIVE_INFINITY;

      if (settledSet.has(from)) {
        // With non-negative weights a settled neighbour can never improve, so
        // this is a guard rather than a required step.
        snapshot(
          'no-relax',
          'Skip',
          [
            `Examine ${current} -> ${from} (road ${roadId}, ${minutes(weight)} min)`,
            `${from} is already finalised, so it cannot improve`,
          ],
          { current, neighbor: from, roadId, weight, candidate },
        );
        continue;
      }

      const improved = candidate < best;

      if (improved) {
        distance.set(from, candidate);
        previous.set(from, current);
        heap.push(from, candidate);
        maxHeapSize = Math.max(maxHeapSize, heap.size);

        snapshot(
          'relax',
          'Relax',
          [
            `Examine road ${roadId}: ${current} -> ${from}`,
            `weight(${current}, ${from}) = ${minutes(weight)}`,
            `newDistance = distance[${current}] + weight = ${minutes(base)} + ${minutes(
              weight,
            )} = ${minutes(candidate)}`,
            `distance[${from}] improved from ${minutes(best)} to ${minutes(candidate)}`,
            `previous[${from}] = ${current}`,
          ],
          { current, neighbor: from, roadId, weight, candidate },
        );
      } else {
        snapshot(
          'no-relax',
          'Compare',
          [
            `Examine road ${roadId}: ${current} -> ${from}`,
            `candidate = ${minutes(base)} + ${minutes(weight)} = ${minutes(candidate)}`,
            `Not better than distance[${from}] = ${minutes(best)}, so no update`,
          ],
          { current, neighbor: from, roadId, weight, candidate },
        );
      }
    }

    // Step 9: the popped junction's distance is final, so mark it visited.
    settled.push(current);
    settledSet.add(current);
    snapshot(
      'settle',
      'Mark visited',
      [
        `Mark ${current} as visited - distance ${minutes(
          distance.get(current) ?? 0,
        )} min is final`,
        `${settled.length} of ${junctions.length} junctions processed`,
      ],
      { current },
    );
  }

  // Terminal state.
  const unreachable = junctions.filter((id) => !Number.isFinite(distance.get(id) ?? Infinity));
  snapshot(
    'done',
    'Finish',
    [
      'Priority queue is empty - every reachable junction is finalised',
      unreachable.length === 0
        ? `All ${junctions.length} junctions reached`
        : `No route found to: ${unreachable.join(', ')}`,
    ],
    { current: null },
  );

  return {
    source,
    steps,
    result: {
      source,
      distance,
      previous,
      settledOrder: settled,
      unreachable,
      maxHeapSize,
    },
  };
}

/**
 * The roads that make up the shortest-path tree at a given point in the trace:
 * one road per junction whose `previous` pointer is set.
 *
 * Used to draw the tree edges that appear as the algorithm confirms them.
 */
export function deriveTreeEdges(
  graph: Graph,
  previous: Record<string, JunctionId | null>,
): RoadId[] {
  const roadIds = new Set<RoadId>();
  for (const [junction, parent] of Object.entries(previous)) {
    if (parent === null) continue;
    const edge = (graph.get(parent) ?? []).find((entry) => entry.to === junction);
    if (edge) roadIds.add(edge.roadId);
  }
  return [...roadIds];
}