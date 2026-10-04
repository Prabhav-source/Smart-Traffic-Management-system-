import { getJunction } from '@/data/cityGraph';
import type { Junction, Road, WeightMode } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Travel-time model
 * ---------------------------------------------------------------------------
 * Free-flow travel times are derived from the real WGS-84 coordinates of the
 * two junctions, so every edge weight is consistent with the map it is drawn
 * on:
 *
 *     roadDistance = greatCircleDistance * ROAD_WINDING_FACTOR
 *     freeFlowMinutes = roadDistance / FREE_FLOW_SPEED_KMH * 60
 *
 * The winding factor is the usual detour ratio between straight-line distance
 * and real road distance (~1.2-1.3x for a city arterial). The speed is a
 * free-flow emergency-response average for Hyderabad; the congestion
 * multipliers in `logic/traffic.ts` then make it slower.
 *
 * The alternative `reference` mode uses the free-flow minutes printed in the
 * assignment brief. Those numbers are kept for reference only: they break the
 * triangle inequality (B-D = 10 min while B-C + C-D = 8 min), so no real road
 * network can honour them.
 */

export const ROAD_WINDING_FACTOR = 1.25;

/** Free-flow average speed in km/h for an emergency response vehicle. */
export const FREE_FLOW_SPEED_KMH = 35;

const EARTH_RADIUS_KM = 6371.0088;

export interface WeightModeMeta {
  id: WeightMode;
  label: string;
  description: string;
}

export const WEIGHT_MODES: Record<WeightMode, WeightModeMeta> = {
  modeled: {
    id: 'modeled',
    label: 'Modelled from real distance',
    description:
      'Free-flow minutes are computed from the real coordinates: straight-line distance x 1.25 winding factor, at 35 km/h.',
  },
  reference: {
    id: 'reference',
    label: 'Brief’s original weights',
    description:
      'The free-flow minutes printed in the assignment brief. Kept for comparison only, because they are not a physically possible road network.',
  },
};

export const WEIGHT_MODE_ORDER: WeightMode[] = ['modeled', 'reference'];

/** Great-circle distance between two coordinates, in kilometres. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Straight-line distance between a road's two junctions, in kilometres. */
export function straightLineKm(road: Road): number {
  const from = getJunction(road.from);
  const to = getJunction(road.to);
  if (!from || !to) return 0;
  return haversineKm(from, to);
}

/**
 * Modelled road distance in kilometres, i.e. the straight line inflated by the
 * winding factor. This is the distance the travel time is based on.
 */
export function roadDistanceKm(road: Road): number {
  return straightLineKm(road) * ROAD_WINDING_FACTOR;
}

/** Modelled free-flow travel time in minutes, before any congestion factor. */
export function modeledMinutesFor(road: Road): number {
  return roundTenths((roadDistanceKm(road) / FREE_FLOW_SPEED_KMH) * 60);
}

/**
 * The free-flow time for a road under the selected weight mode. Congestion
 * multipliers and manual overrides are applied on top of this, never here.
 */
export function freeFlowMinutesFor(road: Road, mode: WeightMode): number {
  return mode === 'reference' ? road.referenceMinutes : modeledMinutesFor(road);
}

/** Human-readable summary of how weights are being produced. */
export function weightSourceLabel(mode: WeightMode): string {
  return mode === 'reference'
    ? 'brief weights'
    : `modelled · ×${ROAD_WINDING_FACTOR} winding · ${FREE_FLOW_SPEED_KMH} km/h`;
}

/** Rounds to one decimal place, so 4.499999 reads as 4.5. */
export function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Bounding box of the junctions used by a set of roads, for the basemap. */
export function boundsFor(junctions: Junction[]): {
  south: number;
  west: number;
  north: number;
  east: number;
} {
  const lats = junctions.map((j) => j.lat);
  const lngs = junctions.map((j) => j.lng);
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  };
}
