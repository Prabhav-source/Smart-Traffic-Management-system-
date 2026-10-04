import type { DijkstraStep } from '@/algorithm/dijkstra';
import { JUNCTIONS } from '@/data/cityGraph';
import { formatMinutes, roundMinutes } from '@/logic/traffic';
import type { Graph, JunctionId } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Algorithm status panel
 * ---------------------------------------------------------------------------
 * Four things the brief asks to be visible while the algorithm runs:
 *   1. the junction currently being processed (pseudocode step 4),
 *   2. the live shortest known distance to every junction (distance[]),
 *   3. the predecessor pointers (previous[]) and the visited set,
 *   4. the roads being evaluated right now, with the candidate total.
 *
 * The road list is read from the live adjacency list, so it always shows the
 * real neighbours of the current junction rather than a guess based on the
 * road-id naming convention.
 */

export interface StatusPanelProps {
  /** Live weighted adjacency list: the only reliable source of neighbours. */
  graph: Graph;
  step: DijkstraStep;
  source: JunctionId;
  stepIndex: number;
  totalSteps: number;
  /** Junctions with no route from the source, from the finished result. */
  unreachable: JunctionId[];
}

const KIND_LABEL: Record<DijkstraStep['kind'], string> = {
  init: 'Initialise',
  select: 'Select minimum',
  stale: 'Discard stale entry',
  relax: 'Relax (update)',
  'no-relax': 'No improvement',
  settle: 'Mark visited',
  done: 'Finish',
};

interface NeighbourRow {
  id: JunctionId;
  label: string;
  roadId: string;
  weight: number;
  known: number;
  candidate: number;
  improves: boolean;
  isUnderTest: boolean;
  isSettled: boolean;
}

export function StatusPanel({
  graph,
  step,
  source,
  stepIndex,
  totalSteps,
  unreachable,
}: StatusPanelProps) {
  const currentLabel = junctionLabel(step.current);
  const currentDistance = step.current ? step.distances[step.current] : undefined;
  const hasCurrentDistance = currentDistance !== undefined && Number.isFinite(currentDistance);
  const settledNow = step.settled.length;

  // Real neighbours of the junction being processed, straight from the graph.
  const checking: NeighbourRow[] =
    step.current && hasCurrentDistance
      ? (graph.get(step.current) ?? []).map((entry) => {
          const known = step.distances[entry.to] ?? Number.POSITIVE_INFINITY;
          const candidate = roundMinutes((currentDistance as number) + entry.weight);
          return {
            id: entry.to,
            label: JUNCTIONS.find((junction) => junction.id === entry.to)?.label ?? entry.to,
            roadId: entry.roadId,
            weight: entry.weight,
            known,
            candidate,
            improves: candidate < known,
            isUnderTest: step.neighbor === entry.to && step.roadId === entry.roadId,
            isSettled: step.settled.includes(entry.to),
          };
        })
      : [];

  return (
    <section className="card card--status">
      <header className="card__header card__header--inline">
        <h2 className="card__title">
          <span className="card__icon" aria-hidden="true">
            ⚙
          </span>
          Algorithm Status
        </h2>
        <span className={`state-pill state-pill--${step.kind}`}>{KIND_LABEL[step.kind]}</span>
      </header>

      <div className="card__body status-body">
        {/* Pseudocode step 4, spelled out. */}
        <div className="status-hero">
          <div className="status-hero__item">
            <span className="status-hero__label">Current node</span>
            <span className="status-hero__value">{currentLabel ?? '—'}</span>
          </div>
          <div className="status-hero__item">
            <span className="status-hero__label">distance[{step.current ?? '—'}]</span>
            <span className="status-hero__value">
              {hasCurrentDistance ? formatMinutes(currentDistance as number) : '∞'}
            </span>
          </div>
          <div className="status-hero__item">
            <span className="status-hero__label">Visited</span>
            <span className="status-hero__value">
              {settledNow} / {JUNCTIONS.length}
            </span>
          </div>
          <div className="status-hero__item">
            <span className="status-hero__label">Queue size</span>
            <span className="status-hero__value">{step.queue.length}</span>
          </div>
        </div>

        <div className="status-columns">
          {/* Live working memory: distance[] and previous[]. */}
          <div className="status-table">
            <h3 className="sub-title">
              Shortest known distance
              <span className="sub-title__note">distance[] / previous[]</span>
            </h3>
            <table className="table table--compact">
              <thead>
                <tr>
                  <th scope="col">Junction</th>
                  <th scope="col">distance[]</th>
                  <th scope="col">previous[]</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {JUNCTIONS.map((junction) => {
                  const distance = step.distances[junction.id];
                  const previous = step.previous[junction.id] ?? null;
                  const isSettled = step.settled.includes(junction.id);
                  const isCurrent = step.current === junction.id;
                  const isNeighbor = step.neighbor === junction.id;

                  return (
                    <tr
                      key={junction.id}
                      className={
                        isCurrent
                          ? 'is-current'
                          : isNeighbor
                            ? 'is-neighbor'
                            : isSettled
                              ? 'is-settled'
                              : ''
                      }
                    >
                      <th scope="row">
                        <span className="node-key">{junction.id}</span> {junction.label}
                      </th>
                      <td className="numeric">
                        {distance !== undefined && Number.isFinite(distance)
                          ? formatMinutes(distance)
                          : '∞'}
                      </td>
                      <td className="numeric">{previous ?? '—'}</td>
                      <td>
                        <span
                          className={`state-pill state-pill--${
                            isCurrent
                              ? 'current'
                              : isSettled
                                ? 'settled'
                                : isNeighbor
                                  ? 'candidate'
                                  : 'idle'
                          }`}
                        >
                          {isCurrent
                            ? 'current'
                            : isSettled
                              ? 'visited'
                              : isNeighbor
                                ? 'checking'
                                : 'unvisited'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* The neighbour-relaxation loop, step by step. */}
          <div className="status-log">
            <h3 className="sub-title">
              Step {Math.min(stepIndex + 1, Math.max(totalSteps, 1))} of {totalSteps} —{' '}
              {step.action}
              <span className="sub-title__note">source = {source}</span>
            </h3>
            <ol className="log" aria-live="polite">
              {step.lines.map((line, lineIndex) => (
                <li key={`${step.index}-${lineIndex}`} className="log__line">
                  {line}
                </li>
              ))}
            </ol>

            {checking.length > 0 && (
              <>
                <h3 className="sub-title">
                  Roads out of {step.current}
                  <span className="sub-title__note">
                    candidate = distance[{step.current}] + weight
                  </span>
                </h3>
                <ul className="neighbour-list">
                  {checking.map((row) => (
                    <li
                      key={`${row.roadId}-${row.id}`}
                      className={`neighbour ${row.isUnderTest ? 'is-active' : ''}`}
                    >
                      <span className="neighbour__arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="neighbour__node">{row.id}</span>
                      <span className="neighbour__name">{row.label}</span>
                      <span className="neighbour__road">via {row.roadId}</span>
                      <span className="neighbour__math">
                        {formatMinutes(row.candidate)} vs best{' '}
                        {Number.isFinite(row.known) ? formatMinutes(row.known) : '∞'}
                      </span>
                      <span
                        className={`neighbour__verdict ${
                          row.isSettled ? 'is-settled' : row.improves ? 'is-better' : 'is-worse'
                        }`}
                      >
                        {row.isSettled
                          ? 'final'
                          : row.improves
                            ? 'improves'
                            : 'no update'}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Priority queue contents - the min-heap, in priority order. */}
        <div className="status-queue">
          <h3 className="sub-title">
            Priority queue (binary min-heap)
            <span className="sub-title__note">lowest distance first</span>
          </h3>
          {step.queue.length === 0 ? (
            <p className="hint">Empty — the algorithm has finished.</p>
          ) : (
            <ul className="heap">
              {step.queue.map((entry, queueIndex) => (
                <li key={`${entry.node}-${queueIndex}`} className="heap__item">
                  <span className="heap__index">{queueIndex}</span>
                  <span className="node-key">{entry.node}</span>
                  <span className="heap__priority">{formatMinutes(entry.priority)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {unreachable.length > 0 && step.kind === 'done' && (
          <p className="notice notice--warn">
            No route exists to: {unreachable.join(', ')}. Dijkstra finished without ever reaching
            these junctions — they remain at <code>∞</code>.
          </p>
        )}
      </div>
    </section>
  );
}

function junctionLabel(id: JunctionId | null): string | null {
  if (!id) return null;
  const junction = JUNCTIONS.find((candidate) => candidate.id === id);
  return junction ? `${junction.id} (${junction.label})` : id;
}
