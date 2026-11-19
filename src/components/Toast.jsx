import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

// Shows the latest message for 3.2 s, then hides it
export default function Toast({ toast }) {
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    setShown(toast);
    const timer = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          className={`toast${shown.isError ? " is-error" : ""}`}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.25 }}
        >
          {shown.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
