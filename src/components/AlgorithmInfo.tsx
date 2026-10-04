import { TRAFFIC_LEVELS, TRAFFIC_LEVEL_ORDER } from '@/logic/traffic';
import type { Graph } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Bottom strip: legend, complexity analysis and the pseudocode being executed
 * ---------------------------------------------------------------------------
 * The assignment is a teaching prototype, so the reasoning has to be visible,
 * not just the result.
 */

export interface AlgorithmInfoProps {
  graph: Graph;
  /** Junctions with no route, from the finished run. */
  unreachable: string[];
  /** Total trace length, i.e. how many observable state changes were recorded. */
  totalSteps: number;
}

/** The pseudocode exactly as the implementation runs it. */
const PSEUDOCODE: string[] = [
  'Dijkstra(Graph, source):',
  '  for each vertex v:',
  '    distance[v] ← ∞;  previous[v] ← null',
  '  distance[source] ← 0',
  '  priorityQueue ← empty',
  '  insert (source, 0) into priorityQueue        ← binary min-heap',
  '  while priorityQueue is not empty:',
  '    current ← extractMin(priorityQueue)         ← smallest distance',
  '    if priority < distance[current]: continue    ← stale entry, lazy delete',
  '    for each neighbour n of current:',
  '      candidate ← distance[current] + weight(current, n)',
  '      if candidate < distance[n]:',
  '        distance[n] ← candidate',
  '        previous[n]  ← current',
  '        insert (n, candidate) into priorityQueue',
  '    mark current as visited                       ← distance is now final',
  '  return distance, previous',
];

const NODE_LEGEND: Array<{ swatch: string; label: string; description: string }> = [
  { swatch: 'marker--source', label: 'Source', description: 'distance = 0' },
  { swatch: 'marker--current', label: 'Current', description: 'lowest distance in the queue' },
  { swatch: 'marker--candidate', label: 'Checking', description: 'road under evaluation' },
  { swatch: 'marker--settled', label: 'Visited', description: 'distance is final' },
  { swatch: 'marker--tree', label: 'Tree', description: 'has a confirmed predecessor' },
  { swatch: 'marker--destination', label: 'Destination', description: 'selected target' },
  { swatch: 'marker--isolated', label: 'Isolated', description: 'no roads connected' },
];

const EDGE_LEGEND: Array<{ swatch: string; label: string; description: string }> = [
  { swatch: 'road--idle', label: 'Idle', description: 'not reached yet' },
  { swatch: 'road--frontier', label: 'Frontier', description: 'touches the current junction' },
  { swatch: 'road--tree', label: 'Tree', description: 'shortest-path-tree road' },
  { swatch: 'road--settled', label: 'Settled', description: 'both ends final' },
  { swatch: 'road--candidate', label: 'Examined', description: 'this step’s road' },
  { swatch: 'road--highlighted', label: 'Route', description: 'chosen shortest route' },
];

export function AlgorithmInfo({ graph, unreachable, totalSteps }: AlgorithmInfoProps) {
  const vertexCount = graph.size;
  const edgeCount = [...graph.values()].reduce((sum, neighbours) => sum + neighbours.length, 0) / 2;

  return (
    <div className="info-strip">
      {/* ------------------------------ legend ---------------------------- */}
      <section className="card card--legend">
        <header className="card__header">
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              🎨
            </span>
            Legend
          </h2>
        </header>
        <div className="card__body">
          <h3 className="sub-title">Congestion (edge weight)</h3>
          <ul className="legend-list legend-list--traffic">
            {TRAFFIC_LEVEL_ORDER.map((level) => {
              const meta = TRAFFIC_LEVELS[level];
              return (
                <li key={level} className="legend-item">
                  <span
                    className={`swatch swatch--traffic swatch--${level}`}
                    style={{ background: meta.color }}
                    aria-hidden="true"
                  />
                  <span className="legend-item__label">{meta.label}</span>
                  <span className="legend-item__detail">×{meta.factor}</span>
                </li>
              );
            })}
            <li className="legend-item">
              <span className="swatch swatch--override" aria-hidden="true" />
              <span className="legend-item__label">Custom</span>
              <span className="legend-item__detail">manual weight</span>
            </li>
          </ul>

          <h3 className="sub-title">Junctions</h3>
          <ul className="legend-list">
            {NODE_LEGEND.map((item) => (
              <li key={item.label} className="legend-item">
                <span className={`swatch ${item.swatch}`} aria-hidden="true" />
                <span className="legend-item__label">{item.label}</span>
                <span className="legend-item__detail">{item.description}</span>
              </li>
            ))}
          </ul>

          <h3 className="sub-title">Roads</h3>
          <ul className="legend-list">
            {EDGE_LEGEND.map((item) => (
              <li key={item.label} className="legend-item">
                <span className={`swatch swatch--line ${item.swatch}`} aria-hidden="true" />
                <span className="legend-item__label">{item.label}</span>
                <span className="legend-item__detail">{item.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------- complexity --------------------------- */}
      <section className="card card--complexity">
        <header className="card__header">
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              📐
            </span>
            Complexity
          </h2>
          <p className="card__subtitle">
            A binary min-heap is used for the priority queue, which is what upgrades Dijkstra from
            O(V²) to O(E log V).
          </p>
        </header>
        <div className="card__body">
          <table className="table table--complexity">
            <thead>
              <tr>
                <th scope="col">Operation</th>
                <th scope="col">Time</th>
                <th scope="col">Space</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Heap insert / extract-min</th>
                <td className="numeric">O(log V)</td>
                <td className="numeric">O(1)</td>
              </tr>
              <tr>
                <th scope="row">Relaxing one road</th>
                <td className="numeric">O(1)</td>
                <td className="numeric">O(1)</td>
              </tr>
              <tr className="is-highlight">
                <th scope="row">Dijkstra (whole run)</th>
                <td className="numeric">O((V + E) log V)</td>
                <td className="numeric">O(V + E)</td>
              </tr>
              <tr>
                <th scope="row">Path reconstruction</th>
                <td className="numeric">O(V)</td>
                <td className="numeric">O(V)</td>
              </tr>
              <tr>
                <th scope="row">k-alternative search</th>
                <td className="numeric">O(P · log P), P = partial paths</td>
                <td className="numeric">O(P · V)</td>
              </tr>
            </tbody>
          </table>

          <dl className="fact-list">
            <div className="fact">
              <dt>Vertices (V)</dt>
              <dd>{vertexCount} junctions</dd>
            </div>
            <div className="fact">
              <dt>Edges (E)</dt>
              <dd>{edgeCount} bidirectional roads</dd>
            </div>
            <div className="fact">
              <dt>Recorded state changes</dt>
              <dd>{totalSteps} trace steps</dd>
            </div>
            <div className="fact">
              <dt>Unreachable</dt>
              <dd>{unreachable.length > 0 ? unreachable.join(', ') : 'none'}</dd>
            </div>
          </dl>

          <p className="hint">
            All weights are travel times in minutes, so they satisfy Dijkstra&rsquo;s precondition
            of being finite and non-negative. Negative values are rejected before the run starts.
          </p>
        </div>
      </section>

      {/* --------------------------- pseudocode --------------------------- */}
      <section className="card card--pseudocode">
        <header className="card__header">
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              {'{ }'}
            </span>
            Pseudocode
          </h2>
          <p className="card__subtitle">
            The trace in the status panel is emitted by exactly these steps.
          </p>
        </header>
        <div className="card__body">
          <pre className="pseudocode">
            <code>{PSEUDOCODE.join('\n')}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}
