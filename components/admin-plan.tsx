import { useRef, useState } from "react";
import { ItemIcon, ItemPicker } from "./common";
import { ConfirmDialog } from "./ui/dialog";
import { PressButton } from "./ui/press-button";
import { labels, rankings, timeText, type Waste } from "@/lib/model";
import { reviewPlan, type Rank, type Plan } from "@/lib/admin-workflow";
import type { Booth } from "@/lib/use-booth";

export const typeNames = (types: Waste[]) =>
  types.map((t) => labels[t]).join(", ") || "없음";
export function InstallationPlan({
  plan,
  rank,
  b,
  update,
  discard,
}: {
  plan: Plan;
  rank: Rank;
  b: Booth;
  update: (plan: Plan) => void;
  discard: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  const [checking, setChecking] = useState(false);
  const review = reviewPlan(plan, rank);
  const { zone } = rank;
  const toggle = (field: "req" | "rep", id: string) =>
    update({
      ...plan,
      [field]: plan[field].includes(id)
        ? plan[field].filter((v) => v !== id)
        : [...plan[field], id],
    });
  const approve = async () => {
    if (lock.current || b.busy) return;
    lock.current = true;
    setChecking(true);
    try {
      const latest = await b.refresh();
      const live =
        latest && rankings(latest).find((r) => r.zone.id === zone.id);
      if (
        !latest ||
        latest.epoch !== plan.epoch ||
        !live ||
        !reviewPlan(plan, live).valid
      ) {
        b.notify(
          "최신 승인 대상을 확인할 수 없습니다. 설치안을 다시 확인해 주세요.",
          "error",
        );
        setConfirm(false);
        return;
      }
      const fresh = reviewPlan(plan, live);
      if (JSON.stringify(fresh) !== JSON.stringify(review)) {
        b.notify("대상 품목이 변경됐습니다. 승인 내용을 다시 확인해 주세요.");
        setConfirm(false);
        return;
      }
      const ok = await b.mutate(
        "admin/approve",
        {
          ...plan.point,
          zone: zone.id,
          name: plan.name.trim(),
          types: fresh.proposed,
          requestIds: plan.req,
          reportIds: plan.rep,
        },
        "설치 예정으로 등록했습니다.",
      );
      setConfirm(false);
      if (ok) discard();
    } finally {
      lock.current = false;
      setChecking(false);
    }
  };
  return (
    <>
      <form
        className="approval-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (review.valid) setConfirm(true);
        }}
      >
        <h3>새 거점 설치안</h3>
        <p>지도에서 설치 위치를 누르거나 건물 중심을 선택하세요.</p>
        <button
          type="button"
          onClick={() =>
            update({ ...plan, point: { lat: zone.lat, lng: zone.lng } })
          }
        >
          가상 위치로 건물 중심 선택
        </button>
        <p className="position">
          {plan.point
            ? plan.point.lat.toFixed(6) + ", " + plan.point.lng.toFixed(6)
            : "설치 위치 미지정"}
        </p>
        <label>
          신규 거점명
          <input
            required
            maxLength={60}
            value={plan.name}
            onChange={(e) => update({ ...plan, name: e.target.value })}
          />
        </label>
        <p>추천 품목 · {typeNames(review.recommended)}</p>
        <ItemPicker
          value={review.proposed}
          onChange={(manualTypes) => update({ ...plan, manualTypes })}
        />
        {plan.manualTypes !== null && (
          <button
            type="button"
            onClick={() => update({ ...plan, manualTypes: null })}
          >
            추천 품목으로 복원
          </button>
        )}
        <fieldset>
          <legend>이번 승인에 반영할 건의·신고</legend>
          {plan.offers.requests.map((r) => {
            const valid = rank.requests.some((x) => x.id === r.id);
            return (
              <label className="checkline" key={r.id}>
                <input
                  type="checkbox"
                  checked={plan.req.includes(r.id)}
                  disabled={!valid && !plan.req.includes(r.id)}
                  onChange={() => toggle("req", r.id)}
                />
                건의 · {typeNames(r.requested_waste_types)} · {r.reason} ·{" "}
                {timeText(r.created_at)}
                {!valid && " · 처리 대상에서 제외됨"}
              </label>
            );
          })}
          {plan.offers.reports.map((r) => {
            const valid = rank.reports.some((x) => x.id === r.id);
            return (
              <label className="checkline" key={r.id}>
                <input
                  type="checkbox"
                  checked={plan.rep.includes(r.id)}
                  disabled={!valid && !plan.rep.includes(r.id)}
                  onChange={() => toggle("rep", r.id)}
                />
                신고 · {labels[r.waste_type]} · {timeText(r.created_at)}
                {!valid && " · 처리 대상에서 제외됨"}
              </label>
            );
          })}
        </fieldset>
        {review.expired && (
          <p role="alert">
            처리되었거나 집계 기간이 지난 대상이 있습니다. 확인 후 해당 선택을
            해제하세요.
          </p>
        )}
        <div className="actions">
          <PressButton
            type="button"
            disabled={checking || b.busy}
            onClick={discard}
          >
            취소
          </PressButton>
          <PressButton
            className="primary"
            disabled={!review.valid || checking || b.busy}
          >
            승인 대상 확인
          </PressButton>
        </div>
      </form>
      <ConfirmDialog
        open={confirm}
        onOpenChange={(v) => {
          if (!checking) setConfirm(v);
        }}
        title="설치를 승인할까요?"
        description={
          zone.name +
          " · " +
          plan.name +
          " · 건의 " +
          plan.req.length +
          "건 / 신고 " +
          plan.rep.length +
          "건"
        }
        content={
          <dl className="plan-comparison">
            {(
              [
                ["건의 품목", review.requested],
                ["신고 품목", review.reported],
                ["실제 설치 품목", review.proposed],
                ["미포함 건의 품목", review.missingRequested],
                ["미포함 신고 품목", review.missingReported],
                ["추가 설치 품목", review.additional],
              ] as const
            ).map(([label, ts]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {ts.length
                    ? ts.map((t) => (
                        <span key={t} className={"plan-type kind-" + t}>
                          <ItemIcon kind={t} size={14} />
                          {labels[t]}
                        </span>
                      ))
                    : "없음"}
                </dd>
              </div>
            ))}
            {review.expired && (
              <div>
                <dt>대상 변경</dt>
                <dd>대상 선택을 다시 확인하세요.</dd>
              </div>
            )}
          </dl>
        }
      >
        <PressButton
          type="button"
          onClick={() => setConfirm(false)}
          disabled={checking}
        >
          설치안 수정
        </PressButton>
        <PressButton
          className="primary"
          disabled={checking || b.busy || !review.valid}
          onClick={approve}
        >
          설치 승인
        </PressButton>
      </ConfirmDialog>
    </>
  );
}
