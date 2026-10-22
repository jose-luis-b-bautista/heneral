import { useCallback, useEffect, useRef, useState } from 'react';

type Sound = 'move' | 'capture' | 'win' | 'lose';

/**
 * Lightweight WebAudio sound effects (no audio files). Each sound is a short
 * synthesized tone. Respects a persisted mute preference.
 */
export function useSoundEffects() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem('salpakan-muted') === '1';
    } catch {
      return false;
    }
  });

  const getCtx = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    // Resume if suspended (e.g. after a user gesture on iOS).
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('salpakan-muted', muted ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [muted]);

  const tone = useCallback(
    (freq: number, start: number, duration: number, type: OscillatorType, gainPeak = 0.12) => {
      const ctx = getCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    },
    [getCtx],
  );

  const play = useCallback(
    (sound: Sound) => {
      if (muted) return;
      try {
        switch (sound) {
          case 'move':
            tone(440, 0, 0.09, 'sine', 0.08);
            break;
          case 'capture':
            tone(220, 0, 0.12, 'square', 0.1);
            tone(160, 0.06, 0.16, 'square', 0.1);
            break;
          case 'win':
            tone(523, 0, 0.14, 'triangle', 0.14);
            tone(659, 0.12, 0.14, 'triangle', 0.14);
            tone(784, 0.24, 0.24, 'triangle', 0.16);
            break;
          case 'lose':
            tone(330, 0, 0.18, 'sawtooth', 0.1);
            tone(247, 0.16, 0.24, 'sawtooth', 0.1);
            break;
        }
      } catch {
        /* ignore audio errors */
      }
    },
    [muted, tone],
  );

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  return { muted, toggleMute, play };
}
