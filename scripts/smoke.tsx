import { renderToString } from 'react-dom/server';
import { App } from '@/App';

/**
 * Server-render smoke test: catches any render-time crash or missing prop in
 * the component tree, which a typecheck alone will not.
 */

const html = renderToString(<App />);

const expectations: Array<[string, RegExp]> = [
  ['header title', /Smart Traffic Signal Management/],
  ['minimum travel time KPI', /Minimum travel time/],
  ['source selector', /Current junction \(source node\)/],
  ['optional Old Town toggle', /Connect Old Town Junction/],
  ['map caption', /City road network/],
  ['playback controls', /Start/],
  ['algorithm status', /Algorithm Status/],
  ['distance table', /Shortest known distance/],
  ['priority queue', /Priority queue \(binary min-heap\)/],
  ['selected route', /Selected Route/],
  ['route summary 7 min', /7 min/],
  ['alternatives', /Route Alternatives/],
  ['shortest-path tree', /Shortest-Path Tree/],
  ['legend', /Legend/],
  ['complexity', /O\(\(V \+ E\) log V\)/],
  ['pseudocode', /extractMin\(priorityQueue\)/],
  ['unreachable junction flagged in results', /is-unreachable/],
  ['unreachable reported in complexity facts', /Unreachable/],
];

let failures = 0;

const roadRows = (html.match(/road-row__weight/g) ?? []).length;
if (roadRows === 9) {
  console.log('PASS  all nine base roads are listed');
} else {
  failures += 1;
  console.log(`FAIL  expected 9 road rows, found ${roadRows}`);
}

const junctions = (html.match(/data-junction="/g) ?? []).length;
if (junctions === 7) {
  console.log('PASS  all seven junctions are drawn');
} else {
  failures += 1;
  console.log(`FAIL  expected 7 junction nodes, found ${junctions}`);
}

for (const [name, pattern] of expectations) {
  if (pattern.test(html)) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name} (no match for ${pattern})`);
  }
}

console.log(`\nRendered ${html.length} characters of HTML.`);
if (failures > 0) {
  console.log(`${failures} expectation(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('All render expectations passed.');
}
