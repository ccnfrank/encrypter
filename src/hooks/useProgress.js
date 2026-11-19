import { useCallback } from "react";
import { useMotionValue, useTransform } from "motion/react";
import { createRun } from "../lib/progress.js";

// The bar is driven by a motion value, so each frame updates the DOM directly and
// the React tree does not re-render 60 times a second.
export function useProgress() {
  const value = useMotionValue(0);
  const percent = useTransform(value, (v) => `${Math.round(v * 100)}%`);

  const start = useCallback(() => createRun((v) => value.set(v)), [value]);
  const reset = useCallback(() => value.set(0), [value]);

  return { value, percent, start, reset };
}
