import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { DijkstraStep } from '@/algorithm/dijkstra';
import { deriveTreeEdges } from '@/algorithm/dijkstra';
import { formatRouteNodes, type Route } from '@/algorithm/paths';
import { JUNCTIONS } from '@/data/cityGraph';
import { arrowPosition, labelPosition, roadPath, trimEndpoints } from '@/lib/geometry';
import type { Point, Viewport } from '@/lib/projection';
import {
  MAP_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
  curvatureScale,
  project,
  scaleBar,
  unproject,
} from '@/lib/projection';
import { formatMinutes, TRAFFIC_LEVELS, freeFlowMinutesOf, travelMinutesFor } from '@/logic/traffic';
import type { Graph, Junction, JunctionId, RoadState, WeightMode } from '@/types';
import { BASEMAP_KEY_CONFIGURED, Basemap, MAP_TYPES, staticMapUrl, type MapTypeId } from './Basemap';

/**
 * ---------------------------------------------------------------------------
 * The map surface: a real Hyderabad map with a traffic overlay on top
 * ---------------------------------------------------------------------------
 * The basemap is a Google Static Maps image, so the SVG layer is drawn in the
 * same 640x640 pixel space as the requested image. Both are panned and zoomed
 * together by moving the centre of the projection, which is what makes the
 * junction markers stay welded to their real buildings.
 *
 * Traffic is ours, not Google's: the congestion on each road is simulated by
 * this app, so it is painted as a Google-style traffic overlay (grey casing,
 * traffic-coloured road surface, white time pills) rather than asked for from
 * the map service.
 */

const NODE_RADIUS = 9;
const ROAD_WIDTH = 5.5;
const ROAD_CASING_WIDTH = 9;
const ROUTE_WIDTH = 8;
const ROUTE_CASING_WIDTH = 14;

/** Roughly one screen of slack around the network, so panning cannot lose it. */
const CENTER_BOUNDS = {
  minLat: 17.12,
  maxLat: 17.58,
  minLng: 78.24,
  maxLng: 78.68,
};

export interface CityGraphProps {
  graph: Graph;
  roads: RoadState[];
  source: JunctionId;
  destination: JunctionId | null;
  /** Trace step currently on screen, or null when no trace is loaded. */
  step: DijkstraStep | null;
  /** Shortest route for the selected destination (already live-updated). */
  route: Route | null;
  /** True when the trace is finished or not started, so the route may dominate. */
  showRoute: boolean;
  /** Changes whenever the route changes, to restart the dash animation. */
  routeKey: string;
  /** Which free-flow weight source the live graph is using. */
  weightMode: WeightMode;
  onSelectJunction: (id: JunctionId) => void;
}

/** Visual precedence for a road. Exactly one state applies at a time. */
type RoadStateClass =
  | 'candidate' // road being evaluated on this step
  | 'highlighted' // part of the selected shortest route
  | 'tree' // confirmed shortest-path-tree road
  | 'settled' // both endpoints already final
  | 'frontier' // touches the junction being processed
  | 'idle';

export function CityGraph({
  graph,
  roads,
  source,
  destination,
  step,
  route,
  showRoute,
  routeKey,
  weightMode,
  onSelectJunction,
}: CityGraphProps) {
  /* ----------------------------- map viewport ---------------------------- */
  const [mapType, setMapType] = useState<MapTypeId>('roadmap');
  const [zoom, setZoom] = useState<number>(MAP_VIEWPORT.zoom);
  const [center, setCenter] = useState<{ lat: number; lng: number }>(MAP_VIEWPORT.center);
  const [trafficVisible, setTrafficVisible] = useState(true);
  const [useSchematic, setUseSchematic] = useState(!BASEMAP_KEY_CONFIGURED);

  const viewport: Viewport = useMemo(
    () => ({ ...MAP_VIEWPORT, zoom, center }),
    [zoom, center],
  );

  const points = useMemo(
    () => new Map(JUNCTIONS.map((junction) => [junction.id, project(junction, viewport)])),
    [viewport],
  );

  const settled = useMemo(() => new Set(step?.settled ?? []), [step]);

  const treeRoadIds = useMemo(() => {
    if (!step) return new Set<string>();
    return new Set(deriveTreeEdges(graph, step.previous));
  }, [graph, step]);

  const routeRoadIds = useMemo(() => new Set(route?.roadIds ?? []), [route]);

  /* --------------------------------- panning ------------------------------ */
  const dragRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    offsetX: number;
    offsetY: number;
    unitsPerPixel: number;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      offsetX: 0,
      offsetY: 0,
      unitsPerPixel: MAP_VIEWPORT.width / rect.width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const offsetX = event.clientX - drag.originX;
    const offsetY = event.clientY - drag.originY;
    drag.offsetX = offsetX;
    drag.offsetY = offsetY;
    setDragOffset({ x: offsetX, y: offsetY });
  }, []);

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
      setDragOffset(null);

      const dx = drag.offsetX * drag.unitsPerPixel;
      const dy = drag.offsetY * drag.unitsPerPixel;
      if (dx === 0 && dy === 0) return;

      // Keep the geographic point that was grabbed under the same screen point.
      const next = unproject(
        { x: MAP_VIEWPORT.width / 2 - dx, y: MAP_VIEWPORT.height / 2 - dy },
        viewport,
      );
      setCenter({
        lat: clamp(next.lat, CENTER_BOUNDS.minLat, CENTER_BOUNDS.maxLat),
        lng: clamp(next.lng, CENTER_BOUNDS.minLng, CENTER_BOUNDS.maxLng),
      });
    },
    [viewport],
  );

  const changeZoom = useCallback((delta: number) => {
    setZoom((current) => clamp(Math.round(current + delta), MIN_ZOOM, MAX_ZOOM));
  }, []);

  const resetView = useCallback(() => {
    setCenter(MAP_VIEWPORT.center);
    setZoom(MAP_VIEWPORT.zoom);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const stepPx = 48;
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          event.preventDefault();
          const dx = event.key === 'ArrowLeft' ? stepPx : event.key === 'ArrowRight' ? -stepPx : 0;
          const dy = event.key === 'ArrowUp' ? stepPx : event.key === 'ArrowDown' ? -stepPx : 0;
          const next = unproject(
            { x: MAP_VIEWPORT.width / 2 - dx, y: MAP_VIEWPORT.height / 2 - dy },
            viewport,
          );
          setCenter({
            lat: clamp(next.lat, CENTER_BOUNDS.minLat, CENTER_BOUNDS.maxLat),
            lng: clamp(next.lng, CENTER_BOUNDS.minLng, CENTER_BOUNDS.maxLng),
          });
          break;
        }
        case '+':
        case '=':
          event.preventDefault();
          changeZoom(1);
          break;
        case '-':
        case '_':
          event.preventDefault();
          changeZoom(-1);
          break;
        default:
          break;
      }
    },
    [changeZoom, viewport],
  );

  /* ------------------------- algorithm presentation ----------------------- */
  /** Pure function of one road + trace state, so precedence is explicit. */
  const stateFor = (roadState: RoadState): RoadStateClass => {
    const roadId = roadState.road.id;

    // 1. The road under evaluation always wins - it is the focus of the step.
    if (step?.roadId === roadId) return 'candidate';

    // 2. The chosen route, but only when the animation is not competing.
    if (showRoute && routeRoadIds.has(roadId)) return 'highlighted';

    // 3. Confirmed tree edges accumulate as the algorithm discovers them.
    if (treeRoadIds.has(roadId)) return 'tree';

    // 4. Fully processed roads recede.
    if (settled.has(roadState.road.from) && settled.has(roadState.road.to)) return 'settled';

    // 5. Roads touching the junction being processed are the candidate set.
    if (step?.current && (roadState.road.from === step.current || roadState.road.to === step.current)) {
      return 'frontier';
    }

    return 'idle';
  };

  const scale = scaleBar(120);
  const scaleLabel = scale.meters >= 1000 ? `${scale.meters / 1000} km` : `${scale.meters} m`;
  const slowRoads = roads.filter((roadState) => roadState.level !== 'low').length;

  return (
    <div className="gmaps">
      <div
        className={`gmaps__canvas ${dragOffset ? 'is-dragging' : ''}`}
        data-map-type={useSchematic ? 'schematic' : mapType}
        data-traffic={trafficVisible ? 'on' : 'off'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="group"
        aria-label="Map of Hyderabad. Drag, or use the arrow keys, to pan. Plus and minus zoom in and out. Click a junction to make it the destination."
      >
        <div
          className="gmaps__layer"
          style={dragOffset ? { transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` } : undefined}
        >
          <Basemap center={center} zoom={zoom} mapType={useSchematic ? 'roadmap' : mapType} />
          <svg
            className="gmaps__overlay"
            viewBox={`0 0 ${MAP_VIEWPORT.width} ${MAP_VIEWPORT.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <filter id="marker-shadow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.35" />
              </filter>
            </defs>

            {/* ---------------------------- roads ---------------------------- */}
            <g className="roads">
              {roads.map((roadState) => {
                const from = points.get(roadState.road.from);
                const to = points.get(roadState.road.to);
                if (!from || !to) return null;

                const { control } = roadPath(
                  from,
                  to,
                  (roadState.road.curve ?? 0) * curvatureScale(zoom),
                );
                const { start, end } = trimEndpoints(from, to, control, NODE_RADIUS + 3);
                const d = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;

                const state = stateFor(roadState);
                const weight = travelMinutesFor(roadState, weightMode);
                const freeFlow = freeFlowMinutesOf(roadState, weightMode);
                const level = TRAFFIC_LEVELS[roadState.level];
                const chip = labelPosition(from, to, control, 17);
                const hopIndex = route ? route.roadIds.indexOf(roadState.road.id) : -1;
                const title = [
                  `${roadState.road.corridor}`,
                  `${roadState.road.from} to ${roadState.road.to}`,
                  `${level.label} traffic`,
                  `${formatMinutes(weight)} now, ${formatMinutes(freeFlow)} free flow`,
                ].join(', ');

                return (
                  <g
                    key={roadState.road.id}
                    className={`road road--${state} road--${roadState.level}`}
                    data-road={roadState.road.id}
                    data-level={roadState.level}
                  >
                    <title>{title}</title>

                    <path className="road__casing" d={d} strokeWidth={ROAD_CASING_WIDTH} />
                    <path
                      className="road__fill"
                      d={d}
                      strokeWidth={ROAD_WIDTH}
                      stroke={trafficVisible ? level.color : 'var(--gm-road)'}
                    />

                    {state === 'candidate' && (
                      <path
                        key={`probe-${step?.index ?? 0}`}
                        className="road__probe"
                        d={d}
                        strokeWidth={ROUTE_WIDTH}
                        markerEnd="url(#road-arrow)"
                      />
                    )}

                    {state === 'highlighted' && (
                      <>
                        <path
                          className="road__route"
                          d={d}
                          strokeWidth={ROUTE_CASING_WIDTH}
                        />
                        <path
                          key={`route-${routeKey}`}
                          className="road__route-core"
                          d={d}
                          strokeWidth={ROUTE_WIDTH}
                          markerEnd="url(#route-arrow)"
                        />
                        <path
                          className="road__route-flow"
                          d={d}
                          strokeWidth={ROUTE_WIDTH}
                        />
                      </>
                    )}

                    {state === 'highlighted' && hopIndex >= 0 && route && (
                      <RouteArrow
                        from={from}
                        to={to}
                        control={control}
                        forward={route.nodes[hopIndex] === roadState.road.from}
                        position={hopIndex}
                        hopCount={route.nodes.length - 1}
                      />
                    )}

                    {/* Live weight on the road itself, never colour alone. */}
                    <g className="road__chip" transform={`translate(${chip.x} ${chip.y})`}>
                      <rect x={-15} y={-8} width={30} height={16} rx={8} />
                      <text textAnchor="middle" dy="3.5">
                        {weightLabel(weight)}
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>

            {/* --------------------------- junctions --------------------------- */}
            <g className="markers">
              {JUNCTIONS.map((junction) => (
                <JunctionMarker
                  key={junction.id}
                  junction={junction}
                  point={points.get(junction.id) ?? { x: 0, y: 0 }}
                  stateClass={nodeStateClass(junction.id, { source, destination, step, route, showRoute })}
                  isIsolated={(graph.get(junction.id) ?? []).length === 0}
                  distance={step?.distances[junction.id]}
                  onSelect={onSelectJunction}
                />
              ))}
            </g>

            {/* Scale bar, drawn in map units so it stays truthful at any zoom. */}
            <g
              className="gmaps__scale"
              transform={`translate(16 ${MAP_VIEWPORT.height - 20})`}
              aria-hidden="true"
            >
              <line x1={0} y1={-5} x2={0} y2={5} />
              <line x1={0} y1={0} x2={scale.pixels} y2={0} />
              <line x1={scale.pixels} y1={-5} x2={scale.pixels} y2={5} />
              <text x={scale.pixels / 2} y={-9} textAnchor="middle">
                {scaleLabel}
              </text>
            </g>

            <defs>
              <marker
                id="route-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="arrow arrow--route" />
              </marker>
              <marker
                id="road-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className="arrow arrow--probe" />
              </marker>
            </defs>
          </svg>
        </div>

        {/* ------------------------- map chrome ------------------------- */}
        <div className="gmaps__toolbar">
          <div className="gmaps__segmented" role="radiogroup" aria-label="Map type">
            {(Object.keys(MAP_TYPES) as MapTypeId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mapType === id}
                className={`gmaps__segment ${mapType === id ? 'is-active' : ''}`}
                onClick={() => setMapType(id)}
                disabled={useSchematic}
                title={useSchematic ? 'Google map types need a Google Maps API key' : MAP_TYPES[id].hint}
              >
                {MAP_TYPES[id].label}
              </button>
            ))}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={trafficVisible}
            className={`gmaps__toggle ${trafficVisible ? 'is-on' : ''}`}
            onClick={() => setTrafficVisible((visible) => !visible)}
            title="Show or hide the simulated traffic layer"
          >
            <span className="gmaps__toggle-dot" aria-hidden="true" />
            Traffic
          </button>

          <span className="gmaps__summary" title="Roads that are not free-flowing">
            {slowRoads}/{roads.length} roads busy
          </span>
        </div>

        <div className="gmaps__controls">
          <button
            type="button"
            className="gmaps__control gmaps__control--compass"
            onClick={resetView}
            title="Reset the map view"
            aria-label="Reset the map view"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 L15.4 12 L12 10.2 L8.6 12 Z" className="compass__north" />
              <path d="M12 21 L8.6 12 L12 13.8 L15.4 12 Z" className="compass__south" />
            </svg>
          </button>
          <div className="gmaps__zoom">
            <button
              type="button"
              className="gmaps__control"
              onClick={() => changeZoom(1)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              className="gmaps__control"
              onClick={() => changeZoom(-1)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>
          <span className="gmaps__zoom-readout" aria-hidden="true">
            z{zoom}
          </span>
        </div>

        <div className="gmaps__legend">
          <p className="gmaps__legend-title">Traffic</p>
          <ul>
            {(['low', 'moderate', 'heavy'] as const).map((id) => (
              <li key={id} className={`gmaps__legend-item gmaps__legend-item--${id}`}>
                <span className="gmaps__legend-line" aria-hidden="true" />
                {TRAFFIC_LEVELS[id].label}
                <span className="gmaps__legend-factor">{TRAFFIC_LEVELS[id].factor}×</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="gmaps__attribution">
          {staticMapUrl(center, zoom, mapType) !== null && !useSchematic ? (
            <span>Map data ©2026 Google</span>
          ) : (
            <span>Schematic view · no map service</span>
          )}
          {BASEMAP_KEY_CONFIGURED && (
            <button
              type="button"
              className="gmaps__attribution-button"
              onClick={() => setUseSchematic((value) => !value)}
            >
              {useSchematic ? 'Show Google map' : 'Show schematic'}
            </button>
          )}
        </div>

        {!BASEMAP_KEY_CONFIGURED && (
          <p className="gmaps__setup" role="note">
            Add <code>VITE_GOOGLE_MAPS_API_KEY=your_key</code> to <code>.env.local</code> and
            restart the dev server to load the real Google map.
          </p>
        )}
      </div>

      {/* Screen-reader narration of the current animation frame. */}
      <p className="gmaps__caption" role="status" aria-live="polite">
        {describeStep(step, source, destination, route)}
      </p>

      <p className="sr-only">
        City road network: {JUNCTIONS.length} junctions, {roads.length} roads. Shortest route from{' '}
        {source}
        {destination ? ` to ${destination}` : ''}:{' '}
        {route ? formatRouteNodes(route) : 'no route'}.
      </p>
    </div>
  );
}

function weightLabel(minutes: number): string {
  if (!Number.isFinite(minutes)) return '∞';
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Directional arrowhead for one hop of the highlighted route. */
function RouteArrow({
  from,
  to,
  control,
  forward,
  position,
  hopCount,
}: {
  from: Point;
  to: Point;
  control: Point;
  forward: boolean;
  position: number;
  hopCount: number;
}) {
  const t = (position + 1) / (hopCount + 1);
  const arrow = arrowPosition(from, to, control, !forward, t);
  return (
    <path
      className="road__arrow"
      d="M 0 0 L 10 5 L 0 10 z"
      transform={`translate(${arrow.x} ${arrow.y}) rotate(${arrow.angle})`}
    />
  );
}

interface NodeStateInput {
  source: JunctionId;
  destination: JunctionId | null;
  step: DijkstraStep | null;
  route: Route | null;
  showRoute: boolean;
}

/** Marker precedence: source > in-flight > settled > tree/route > idle. */
function nodeStateClass(
  id: JunctionId,
  { source, destination, step, route, showRoute }: NodeStateInput,
): string {
  if (id === source) return 'marker--source';
  if (step?.neighbor === id) return 'marker--candidate';
  if (step?.current === id) return 'marker--current';
  if (step?.settled.includes(id)) return 'marker--settled';
  if (showRoute && route?.nodes.includes(id)) return 'marker--route';
  if (step?.previous?.[id]) return 'marker--tree';
  if (id === destination) return 'marker--destination';
  return 'marker--idle';
}

interface JunctionMarkerProps {
  junction: Junction;
  point: Point;
  isIsolated: boolean;
  stateClass: string;
  distance: number | undefined;
  onSelect: (id: JunctionId) => void;
}

function JunctionMarker({
  junction,
  point,
  isIsolated,
  stateClass,
  distance,
  onSelect,
}: JunctionMarkerProps) {
  const name = nameOffset(junction);
  const showDistance = distance !== undefined && Number.isFinite(distance);
  const accessibleName = [
    `${junction.label}, junction ${junction.id}`,
    junction.purpose,
    isIsolated ? 'isolated, no roads connected' : null,
    showDistance ? `minimum travel time ${formatMinutes(distance)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <g
      className={`marker ${stateClass}${isIsolated ? ' marker--isolated' : ''}`}
      transform={`translate(${point.x} ${point.y})`}
      onClick={() => onSelect(junction.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(junction.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={accessibleName}
      data-junction={junction.id}
    >
      {isIsolated && <circle className="marker__isolation" r={NODE_RADIUS + 6} />}

      <circle className="marker__ring" r={NODE_RADIUS} filter="url(#marker-shadow)" />
      <circle className="marker__pulse" r={NODE_RADIUS + 3} />
      <text className="marker__letter" textAnchor="middle" dy="3.6">
        {junction.id}
      </text>

      {/* Live distance badge - the algorithm's current knowledge about this node. */}
      {showDistance && (
        <g className="marker__chip" transform={`translate(${NODE_RADIUS - 2} ${-NODE_RADIUS - 8})`}>
          <rect x={0} y={-8} width={26} height={15} rx={7.5} />
          <text x={13} y={3} textAnchor="middle">
            {weightLabel(distance)}
          </text>
        </g>
      )}

      <text
        className="marker__name"
        x={name.dx}
        y={name.dy}
        textAnchor={name.anchor}
        dy={name.verticalAlign}
      >
        {junction.label}
      </text>
    </g>
  );
}

/** Label placement per junction, kept clear of the roads. */
function nameOffset(junction: Junction): {
  dx: number;
  dy: number;
  anchor: 'start' | 'middle' | 'end';
  verticalAlign: string;
} {
  const gap = NODE_RADIUS + 6;
  switch (junction.labelAnchor) {
    case 'top':
      return { dx: 0, dy: -gap, anchor: 'middle', verticalAlign: '0' };
    case 'bottom':
      return { dx: 0, dy: gap, anchor: 'middle', verticalAlign: '1em' };
    case 'left':
      return { dx: -gap, dy: 0, anchor: 'end', verticalAlign: '-0.35em' };
    case 'right':
    default:
      return { dx: gap, dy: 0, anchor: 'start', verticalAlign: '-0.35em' };
  }
}

/** Text narration of the current frame, for screen readers and the log. */
function describeStep(
  step: DijkstraStep | null,
  source: JunctionId,
  destination: JunctionId | null,
  route: Route | null,
): string {
  if (!step) {
    return route
      ? `Best route ${formatRouteNodes(route)}, ${formatMinutes(route.totalMinutes)}. Press "Run Dijkstra" to trace the algorithm step by step.`
      : 'Press "Run Dijkstra" to trace the algorithm step by step.';
  }
  switch (step.kind) {
    case 'init':
      return `Initialised. distance[${source}] = 0, every other junction starts at infinity.`;
    case 'select':
      return `Processing junction ${step.current}, the unvisited junction with the smallest distance.`;
    case 'stale':
      return `Discarded an outdated priority-queue entry for ${step.current}.`;
    case 'relax':
      return `Road ${step.roadId}: ${step.current} to ${step.neighbor}. New distance ${step.candidate?.toFixed(
        1,
      )} minutes, which is better, so the distance and previous junction are updated.`;
    case 'no-relax':
      return `Road ${step.roadId}: ${step.current} to ${step.neighbor}. No improvement, nothing changes.`;
    case 'settle':
      return `Junction ${step.current} is final.`;
    case 'done':
      return destination
        ? `Finished. The shortest route to ${destination} is highlighted on the map.`
        : 'Finished. Minimum travel times are listed on the right.';
    default:
      return '';
  }
}
