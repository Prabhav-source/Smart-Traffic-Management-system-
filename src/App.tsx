import { useCallback, useMemo, useState } from 'react';
import { runDijkstraWithTrace } from '@/algorithm/dijkstra';
import { buildRouteTable, compareRoutes } from '@/algorithm/paths';
import { AlgorithmInfo } from '@/components/AlgorithmInfo';
import { CityGraph } from '@/components/CityGraph';
import { ControlPanel } from '@/components/ControlPanel';
import { Header } from '@/components/Header';
import { PlaybackBar } from '@/components/PlaybackBar';
import { ResultsPanel } from '@/components/ResultsPanel';
import { StatusPanel } from '@/components/StatusPanel';
import {
  DEFAULT_DESTINATION,
  DEFAULT_SOURCE,
  UPPAL_LINK,
  ROADS,
  createInitialNetworkState,
} from '@/data/cityGraph';
import { useDijkstraPlayer } from '@/hooks/useDijkstraPlayer';
import {
  TRAFFIC_PRESETS,
  applyPreset,
  isOverridden,
  travelMinutesFor,
  validateTravelMinutes,
} from '@/logic/traffic';
import { buildGraph, totalNetworkMinutes, validateGraph } from '@/logic/graph';
import type {
  JunctionId,
  NetworkState,
  RoadState,
  TrafficLevel,
  WeightMode,
} from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Application root: owns the simulated traffic state and the playback position.
 * ---------------------------------------------------------------------------
 * Two independent layers keep the UI honest:
 *
 *   live layer   source + traffic -> graph -> Dijkstra -> results table / route
 *   trace layer  the same run's recorded steps, replayed by the player
 *
 * Editing traffic recomputes the live layer immediately and rewinds the trace,
 * so the numbers on the right are never stale while the animation re-runs.
 */

export function App() {
  /* ------------------------------ live state ------------------------------ */
  const [network, setNetwork] = useState<NetworkState>(createInitialNetworkState);
  const [source, setSource] = useState<JunctionId>(DEFAULT_SOURCE);
  const [destination, setDestination] = useState<JunctionId | null>(DEFAULT_DESTINATION);
  const [activePresetId, setActivePresetId] = useState<string | null>(
    TRAFFIC_PRESETS[0].id,
  );
  const [overrideErrors, setOverrideErrors] = useState<Record<string, string | null>>({});

  const uppalLinked = network.roads.some((r) => r.road.id === UPPAL_LINK.id);

  /* --------------------------- derived live model ------------------------- */
  const graph = useMemo(() => buildGraph(network), [network]);
  const problems = useMemo(() => validateGraph(graph), [graph]);

  const run = useMemo(() => runDijkstraWithTrace(graph, source), [graph, source]);
  const routeTable = useMemo(() => buildRouteTable(run.result, graph), [run.result, graph]);

  const comparison = useMemo(
    () =>
      destination
        ? compareRoutes(graph, source, destination, 4)
        : { best: null, alternatives: [], hasTie: false, tiedCount: 0 },
    [graph, source, destination],
  );

  const activeRoute = destination ? routeTable.get(destination) ?? null : null;

  /* ------------------------------ trace player ---------------------------- */
  // Any weight or source change produces a new key, which rewinds playback.
  const resetKey = useMemo(() => {
    const signature = network.roads
      .map((roadState) => `${roadState.road.id}:${roadState.level}:${roadState.overrideMinutes ?? 'auto'}`)
      .join('|');
    return `${source}#${network.weightMode}#${signature}`;
  }, [network.roads, network.weightMode, source]);

  const player = useDijkstraPlayer({ steps: run.steps, resetKey });
  const step = player.step;

  /* ------------------------------- handlers ------------------------------- */
  const patchRoad = useCallback(
    (roadId: string, patch: (roadState: RoadState) => RoadState) => {
      setNetwork((current) => ({
        ...current,
        roads: current.roads.map((roadState) =>
          roadState.road.id === roadId ? patch(roadState) : roadState,
        ),
      }));
    },
    [],
  );

  const handlePresetSelect = useCallback(
    (presetId: string) => {
      const preset = TRAFFIC_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) return;

      // Presets are defined against the nine base roads; the optional Uppal
      // link is added or removed separately so its traffic state is predictable.
      const baseRoads = applyPreset(
        ROADS.map((road) => ({ road, level: 'low' as const, overrideMinutes: null })),
        preset,
      );
      const withOptional = preset.uppalLinked
        ? [...baseRoads, { road: UPPAL_LINK, level: 'low' as const, overrideMinutes: null }]
        : baseRoads;

      setNetwork((current) => ({
        roads: withOptional,
        isolatedJunctions: preset.uppalLinked ? [] : ['G'],
        weightMode: current.weightMode,
      }));
      setOverrideErrors({});
      setActivePresetId(preset.id);
    },
    [],
  );

  const handleWeightModeChange = useCallback((mode: WeightMode) => {
    setNetwork((current) => ({ ...current, weightMode: mode }));
    setActivePresetId(null);
  }, []);

  const handleLevelChange = useCallback(
    (roadId: string, level: TrafficLevel) => {
      // Changing congestion also drops any manual weight, otherwise the
      // override would silently win and the control would appear dead.
      patchRoad(roadId, (roadState) => ({ ...roadState, level, overrideMinutes: null }));
      setOverrideErrors((current) => ({ ...current, [roadId]: null }));
      setActivePresetId(null);
    },
    [patchRoad],
  );

  const handleToggleUppal = useCallback(() => {
    setNetwork((current) => {
      const hasLink = current.roads.some((r) => r.road.id === UPPAL_LINK.id);
      return {
        roads: hasLink
          ? current.roads.filter((r) => r.road.id !== UPPAL_LINK.id)
          : [
              ...current.roads,
              { road: UPPAL_LINK, level: 'low' as const, overrideMinutes: null },
            ],
        isolatedJunctions: hasLink ? ['G'] : [],
        weightMode: current.weightMode,
      };
    });
    setOverrideErrors((current) => {
      if (!(UPPAL_LINK.id in current)) return current;
      const next = { ...current };
      delete next[UPPAL_LINK.id];
      return next;
    });
    setActivePresetId(null);
  }, []);

  const handleStartOverride = useCallback(
    (roadId: string) => {
      const roadState = network.roads.find((r) => r.road.id === roadId);
      if (!roadState) return;
      // Seed the field with the value congestion currently implies, so the
      // first keystroke is an edit rather than a replacement.
      patchRoad(roadId, (current) => ({
        ...current,
        overrideMinutes: travelMinutesFor(current, network.weightMode),
      }));
      setOverrideErrors((current) => ({ ...current, [roadId]: null }));
    },
    [network.roads, network.weightMode, patchRoad],
  );

  const handleClearOverride = useCallback(
    (roadId: string) => {
      patchRoad(roadId, (current) => ({ ...current, overrideMinutes: null }));
      setOverrideErrors((current) => ({ ...current, [roadId]: null }));
    },
    [patchRoad],
  );

  const handleOverrideChange = useCallback(
    (roadId: string, raw: string) => {
      const validation = validateTravelMinutes(raw);
      setOverrideErrors((current) => ({ ...current, [roadId]: validation.error }));
      // An invalid entry is reported but never becomes an edge weight, so the
      // graph keeps the last value that was known to be valid.
      if (!validation.ok) return;
      patchRoad(roadId, (current) => ({ ...current, overrideMinutes: validation.value }));
    },
    [patchRoad],
  );

  const handleReset = useCallback(() => {
    setNetwork(createInitialNetworkState());
    setSource(DEFAULT_SOURCE);
    setDestination(DEFAULT_DESTINATION);
    setActivePresetId(TRAFFIC_PRESETS[0].id);
    setOverrideErrors({});
    player.reset();
  }, [player]);

  const handleSourceChange = useCallback((id: JunctionId) => setSource(id), []);

  /* -------------------------------- render -------------------------------- */
  const canRun = problems.length === 0;
  const blockedReason =
    problems.length > 0
      ? `Fix before running: ${problems.map((problem) => problem.message).join(' ')}`
      : null;
  const overrideErrorCount = Object.values(overrideErrors).filter(Boolean).length;

  const routeKey = activeRoute
    ? `${destination}:${activeRoute.nodes.join('>')}:${activeRoute.totalMinutes}`
    : 'none';

  return (
    <div className="app">
      <Header
        source={source}
        destination={destination}
        bestMinutes={activeRoute ? activeRoute.totalMinutes : null}
        roadCount={network.roads.length}
        junctionCount={graph.size}
        networkMinutes={totalNetworkMinutes(network.roads, network.weightMode)}
        visitedCount={run.result.settledOrder.length}
        bestRouteCount={comparison.best ? (comparison.hasTie ? comparison.tiedCount : 1) : 0}
        maxHeapSize={run.result.maxHeapSize}
        isPlaying={player.isPlaying}
      />

      {overrideErrorCount > 0 && (
        <p className="notice notice--warn app__banner">
          {overrideErrorCount} custom travel time{overrideErrorCount === 1 ? '' : 's'} rejected —
          the affected road{overrideErrorCount === 1 ? ' keeps' : 's keep'} the last valid weight.
        </p>
      )}

      <main className="layout">
        <aside className="layout__left">
          <ControlPanel
            source={source}
            destination={destination}
            roads={network.roads}
            uppalLinked={uppalLinked}
            weightMode={network.weightMode}
            activePresetId={activePresetId}
            canRun={canRun}
            blockedReason={blockedReason}
            isPlaying={player.isPlaying}
            onSourceChange={handleSourceChange}
            onWeightModeChange={handleWeightModeChange}
            onPresetSelect={handlePresetSelect}
            onLevelChange={handleLevelChange}
            onToggleUppal={handleToggleUppal}
            onStartOverride={handleStartOverride}
            onClearOverride={handleClearOverride}
            onOverrideChange={handleOverrideChange}
            overrideErrors={overrideErrors}
            onRun={player.toggle}
            onReset={handleReset}
          />
        </aside>

        <section className="layout__center">
          <div className="card card--map">
            <header className="card__header card__header--inline">
              <h2 className="card__title">
                <span className="card__icon" aria-hidden="true">
                  🗺
                </span>
                Hyderabad Network
              </h2>
              <span className="card__hint">
                Real junctions on the map · click one to set the destination · drag to pan
              </span>
            </header>
            <div className="card__body card__body--flush">
              <CityGraph
                graph={graph}
                roads={network.roads}
                source={source}
                destination={destination}
                step={step}
                route={activeRoute}
                showRoute={player.state === 'finished' || player.state === 'idle'}
                routeKey={routeKey}
                weightMode={network.weightMode}
                onSelectJunction={setDestination}
              />
            </div>
          </div>

          <PlaybackBar
            state={player.state}
            index={player.index}
            total={player.total}
            speed={player.speed}
            onToggle={player.toggle}
            onNext={player.next}
            onPrevious={player.previous}
            onReset={player.reset}
            onFinish={player.finish}
            onSpeedChange={player.setSpeed}
          />

          <StatusPanel
            graph={graph}
            step={step}
            source={source}
            stepIndex={player.index}
            totalSteps={player.total}
            unreachable={run.result.unreachable}
          />
        </section>

        <aside className="layout__right">
          <ResultsPanel
            graph={graph}
            result={run.result}
            routeTable={routeTable}
            comparison={comparison}
            source={source}
            destination={destination}
            step={step}
            onSelectDestination={setDestination}
          />
        </aside>
      </main>

      <AlgorithmInfo
        graph={graph}
        unreachable={run.result.unreachable}
        totalSteps={run.steps.length}
      />

      <footer className="app__footer">
        <p>
          Dijkstra requires non-negative weights. Travel times are always in minutes, and every
          value on this page is derived live from the traffic state on the left — no stored
          results, no backend.
        </p>
        {network.roads.some(isOverridden) && (
          <p className="app__footer-note">
            At least one road is using a manual weight that overrides its congestion factor.
          </p>
        )}
      </footer>
    </div>
  );
}
