import type { Graph, JunctionId, RoadId, ShortestPathResult } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Route reconstruction and alternative-route enumeration
 * ---------------------------------------------------------------------------
 *
 * Dijkstra returns `distance` and `previous`. Everything a user wants to read -
 * "the route", "how many equally fast routes exist", "what did Dijkstra reject"
 * - is derived from those two structures here.
 */

/** One complete path through the network. */
export interface Route {
  /** Junctions from source to destination, inclusive. */
  nodes: JunctionId[];
  /** Roads traversed, aligned 1:1 with `nodes`. */
  roadIds: RoadId[];
  /** Sum of the road weights along the route, in minutes. */
  totalMinutes: number;
}

/**
 * Rebuilds the shortest route to `destination` by walking `previous` backwards.
 *
 * Returns `null` when the destination is unreachable. When the destination is
 * the source itself the result is a single-node zero-minute route, which is
 * the correct answer rather than a special case to hide.
 */
export function reconstructRoute(
  result: ShortestPathResult,
  graph: Graph,
  destination: JunctionId,
): Route | null {
  if (!Number.isFinite(result.distance.get(destination) ?? Number.POSITIVE_INFINITY)) {
    return null;
  }

  const reversedNodes: JunctionId[] = [];
  const reversedRoads: RoadId[] = [];
  let cursor: JunctionId | null = destination;

  while (cursor !== null) {
    reversedNodes.push(cursor);
    if (cursor === result.source) break;
    const parent: JunctionId | null = result.previous.get(cursor) ?? null;
    if (parent === null) return null; // defensive: broken predecessor chain
    const edge = (graph.get(parent) ?? []).find((entry) => entry.to === cursor);
    if (!edge) return null; // defensive: predecessor not connected by a road
    reversedRoads.push(edge.roadId);
    cursor = parent;
  }

  reversedNodes.reverse();
  reversedRoads.reverse();

  return {
    nodes: reversedNodes,
    roadIds: reversedRoads,
    totalMinutes: result.distance.get(destination) ?? Number.POSITIVE_INFINITY,
  };
}

/**
 * Enumerates the k cheapest *simple* paths (no repeated junctions) from source
 * to destination using uniform-cost search over partial paths.
 *
 * This is deliberately not Dijkstra: Dijkstra deliberately collapses every
 * route to one distance per junction, which is exactly the information the
 * comparison panel needs to look behind. Expanding whole partial paths keeps
 * the runners-up.
 *
 * An expansion cap bounds the work on pathological graphs; the prototype's
 * six/seven-junction network never approaches it.
 */
export function findAlternativeRoutes(
  graph: Graph,
  source: JunctionId,
  destination: JunctionId,
  limit = 4,
  maxExpansions = 20000,
): Route[] {
  if (source === destination) {
    return [{ nodes: [source], roadIds: [], totalMinutes: 0 }];
  }

  interface Partial {
    nodes: JunctionId[];
    roadIds: RoadId[];
    totalMinutes: number;
  }

  const found: Route[] = [];
  const seenComplete = new Set<string>();
  const queue: Partial[] = [{ nodes: [source], roadIds: [], totalMinutes: 0 }];
  let expansions = 0;

  while (queue.length > 0 && found.length < limit && expansions < maxExpansions) {
    // Partial paths are kept sorted by cost; the list is tiny at city scale.
    queue.sort((a, b) => a.totalMinutes - b.totalMinutes);
    const partial = queue.shift()!;
    expansions += 1;

    const tail = partial.nodes[partial.nodes.length - 1];

    if (tail === destination) {
      const key = partial.nodes.join('>');
      if (!seenComplete.has(key)) {
        seenComplete.add(key);
        found.push({
          nodes: partial.nodes,
          roadIds: partial.roadIds,
          totalMinutes: partial.totalMinutes,
        });
      }
      // A completed path is not extended further.
      continue;
    }

    const visited = new Set(partial.nodes);
    for (const edge of graph.get(tail) ?? []) {
      if (visited.has(edge.to)) continue; // keep paths simple
      queue.push({
        nodes: [...partial.nodes, edge.to],
        roadIds: [...partial.roadIds, edge.roadId],
        totalMinutes: partial.totalMinutes + edge.weight,
      });
    }
  }

  return found.sort((a, b) => a.totalMinutes - b.totalMinutes);
}

/**
 * Splits alternative routes into the shortest one plus everything else, and
 * flags ties.
 *
 * The tie case matters: when two routes cost exactly the same, Dijkstra's
 * answer is not uniquely "the" answer, and the UI says so instead of implying
 * a false certainty.
 */
export interface RouteComparison {
  /** The best route, or null when the destination is unreachable. */
  best: Route | null;
  /** Rejected routes, cheapest first. */
  alternatives: Route[];
  /** True when more than one route shares the minimum cost. */
  hasTie: boolean;
  /** How many routes share the minimum cost. */
  tiedCount: number;
}

export function compareRoutes(
  graph: Graph,
  source: JunctionId,
  destination: JunctionId,
  limit = 4,
): RouteComparison {
  const routes = findAlternativeRoutes(graph, source, destination, limit);

  if (routes.length === 0) {
    return { best: null, alternatives: [], hasTie: false, tiedCount: 0 };
  }

  const bestMinutes = routes[0].totalMinutes;
  const tiedCount = routes.filter((route) => route.totalMinutes === bestMinutes).length;

  return {
    best: routes[0],
    alternatives: routes.slice(1),
    hasTie: tiedCount > 1,
    tiedCount,
  };
}

/**
 * The live shortest-path tree: one route per reachable junction, keyed by
 * destination. Feeds the results table.
 */
export function buildRouteTable(
  result: ShortestPathResult,
  graph: Graph,
): Map<JunctionId, Route | null> {
  const table = new Map<JunctionId, Route | null>();
  for (const junction of result.distance.keys()) {
    table.set(junction, reconstructRoute(result, graph, junction));
  }
  return table;
}

/**
 * Formats a route as "A -> C -> D" for tables and status copy.
 */
export function formatRouteNodes(route: Route | null): string {
  if (!route) return 'No route available';
  return route.nodes.join(' → ');
}

/**
 * How much worse an alternative is than the best route, in minutes.
 * Used to explain why Dijkstra rejected it.
 */
export function extraMinutes(route: Route, best: Route | null): number | null {
  if (!best) return null;
  return Math.round((route.totalMinutes - best.totalMinutes) * 10) / 10;
}