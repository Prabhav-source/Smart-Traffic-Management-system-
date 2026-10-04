/**
 * ---------------------------------------------------------------------------
 * Web Mercator projection
 * ---------------------------------------------------------------------------
 * The basemap is a single Google Static Maps image, so the SVG graph overlay has
 * to reproduce Google's own pixel grid exactly. That means using the standard
 * slippy-map formulas with the same zoom and image size the Static Maps API was
 * asked for:
 *
 *     worldX = (lng + 180) / 360 * 256 * 2^zoom
 *     worldY = (0.5 - ln((1 + sin(lat)) / (1 - sin(lat))) / (4*PI)) * 256 * 2^zoom
 *
 * Anything less precise puts the junction markers visibly off their real
 * buildings, which would defeat the point of drawing on a real map.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  width: number;
  height: number;
  zoom: number;
  center: { lat: number; lng: number };
}

/** The map image size requested from the Static Maps API. */
export const MAP_VIEWPORT = {
  width: 640,
  height: 640,
  zoom: 12,
  scale: 2,
  center: { lat: 17.3419, lng: 78.4528 },
} as const;

/**
 * Ground resolution at the viewport centre, in metres per pixel. Used by the
 * scale bar, which has to state a real distance or it is just decoration.
 */
export function metersPerPixel(viewport: Viewport = MAP_VIEWPORT): number {
  return (
    (156543.03392 * Math.cos((viewport.center.lat * Math.PI) / 180)) / 2 ** viewport.zoom
  );
}

/** A round ground distance that fits in `maxPixels`, for the scale bar. */
export function scaleBar(maxPixels = 150): { meters: number; pixels: number } {
  const candidates = [
    100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000,
  ];
  const resolution = metersPerPixel();
  const meters = candidates.find((candidate) => candidate / resolution <= maxPixels) ?? 200000;
  return { meters, pixels: meters / resolution };
}


/**
 * Zoom limits for the map surface. Below 11 the whole network shrinks into a
 * corner of the frame; above 16 the Static Maps image is mostly empty road.
 */
export const MIN_ZOOM = 11;
export const MAX_ZOOM = 16;

/** How much a road's drawn curvature should grow per zoom level past the default. */
export function curvatureScale(zoom: number): number {
  return 2 ** (zoom - MAP_VIEWPORT.zoom);
}

const TILE_SIZE = 256;

function lngToWorldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

function latToWorldY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE * 2 ** zoom;
}

/** Offset of the viewport's top-left corner within the zoomed world grid. */
export function viewportOrigin(viewport: Viewport): Point {
  return {
    x: lngToWorldX(viewport.center.lng, viewport.zoom) - viewport.width / 2,
    y: latToWorldY(viewport.center.lat, viewport.zoom) - viewport.height / 2,
  };
}

/** Projects a coordinate into the viewport's pixel space, origin top-left. */
export function project(
  coordinate: { lat: number; lng: number },
  viewport: Viewport = MAP_VIEWPORT,
): Point {
  const origin = viewportOrigin(viewport);
  return {
    x: lngToWorldX(coordinate.lng, viewport.zoom) - origin.x,
    y: latToWorldY(coordinate.lat, viewport.zoom) - origin.y,
  };
}

/**
 * Inverse of {@link project}: turns a point in the viewport back into a
 * coordinate. Panning the map is just the round trip, which is why the exact
 * same projection is used for drawing and for reading the drag gesture.
 */
export function unproject(
  point: Point,
  viewport: Viewport = MAP_VIEWPORT,
): { lat: number; lng: number } {
  const origin = viewportOrigin(viewport);
  const scale = TILE_SIZE * 2 ** viewport.zoom;
  const worldX = point.x + origin.x;
  const worldY = point.y + origin.y;
  const lng = (worldX / scale) * 360 - 180;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / scale)));
  return { lat, lng };
}

/** Builds the `center=lat,lng&zoom=z` query fragment for the Static Maps API. */
export function staticMapViewParams(viewport: Viewport = MAP_VIEWPORT): string {
  return `center=${viewport.center.lat},${viewport.center.lng}&zoom=${viewport.zoom}`;
}

/** Builds the `size=WxH&scale=S` query fragment for the Static Maps API. */
export function staticMapSizeParams(viewport: Viewport = MAP_VIEWPORT): string {
  return `size=${viewport.width}x${viewport.height}&scale=${MAP_VIEWPORT.scale}`;
}
