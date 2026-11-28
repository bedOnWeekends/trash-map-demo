"use client";
import { useMotionPreference } from "@/components/motion/patterns";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { duration, tween } from "@/lib/motion";
import { stateLabels, type RequestRow, type Bin } from "@/lib/model";

export function useChangeHighlight<T extends HTMLElement>(
  value: string | number,
) {
  const ref = useRef<T>(null);
  const previous = useRef(value);
  const reduced = useMotionPreference();
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (reduced || !ref.current) return;
    const animation = ref.current.animate(
      [
        { backgroundColor: "var(--change-surface)" },
        { backgroundColor: getComputedStyle(ref.current).backgroundColor },
      ],
      { duration: duration.emphasis * 1000 },
    );
    return () => animation.cancel();
  }, [value, reduced]);
  return ref;
}

export function StatusLabel({ status }: { status: RequestRow["status"] }) {
  const [initial] = useState(status);
  const changedToInstalled = status === "installed" && initial !== status;
  const label =
    status === "approved" ? "승인 · 설치 예정" : stateLabels[status];
  return (
    <b className="status-tag" data-status={status}>
      <span className="visually-hidden">{label}</span>
      <span className="status-label" aria-hidden>
        <AnimatePresence initial={false}>
          <motion.span
            key={status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tween(duration.micro)}
          >
            {status === "installed" && (
              <Check
                size={13}
                className={changedToInstalled ? "status-check" : undefined}
              />
            )}{" "}
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </b>
  );
}

// Compare complete snapshots, before filtering. Opening a map starts with a baseline.
export function useInstalledBins(
  bins: Bin[] | undefined,
  epoch: string | undefined,
) {
  const [seen, setSeen] = useState({ bins, epoch, fresh: new Set<string>() });
  if (bins !== seen.bins || epoch !== seen.epoch) {
    let fresh = seen.fresh;
    if (!seen.bins || seen.epoch !== epoch) fresh = new Set();
    else {
      const old = new Set(seen.bins.map((b) => b.id));
      const added =
        bins?.filter((b) => b.source === "request" && !old.has(b.id)) ?? [];
      if (added.length) fresh = new Set([...fresh, ...added.map((b) => b.id)]);
    }
    setSeen({ bins, epoch, fresh });
  }
  const fresh = seen.fresh;
  useEffect(() => {
    if (!fresh.size) return;
    const timer = setTimeout(
      () =>
        setSeen((prev) =>
          prev.fresh === fresh ? { ...prev, fresh: new Set() } : prev,
        ),
      duration.emphasis * 1000,
    );
    return () => clearTimeout(timer);
  }, [fresh]);
  return fresh;
}
