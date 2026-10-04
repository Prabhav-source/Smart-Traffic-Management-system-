/**
 * Shared domain types for the Smart Traffic Signal Management prototype.
 *
 * Vocabulary used throughout the app:
 *   Junction (node/vertex) -> a traffic signal intersection
 *   Road    (edge)         -> a bidirectional link between two junctions
 *   Weight                   -> current travel time on that road, in minutes
 */

/** Stable identifier of a junction (matches the labels used in the brief: A..G). */
export type JunctionId = string;

/** Stable identifier of a road, e.g. "A-B". */
export type RoadId = string;

/**
 * A traffic junction. `lat` / `lng` are real WGS-84 coordinates of an actual
 * Hyderabad landmark, so the graph can be drawn on top of a real basemap and
 * road lengths computed from the geometry rather than invented.
 */
export interface Junction {
  id: JunctionId;
  /** Short label shown on the map and in tables, e.g. "Begumpet". */
  label: string;
  /** What this junction is for in the emergency-response story. */
  purpose: string;
  lat: number;
  lng: number;
  /**
   * Screen position of the label relative to the node. Keeps labels from
   * colliding with edges on the map.
   */
  labelAnchor: 'top' | 'bottom' | 'left' | 'right';
}


/**
 * A traffic congestion state for a single road.
 * Ordered from best to worst so the UI can render them as a segmented control.
 */
export type TrafficLevel = 'low' | 'moderate' | 'heavy';

/**
 * A road as defined in the *sample data*.
 *
 * Two weight sources exist, selected by {@link WeightMode}:
 *   - `modeled`  : free-flow minutes derived from the real coordinates of the
 *                  two junctions (see `logic/weights.ts`). This is the default,
 *                  because it keeps the graph a physically possible road
 *                  network.
 *   - `reference` : the free-flow minutes printed in the original assignment
 *                  brief, kept for comparison.
 */
export interface Road {
  id: RoadId;
  /** Roads are bidirectional: an emergency vehicle may travel either way. */
  from: JunctionId;
  to: JunctionId;
  /** The real Hyderabad corridor this edge represents, e.g. "NH 44". */
  corridor: string;
  /**
   * Free-flow travel time in minutes as printed in the assignment brief.
   * Only used when {@link NetworkState.weightMode} is `reference`.
   */
  referenceMinutes: number;
  /**
   * Curvature of the drawn edge, in SVG units, applied perpendicular to the
   * straight line. Used to keep edges that share a junction from overlapping.
   */
  curve?: number;
}


/** A road plus the traffic state the user has assigned to it. */
export interface RoadState {
  road: Road;
  level: TrafficLevel;
  /**
   * Optional explicit travel time that overrides the congestion-derived weight.
   * `null` means "derive from traffic level".
   */
  overrideMinutes: number | null;
}

/**
 * Where a road's free-flow travel time comes from.
 *
 * `modeled` is the real geometry; `reference` is the toy graph from the brief.
 * Both are needed: the brief's numbers are not a physically possible road
 * network (B-D = 10 min is longer than B-C + C-D = 8 min), so a shortest path
 * over them is a valid answer to the wrong question.
 */
export type WeightMode = 'modeled' | 'reference';

/** Full mutable state of the simulated road network. */
export interface NetworkState {
  roads: RoadState[];
  /**
   * Junctions that are simulated as isolated (no roads at all) so the
   * unreachable-destination edge case can be demonstrated.
   */
  isolatedJunctions: JunctionId[];
  /** Which free-flow weight source the live graph uses. */
  weightMode: WeightMode;
}


/**
 * An adjacency-list entry: one neighbour reachable over a single road.
 */
export interface AdjacencyEntry {
  to: JunctionId;
  /** The road connecting `from` -> `to`. */
  roadId: RoadId;
  /** Live travel time in minutes (the Dijkstra edge weight). */
  weight: number;
}

/** Adjacency list keyed by junction id. */
export type Graph = Map<JunctionId, AdjacencyEntry[]>;

/**
 * A result produced by {@link runDijkstraWithTrace}: shortest travel times to
 * every junction, plus the `previous` pointers needed to rebuild routes.
 */
export interface ShortestPathResult {
  source: JunctionId;
  /** distance[junction] === Infinity means "no route exists". */
  distance: Map<JunctionId, number>;
  /** previous[junction] === null for the source and for unreachable junctions. */
  previous: Map<JunctionId, JunctionId | null>;
  /** Junctions in the order Dijkstra settled (removed) them from the queue. */
  settledOrder: JunctionId[];
  /** Junctions with no route from the source. */
  unreachable: JunctionId[];
  /** Highest number of live entries that were simultaneously in the heap. */
  maxHeapSize: number;
}