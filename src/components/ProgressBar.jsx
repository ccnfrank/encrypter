import { useEffect, useRef } from "react";
import { motion, useTransform } from "motion/react";

export default function ProgressBar({ progress, busy, done, status, tone }) {
  const barRef = useRef(null);
  const head = useTransform(progress.value, (v) => `${v * 100}%`);

  // Keep aria-valuenow in step without re-rendering React
  useEffect(
    () =>
      progress.value.on("change", (v) => {
        barRef.current?.setAttribute("aria-valuenow", String(Math.round(v * 100)));
      }),
    [progress.value]
  );

  return (
    <div className="progress-block">
      <div className="progress-head">
        <span className={`status${tone ? ` is-${tone}` : ""}`} aria-live="polite">
          {status}
        </span>
        <motion.span className="percent">{progress.percent}</motion.span>
      </div>
      <div
        ref={barRef}
        className={`bar${busy ? " is-working" : ""}${done ? " is-done" : ""}`}
        role="progressbar"
        aria-label="Encryption progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
      >
        <motion.div className="fill" style={{ scaleX: progress.value }}>
          <span className="fill-shine" />
        </motion.div>
        <motion.span className="fill-head" style={{ left: head }} />
      </div>
    </div>
  );
}
