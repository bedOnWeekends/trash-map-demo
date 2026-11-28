import { useRef, useState } from "react";
import { Activity } from "lucide-react";
import { type Snapshot, type Waste, labels, fillState } from "@/lib/model";
import { type Booth } from "@/lib/use-booth";
import { PressButton } from "./ui/press-button";

export type SensorIntent = { binId: string; item: Waste };
type Adjustment = { value?: number; accepted?: number; result?: string };
export function Sensor({
  s,
  b,
  target,
  select,
}: {
  s: Snapshot;
  b: Booth;
  target: SensorIntent | null;
  select: (target: SensorIntent) => void;
}) {
  const [edits, setEdits] = useState<Record<string, Adjustment>>({});
  const saving = useRef(false);
  const bin = target ? s.bins.find((x) => x.id === target.binId) : s.bins[0];
  const item = target?.item ?? bin?.waste_types[0];
  const key = bin?.id + "/" + item;
  const edit = edits[key] ?? {};
  const committed = item ? (bin?.fills[item] ?? null) : null;
  if (edit.accepted != null && committed === edit.accepted) {
    setEdits((prev) => ({
      ...prev,
      [key]: { result: committed + "% 적용됨" },
    }));
  }
  const change = (value: number) =>
    setEdits((prev) => ({ ...prev, [key]: { value } }));
  const verified = (
    state: Snapshot | null,
    submitted: number,
    recheck = false,
  ) => {
    const confirmed =
      !!bin &&
      !!item &&
      state?.epoch === s.epoch &&
      state.bins.find((x) => x.id === bin.id)?.fills[item] === submitted;
    setEdits((prev) =>
      recheck && prev[key]?.accepted !== submitted
        ? prev
        : {
            ...prev,
            [key]: confirmed
              ? { result: submitted + "% 적용됨" }
              : {
                  value: submitted,
                  accepted: submitted,
                  result: "저장 요청 수락 · 최신 측정값 확인 필요",
                },
          },
    );
  };
  return (
    <section className="panel" id="sensor">
      <h2 tabIndex={-1}>
        <Activity size={20} />
        센서 시뮬레이터
      </h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            saving.current ||
            b.busy ||
            !bin ||
            !item ||
            !bin.waste_types.includes(item) ||
            edit.value == null ||
            edit.value === committed
          )
            return;
          saving.current = true;
          const value = edit.value;
          try {
            const ok = await b.mutate(
              "admin/sensor",
              { id: bin.id, item, percent: value },
              "",
              (snapshot) => verified(snapshot, value),
            );
            if (!ok)
              setEdits((prev) => ({
                ...prev,
                [key]: {
                  value,
                  result: "측정값 적용 실패 · 다시 시도해 주세요.",
                },
              }));
          } finally {
            saving.current = false;
          }
        }}
      >
        <div className="inline-fields">
          <label>
            수거 거점
            <select
              aria-label="수거 거점"
              value={bin?.id ?? ""}
              onChange={(e) => {
                const next = s.bins.find((x) => x.id === e.target.value);
                if (next?.waste_types[0])
                  select({ binId: next.id, item: next.waste_types[0] });
              }}
            >
              {!bin && <option value="">거점을 선택하세요</option>}
              {s.bins.map((x) => (
                <option value={x.id} key={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            설치 품목
            <select
              aria-label="설치 품목"
              value={item ?? ""}
              onChange={(e) =>
                bin && select({ binId: bin.id, item: e.target.value as Waste })
              }
            >
              {bin?.waste_types.map((t) => (
                <option value={t} key={t}>
                  {labels[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {bin && item && bin.waste_types.includes(item) ? (
          <>
            <div className="sensor-preview">
              <div
                className="bin-section"
                data-unknown={committed == null || undefined}
                data-decreasing={
                  (edit.value != null &&
                    committed != null &&
                    edit.value < committed) ||
                  undefined
                }
                aria-hidden="true"
              >
                {committed != null && (
                  <i
                    className="bin-level"
                    data-level={fillState(committed)}
                    style={{ height: committed + "%" }}
                  />
                )}
                {edit.value != null && edit.value !== committed && (
                  <>
                    {committed != null && (
                      <i
                        className="bin-difference"
                        style={{
                          bottom: Math.min(committed, edit.value) + "%",
                          height: Math.abs(committed - edit.value) + "%",
                        }}
                      />
                    )}
                    <i
                      className="draft-line"
                      style={{ bottom: edit.value + "%" }}
                    />
                  </>
                )}
              </div>
              <div className="sensor-values">
                <div>
                  현재 측정값
                  <strong>
                    {committed == null ? "정보 없음" : committed + "%"}
                  </strong>
                </div>
                <div>
                  적용 예정
                  <strong>{edit.value == null ? "—" : edit.value + "%"}</strong>
                  {edit.value != null && (
                    <small>
                      {fillState(edit.value)}
                      {committed != null &&
                        edit.value !== committed &&
                        " · " +
                          (edit.value > committed ? "+" : "−") +
                          Math.abs(edit.value - committed) +
                          "%p"}
                    </small>
                  )}
                </div>
              </div>
            </div>
            <label htmlFor="sensor-pct">포화도 설정</label>
            <div className="sensor-range">
              <input
                id="sensor-pct"
                type="range"
                min={0}
                max={100}
                disabled={b.busy}
                value={edit.value ?? committed ?? 0}
                aria-valuetext={
                  edit.value != null
                    ? "적용 예정 " + edit.value + "%"
                    : committed == null
                      ? "정보 없음"
                      : committed + "%"
                }
                onChange={(e) => change(Number(e.target.value))}
              />
              {committed != null && (
                <div className="saved-rail" aria-hidden>
                  <i
                    style={{ transform: "translateX(" + committed + "cqw)" }}
                  />
                </div>
              )}
            </div>
            <div className="actions">
              {committed == null && (
                <button
                  type="button"
                  disabled={b.busy}
                  onClick={() => change(0)}
                >
                  0% 지정
                </button>
              )}
              {edit.accepted != null ? (
                <PressButton
                  type="button"
                  onClick={async () =>
                    verified(await b.refresh(), edit.accepted!, true)
                  }
                >
                  측정값 다시 확인
                </PressButton>
              ) : (
                <PressButton
                  className="primary"
                  disabled={
                    b.busy || edit.value == null || edit.value === committed
                  }
                >
                  측정값 적용
                </PressButton>
              )}
            </div>
            <output className="sensor-result" aria-live="polite">
              {edit.result}
            </output>
          </>
        ) : (
          <p>
            현재 선택한 거점 또는 품목을 찾을 수 없습니다. 거점을 다시
            선택하세요.
          </p>
        )}
      </form>
    </section>
  );
}
