"use client";
import { PressButton } from "./ui/press-button";
import { forwardRef, useContext, useLayoutEffect, useRef } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { duration, distance, ease, tween } from "@/lib/motion";
import { SheetDragging } from "./station-sheet";
import { ChevronRight, Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { ItemIcon, Fill } from "./common";
import { ConfirmDialog } from "./ui/dialog";
import { labels, zoneName, type Bin, type Waste } from "@/lib/model";
import type { Booth } from "@/lib/use-booth";
import type { Pin } from "./campus-map";
export type ReportTarget = { id: string; item: Waste };
export const binPin = (b: Bin): Pin => ({
  ...b,
  kind: b.waste_types.length > 1 ? "mixed" : b.waste_types[0],
});

export function BinDetail({
  current,
  compact = false,
  confirmReport,
}: {
  current: Bin;
  compact?: boolean;
  confirmReport: (r: ReportTarget) => void;
}) {
  return (
    <>
      {!compact && (
        <>
          <span className={"station-icon large kind-" + binPin(current).kind}>
            <ItemIcon kind={binPin(current).kind} size={26} />
          </span>
          <h2>{current.name}</h2>
        </>
      )}
      <p className="muted">
        {zoneName(current.zone_id)} / {current.location_description}
      </p>
      <div className="divider" />
      <h3>품목별 포화도</h3>
      {current.waste_types.map((t) => (
        <div className="item-detail" key={t}>
          <div className="title-row">
            <strong>
              <ItemIcon kind={t} />
              {labels[t]}
            </strong>
            <PressButton
              className="report"
              onClick={() => confirmReport({ id: current.id, item: t })}
            >
              <TriangleAlert size={14} />
              가득 참 신고
            </PressButton>
          </div>
          <Fill value={current.fills[t]} />
        </div>
      ))}
    </>
  );
}
export function StationList({
  filtered,
  choose,
}: {
  filtered: Bin[];
  choose: (pin: Pin) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, number>());
  const drag = useContext(SheetDragging);
  const reduce = useReducedMotion();
  const order = filtered.map(b => b.id).join(",");
  useLayoutEffect(() => {
    // offsetTop uses list-local layout coordinates. Sheet movement and scroll
    // never enter the projection. Read the final slots before writing motion.
    const slots = [...list.current!.querySelectorAll<HTMLElement>(":scope > [data-bin-id]:not([inert])")];
    const positions = new Map(slots.map(el => [el.dataset.binId!, el.offsetTop]));
    const animations: Animation[] = [];
    if (!drag && !reduce) {
      for (const el of slots) {
        const id = el.dataset.binId!;
        const from = previous.current.get(id);
        const to = positions.get(id)!;
        if (from === undefined || from === to) continue;
        // Keep long moves inside their own opaque slot so labels cannot cross.
        const dy = Math.max(-distance.reveal, Math.min(distance.reveal, from - to));
        animations.push(el.firstElementChild!.animate(
          [{ translate: `0 ${dy}px` }, { translate: "0 0" }],
          { duration: duration.fast * 1000, easing: `cubic-bezier(${ease.enter.join(",")})` },
        ));
      }
    }
    previous.current = positions;
    return () => animations.forEach(a => a.cancel());
  }, [order, drag, reduce]);
  return (
    <div className="stations" ref={list} data-empty={!filtered.length || undefined}>
      <AnimatePresence mode="popLayout" initial={false}>
        {filtered.map((b) => <StationRow key={b.id} bin={b} choose={choose} />)}
      </AnimatePresence>
    </div>
  );
}
const StationRow = forwardRef<
  HTMLDivElement,
  { bin: Bin; choose: (p: Pin) => void }
>(function StationRow({ bin: b, choose }, ref) {
  const present = useIsPresent();
  const drag = useContext(SheetDragging);
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="station-slot" data-bin-id={b.id}
      inert={!present} aria-hidden={!present || undefined}>
    <motion.button
      className="station"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={tween(drag || reduce ? 0 : duration.micro)}
      onClick={() => choose(binPin(b))}
    >
      <span className={"station-icon kind-" + binPin(b).kind}>
        <ItemIcon kind={binPin(b).kind} />
      </span>
      <span>
        <strong>{b.name}</strong>
        <small>{b.waste_types.map((t) => labels[t]).join(" / ")}</small>
      </span>
      <ChevronRight size={16} />
    </motion.button>
    </div>
  );
});
export function ReportDialog({
  report,
  confirmReport,
  booth,
}: {
  report: ReportTarget | null;
  confirmReport: (r: ReportTarget | null) => void;
  booth: Booth;
}) {
  const { busy, mutate } = booth;
  return (
    <ConfirmDialog
      open={!!report}
      onOpenChange={(v) => {
        if (!v) confirmReport(null);
      }}
      content={
        booth.noticeKind === "error" &&
        booth.notice && <p role="alert">{booth.notice}</p>
      }
      title="수거함이 가득 찼나요?"
      description={
        report
          ? labels[report.item] +
            " 수거함이 현장에서 가득 찬 경우에 신고해 주세요. 센서 측정값은 유지됩니다."
          : ""
      }
    >
      <PressButton
        className="primary wide"
        disabled={busy}
        onClick={async () => {
          if (report) {
            if (await mutate("reports", report, "가득 참 신고를 접수했어요."))
              confirmReport(null);
          }
        }}
      >
        {busy ? (
          <LoaderCircle size={16} className="pending-icon" />
        ) : (
          <Check size={16} />
        )}
        {busy ? "접수 중…" : "확인하고 신고"}
      </PressButton>
    </ConfirmDialog>
  );
}
