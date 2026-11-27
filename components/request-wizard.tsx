"use client";
import { useState } from "react";
import {
  LoaderCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  X,
} from "lucide-react";
import {
  items,
  labels,
  zones,
  zoneAt,
  type Point,
  type Waste,
} from "@/lib/model";
import { ItemPicker } from "./common";

export type Draft = {
  step: 1 | 2 | 3;
  point: Point | null;
  types: Waste[];
  reason: string;
};
export const emptyDraft: Draft = {
  step: 1,
  point: null,
  types: [],
  reason: "",
};
const draftKey = "booth-student-request";
export function savedDraft(epoch?: string): Draft | null {
  if (!epoch) return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
    if (!saved || saved.epoch !== epoch) return null;
    const d = saved.draft;
    if (
      ![1, 2, 3].includes(d.step) ||
      typeof d.reason !== "string" ||
      d.reason.length > 400 ||
      !Array.isArray(d.types) ||
      !d.types.every((t: Waste) => items.includes(t)) ||
      (d.point && !zoneAt(d.point)) ||
      (d.step > 1 && !d.point) ||
      (d.step === 3 && !d.types.length)
    )
      return null;
    return d;
  } catch {
    return null;
  }
}
export function saveDraft(epoch: string | undefined, draft: Draft | null) {
  if (!epoch) return;
  try {
    if (draft)
      sessionStorage.setItem(draftKey, JSON.stringify({ epoch, draft }));
    else sessionStorage.removeItem(draftKey);
  } catch {
    /* The open wizard still retains its state when storage is unavailable. */
  }
}
const titles = ["위치 지정", "품목 선택", "사유 입력"];
export function RequestWizard({
  draft,
  change,
  revealBuilding,
  cancel,
  submit,
  busy,
  notice,
}: {
  draft: Draft;
  change: (d: Draft) => void;
  revealBuilding: (point: Point) => void;
  cancel: () => void;
  submit: () => void;
  busy: boolean;
  notice: string;
}) {
  const { step, point, types, reason } = draft;
  const [previous, setPrevious] = useState(step);
  const [direction, setDirection] = useState(1);
  if (step !== previous) {
    setDirection(step > previous ? 1 : -1);
    setPrevious(step);
  }
  const zone = point && zoneAt(point);
  const valid =
    step === 1
      ? !!zone
      : step === 2
        ? !!types.length
        : !!reason.trim() && reason.length <= 400;
  return (
    <form
      className="proposal-wizard"
      aria-label="추가 설치 건의"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || busy) return;
        if (step === 3) submit();
        else change({ ...draft, step: step === 1 ? 2 : 3 });
      }}
    >
      <div className="wizard-heading">
        <span className="step-count" aria-label={"3단계 중 " + step + "단계"}>
          {[1, 2, 3].map((n) => (
            <span
              className="step-segment"
              aria-hidden
              key={n}
              data-active={step >= n}
            >
              {n < step ? <Check size={12} /> : n}
            </span>
          ))}
        </span>
        <h2 aria-live="polite">{titles[step - 1]}</h2>
        <button
          type="button"
          aria-label="건의 작성 취소"
          disabled={busy}
          onClick={cancel}
        >
          <X size={19} />
        </button>
      </div>
      <div className="wizard-fields" key={step} data-direction={direction}>
        {step === 1 && (
          <label>
            <span>
              <MapPin size={16} />
              {zone ? zone.name : "지도를 누르거나 건물을 선택하세요"}
            </span>
            <select
              aria-label="가상 위치 선택"
              value={zone?.id ?? ""}
              onChange={(e) => {
                const z = zones.find((z) => z.id === e.target.value);
                if (z) {
                  const point = { lat: z.lat, lng: z.lng };
                  change({ ...draft, point });
                  revealBuilding(point);
                }
              }}
            >
              <option value="">건물 중심으로 지정</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {step === 2 && (
          <ItemPicker
            value={types}
            onChange={(types) => change({ ...draft, types })}
          />
        )}
        {step === 3 && (
          <>
            <div className="proposal-summary">
              <strong>
                <MapPin size={16} />
                {zone?.name}
              </strong>
              <p>{types.map((t) => labels[t]).join(" · ")}</p>
            </div>
            <label>
              건의 사유
              <textarea
                rows={3}
                required
                maxLength={400}
                value={reason}
                placeholder="이 위치에 수거함이 필요한 이유"
                onChange={(e) => change({ ...draft, reason: e.target.value })}
              />
            </label>
            <small>{reason.length} / 400자</small>
          </>
        )}
      </div>
      <div>
        <div
          role="status"
          aria-live="polite"
          className={notice ? "wizard-feedback" : "visually-hidden"}
        >
          {notice}
        </div>
        <div className="wizard-actions">
          {step > 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => change({ ...draft, step: step === 3 ? 2 : 1 })}
            >
              <ArrowLeft size={16} />
              이전
            </button>
          )}
          <button type="submit" className="primary" disabled={!valid || busy}>
            {step === 3 ? (busy ? "접수 중…" : "건의 제출") : "다음"}
            {busy ? (
              <LoaderCircle className="pending-icon" size={16} />
            ) : step === 3 ? (
              <Check size={16} />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
