import type { Junction, JunctionId, NetworkState, Road, RoadState } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Real Hyderabad road network (WGS-84 coordinates, named real corridors)
 * ---------------------------------------------------------------------------
 * The seven junctions are real, well-known Hyderabad locations, and the nine
 * roads are real corridors between them:
 *
 *   A-B  Begumpet      - Secunderabad    SP Nagar Rd / NH 44
 *   A-C  Begumpet      - Ameerpet        Ameerpet-Ferozguda Rd
 *   B-C  Secunderabad  - Ameerpet        Balanagar - Mehdipatnam Rd
 *   B-D  Secunderabad  - Kukatpally      Bowenpally - NH 44
 *   C-D  Ameerpet      - Kukatpally      Gachibowli - Banjara Hills Rd
 *   C-E  Ameerpet      - Gachibowli      Gachibowli - Ameerpet Link Rd
 *   D-E  Kukatpally     - Gachibowli      Outer Ring Road
 *   D-F  Kukatpally     - Shamshabad      Aramghar - Airport Approach Rd
 *   E-F  Gachibowli    - Shamshabad      Shamshabad - Gachibowli Link Rd
 *   C-G  Ameerpet      - Uppal           Nagole - Uppal Rd  (optional link)
 *
 * Free-flow travel times are NOT hard-coded for the default mode: they are
 * derived from these coordinates in `logic/weights.ts`, so the graph stays a
 * physically possible road network. `referenceMinutes` keeps the numbers from
 * the original assignment brief available for comparison.
 */

export const JUNCTIONS: Junction[] = [
  {
    id: 'A',
    label: 'Begumpet',
    purpose: 'Central dispatch control post',
    lat: 17.4232,
    lng: 78.448,
    labelAnchor: 'right',
  },
  {
    id: 'B',
    label: 'Secunderabad',
    purpose: 'Railway command and triage centre',
    lat: 17.4435,
    lng: 78.4676,
    labelAnchor: 'right',
  },
  {
    id: 'C',
    label: 'Ameerpet',
    purpose: 'Metro interchange and hospital corridor',
    lat: 17.4149,
    lng: 78.4495,
    labelAnchor: 'right',
  },
  {
    id: 'D',
    label: 'Kukatpally',
    purpose: 'Western flyover distribution node',
    lat: 17.4435,
    lng: 78.407,
    labelAnchor: 'top',
  },
  {
    id: 'E',
    label: 'Gachibowli',
    purpose: 'IT corridor approach junction',
    lat: 17.44,
    lng: 78.3486,
    labelAnchor: 'bottom',
  },
  {
    id: 'F',
    label: 'Shamshabad',
    purpose: 'Rajiv Gandhi International Airport',
    lat: 17.2403,
    lng: 78.4294,
    labelAnchor: 'bottom',
  },
  {
    id: 'G',
    label: 'Uppal',
    purpose: 'Eastern logistics hub, link under repair',
    lat: 17.398,
    lng: 78.557,
    labelAnchor: 'left',
  },
];

/**
 * Curvature per road, in map pixels. Roads that leave the same junction are
 * given alternating signs so the drawn curves separate instead of overlapping.
 */
export const ROADS: Road[] = [
  { id: 'A-B', from: 'A', to: 'B', corridor: 'SP Nagar Rd / NH 44', referenceMinutes: 4, curve: -30 },
  { id: 'A-C', from: 'A', to: 'C', corridor: 'Ameerpet-Ferozguda Rd', referenceMinutes: 2, curve: 26 },
  { id: 'B-C', from: 'B', to: 'C', corridor: 'Balanagar-Mehdipatnam Rd', referenceMinutes: 5, curve: 30 },
  { id: 'B-D', from: 'B', to: 'D', corridor: 'Bowenpally / NH 44', referenceMinutes: 10, curve: 40 },
  { id: 'C-D', from: 'C', to: 'D', corridor: 'Gachibowli-Banjara Hills Rd', referenceMinutes: 3, curve: -46 },
  { id: 'C-E', from: 'C', to: 'E', corridor: 'Gachibowli-Ameerpet Link Rd', referenceMinutes: 8, curve: 34 },
  { id: 'D-E', from: 'D', to: 'E', corridor: 'Outer Ring Road', referenceMinutes: 2, curve: -30 },
  { id: 'D-F', from: 'D', to: 'F', corridor: 'Aramghar-Airport Approach Rd', referenceMinutes: 6, curve: 44 },
  { id: 'E-F', from: 'E', to: 'F', corridor: 'Shamshabad-Gachibowli Link Rd', referenceMinutes: 3, curve: -38 },
];

/**
 * Optional link that connects Uppal, the junction isolated on load so the
 * "destination unreachable" case is always visible in the prototype.
 */
export const UPPAL_LINK: Road = {
  id: 'C-G',
  from: 'C',
  to: 'G',
  corridor: 'Nagole-Uppal Rd',
  referenceMinutes: 4,
  curve: -30,
};

/** Junction the emergency vehicle is parked at when the app loads. */
export const DEFAULT_SOURCE: JunctionId = 'A';

/** Destination pre-selected so the route panels have something to show. */
export const DEFAULT_DESTINATION: JunctionId = 'F';

export const JUNCTION_INDEX: ReadonlyMap<string, Junction> = new Map(
  JUNCTIONS.map((junction) => [junction.id, junction]),
);

/** Looks up a junction, returning `undefined` for unknown ids. */
export function getJunction(id: string): Junction | undefined {
  return JUNCTION_INDEX.get(id);
}

/** Whether the given road is the optional Uppal link. */
export function isOptionalLink(roadId: string): boolean {
  return roadId === UPPAL_LINK.id;
}

/** The starting network: every junction reachable except Uppal. */
export function createInitialNetworkState(): NetworkState {
  return {
    roads: baseRoadStates(),
    isolatedJunctions: ['G'],
    weightMode: 'modeled',
  };
}

/** A network state where the optional C-G link is live (Uppal reachable). */
export function createConnectedNetworkState(): NetworkState {
  return {
    roads: [...baseRoadStates(), { road: UPPAL_LINK, level: 'low', overrideMinutes: null }],
    isolatedJunctions: [],
    weightMode: 'modeled',
  };
}

/** The nine base roads, all at free flow, with no manual overrides. */
export function baseRoadStates(): RoadState[] {
  return ROADS.map((road) => ({ road, level: 'low', overrideMinutes: null }));
}
