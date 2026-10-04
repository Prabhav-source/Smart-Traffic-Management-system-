import { useMemo } from 'react';
import { extraMinutes, formatRouteNodes, type Route, type RouteComparison } from '@/algorithm/paths';
import { JUNCTIONS, getJunction } from '@/data/cityGraph';
import { formatMinutes } from '@/logic/traffic';
import type { DijkstraStep } from '@/algorithm/dijkstra';
import type { Graph, JunctionId, ShortestPathResult } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Right column: the answer, plus the reasoning behind it
 * ---------------------------------------------------------------------------
 * Three stacked cards:
 *   1. the selected route, leg by leg, with cumulative times,
 *   2. the routes Dijkstra rejected (bounded alternatives + tie detection),
 *   3. the shortest-path tree, i.e. the minimum time from the source to every
 *      junction, which is the algorithm's real output.
 *
 * Every number here is read from the live graph, so the column stays correct
 * even while the animation is rewound to step 0.
 */

export interface ResultsPanelProps {
  graph: Graph;
  result: ShortestPathResult;
  routeTable: Map<JunctionId, Route | null>;
  comparison: RouteComparison;
  source: JunctionId;
  destination: JunctionId | null;
  /** Current trace frame, used for the "live" column and progress hints. */
  step: DijkstraStep;
  onSelectDestination: (id: JunctionId) => void;
}

export function ResultsPanel({
  graph,
  result,
  routeTable,
  comparison,
  source,
  destination,
  step,
  onSelectDestination,
}: ResultsPanelProps) {
  const route = destination ? routeTable.get(destination) ?? null : null;
  const legs = useMemo(() => (route ? routeLegs(graph, route) : []), [graph, route]);

  return (
    <div className="panel-stack">
      {/* ------------------------- selected route ------------------------- */}
      <section className="card card--route">
        <header className="card__header card__header--inline">
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              🛣
            </span>
            Selected Route
          </h2>
          {comparison.hasTie && (
            <span className="state-pill state-pill--candidate">
              {comparison.tiedCount}-way tie
            </span>
          )}
        </header>

        <div className="card__body">
          {!destination ? (
            <p className="hint">
              No destination selected. Click a junction on the map or a row in the
              shortest-path table to route to it.
            </p>
          ) : !route ? (
            <div className="notice notice--warn">
              <strong>No route from {source} to {destination}.</strong>
              <p>
                {getJunction(destination)?.label ?? destination} is not reachable, so its distance
                stays at <code>∞</code>. Connect Uppal Junction to bring the network back
                together.
              </p>
            </div>
          ) : route.nodes.length === 1 ? (
            <p className="hint">
              Source and destination are the same junction &mdash; the optimal route is the
              empty route at <strong>0 min</strong>.
            </p>
          ) : (
            <>
              <p className="route-summary">
                <span className="route-summary__time">{formatMinutes(route.totalMinutes)}</span>
                <span className="route-summary__meta">
                  over {route.roadIds.length} road{route.roadIds.length === 1 ? '' : 's'} via{' '}
                  {formatRouteNodes(route)}
                </span>
              </p>

              <ol className="route-legs">
                {legs.map((leg) => (
                  <li
                    key={leg.roadId}
                    className={`route-leg ${leg.isFinal ? 'is-final' : ''}`}
                  >
                    <span className="route-leg__index" aria-hidden="true">
                      {leg.position}
                    </span>
                    <span className="route-leg__main">
                      <span className="route-leg__nodes">
                        {leg.from} → {leg.to}
                      </span>
                      <span className="route-leg__road">
                        {leg.roadId} · {getJunction(leg.to)?.label ?? leg.to}
                      </span>
                    </span>
                    <span className="route-leg__numbers">
                      <span className="route-leg__weight">{formatMinutes(leg.weight)}</span>
                      <span className="route-leg__cumulative">
                        Σ {formatMinutes(leg.cumulative)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </section>

      {/* --------------------------- alternatives -------------------------- */}
      <section className="card card--alternatives">
        <header className="card__header">
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              🔀
            </span>
            Route Alternatives
          </h2>
          <p className="card__subtitle">
            Cheapest-first simple paths, compared against the same live weights Dijkstra used.
          </p>
        </header>

        <div className="card__body">
          {!destination ? (
            <p className="hint">Select a destination to compare routes.</p>
          ) : comparison.alternatives.length === 0 ? (
            <p className="hint">
              {route ? 'No other simple route exists to this destination.' : 'No route exists.'}
            </p>
          ) : (
            <ol className="alternative-list">
              {comparison.alternatives.map((alternative, index) => {
                const delta = extraMinutes(alternative, comparison.best);
                return (
                  <li key={alternative.nodes.join('>')} className="alternative">
                    <span className="alternative__rank" aria-hidden="true">
                      {index + 2}
                    </span>
                    <span className="alternative__body">
                      <span className="alternative__path">
                        {formatRouteNodes(alternative)}
                      </span>
                      <span className="alternative__roads">
                        {alternative.roadIds.length} road
                        {alternative.roadIds.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="alternative__numbers">
                      <span className="alternative__time">
                        {formatMinutes(alternative.totalMinutes)}
                      </span>
                      <span className="alternative__delta">+{formatMinutes(delta ?? 0)}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {comparison.hasTie && (
            <p className="notice">
              <strong>Tie detected.</strong> {comparison.tiedCount} distinct routes cost exactly{' '}
              {comparison.best ? formatMinutes(comparison.best.totalMinutes) : '—'}. Dijkstra
              reports one of them; it is not uniquely optimal.
            </p>
          )}
        </div>
      </section>

      {/* ---------------------- shortest path tree table ------------------- */}
      <section className="card card--table">
        <header className="card__header">
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              📋
            </span>
            Shortest-Path Tree
          </h2>
          <p className="card__subtitle">
            Minimum travel time from {source} to every junction, after the full run.
          </p>
        </header>

        <div className="card__body card__body--flush">
          <table className="table table--results">
            <thead>
              <tr>
                <th scope="col">Junction</th>
                <th scope="col">Time</th>
                <th scope="col">Route</th>
                <th scope="col">Live</th>
                <th scope="col">
                  <span className="sr-only">Select as destination</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {JUNCTIONS.map((junction) => {
                const distance = result.distance.get(junction.id) ?? Number.POSITIVE_INFINITY;
                const parent = result.previous.get(junction.id) ?? null;
                const junctionRoute = routeTable.get(junction.id) ?? null;
                const liveDistance = step.distances[junction.id];
                const liveKnown = liveDistance !== undefined && Number.isFinite(liveDistance);
                const isDestination = junction.id === destination;

                return (
                  <tr
                    key={junction.id}
                    className={
                      isDestination
                        ? 'is-destination'
                        : result.unreachable.includes(junction.id)
                          ? 'is-unreachable'
                          : ''
                    }
                  >
                    <th scope="row">
                      <span className="node-key">{junction.id}</span>
                      <span className="result-name">{junction.label}</span>
                      <span className="result-purpose">{junction.purpose}</span>
                    </th>
                    <td className="numeric">
                      {Number.isFinite(distance) ? (
                        formatMinutes(distance)
                      ) : (
                        <span className="unreachable">∞</span>
                      )}
                      {parent && (
                        <span className="result-prev">via {parent}</span>
                      )}
                    </td>
                    <td className="result-path">
                      {junctionRoute ? formatRouteNodes(junctionRoute) : '—'}
                    </td>
                    <td className="numeric numeric--muted">
                      {liveKnown ? formatMinutes(liveDistance) : liveDistance === undefined ? '—' : '∞'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`link-button ${isDestination ? 'is-active' : ''}`}
                        onClick={() => onSelectDestination(junction.id)}
                        disabled={junction.id === source}
                        title={
                          junction.id === source
                            ? 'The source is always 0 min away'
                            : `Route to ${junction.id}`
                        }
                      >
                        {isDestination ? 'target' : 'route'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

interface RouteLeg {
  position: number;
  from: JunctionId;
  to: JunctionId;
  roadId: string;
  weight: number;
  cumulative: number;
  isFinal: boolean;
}

/** Turns a route into per-hop rows with the weight and running total. */
function routeLegs(graph: Graph, route: Route): RouteLeg[] {
  const legs: RouteLeg[] = [];
  let cumulative = 0;

  for (let i = 0; i < route.roadIds.length; i += 1) {
    const from = route.nodes[i];
    const to = route.nodes[i + 1];
    const roadId = route.roadIds[i];
    const edge = (graph.get(from) ?? []).find(
      (entry) => entry.to === to && entry.roadId === roadId,
    );
    const weight = edge?.weight ?? 0;
    cumulative += weight;
    legs.push({
      position: i + 1,
      from,
      to,
      roadId,
      weight,
      cumulative,
      isFinal: i === route.roadIds.length - 1,
    });
  }

  return legs;
}
