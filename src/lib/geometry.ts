import type { JunctionId, RoadState } from '@/types';
import type { Point } from './projection';
import { TRAFFIC_LEVELS } from '@/logic/traffic';

/**
 * Geometry helpers for the SVG overlay that sits on top of the basemap.
 *
 * Junctions arrive here already projected into pixel space by
 * `lib/projection.ts`, so nothing in this file knows about latitude.
 *
 * Roads are drawn as quadratic Bezier curves. Besides reading like a metro map,
 * the curvature keeps roads that share a junction from overlapping, and gives
 * the weight labels somewhere unambiguous to sit. Every curve has a small
 * perpendicular offset derived from the road's `curve` field.
 */

/** Offsets the line's midpoint perpendicular to its direction. */
export function controlPoint(from: Point, to: Point, curvature: number): Point {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  return { x: mx + nx * curvature, y: my + ny * curvature };
}

/** Point on a quadratic Bezier at parameter t. */
export function quadraticAt(from: Point, control: Point, to: Point, t: number): Point {
  const inv = 1 - t;
  return {
    x: inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x,
    y: inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y,
  };
}

/** SVG path for the full road, plus the control point used elsewhere. */
export function roadPath(from: Point, to: Point, curvature = 0): { d: string; control: Point } {
  const control = controlPoint(from, to, curvature);
  return {
    d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
    control,
  };
}

/**
 * Point on the curve at t, pushed further away from the road so the weight
 * label sits beside the line rather than on top of it.
 */
export function labelPosition(from: Point, to: Point, control: Point, offset = 16): Point {
  const point = quadraticAt(from, control, to, 0.5);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: point.x + (-dy / length) * offset,
    y: point.y + (dx / length) * offset,
  };
}

/** Where a direction arrowhead sits on the curve (0 = from end, 1 = to end). */
export function arrowPosition(
  from: Point,
  to: Point,
  control: Point,
  towardFrom: boolean,
  t = 0.62,
): { x: number; y: number; angle: number } {
  const before = quadraticAt(from, control, to, t - 0.02);
  const after = quadraticAt(from, control, to, t + 0.02);
  const angle = (Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI;
  const point = quadraticAt(from, control, to, towardFrom ? 1 - t : t);
  return { x: point.x, y: point.y, angle };
}

/**
 * Trims a road's ends so the stroke stops at the node border instead of
 * disappearing under the junction circle.
 */
export function trimEndpoints(
  from: Point,
  to: Point,
  control: Point,
  radius: number,
): { start: Point; end: Point } {
  const nearFrom = quadraticAt(from, control, to, 0.06);
  const nearTo = quadraticAt(from, control, to, 0.94);

  const startDirX = nearFrom.x - from.x;
  const startDirY = nearFrom.y - from.y;
  const startLen = Math.hypot(startDirX, startDirY) || 1;

  const endDirX = nearTo.x - to.x;
  const endDirY = nearTo.y - to.y;
  const endLen = Math.hypot(endDirX, endDirY) || 1;

  return {
    start: {
      x: from.x + (startDirX / startLen) * radius,
      y: from.y + (startDirY / startLen) * radius,
    },
    end: {
      x: to.x + (endDirX / endLen) * radius,
      y: to.y + (endDirY / endLen) * radius,
    },
  };
}

/** Traffic colour token for a road, used for both stroke and legend chips. */
export function trafficColor(roadState: RoadState): string {
  return TRAFFIC_LEVELS[roadState.level].color;
}

/** Compact "A-B" style identifier for a road between two junctions. */
export function roadLabel(from: JunctionId, to: JunctionId): string {
  return `${from}-${to}`;
}
