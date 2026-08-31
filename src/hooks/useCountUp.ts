import { useEffect, useRef, useState } from "react";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates a number towards `target` using requestAnimationFrame.
 * Re-animates from the current value whenever `target` changes,
 * so it works for both mount effects and live-updating stats.
 */
export function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);

  useEffect(() => {
    // With reduced motion preferred, jump straight to the target on the first frame
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const from = valueRef.current;
    const start = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const progress = reduceMotion ? 1 : Math.min((now - start) / duration, 1);
      const current = from + (target - from) * easeOutCubic(progress);
      valueRef.current = current;
      setValue(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
