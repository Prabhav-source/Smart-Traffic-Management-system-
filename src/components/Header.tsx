import { getJunction } from '@/data/cityGraph';
import { formatMinutes } from '@/logic/traffic';
import type { JunctionId } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Top bar: project identity plus the KPI strip
 * ---------------------------------------------------------------------------
 * The KPIs are always read from the *live* graph, never from the animation, so
 * they keep updating while traffic is edited and the trace is rewound.
 */

export interface HeaderProps {
  source: JunctionId;
  destination: JunctionId | null;
  /** Best route total, or null when the destination cannot be reached. */
  bestMinutes: number | null;
  roadCount: number;
  junctionCount: number;
  /** Sum of every live edge weight, in minutes. */
  networkMinutes: number;
  /** Junctions finalised by the finished run. */
  visitedCount: number;
  /** How many equally fast routes were found. */
  bestRouteCount: number;
  /** Highest simultaneous heap occupancy, from the finished run. */
  maxHeapSize: number;
  isPlaying: boolean;
}

export function Header({
  source,
  destination,
  bestMinutes,
  roadCount,
  junctionCount,
  networkMinutes,
  visitedCount,
  bestRouteCount,
  maxHeapSize,
  isPlaying,
}: HeaderProps) {
  const sourceLabel = getJunction(source)?.label ?? source;

  return (
    <header className="app-header">
      <div className="app-header__top">
        <div className="app-header__identity">
          <span className="app-header__mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" role="presentation">
              <circle cx="16" cy="16" r="15" className="app-header__ring" />
              <circle cx="16" cy="16" r="6" className="app-header__core" />
              <path d="M16 1 L16 10 M31 16 L22 16 M16 31 L16 22 M1 16 L10 16" className="app-header__spokes" />
            </svg>
          </span>
          <div>
            <h1 className="app-header__title">Smart Traffic Signal Management</h1>
            <p className="app-header__subtitle">
              Emergency vehicle routing with Dijkstra&rsquo;s Single-Source Shortest Path
              Algorithm &mdash; weighted by live congestion
            </p>
          </div>
        </div>

        <div className="app-header__state">
          <span className={`state-pill state-pill--${isPlaying ? 'playing' : 'finished'}`}>
            <span className="pulse-dot" aria-hidden="true" />
            {isPlaying ? 'Algorithm running' : 'Ready for dispatch'}
          </span>
          <span className="app-header__origin">
            Dispatch from <strong>{sourceLabel}</strong>
            {destination ? (
              <>
                {' '}
                to <strong>{getJunction(destination)?.label ?? destination}</strong>
              </>
            ) : null}
          </span>
        </div>
      </div>

      <dl className="kpi-strip">
        <Metric
          label="Minimum travel time"
          value={bestMinutes === null ? 'No route' : formatMinutes(bestMinutes)}
          note={
            bestRouteCount > 1
              ? `${bestRouteCount} equally fast routes`
              : 'unique fastest route'
          }
          tone={bestMinutes === null ? 'warn' : 'good'}
        />
        <Metric
          label="Junctions visited"
          value={`${visitedCount} / ${junctionCount}`}
          note="finalised by the run"
        />
        <Metric
          label="Roads in network"
          value={String(roadCount)}
          note={`${formatMinutes(networkMinutes)} total travel time`}
        />
        <Metric
          label="Peak priority queue"
          value={String(maxHeapSize)}
          note="binary min-heap entries"
        />
      </dl>
    </header>
  );
}

function Metric({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <div className={`metric metric--${tone}`}>
      <dt className="metric__label">{label}</dt>
      <dd className="metric__value">{value}</dd>
      <dd className="metric__note">{note}</dd>
    </div>
  );
}
