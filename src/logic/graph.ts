import type {
  AdjacencyEntry,
  Graph,
  JunctionId,
  NetworkState,
  RoadState,
  WeightMode,
} from '@/types';
import { JUNCTIONS } from '@/data/cityGraph';
import { travelMinutesFor } from './traffic';
import { roundTenths } from './weights';

/**
 * A problem that would make the Dijkstra result untrustworthy.
 * The UI surfaces these in a banner and refuses to run the algorithm.
 */
export interface GraphProblem {
  roadId: string;
  message: string;
}

/**
 * Builds the live weighted adjacency list from the network state.
 *
 * Every junction always gets an entry, even isolated ones, so the map and the
 * results table can render "unreachable" rather than crashing.
 * Roads are bidirectional, so each one is added in both directions.
 */
export function buildGraph(state: NetworkState): Graph {
  const graph: Graph = new Map();

  for (const junction of JUNCTIONS) {
    graph.set(junction.id, []);
  }
  // Include any junction id referenced only by a road, defensively.
  for (const { road } of state.roads) {
    if (!graph.has(road.from)) graph.set(road.from, []);
    if (!graph.has(road.to)) graph.set(road.to, []);
  }

  for (const roadState of state.roads) {
    const weight = travelMinutesFor(roadState, state.weightMode);
    const { from, to } = roadState.road;
    graph.get(from)?.push({ to, roadId: roadState.road.id, weight });
    graph.get(to)?.push({ to: from, roadId: roadState.road.id, weight });
  }

  // Deterministic neighbour ordering keeps the animation reproducible:
  // lightest road first, then alphabetical.
  for (const neighbours of graph.values()) {
    neighbours.sort((a, b) =>
      a.weight === b.weight ? a.to.localeCompare(b.to) : a.weight - b.weight,
    );
  }

  return graph;
}

/**
 * Guards the mathematical precondition of Dijkstra: all weights must be finite
 * and >= 0. Negative weights break the "first settled is final" guarantee,
 * so the prototype reports them rather than silently producing a wrong route.
 */
export function validateGraph(graph: Graph): GraphProblem[] {
  const problems: GraphProblem[] = [];
  for (const [junctionId, neighbours] of graph) {
    for (const neighbour of neighbours) {
      if (!Number.isFinite(neighbour.weight)) {
        problems.push({
          roadId: neighbour.roadId,
          message: `Road ${neighbour.roadId} has a non-numeric travel time.`,
        });
      } else if (neighbour.weight < 0) {
        problems.push({
          roadId: neighbour.roadId,
          message: `Road ${neighbour.roadId} has a negative travel time (${neighbour.weight}).`,
        });
      }
    }
    void junctionId;
  }
  return problems;
}

/** Junction ids that currently have no road leading out of them. */
export function isolatedIn(graph: Graph): JunctionId[] {
  const ids: JunctionId[] = [];
  for (const [id, neighbours] of graph) {
    if (neighbours.length === 0) ids.push(id);
  }
  return ids;
}

/** Sum of every live edge weight; used for the "network weight total" metric. */
export function totalNetworkMinutes(roads: RoadState[], mode: WeightMode = 'modeled'): number {
  return roundTenths(roads.reduce((sum, roadState) => sum + travelMinutesFor(roadState, mode), 0));
}

/** Looks up the live weight of a road in either direction. */
export function weightForRoad(
  roads: RoadState[],
  roadId: string,
  mode: WeightMode = 'modeled',
): number | null {
  const found = roads.find((roadState) => roadState.road.id === roadId);
  return found ? travelMinutesFor(found, mode) : null;
}


/** Convenience: neighbours of a junction, or an empty list for unknown ids. */
export function neighboursOf(graph: Graph, junction: JunctionId): AdjacencyEntry[] {
  return graph.get(junction) ?? [];
}