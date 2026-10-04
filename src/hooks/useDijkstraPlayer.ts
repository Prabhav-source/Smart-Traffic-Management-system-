import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DijkstraStep } from '@/algorithm/dijkstra';

/**
 * Replays a precomputed Dijkstra trace one step at a time.
 *
 * The trace itself is pure and synchronous (see `runDijkstraWithTrace`), so the
 * player only owns *playback*: an index into the step list plus a timer. That
 * keeps the visualisation perfectly in sync with the numbers shown elsewhere,
 * and makes Start / Pause / Next / Previous / Reset trivial to guarantee.
 */

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'finished';

export interface DijkstraPlayer {
  /** Step currently displayed. */
  step: DijkstraStep;
  /** Position within the trace, 0-based. */
  index: number;
  /** Total number of steps in the trace. */
  total: number;
  state: PlaybackState;
  isPlaying: boolean;
  /** Steps executed per second while playing. */
  speed: number;
  setSpeed: (speed: number) => void;
  /** Start (or resume) playback from the current position. */
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Advance a single step; starts playback if idle. */
  next: () => void;
  /** Step backwards a single position. */
  previous: () => void;
  /** Jump straight to the finished state. */
  finish: () => void;
  /** Return to the first step and stop. */
  reset: () => void;
  /** True once the trace has run to completion at least once. */
  hasFinished: boolean;
}

interface Options {
  steps: DijkstraStep[];
  /** Recomputes whenever this value changes, forcing a rewind. */
  resetKey: string;
  /** Milliseconds between steps while playing. */
  intervalMs?: number;
}

export function useDijkstraPlayer({
  steps,
  resetKey,
  intervalMs = 700,
}: Options): DijkstraPlayer {
  const total = steps.length;
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Clamp the index in case the trace shrinks underneath us.
  const safeIndex = Math.min(index, Math.max(total - 1, 0));
  const step = steps[Math.min(safeIndex, total - 1)] ?? steps[0];

  // Any change to the network or source rewinds the trace.
  useEffect(() => {
    setIndex(0);
    setIsPlaying(false);
    setHasFinished(false);
  }, [resetKey]);

  // Playback timer.
  const delay = Math.max(120, intervalMs / speed);
  useEffect(() => {
    if (!isPlaying || total === 0) return;

    if (safeIndex >= total - 1) {
      setIsPlaying(false);
      setHasFinished(true);
      return;
    }

    const timer = window.setTimeout(() => {
      setIndex((current) => Math.min(current + 1, total - 1));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isPlaying, safeIndex, total, delay]);

  const play = useCallback(() => {
    if (total === 0) return;
    // Pressing play from the end rewinds and replays.
    if (index >= total - 1) {
      setIndex(0);
      setHasFinished(false);
    }
    setIsPlaying(true);
  }, [index, total]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const next = useCallback(() => {
    setIndex((current) => {
      const updated = Math.min(current + 1, total - 1);
      if (updated >= total - 1) {
        setHasFinished(true);
        setIsPlaying(false);
      }
      return updated;
    });
  }, [total]);

  const previous = useCallback(() => {
    setIsPlaying(false);
    setHasFinished(false);
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

  const finish = useCallback(() => {
    if (total === 0) return;
    setIsPlaying(false);
    setHasFinished(true);
    setIndex(total - 1);
  }, [total]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setHasFinished(false);
    setIndex(0);
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const state: PlaybackState = useMemo(() => {
    if (isPlaying) return 'playing';
    if (hasFinished) return 'finished';
    if (safeIndex === 0) return 'idle';
    return 'paused';
  }, [isPlaying, hasFinished, safeIndex]);

  // Guards against a trace that is empty for one render.
  const fallbackRef = useRef<DijkstraStep | null>(null);
  if (!step && fallbackRef.current === null) {
    fallbackRef.current = {
      index: 0,
      kind: 'init',
      action: 'Initialise',
      current: null,
      neighbor: null,
      roadId: null,
      weight: null,
      candidate: null,
      distances: {},
      previous: {},
      settled: [],
      queue: [],
      lines: ['No road network loaded.'],
    };
  }

  return {
    step: step ?? (fallbackRef.current as DijkstraStep),
    index: safeIndex,
    total,
    state,
    isPlaying,
    speed,
    setSpeed,
    play,
    pause,
    toggle,
    next,
    previous,
    finish,
    reset,
    hasFinished,
  };
}