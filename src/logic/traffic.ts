import type { RoadState, TrafficLevel, WeightMode } from '@/types';
import { freeFlowMinutesFor, roundTenths } from './weights';

/**
 * ---------------------------------------------------------------------------
 * Traffic congestion model
 * ---------------------------------------------------------------------------
 * Congestion is converted into an edge weight by multiplying the road's
 * free-flow travel time by a factor. This is exactly the transformation the
 * prototype is meant to demonstrate:
 *
 *     Traffic conditions -> road travel time -> weighted graph -> Dijkstra
 *
 * The free-flow time itself comes from `logic/weights.ts`: either modelled from
 * the real coordinates of the two junctions, or taken from the brief.
 */

export interface TrafficLevelMeta {
  id: TrafficLevel;
  /** Human label shown next to the colour (accessibility: never colour only). */
  label: string;
  /** Multiplier applied to a road's free-flow time. */
  factor: number;
  /** Short glyph used in text-only contexts. */
  symbol: string;
  /** Primary colour token from the stylesheet. */
  color: string;
  /** Semantic description for screen readers / tooltips. */
  description: string;
}

export const TRAFFIC_LEVELS: Record<TrafficLevel, TrafficLevelMeta> = {
  low: {
    id: 'low',
    label: 'Low',
    factor: 1,
    symbol: 'OK',
    color: 'var(--traffic-low)',
    description: 'Free flowing, travel time close to the free-flow estimate',
  },
  moderate: {
    id: 'moderate',
    label: 'Moderate',
    factor: 1.5,
    symbol: 'MOD',
    color: 'var(--traffic-moderate)',
    description: 'Slowed traffic, roughly half again the free-flow travel time',
  },
  heavy: {
    id: 'heavy',
    label: 'Heavy',
    factor: 2,
    symbol: 'HVY',
    color: 'var(--traffic-heavy)',
    description: 'Congested, about double the free-flow travel time',
  },
};

/** Display order used by the segmented traffic controls. */
export const TRAFFIC_LEVEL_ORDER: TrafficLevel[] = ['low', 'moderate', 'heavy'];

/** The congestion level the prototype starts with: everything free-flowing. */
export const DEFAULT_LEVEL: TrafficLevel = 'low';

/**
 * Named scenarios. Each preset is a full assignment of traffic levels keyed by
 * road id, so pressing one gives a reproducible, explainable result.
 */
export interface TrafficPreset {
  id: string;
  name: string;
  description: string;
  levels: Record<string, TrafficLevel>;
  /** Whether the optional Nagole-Uppal link should be present. */
  uppalLinked: boolean;
}

export const TRAFFIC_PRESETS: TrafficPreset[] = [
  {
    id: 'free-flow',
    name: 'Free flow',
    description:
      'Every road at its free-flow time. This is the base network, with Uppal still isolated.',
    levels: {},
    uppalLinked: false,
  },
  {
    id: 'rush-hour',
    name: 'Rush hour',
    description:
      'Congestion builds around Ameerpet and the airport approach; the railway link stays clear.',
    uppalLinked: false,
    levels: {
      'A-B': 'moderate',
      'A-C': 'heavy',
      'B-C': 'low',
      'B-D': 'low',
      'C-D': 'low',
      'C-E': 'heavy',
      'D-E': 'low',
      'D-F': 'moderate',
      'E-F': 'low',
    },
  },
  {
    id: 'ameerpet-gridlock',
    name: 'Ameerpet gridlock',
    description:
      'Ameerpet is choked, so the Kukatpally link becomes the expensive shortcut and the longer Secunderabad road starts to win.',
    uppalLinked: false,
    levels: {
      'A-B': 'low',
      'A-C': 'low',
      'B-C': 'heavy',
      'B-D': 'low',
      'C-D': 'heavy',
      'C-E': 'low',
      'D-E': 'low',
      'D-F': 'low',
      'E-F': 'low',
    },
  },
  {
    id: 'airport-blocked',
    name: 'Airport route congested',
    description:
      'The airport approach is heavy while the ring road stays clear, pushing traffic around via the Gachibowli link.',
    uppalLinked: false,
    levels: {
      'A-B': 'low',
      'A-C': 'low',
      'B-C': 'low',
      'B-D': 'low',
      'C-D': 'moderate',
      'C-E': 'heavy',
      'D-E': 'moderate',
      'D-F': 'low',
      'E-F': 'low',
    },
  },
  {
    id: 'uppal-open',
    name: 'Uppal link reopened',
    description:
      'Road works on the Nagole-Uppal corridor finish, the C-G link reopens, and Uppal becomes reachable.',
    uppalLinked: true,
    levels: {},
  },
];

/**
 * Applies a preset to a road list, returning a fresh array.
 * `levels` only needs to name the roads that differ from free flow.
 */
export function applyPreset(
  roads: RoadState[],
  preset: TrafficPreset,
): RoadState[] {
  return roads.map((roadState) => ({
    ...roadState,
    level: preset.levels[roadState.road.id] ?? 'low',
    overrideMinutes: null,
  }));
}

/**
 * The travel time Dijkstra will use for a road.
 *
 * Precedence: explicit manual override (validated elsewhere) beats the
 * congestion multiplier, which beats the free-flow time for the active mode.
 */
export function travelMinutesFor(roadState: RoadState, mode: WeightMode = 'modeled'): number {
  if (roadState.overrideMinutes !== null) {
    return roundMinutes(roadState.overrideMinutes);
  }
  return roundMinutes(freeFlowMinutesFor(roadState.road, mode) * TRAFFIC_LEVELS[roadState.level].factor);
}

/** The congestion-free time for a road, in the active weight mode. */
export function freeFlowMinutesOf(roadState: RoadState, mode: WeightMode = 'modeled'): number {
  return roundMinutes(freeFlowMinutesFor(roadState.road, mode));
}


/** Rounds to at most one decimal place so 1.5x of 3 reads as 4.5, not 4.499999. */
export function roundMinutes(value: number): number {
  return roundTenths(value);
}

/** True when the weight is derived from congestion rather than an override. */
export function isOverridden(roadState: RoadState): boolean {
  return roadState.overrideMinutes !== null;
}

/** Result of validating a user-typed travel time. */
export interface TravelTimeValidation {
  ok: boolean;
  /** Parsed value; 0 when the input could not be parsed. */
  value: number;
  /** Message to display under the input when `ok` is false. */
  error: string | null;
}

/**
 * Validates a manually entered travel time.
 *
 * Dijkstra's correctness depends on non-negative weights, so anything below
 * zero, blank, non-numeric, or non-finite is rejected rather than clamped.
 */
export function validateTravelMinutes(raw: string): TravelTimeValidation {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, value: 0, error: 'Enter a travel time in minutes.' };
  }
  // Reject anything that is not a plain number (e.g. "12px", "1e", "-", "abc").
  if (!/^\d*\.?\d+$/.test(trimmed)) {
    return { ok: false, value: 0, error: 'Use digits only, for example 4.5' };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, value: 0, error: 'Travel time must be a finite number.' };
  }
  if (value < 0) {
    return { ok: false, value: 0, error: 'Dijkstra requires travel times >= 0.' };
  }
  return { ok: true, value, error: null };
}

/** Formats a travel time for tables and map labels. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return 'unreachable';
  if (Number.isInteger(minutes)) return `${minutes} min`;
  return `${minutes.toFixed(1)} min`;
}