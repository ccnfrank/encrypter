import { AnimatePresence, motion } from "motion/react";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";

// Concentric seal rings behind the drop area. They turn slowly, close in on a drag,
// and spin faster while a job runs. The lock in the centre opens when decrypting.
export default function Seal({ busy, dragover, decrypting, done }) {
  const outerSpeed = busy ? 9 : 80;
  const innerSpeed = busy ? -6 : -54;
  const locked = !decrypting || busy;

  return (
    <motion.div
      className="seal"
      aria-hidden="true"
      animate={{ scale: dragover ? 0.9 : 1 }}
      transition={{ type: "spring", stiffness: 180, damping: 18 }}
    >
      <svg viewBox="0 0 400 400" focusable="false">
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: outerSpeed, repeat: Infinity, ease: "linear" }}
        >
          <circle className="ring ring-dots" cx="200" cy="200" r="194" />
          <circle className="ring ring-ticks" cx="200" cy="200" r="168" />
        </motion.g>
        <motion.g
          animate={{ rotate: 360 * Math.sign(innerSpeed) }}
          transition={{ duration: Math.abs(innerSpeed), repeat: Infinity, ease: "linear" }}
        >
          <circle className="ring" cx="200" cy="200" r="132" />
          <circle className="ring ring-thick" cx="200" cy="200" r="104" />
        </motion.g>
      </svg>

      <div className={`seal-lock${done ? " is-done" : ""}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={locked ? "locked" : "open"}
            initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.6, rotate: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ display: "grid", placeItems: "center" }}
          >
            {locked ? <LockKeyhole size={38} strokeWidth={1.6} /> : <LockKeyholeOpen size={38} strokeWidth={1.6} />}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
