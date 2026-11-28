"use client";
import { useMotionPreference } from "@/components/motion/patterns";
import Link from "next/link";
import { PressButton } from "./ui/press-button";
import { forwardRef, useContext, useLayoutEffect, useRef } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { duration, distance, ease, tween } from "@/lib/motion";
import { SheetDragging } from "./station-sheet";
import { ChevronRight, Check, LoaderCircle, TriangleAlert } from "lucide-react";
import { ItemIcon, Fill } from "./common";
import { ConfirmDialog } from "./ui/dialog";
import {
  alternatives,
  fillState,
  labels,
  preferredItems,
  zoneName,
  type Bin,
  type Waste,
} from "@/lib/model";
import type { Booth } from "@/lib/use-booth";
import type { Pin } from "./campus-map";
export type ReportTarget = { id: string; item: Waste };
export const binPin = (b: Bin): Pin => ({
  ...b,
  kind: b.waste_types.length > 1 ? "mixed" : b.waste_types[0],
});

export function BinDetail({
  current,
  bins,
  onAlternative,
  compact = false,
  preferred,
  confirmReport,
}: {
  current: Bin;
  bins: Bin[];
  onAlternative: (bin: Bin, item: Waste) => void;
  compact?: boolean;
  preferred?: Waste | null;
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
      {preferredItems(current.waste_types, preferred).map((t) => (
        <div
          className={"item-detail kind-" + t}
          data-preferred={t === preferred || undefined}
          key={t}
        >
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
          {fillState(current.fills[t]) === "가득 참" && (
            <AlternativeList
              bins={bins}
              current={current}
              item={t}
              choose={onAlternative}
            />
          )}
        </div>
      ))}
    </>
  );
}
function AlternativeList({
  bins,
  current,
  item,
  choose,
}: {
  bins: Bin[];
  current: Bin;
  item: Waste;
  choose: (bin: Bin, item: Waste) => void;
}) {
  const options = alternatives(bins, current, item);
  return (
    <section
      className="station-alternatives"
      aria-label={labels[item] + " 대안"}
    >
      {options.length ? (
        <>
          <h4>대신 이용할 수 있는 수거함</h4>
          {options.map((b) => (
            <button
              type="button"
              className="station"
              key={b.id}
              onClick={() => choose(b, item)}
            >
              <span className={"station-icon kind-" + item}>
                <ItemIcon kind={item} />
              </span>
              <span>
                <strong>{b.name}</strong>
                <small>
                  {b.zone_id === current.zone_id
                    ? "같은 건물"
                    : zoneName(b.zone_id)}{" "}
                  / {labels[item]} {b.fills[item]}% 여유
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </>
      ) : (
        <p>현재 여유 상태가 확인된 다른 수거함이 없어요.</p>
      )}
    </section>
  );
}
export function GroupPicker({
  bins,
  context,
  choose,
  close,
  picking = false,
}: {
  picking?: boolean;
  bins: Bin[];
  context: Waste | null;
  choose: (pin: Pin) => void;
  close: () => void;
}) {
  const zones = new Set(bins.map((b) => b.zone_id));
  const title =
    (zones.size === 1 ? zoneName(bins[0].zone_id) + " " : "") +
    "수거 거점 " +
    bins.length +
    "곳";
  return (
    <ConfirmDialog
      open
      sheet
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={title}
      description={
        picking
          ? "건의 위치로 사용할 거점을 선택하세요."
          : "확인할 수거 거점을 선택하세요."
      }
      content={
        <div className="group-options">
          <StationList
            filtered={bins}
            filter={context}
            choose={(p) => {
              close();
              choose(p);
            }}
          />
        </div>
      }
    />
  );
}
export function CoffeeChoice({ drink }: { drink: () => void }) {
  return (
    <section className="coffee-choice">
      <h3>무엇을 버리려고 하시나요?</h3>
      <PressButton type="button" onClick={drink}>
        남은 커피·음료
      </PressButton>
      <Link href="/guide">빈 컵 재질별 배출 안내</Link>
    </section>
  );
}
export function StationList({
  filtered,
  filter,
  choose,
}: {
  filtered: Bin[];
  filter?: Waste | null;
  choose: (pin: Pin) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<string, number>());
  const drag = useContext(SheetDragging);
  const reduce = useMotionPreference();
  const order = filtered.map((b) => b.id).join(",");
  useLayoutEffect(() => {
    // offsetTop uses list-local layout coordinates. Sheet movement and scroll
    // never enter the projection. Read the final slots before writing motion.
    const slots = [
      ...list.current!.querySelectorAll<HTMLElement>(
        ":scope > [data-bin-id]:not([inert])",
      ),
    ];
    const positions = new Map(
      slots.map((el) => [el.dataset.binId!, el.offsetTop]),
    );
    const animations: Animation[] = [];
    if (!drag && !reduce) {
      for (const el of slots) {
        const id = el.dataset.binId!;
        const from = previous.current.get(id);
        const to = positions.get(id)!;
        if (from === undefined || from === to) continue;
        // Keep long moves inside their own opaque slot so labels cannot cross.
        const dy = Math.max(
          -distance.reveal,
          Math.min(distance.reveal, from - to),
        );
        animations.push(
          el.firstElementChild!.animate(
            [{ translate: `0 ${dy}px` }, { translate: "0 0" }],
            {
              duration: duration.fast * 1000,
              easing: `cubic-bezier(${ease.enter.join(",")})`,
            },
          ),
        );
      }
    }
    previous.current = positions;
    return () => animations.forEach((a) => a.cancel());
  }, [order, drag, reduce]);
  return (
    <div
      className="stations"
      ref={list}
      data-empty={!filtered.length || undefined}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {filtered.map((b) => (
          <StationRow key={b.id} bin={b} filter={filter} choose={choose} />
        ))}
      </AnimatePresence>
    </div>
  );
}
const StationRow = forwardRef<
  HTMLDivElement,
  { bin: Bin; filter?: Waste | null; choose: (p: Pin) => void }
>(function StationRow({ bin: b, filter, choose }, ref) {
  const present = useIsPresent();
  const drag = useContext(SheetDragging);
  const reduce = useMotionPreference();
  return (
    <div
      ref={ref}
      className="station-slot"
      data-bin-id={b.id}
      inert={!present}
      aria-hidden={!present || undefined}
    >
      <motion.button
        className="station"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={tween(drag || reduce ? 0 : duration.micro)}
        onClick={(e) => {
          e.currentTarget.dataset.opening = "";
          choose(binPin(b));
        }}
      >
        <span className={"station-icon kind-" + binPin(b).kind}>
          <ItemIcon kind={binPin(b).kind} />
        </span>
        <span>
          <strong>{b.name}</strong>
          {filter ? (
            <span className="station-reading">
              <span>{labels[filter]} 포화도</span>
              <Fill value={b.fills[filter]} />
            </span>
          ) : (
            <small>{b.waste_types.map((t) => labels[t]).join(" / ")}</small>
          )}
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

export function EmptySearch({
  query,
  filter,
  clearQuery,
  clearFilter,
}: {
  query: string;
  filter: Waste | null;
  clearQuery: () => void;
  clearFilter: () => void;
}) {
  return (
    <div className="empty empty-reveal">
      <p>
        {[query.trim() && "“" + query.trim() + "”", filter && labels[filter]]
          .filter(Boolean)
          .join(" / ") || "현재 조건"}
        에 맞는 거점이 없어요.
      </p>
      <div className="empty-actions">
        {filter && (
          <PressButton onClick={clearFilter}>품목 필터만 해제</PressButton>
        )}
        {query.trim() && (
          <PressButton onClick={clearQuery}>검색어 지우기</PressButton>
        )}
      </div>
    </div>
  );
}
