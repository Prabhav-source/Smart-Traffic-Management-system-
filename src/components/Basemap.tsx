import { useEffect, useMemo, useState } from 'react';
import { MAP_VIEWPORT } from '@/lib/projection';

/**
 * ---------------------------------------------------------------------------
 * Basemap: the real Hyderabad map underneath the algorithm overlay
 * ---------------------------------------------------------------------------
 * A single Google Static Maps image, requested for exactly the viewport the SVG
 * overlay is drawn in, so every marker lands on its real building.
 *
 * The key comes from the Vite environment (`VITE_GOOGLE_MAPS_API_KEY`) and is
 * never hard-coded. It is also not required to run the prototype: with no key,
 * or if the image fails, the component renders a light Google-style canvas so
 * the traffic overlay, the controls and the algorithm all keep working.
 */

export type MapTypeId = 'roadmap' | 'satellite';

export const MAP_TYPES: Record<MapTypeId, { id: MapTypeId; label: string; hint: string }> = {
  roadmap: {
    id: 'roadmap',
    label: 'Map',
    hint: 'Google roadmap: roads, landmarks and labels',
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    hint: 'Google satellite imagery with the road network on top',
  },
};

/**
 * `import.meta.env` is injected by Vite. The cast keeps the bundler used by
 * the test scripts from tripping over it, and the optional chain keeps the
 * component renderable when the environment is absent.
 */
const ENV: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

const API_KEY: string = ENV.VITE_GOOGLE_MAPS_API_KEY ?? '';

export const BASEMAP_KEY_CONFIGURED = API_KEY.trim().length > 0;

/** Fully built Static Maps URL, or null when no key is configured. */
export function staticMapUrl(
  center: { lat: number; lng: number },
  zoom: number,
  mapType: MapTypeId,
): string | null {
  if (!BASEMAP_KEY_CONFIGURED) return null;
  const params = new URLSearchParams({
    center: `${center.lat},${center.lng}`,
    zoom: String(zoom),
    size: `${MAP_VIEWPORT.width}x${MAP_VIEWPORT.height}`,
    scale: String(MAP_VIEWPORT.scale),
    maptype: mapType,
    language: 'en',
    key: API_KEY.trim(),
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

type LoadState = 'loading' | 'ready' | 'failed';

export interface BasemapProps {
  center: { lat: number; lng: number };
  zoom: number;
  mapType: MapTypeId;
}

export function Basemap({ center, zoom, mapType }: BasemapProps) {
  const url = useMemo(() => staticMapUrl(center, zoom, mapType), [center, zoom, mapType]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  // A new viewport means a new request, so any earlier failure is forgotten.
  useEffect(() => {
    setLoadState('loading');
  }, [url]);

  const showFallback = url === null || loadState === 'failed';

  return (
    <div className="basemap" data-state={showFallback ? 'fallback' : loadState}>
      {url !== null && (
        <img
          className="basemap__image"
          src={url}
          alt={`${MAP_TYPES[mapType].label} view of Hyderabad showing Begumpet, Secunderabad, Ameerpet, Kukatpally, Gachibowli, Shamshabad airport and Uppal.`}
          decoding="async"
          draggable={false}
          onLoad={() => setLoadState('ready')}
          onError={() => setLoadState('failed')}
        />
      )}

      {showFallback && (
        <div className="basemap__fallback" aria-hidden="true">
          <svg
            className="basemap__grid"
            viewBox={`0 0 ${MAP_VIEWPORT.width} ${MAP_VIEWPORT.height}`}
            preserveAspectRatio="xMidYMid slice"
          >
            <rect
              x={0}
              y={0}
              width={MAP_VIEWPORT.width}
              height={MAP_VIEWPORT.height}
              className="basemap__land"
            />
            {/* Arterials, drawn with a Google-style casing so the fallback still
                reads as a map rather than a debug grid. */}
            {FALLBACK_ROADS.map((road) => (
              <g key={road.id}>
                <path d={road.d} className="basemap__casing" />
                <path d={road.d} className="basemap__surface" />
              </g>
            ))}
            <path d="M 352 250 q 46 26 78 -10 q 30 -34 -12 -52 q -40 -16 -66 12" className="basemap__water" />
          </svg>
        </div>
      )}
    </div>
  );
}

/**
 * Fallback geometry: a few sweeping arterials plus the Hussain Sagar shape,
 * positioned in the same 640x640 frame as the junctions.
 */
const FALLBACK_ROADS = [
  { id: 'nh44', d: 'M 300 0 C 296 120 300 200 316 300 C 330 400 322 520 300 640' },
  { id: 'ring', d: 'M 0 300 C 120 250 300 236 420 258 C 540 280 600 320 640 372' },
  { id: 'airport', d: 'M 300 300 C 292 380 288 470 296 640' },
  { id: 'cross', d: 'M 120 120 C 240 190 420 240 600 300' },
  { id: 'north', d: 'M 180 640 C 230 520 330 420 470 330' },
] as const;
