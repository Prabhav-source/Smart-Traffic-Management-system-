import { runDijkstraWithTrace } from '@/algorithm/dijkstra';
import { buildRouteTable, compareRoutes, findAlternativeRoutes, reconstructRoute } from '@/algorithm/paths';
import {
  DEFAULT_DESTINATION,
  DEFAULT_SOURCE,
  OLD_TOWN_LINK,
  ROADS,
  createInitialNetworkState,
} from '@/data/cityGraph';
import { buildGraph, totalNetworkMinutes, validateGraph } from '@/logic/graph';
import {
  TRAFFIC_PRESETS,
  applyPreset,
  travelMinutesFor,
  validateTravelMinutes,
} from '@/logic/traffic';
import { MinHeap } from '@/algorithm/minHeap';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      expected ${e}\n      actual   ${a}`}`);
}

// --- min-heap invariants -----------------------------------------------------
{
  const heap = new MinHeap();
  for (const [node, priority] of [
    ['C', 3],
    ['A', 1],
    ['B', 2],
    ['D', 0.5],
    ['E', 9],
  ] as const) {
    heap.push(node, priority);
  }
  const popped: Array<[string, number]> = [];
  while (!heap.isEmpty) {
    const entry = heap.pop()!;
    popped.push([entry.node, entry.priority]);
  }
  check('heap pops in ascending priority order', popped, [
    ['D', 0.5],
    ['A', 1],
    ['B', 2],
    ['C', 3],
    ['E', 9],
  ]);
  check('empty heap returns null', heap.pop(), null);
}

// --- traffic model -----------------------------------------------------------
{
  const road = { road: { id: 'A-B', from: 'A', to: 'B', baseMinutes: 4 }, level: 'heavy' as const, overrideMinutes: null };
  check('heavy doubles free-flow time', travelMinutesFor(road), 8);
  check('moderate is 1.5x and rounds to 1dp', travelMinutesFor({ ...road, level: 'moderate' }), 6);
  check('override beats congestion', travelMinutesFor({ ...road, overrideMinutes: 3.25 }), 3.3);
  check('rejects blank', validateTravelMinutes('  ').ok, false);
  check('rejects non-numeric', validateTravelMinutes('12px').ok, false);
  check('rejects negative', validateTravelMinutes('-4').ok, false);
  check('rejects infinite', validateTravelMinutes('Infinity').ok, false);
  check('accepts zero', validateTravelMinutes('0'), { ok: true, value: 0, error: null });
  check('accepts decimal', validateTravelMinutes('4.5'), { ok: true, value: 4.5, error: null });
}

// --- graph construction ------------------------------------------------------
const initial = createInitialNetworkState();
const initialGraph = buildGraph(initial);
check('isolated junction G has no roads', initialGraph.get('G'), []);
check('graph has no problems', validateGraph(initialGraph), []);
check('network minutes sum to base times', totalNetworkMinutes(initial.roads), 43);

const linkedGraph = buildGraph({
  roads: [...initial.roads, { road: OLD_TOWN_LINK, level: 'low' as const, overrideMinutes: null }],
  isolatedJunctions: [],
});
check('linking Old Town gives G one road', (linkedGraph.get('G') ?? []).length, 1);

// --- Dijkstra correctness ----------------------------------------------------
{
  const run = runDijkstraWithTrace(initialGraph, DEFAULT_SOURCE);
  const d = run.result.distance;
  check('distance[A] = 0', d.get('A'), 0);
  check('distance[B] = 4 (direct A-B)', d.get('B'), 4);
  check('distance[C] = 2 (direct A-C)', d.get('C'), 2);
  check('distance[D] = 5 (A-C-D)', d.get('D'), 5);
  check('distance[E] = 7 (A-C-D-E)', d.get('E'), 7);
  check('distance[F] = 10 (A-C-D-F)', d.get('F'), 10);
  check('distance[G] = Infinity (isolated)', d.get('G'), null);
  check('unreachable list', run.result.unreachable, ['G']);
  check('settled order', run.result.settledOrder, ['A', 'C', 'B', 'D', 'E', 'F']);
  check('trace ends with a done step', run.steps[run.steps.length - 1].kind, 'done');
  check('trace starts with init', run.steps[0].kind, 'init');
  check('trace has settle + select + relax steps', ['select', 'relax', 'settle', 'no-relax'].every((k) => run.steps.some((s) => s.kind === k)), true);

  const route = reconstructRoute(run.result, initialGraph, DEFAULT_DESTINATION);
  check('route to E', route?.nodes, ['A', 'C', 'D', 'E']);
  check('route roads to E', route?.roadIds, ['A-C', 'C-D', 'D-E']);
  check('route total', route?.totalMinutes, 7);

  const table = buildRouteTable(run.result, initialGraph);
  check('route table covers every junction', table.size, 7);
  check('route table marks G unreachable', table.get('G'), null);

  // Hospital claim check: A -> B must be 4 min via the direct road, not 7.
  const toB = reconstructRoute(run.result, initialGraph, 'B');
  check('route to B uses the direct A-B road', [toB?.roadIds, toB?.totalMinutes], [['A-B'], 4]);
}

// --- Old Town linked ---------------------------------------------------------
{
  const run = runDijkstraWithTrace(linkedGraph, DEFAULT_SOURCE);
  check('G reachable once linked', run.result.distance.get('G'), 6);
  check('nothing unreachable once linked', run.result.unreachable, []);
}

// --- alternatives and tie detection -----------------------------------------
{
  // A -> B -> C costs 4 + 5 = 9, and A -> B direct costs 4, so no tie there.
  const comparison = compareRoutes(initialGraph, 'A', 'C', 4);
  check('shortest A->C is the direct road', comparison.best?.roadIds, ['A-C']);
  check('alternative A->B->C is 9 min', comparison.alternatives[0]?.totalMinutes, 9);
  check('no tie on A->C', comparison.hasTie, false);

  // A -> C -> D (2 + 3 = 5) vs A -> B -> D (4 + 10 = 14): no tie.
  const toD = compareRoutes(initialGraph, 'A', 'D', 4);
  check('shortest A->D', toD.best?.roadIds, ['A-C', 'C-D']);

  // Build a genuine tie: A-B = 1, B-C = 1 and A-C = 2 all reach C in 2 min.
  const tieGraph = buildGraph({
    roads: initial.roads.map((r) => {
      if (r.road.id === 'A-B') return { ...r, road: { ...r.road, baseMinutes: 1 } };
      if (r.road.id === 'B-C') return { ...r, road: { ...r.road, baseMinutes: 1 } };
      return r;
    }),
    isolatedJunctions: ['G'],
  });
  check('tie scenario: both A->C routes cost 2', findAlternativeRoutes(tieGraph, 'A', 'C', 4).map((r) => r.totalMinutes).slice(0, 2), [2, 2]);
  const tie = compareRoutes(tieGraph, 'A', 'C', 4);
  check('tie is detected when two routes cost the same', tie.hasTie, true);
  check('tied count is 2', tie.tiedCount, 2);

  // Unreachable destination: no routes at all.
  const none = compareRoutes(initialGraph, 'A', 'G', 4);
  check('no route to isolated G', [none.best, none.alternatives.length], [null, 0]);

  // Source equals destination.
  const same = compareRoutes(initialGraph, 'A', 'A', 4);
  check('source to itself is 0 min', [same.best?.totalMinutes, same.best?.nodes], [0, ['A']]);
}

// --- presets -----------------------------------------------------------------
{
  for (const preset of TRAFFIC_PRESETS) {
    const roads = applyPreset(
      ROADS.map((road) => ({ road, level: 'low' as const, overrideMinutes: null })),
      preset,
    );
    const graph = buildGraph({ roads, isolatedJunctions: preset.oldTownLinked ? [] : ['G'] });
    const run = runDijkstraWithTrace(graph, DEFAULT_SOURCE);
    const comparison = compareRoutes(graph, DEFAULT_SOURCE, DEFAULT_DESTINATION, 4);
    const best = run.result.distance.get(DEFAULT_DESTINATION);
    console.log(
      `      preset "${preset.name}": dist(E)=${best}, route=${comparison.best?.roadIds.join(' + ') ?? 'none'}, ` +
        `alternatives=${comparison.alternatives.length}, unreachable=${run.result.unreachable.join(',') || 'none'}`,
    );
    if (!Number.isFinite(best) || best === null) {
      failures += 1;
      console.log(`FAIL  preset ${preset.name} leaves E unreachable`);
    }
    if (comparison.best && comparison.best.totalMinutes !== best) {
      failures += 1;
      console.log(
        `FAIL  preset ${preset.name}: alternative search (${comparison.best.totalMinutes}) disagrees with Dijkstra (${best})`,
      );
    }
  }
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
if (failures > 0) process.exitCode = 1;
