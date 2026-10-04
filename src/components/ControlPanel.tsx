import { JUNCTIONS, UPPAL_LINK } from '@/data/cityGraph';
import {
  TRAFFIC_LEVELS,
  TRAFFIC_LEVEL_ORDER,
  TRAFFIC_PRESETS,
  formatMinutes,
  freeFlowMinutesOf,
  isOverridden,
  travelMinutesFor,
} from '@/logic/traffic';
import { WEIGHT_MODES, WEIGHT_MODE_ORDER, roadDistanceKm } from '@/logic/weights';
import type { JunctionId, RoadState, TrafficLevel, WeightMode } from '@/types';

/**
 * ---------------------------------------------------------------------------
 * Left panel: where the emergency vehicle is, and how traffic is simulated
 * ---------------------------------------------------------------------------
 */

export interface ControlPanelProps {
  source: JunctionId;
  destination: JunctionId | null;
  roads: RoadState[];
  /** Whether the optional Nagole-Uppal link is currently open. */
  uppalLinked: boolean;
  weightMode: WeightMode;
  activePresetId: string | null;
  canRun: boolean;
  blockedReason: string | null;
  isPlaying: boolean;
  onSourceChange: (id: JunctionId) => void;
  onWeightModeChange: (mode: WeightMode) => void;
  onPresetSelect: (presetId: string) => void;
  onLevelChange: (roadId: string, level: TrafficLevel) => void;
  onToggleUppal: () => void;
  /** Seeds a manual override with the currently derived weight. */
  onStartOverride: (roadId: string) => void;
  onClearOverride: (roadId: string) => void;
  onOverrideChange: (roadId: string, rawValue: string) => void;
  /** Live validation message keyed by road id. */
  overrideErrors: Record<string, string | null>;
  onRun: () => void;
  onReset: () => void;
}

export function ControlPanel({
  source,
  destination,
  roads,
  uppalLinked,
  weightMode,
  activePresetId,
  canRun,
  blockedReason,
  isPlaying,
  onSourceChange,
  onWeightModeChange,
  onPresetSelect,
  onLevelChange,
  onToggleUppal,
  onStartOverride,
  onClearOverride,
  onOverrideChange,
  overrideErrors,
  onRun,
  onReset,
}: ControlPanelProps) {
  return (
    <div className="panel-stack">
      {/* ------------------------- vehicle location ------------------------ */}
      <section className="card">
        <header className="card__header">
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              🚑
            </span>
            Emergency Vehicle
          </h2>
        </header>

        <div className="card__body">
          <label className="field">
            <span className="field__label">Current junction (source node)</span>
            <select
              className="select"
              value={source}
              onChange={(event) => onSourceChange(event.target.value)}
            >
              {JUNCTIONS.map((junction) => (
                <option key={junction.id} value={junction.id}>
                  {junction.id} — {junction.label}
                  {junction.id === destination ? ' (destination)' : ''}
                </option>
              ))}
            </select>
          </label>

          <p className="hint">
            Dijkstra sets <code>distance[{source}] = 0</code> and every other junction to{' '}
            <code>∞</code>, then expands outwards from this junction.
          </p>
        </div>
      </section>

      {/* --------------------------- traffic states ------------------------ */}
      <section className="card">
        <header className="card__header">
          <h2 className="card__title">
            <span className="card__icon" aria-hidden="true">
              🚦
            </span>
            Traffic Conditions
          </h2>
          <p className="card__subtitle">
            Congestion multiplies each road&rsquo;s free-flow time to produce the Dijkstra edge
            weight.
          </p>
        </header>

        <div className="card__body">
          <div className="field">
            <span className="field__label" id="weight-mode-label">
              Free-flow weight source
            </span>
            <div
              className="segmented segmented--two"
              role="radiogroup"
              aria-labelledby="weight-mode-label"
            >
              {WEIGHT_MODE_ORDER.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={weightMode === mode}
                  className={`segmented__option ${weightMode === mode ? 'is-active' : ''}`}
                  onClick={() => onWeightModeChange(mode)}
                  title={WEIGHT_MODES[mode].description}
                >
                  {WEIGHT_MODES[mode].label}
                </button>
              ))}
            </div>
            <p className="hint">{WEIGHT_MODES[weightMode].description}</p>
          </div>

          <div className="preset-row" role="group" aria-label="Traffic scenarios">
            {TRAFFIC_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`chip ${activePresetId === preset.id ? 'chip--active' : ''}`}
                onClick={() => onPresetSelect(preset.id)}
                title={preset.description}
                aria-pressed={activePresetId === preset.id}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="road-list">
            {roads.map((roadState) => {
              const level = TRAFFIC_LEVELS[roadState.level];
              const overridden = isOverridden(roadState);
              const error = overrideErrors[roadState.road.id] ?? null;
              const multiplier = overridden ? null : `${level.factor}× free flow`;
              const weight = travelMinutesFor(roadState, weightMode);
              const freeFlow = freeFlowMinutesOf(roadState, weightMode);

              return (
                <div
                  key={roadState.road.id}
                  className={`road-row road-row--${roadState.level}`}
                >
                  <div className="road-row__head">
                    <span className="road-row__name">
                      <strong>
                        {roadState.road.from} ↔ {roadState.road.to}
                      </strong>
                      <span className="road-row__corridor">{roadState.road.corridor}</span>
                    </span>
                    <span className="road-row__weight">
                      {formatMinutes(weight)}
                      <span className="road-row__base">
                        free flow {formatMinutes(freeFlow)} ·{' '}
                        {roadDistanceKm(roadState.road).toFixed(1)} km
                      </span>
                    </span>
                  </div>

                  <div
                    className="segmented"
                    role="radiogroup"
                    aria-label={`Traffic on road ${roadState.road.from} to ${roadState.road.to}`}
                  >
                    {TRAFFIC_LEVEL_ORDER.map((option) => {
                      const meta = TRAFFIC_LEVELS[option];
                      return (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={roadState.level === option}
                          className={`segmented__option segmented__option--${option} ${
                            roadState.level === option ? 'is-active' : ''
                          }`}
                          onClick={() => onLevelChange(roadState.road.id, option)}
                          title={meta.description}
                        >
                          <span className="segmented__dot" aria-hidden="true" />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="road-row__foot">
                    <span className={`badge badge--${roadState.level}`}>{level.label} traffic</span>
                    {multiplier && <span className="road-row__factor">{multiplier}</span>}

                    {overridden ? (
                      <label className="override">
                        <span className="sr-only">
                          Custom travel time for road {roadState.road.id} in minutes
                        </span>
                        <input
                          className={`override__input ${error ? 'has-error' : ''}`}
                          type="text"
                          inputMode="decimal"
                          value={String(roadState.overrideMinutes ?? '')}
                          placeholder="min"
                          onChange={(event) =>
                            onOverrideChange(roadState.road.id, event.target.value)
                          }
                        />
                        <span className="override__unit">min</span>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => onClearOverride(roadState.road.id)}
                        >
                          reset
                        </button>
                      </label>
                    ) : (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => onStartOverride(roadState.road.id)}
                      >
                        custom value
                      </button>
                    )}
                  </div>

                  {error && <p className="field__error">{error}</p>}
                </div>
              );
            })}
          </div>

          {/* Optional road that demonstrates the unreachable case. */}
          <label className="toggle">
            <input type="checkbox" checked={uppalLinked} onChange={onToggleUppal} />
            <span className="toggle__track" aria-hidden="true">
              <span className="toggle__thumb" />
            </span>
            <span className="toggle__label">
              Connect Uppal Junction
              <span className="toggle__hint">
                Road {UPPAL_LINK.from} ↔ {UPPAL_LINK.to} on {UPPAL_LINK.corridor},{' '}
                {formatMinutes(
                  freeFlowMinutesOf(
                    { road: UPPAL_LINK, level: 'low', overrideMinutes: null },
                    weightMode,
                  ),
                )}{' '}
                free flow. Off by default so the unreachable case is visible.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* ------------------------------ actions ---------------------------- */}
      <section className="card card--actions">
        <div className="card__body">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onRun}
            disabled={!canRun}
            title={blockedReason ?? 'Run Dijkstra step by step'}
          >
            {isPlaying ? '❚❚ Pause algorithm' : '▶ Run Dijkstra’s Algorithm'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            ⟲ Reset
          </button>
          {blockedReason && <p className="field__error">{blockedReason}</p>}
        </div>
      </section>
    </div>
  );
}