"use client";
import { ChevronRight, Check, TriangleAlert } from "lucide-react";
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
            <button
              className="report"
              onClick={() => confirmReport({ id: current.id, item: t })}
            >
              <TriangleAlert size={14} />
              가득 참 신고
            </button>
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
  return (
    <div className="stations">
      {filtered.map((b) => (
        <button
          className="station"
          key={b.id}
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
        </button>
      ))}
    </div>
  );
}
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
      title="수거함이 가득 찼나요?"
      description={
        report
          ? labels[report.item] +
            " 수거함이 현장에서 가득 찬 경우에 신고해 주세요. 센서 측정값은 유지됩니다."
          : ""
      }
    >
      <button
        className="primary wide"
        disabled={busy}
        onClick={async () => {
          if (report) {
            await mutate("reports", report, "가득 참 신고를 접수했어요.");
            confirmReport(null);
          }
        }}
      >
        <Check size={16} />
        확인하고 신고
      </button>
    </ConfirmDialog>
  );
}
