"use client";
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type Snap = "peek" | "half" | "expanded";
type Stop = { snap: Snap; height: number };
type Drag = {
  id: number;
  y: number;
  origin: number;
  lastY: number;
  time: number;
  velocity: number;
  moved: boolean;
};
export function StationSheet({
  snap,
  onSnap,
  label,
  title,
  children,
}: {
  snap: Snap;
  onSnap: (s: Snap) => void;
  label: string;
  title: ReactNode;
  children: ReactNode;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLButtonElement>(null),
    content = useRef<HTMLDivElement>(null),
    sheet = useRef<HTMLElement>(null);
  const [stops, setStops] = useState<Stop[]>([{ snap: "peek", height: 54 }]);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<Drag | null>(null),
    skipClick = useRef(false),
    frame = useRef(0);
  const active = stops.find((s) => s.snap === snap) ?? stops[stops.length - 1];
  const open = active.snap !== "peek" || dragging;
  const next = stops[(stops.indexOf(active) + 1) % stops.length];
  useLayoutEffect(() => {
    const el = sheet.current?.closest<HTMLDivElement>(".map-overlays");
    layer.current = el ?? null;
    const body = content.current,
      button = header.current;
    if (!el || !body || !button) return;
    function measure() {
      if (!el || !body || !button) return;
      // Measure unconstrained content, including its padding, even while the viewport is collapsed.
      const peek = button.offsetHeight + 2;
      const available = Math.max(peek, el.clientHeight);
      const max = Math.min(
        peek + body.offsetHeight,
        Math.max(peek, Math.min(Math.floor(available * 0.88), available - 58)),
      );
      const half = Math.min(max, Math.max(peek, Math.round(available * 0.5)));
      const choices: Stop[] = [{ snap: "peek", height: peek }];
      if (max > peek) {
        choices.push({ snap: "half", height: max - half < 44 ? max : half });
        if (max - half >= 44) choices.push({ snap: "expanded", height: max });
      }
      setStops((old) =>
        old.length === choices.length &&
        old.every((s, i) => s.height === choices[i].height)
          ? old
          : choices,
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    for (const target of [el, button, body]) observer.observe(target);
    return () => {
      observer.disconnect();
      el.style.removeProperty("--sheet-height");
      cancelAnimationFrame(frame.current);
      el.style.removeProperty("--drag-height");
      el.removeAttribute("data-dragging");
    };
  }, [layer]);
  useLayoutEffect(() => {
    const el = layer.current;
    if (!el) return;
    el.style.setProperty("--sheet-height", active.height + "px");
    if (stops.length > 1 && snap !== active.snap) onSnap(active.snap);
  }, [layer, active, snap, stops, onSnap]);
  function finish(e: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.id) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    const el = layer.current;
    if (!el) return;
    if (g.moved) {
      skipClick.current = true;
      if (!cancelled) {
        const velocity = e.timeStamp - g.time < 120 ? g.velocity : 0;
        const end =
          g.origin +
          g.y -
          e.clientY +
          Math.max(-100, Math.min(100, velocity * 85));
        const nearest = stops.reduce((a, b) =>
          Math.abs(b.height - end) < Math.abs(a.height - end) ? b : a,
        );
        onSnap(nearest.snap);
      }
    }
    el.removeAttribute("data-dragging");
    el.style.removeProperty("--drag-height");
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(g.id))
      e.currentTarget.releasePointerCapture(g.id);
  }
  return (
    <section
      className="mobile-sheet station-sheet"
      ref={sheet}
      aria-label={label}
      data-state={dragging ? "dragging" : active.snap}
    >
      <button
        type="button"
        ref={header}
        className="sheet-handle"
        aria-label={
          next.snap === "peek"
            ? "목록 접기"
            : next.snap === "half"
              ? "목록 펼치기"
              : "시트 최대로 펼치기"
        }
        aria-expanded={open}
        onPointerDown={(e) => {
          if (gesture.current || e.button !== 0) return;
          skipClick.current = false;
          gesture.current = {
            id: e.pointerId,
            y: e.clientY,
            origin: sheet.current!.getBoundingClientRect().height,
            lastY: e.clientY,
            time: e.timeStamp,
            velocity: 0,
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = gesture.current,
            el = layer.current;
          if (!g || g.id !== e.pointerId || !el) return;
          const delta = g.y - e.clientY;
          if (!g.moved && Math.abs(delta) < 4) return;
          if (!g.moved) {
            g.moved = true;
            setDragging(true);
            el.setAttribute("data-dragging", "true");
          }
          g.velocity =
            (g.lastY - e.clientY) / Math.max(8, e.timeStamp - g.time);
          g.lastY = e.clientY;
          g.time = e.timeStamp;
          const height = Math.max(
            stops[0].height,
            Math.min(stops[stops.length - 1].height, g.origin + delta),
          );
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() =>
            el.style.setProperty("--drag-height", height + "px"),
          );
        }}
        onPointerUp={(e) => finish(e)}
        onLostPointerCapture={(e) => finish(e, true)}
        onPointerCancel={(e) => finish(e, true)}
        onClick={(e) => {
          if (e.detail && skipClick.current) {
            skipClick.current = false;
            return;
          }
          onSnap(next.snap);
        }}
      >
        <span className="grabber" />
        <span className="sheet-label">{title}</span>
        {next.snap === "peek" ? (
          <ChevronDown size={19} />
        ) : (
          <ChevronUp size={19} />
        )}
      </button>
      <div className="sheet-scroll" inert={!open} aria-hidden={!open}>
        <div className="sheet-body" ref={content}>
          {children}
        </div>
      </div>
    </section>
  );
}
