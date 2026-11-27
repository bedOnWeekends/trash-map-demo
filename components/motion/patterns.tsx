"use client";
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useIsPresent,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { duration, distance, tween, slideFade } from "@/lib/motion";

export function MotionPolicy({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={tween()}>
      {children}
    </MotionConfig>
  );
}

// Outgoing panels remain visible briefly but cannot receive clicks, focus or announcements.
function Panel(props: HTMLMotionProps<"div">) {
  const present = useIsPresent();
  return (
    <motion.div
      {...props}
      inert={!present}
      aria-hidden={!present || undefined}
      style={{
        ...props.style,
        ...(!present && {
          position: "absolute",
          insetInline: 0,
          top: 0,
          pointerEvents: "none",
        }),
      }}
    />
  );
}
export function Swap({
  identity,
  direction = 0,
  children,
  ...override
}: HTMLMotionProps<"div"> & {
  identity: string | number;
  direction?: number;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="motion-swap">
      <AnimatePresence initial={false} custom={reduced ? 0 : direction}>
        <Panel
          key={identity}
          custom={reduced ? 0 : direction}
          variants={slideFade}
          initial="enter"
          animate="visible"
          exit="leave"
          transition={tween(reduced ? 0 : duration.fast)}
          {...override}
        >
          {children}
        </Panel>
      </AnimatePresence>
    </div>
  );
}
export function AnimatedNumber({ value }: { value: number }) {
  const reduced = useReducedMotion();
  return (
    <span className="rolling-number">
      <span className="visually-hidden">{value}</span>
      <span className="number-track" aria-hidden>
        <AnimatePresence initial={false}>
          <motion.span
            key={value}
            data-value={value}
            initial={{ opacity: 0, y: reduced ? 0 : distance.reveal }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -distance.reveal }}
            transition={tween(reduced ? 0 : duration.fast)}
          />
        </AnimatePresence>
      </span>
    </span>
  );
}
function Placeholder({ kind }: { kind: "stations" | "requests" }) {
  const [shown, show] = useState(false);
  const present = useIsPresent();
  useEffect(() => {
    if (!present) return;
    const t = setTimeout(() => show(true), 240);
    return () => clearTimeout(t);
  }, [present]);
  return (
    <div className="data-placeholder" aria-busy="true" aria-label="불러오는 중">
      {shown && (
        <div className={"skeleton " + kind} aria-hidden>
          {[0, 1, 2].map((i) => (
            <div className="skeleton-row" key={i}>
              <i />
              <span />
              <span />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function ContentReveal({
  ready,
  error,
  kind,
  children,
}: {
  ready: boolean;
  error: string;
  kind: "stations" | "requests";
  children: ReactNode;
}) {
  const phase = ready ? "content" : error ? "error" : "loading";
  return (
    <Swap
      identity={phase}
      variants={{
        enter: { opacity: 0, y: distance.reveal },
        visible: { opacity: 1, y: 0 },
        leave: { opacity: 0 },
      }}
    >
      {phase === "loading" ? <Placeholder kind={kind} /> : children}
    </Swap>
  );
}
