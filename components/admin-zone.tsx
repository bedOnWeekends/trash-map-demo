import { useState, type Ref } from "react";
import { MapPin, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { binPin } from "./student-stations";
import { ItemIcon } from "./common";
import { ConfirmDialog } from "./ui/dialog";
import { PressButton } from "./ui/press-button";
import CampusMap, { type Pin, type MobileCamera } from "./campus-map";
import { useInstalledBins } from "./motion/data";
import { InstallationPlan, typeNames } from "./admin-plan";
import type { SensorIntent } from "./admin-sensor";
import type { Booth } from "@/lib/use-booth";
import { labels, timeText, zoneAt, type Snapshot } from "@/lib/model";
import { startPlan, type Plan, type Rank } from "@/lib/admin-workflow";

export function ZoneReview({
  rank,
  s,
  b,
  plan,
  save,
  camera,
  onSensor,
}: {
  rank: Rank;
  s: Snapshot;
  b: Booth;
  plan?: Plan;
  save: (plan?: Plan) => void;
  camera: Ref<MobileCamera>;
  onSensor: (intent: SensorIntent) => void;
}) {
  const { zone, requests, reports } = rank;
  const [detail, setDetail] = useState("");
  const fresh = useInstalledBins(s.bins, s.epoch);
  const bins = s.bins.filter((x) => x.zone_id === zone.id);
  const pins: Pin[] = bins.map((x) => ({
    ...binPin(x),
    fresh: fresh.has(x.id),
    warning: reports.filter((r) => r.bin_id === x.id).length,
  }));
  pins.push(
    ...requests.map((r) => ({
      ...r,
      id: "request:" + r.id,
      kind: "request" as const,
      name: "설치 건의 · " + typeNames(r.requested_waste_types),
    })),
  );
  if (plan?.point)
    pins.push({
      ...plan.point,
      id: "candidate",
      kind: "candidate",
      name: "설치 후보",
    });
  const bin = bins.find((x) => x.id === detail);
  const request = requests.find((r) => "request:" + r.id === detail);
  return (
    <section id="management" className="panel review">
      <div className="title-row">
        <h2 tabIndex={-1}>
          <MapPin size={19} />
          {zone.name} 관리 구역
        </h2>
        {!plan && (
          <PressButton
            className="primary"
            disabled={!requests.length && !reports.length}
            onClick={() => save(startPlan(rank, s.epoch))}
          >
            <Plus size={16} />
            설치 위치 지정
          </PressButton>
        )}
      </div>
      <CampusMap
        pins={pins}
        pickedZone={zone}
        picking={!!plan}
        selected={detail}
        cameraRef={camera}
        onPick={(point) => {
          if (!plan) return;
          if (zoneAt(point)?.id !== zone.id) {
            b.notify("선택한 관리 구역 안에서 설치 위치를 지정해 주세요.");
            return;
          }
          save({ ...plan, point });
        }}
        onSelect={(p) => {
          if (p.kind !== "candidate") setDetail(p.id);
        }}
        groupContent={(ids, close) => (
          <ConfirmDialog
            open
            onOpenChange={(v) => {
              if (!v) close();
            }}
            title={zone.name + " 지도 항목 " + ids.length + "개"}
            description="확인할 건의 또는 수거 거점을 선택하세요."
            content={
              <div className="group-options admin-members">
                {pins
                  .filter((p) => ids.includes(p.id))
                  .map((p) => {
                    const req = requests.find(
                      (r) => "request:" + r.id === p.id,
                    );
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          setDetail(p.id);
                          close();
                        }}
                      >
                        <ItemIcon kind={p.kind} />
                        <span>
                          {p.name}
                          <small>
                            {req
                              ? req.reason + " · " + timeText(req.created_at)
                              : "수거 거점 · 미반영 신고 " +
                                (p.warning ?? 0) +
                                "건"}
                          </small>
                        </span>
                      </button>
                    );
                  })}
              </div>
            }
          />
        )}
      />
      {request && (
        <div className="inspection">
          <h3>설치 건의 · {typeNames(request.requested_waste_types)}</h3>
          <p>
            {request.reason} · {timeText(request.created_at)}
          </p>
        </div>
      )}
      {bin && (
        <div className="inspection">
          <h3>{bin.name}</h3>
          {bin.waste_types.map((item) => {
            const hist = reports
              .filter((r) => r.bin_id === bin.id && r.waste_type === item)
              .sort((a, b) => b.created_at.localeCompare(a.created_at));
            return (
              <div key={item} className="inspect-item">
                <div>
                  <strong>{labels[item]}</strong>
                  <small>
                    현재 측정값{" "}
                    {bin.fills[item] == null
                      ? "정보 없음"
                      : bin.fills[item] + "%"}{" "}
                    · 미반영 신고 {hist.length}건
                  </small>
                  {hist[0] && (
                    <small>최근 신고 {timeText(hist[0].created_at)}</small>
                  )}
                </div>
                <PressButton onClick={() => onSensor({ binId: bin.id, item })}>
                  이 품목 센서 설정
                </PressButton>
              </div>
            );
          })}
        </div>
      )}
      {plan && (
        <InstallationPlan
          key={zone.id}
          plan={plan}
          rank={rank}
          b={b}
          update={save}
          discard={() => save()}
        />
      )}
      {!plan && requests.length > 0 && (
        <details className="queue">
          <summary>건의 검토 및 반려 ({requests.length})</summary>
          <AnimatePresence initial={false}>
            {requests.map((r) => (
              <motion.div
                className="queue-row"
                key={r.id}
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div>
                  <strong>{r.reason}</strong>
                  <small>
                    {r.requested_waste_types.map((t) => labels[t]).join(", ")} /{" "}
                    {timeText(r.created_at)}
                  </small>
                </div>
                <div>
                  {r.status === "pending" && (
                    <PressButton
                      disabled={b.busy}
                      onClick={() =>
                        b.mutate(
                          "admin/review",
                          { id: r.id },
                          "검토 중으로 변경했습니다.",
                        )
                      }
                    >
                      검토 시작
                    </PressButton>
                  )}
                  <PressButton
                    disabled={b.busy}
                    onClick={() =>
                      b.mutate(
                        "admin/reject",
                        { id: r.id },
                        "건의를 반려했습니다.",
                      )
                    }
                  >
                    반려
                  </PressButton>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </details>
      )}
    </section>
  );
}
