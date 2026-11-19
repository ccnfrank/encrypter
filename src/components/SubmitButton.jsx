import { AnimatePresence, motion } from "motion/react";
import { Loader2, LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { CheckGlyph } from "./icons.jsx";

export default function SubmitButton({ disabled, busy, done, decrypting, label }) {
  const icon = busy ? "busy" : done ? "done" : decrypting ? "open" : "locked";

  return (
    <motion.button
      type="submit"
      className={`submit${busy ? " is-busy" : ""}`}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={icon}
          className="submit-icon"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.18 }}
        >
          {icon === "busy" && <Loader2 size={18} strokeWidth={2} className="spin" aria-hidden="true" />}
          {icon === "done" && <CheckGlyph />}
          {icon === "open" && <LockKeyholeOpen size={18} strokeWidth={1.8} aria-hidden="true" />}
          {icon === "locked" && <LockKeyhole size={18} strokeWidth={1.8} aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
      <span>{label}</span>
    </motion.button>
  );
}
