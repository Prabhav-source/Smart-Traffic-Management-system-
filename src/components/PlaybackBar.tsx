import type { PlaybackState } from '@/hooks/useDijkstraPlayer';

/**
 * Playback transport for the Dijkstra trace: Start / Pause / Next / Previous /
 * Reset plus a speed control. Deliberately keyboard-accessible native buttons.
 */

export interface PlaybackBarProps {
  state: PlaybackState;
  index: number;
  total: number;
  speed: number;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onReset: () => void;
  onFinish: () => void;
  onSpeedChange: (speed: number) => void;
}

const SPEEDS = [0.5, 1, 2, 4];
const STATE_LABEL: Record<PlaybackState, string> = {
  idle: 'Ready',
  playing: 'Running',
  paused: 'Paused',
  finished: 'Finished',
};

export function PlaybackBar({
  state,
  index,
  total,
  speed,
  onToggle,
  onNext,
  onPrevious,
  onReset,
  onFinish,
  onSpeedChange,
}: PlaybackBarProps) {
  const progress = total > 1 ? (index / (total - 1)) * 100 : 0;

  return (
    <div className="playback">
      <div className="playback__controls">
        <button
          type="button"
          className="btn btn--primary btn--compact"
          onClick={onToggle}
          disabled={total === 0}
        >
          {state === 'playing' ? '❚❚ Pause' : state === 'paused' ? '▶ Resume' : '▶ Start'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={onPrevious}
          disabled={index === 0}
          title="Previous step"
        >
          ◀ Prev
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={onNext}
          disabled={total === 0}
          title="Next step"
        >
          Next ▶
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={onFinish}
          disabled={total === 0}
          title="Jump to the finished state"
        >
          ⏭ Finish
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={onReset}
          title="Rewind to the first step"
        >
          ⟲ Reset
        </button>

        <label className="speed">
          <span className="speed__label">Speed</span>
          <select
            className="select select--compact"
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
          >
            {SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}×
              </option>
            ))}
          </select>
        </label>

        <span className={`state-pill state-pill--${state}`}>{STATE_LABEL[state]}</span>
        <span className="playback__counter">
          Step {Math.min(index + 1, total)} / {total}
        </span>
      </div>

      <div
        className="progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={Math.max(total, 1)}
        aria-valuenow={Math.min(index + 1, Math.max(total, 1))}
        aria-label="Algorithm trace progress"
      >
        <div className="progress__fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}