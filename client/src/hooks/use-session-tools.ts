import { useCallback, useEffect, useRef, useState } from "react";

export function useCountdown(initialSeconds: number) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const tickRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => {
    setRemaining(initialSeconds);
    setFinished(false);
    setRunning(false);
    clear();
  }, [initialSeconds, clear]);

  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clear();
          setRunning(false);
          setFinished(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return clear;
  }, [running, clear]);

  const start = useCallback(() => {
    if (remaining <= 0) {
      setRemaining(initialSeconds);
      setFinished(false);
    }
    setRunning(true);
  }, [remaining, initialSeconds]);

  const pause = useCallback(() => setRunning(false), []);

  const reset = useCallback(() => {
    clear();
    setRemaining(initialSeconds);
    setRunning(false);
    setFinished(false);
  }, [initialSeconds, clear]);

  return { remaining, running, finished, start, pause, reset };
}

export function useMetronome(initialBpm = 60) {
  const [bpm, setBpm] = useState(initialBpm);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const nextNoteTimeRef = useRef(0);
  const schedulerRef = useRef<number | null>(null);
  const beatCountRef = useRef(0);
  const bpmRef = useRef(initialBpm);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const playClick = useCallback((ctx: AudioContext, when: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.45 : 0.3, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.08);
  }, []);

  const scheduler = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const lookahead = 0.1;
    while (nextNoteTimeRef.current < ctx.currentTime + lookahead) {
      const isAccent = beatCountRef.current % 4 === 0;
      playClick(ctx, nextNoteTimeRef.current, isAccent);
      const currentBeat = beatCountRef.current;
      const scheduleTime = nextNoteTimeRef.current;
      const delayMs = Math.max(0, (scheduleTime - ctx.currentTime) * 1000);
      window.setTimeout(() => setBeat(currentBeat % 4), delayMs);
      beatCountRef.current += 1;
      nextNoteTimeRef.current += 60 / bpmRef.current;
    }
  }, [playClick]);

  const start = useCallback(() => {
    if (running) return;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
    }
    const ctx = ctxRef.current!;
    if (ctx.state === "suspended") ctx.resume();
    beatCountRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    setRunning(true);
    schedulerRef.current = window.setInterval(scheduler, 25);
  }, [running, scheduler]);

  const stop = useCallback(() => {
    if (schedulerRef.current != null) {
      window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    setRunning(false);
    setBeat(0);
  }, []);

  useEffect(() => () => {
    if (schedulerRef.current != null) window.clearInterval(schedulerRef.current);
    if (ctxRef.current) ctxRef.current.close();
  }, []);

  return { bpm, setBpm, running, start, stop, beat };
}

export function formatClock(totalSec: number) {
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}
