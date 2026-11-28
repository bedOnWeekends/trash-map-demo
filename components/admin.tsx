"use client";
import { priorityChanges } from "@/lib/priority-change";
import { PressButton } from "./ui/press-button";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  StatusLabel,
  useChangeHighlight,
  useInstalledBins,
} from "./motion/data";
import { AnimatedNumber } from "./motion/patterns";
import { duration, tween } from "@/lib/motion";
import { AnimatePresence, motion } from "motion/react";
import {
  LockKeyhole,
  ArrowRight,
  LogOut,
  RotateCcw,
  MapPin,
  Plus,
  Check,
  Activity,
  ChevronRight,
} from "lucide-react";
import {
  Shell,
  LoadState,
  Notice,
  Footer,
  ItemPicker,
  ItemIcon,
  Fill,
} from "./common";
import { ConfirmDialog } from "./ui/dialog";
import CampusMap, { type Pin } from "./campus-map";
import { binPin } from "./student-stations";
import { useBooth, type Booth } from "@/lib/use-booth";
import {
  items,
  labels,
  rankings,
  daysThrough,
  day,
  fillState,
  pending,
  timeText,
  zoneAt,
  zoneName,
  type Snapshot,
  type Waste,
  type Point,
  type Zone,
} from "@/lib/model";
export function Login() {
  const router = useRouter(),
    [pin, setPin] = useState(""),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <Shell admin />
      <main className="login">
        <LockKeyhole size={30} />
        <h1>관리자 로그인</h1>
        <p>체험 부스 운영용 PIN을 입력해 주세요.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/admin/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: pin }),
              });
              if (!r.ok) throw Error((await r.json()).error);
              router.refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "연결을 확인해 주세요.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            관리자 비밀번호
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              required
              maxLength={128}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          {err && <p role="alert">{err}</p>}
          <PressButton className="primary wide" disabled={busy}>
            로그인
            <ArrowRight size={16} />
          </PressButton>
        </form>
      </main>
    </>
  );
}
function Statistics({ s }: { s: Snapshot }) {
  const values = s.bins.flatMap((b) => b.waste_types.map((t) => b.fills[t])),
    open = s.requests.filter(pending),
    dates = daysThrough(s.as_of),
    levels = ["여유", "보통", "혼잡", "가득 참", "정보 없음"];
  const trend = dates.map((date) => ({
    date,
    r: s.reports.filter((r) => day(r.created_at) === date).length,
    f: s.readings.filter(
      (r) =>
        day(r.created_at) === date &&
        (r.previous_percent ?? 0) < 80 &&
        r.fill_percent >= 80,
    ).length,
  }));
  const max = Math.max(1, ...trend.flatMap((t) => [t.r, t.f]));
  return (
    <>
      <div className="kpis">
        {[
          ["수거 거점", s.bins.length, "곳"],
          [
            "혼잡·포화 품목",
            values.filter((v) => v != null && v >= 80).length,
            "개",
          ],
          ["미처리 건의", open.length, "건"],
          ["미처리 구역", new Set(open.map((r) => r.zone_id)).size, "곳"],
          ["7일 포화 신고", s.reports.length, "건"],
        ].map(([label, v, unit]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>
              <AnimatedNumber value={Number(v)} />
              <small>{unit}</small>
            </strong>
          </div>
        ))}
      </div>
      <section className="analytics" id="stats">
        <div>
          <h2>전체 적재 상태</h2>
          <div className="distribution">
            {levels.map((l) => (
              <i
                key={l}
                data-level={l}
                style={{
                  flexGrow: values.filter((v) => fillState(v) === l).length,
                }}
              />
            ))}
          </div>
          <div className="level-list">
            {levels.map((l) => (
              <span key={l}>
                <i data-level={l} />
                {l} <b>{values.filter((v) => fillState(v) === l).length}</b>
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2>품목별 적재 현황</h2>
          {items.map((t) => {
            const v = s.bins
              .filter((b) => b.waste_types.includes(t))
              .map((b) => b.fills[t])
              .filter((p): p is number => p != null);
            return (
              <div className="item-stat" key={t}>
                <span>{labels[t]}</span>
                <Fill
                  value={
                    v.length
                      ? Math.round(v.reduce((x, y) => x + y, 0) / v.length)
                      : null
                  }
                />
              </div>
            );
          })}
          <small>측정값이 있는 수거함의 평균</small>
        </div>
        <div>
          <h2>최근 7일 추이</h2>
          <div
            className="trend"
            aria-label="서울 날짜별 센서 포화 진입과 학생 포화 신고"
          >
            {trend.map((t) => (
              <div key={t.date}>
                <span className="bars">
                  <i style={{ "--ratio": t.f / max } as React.CSSProperties}>
                    {t.f}
                  </i>
                  <i style={{ "--ratio": t.r / max } as React.CSSProperties}>
                    {t.r}
                  </i>
                </span>
                <small>{t.date.slice(-5)}</small>
              </div>
            ))}
          </div>
          <div className="trend-key">
            <span>센서 포화 진입</span>
            <span>학생 포화 신고</span>
          </div>
        </div>
      </section>
    </>
  );
}
function Sensor({ s, b }: { s: Snapshot; b: Booth }) {
  const [id, select] = useState(s.bins[0]?.id ?? ""),
    bin = s.bins.find((x) => x.id === id) ?? s.bins[0];
  const [chosen, choose] = useState<Waste | undefined>(),
    item = bin?.waste_types.find((t) => t === chosen) ?? bin?.waste_types[0];
  const [draft, setDraft] = useState<number | null>(null);
  if (!bin || !item) return null;
  const pct = draft ?? bin.fills[item] ?? 0;
  return (
    <section className="panel" id="sensor">
      <h2>
        <Activity size={20} />
        센서 시뮬레이터
      </h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await b.mutate(
              "admin/sensor",
              { id: bin.id, item, percent: pct },
              "센서 측정값을 적용했습니다.",
            )
          )
            setDraft(null);
        }}
      >
        <div className="inline-fields">
          <label>
            수거 거점
            <select
              aria-label="수거 거점"
              value={bin.id}
              onChange={(e) => {
                select(e.target.value);
                choose(undefined);
                setDraft(null);
              }}
            >
              {s.bins.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            설치 품목
            <select
              aria-label="설치 품목"
              value={item}
              onChange={(e) => {
                choose(e.target.value as Waste);
                setDraft(null);
              }}
            >
              {bin.waste_types.map((t) => (
                <option value={t} key={t}>
                  {labels[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="title-row">
          <label htmlFor="sensor-pct">포화도 설정</label>
          <b>{pct}%</b>
        </div>
        <input
          id="sensor-pct"
          type="range"
          min="0"
          max="100"
          value={pct}
          onChange={(e) => setDraft(Number(e.target.value))}
        />
        <PressButton className="primary" disabled={b.busy}>
          측정값 적용
        </PressButton>
      </form>
    </section>
  );
}
type Rank = ReturnType<typeof rankings>[number];
function ZoneReview({ rank, s, b }: { rank: Rank; s: Snapshot; b: Booth }) {
  const { zone, requests, reports } = rank;
  const [draft, setDraft] = useState<{ req: string[]; rep: string[] } | null>(
      null,
    ),
    [candidate, locate] = useState<Point | null>(null),
    [name, setName] = useState(""),
    [types, choose] = useState<Waste[]>([]),
    [detail, setDetail] = useState(""),
    [confirm, setConfirm] = useState(false);
  const groups = new Map<string, typeof requests>();
  requests.forEach((r) => {
    const k = r.lat + "," + r.lng;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  });
  const fresh = useInstalledBins(s.bins, s.epoch);
  const pins: Pin[] = s.bins
    .filter((x) => x.zone_id === zone.id)
    .map((x) => ({
      ...binPin(x),
      fresh: fresh.has(x.id),
      warning: reports.filter((r) => r.bin_id === x.id).length,
    }));
  groups.forEach((rows, k) =>
    pins.push({
      ...rows[0],
      id: k,
      kind: "request",
      name: "설치 건의 " + rows.length + "건",
      count: rows.length,
    }),
  );
  if (candidate)
    pins.push({
      ...candidate,
      id: "candidate",
      kind: "candidate",
      name: "설치 후보",
    });
  const pick = (p: Point) => {
    if (!draft) return;
    if (zoneAt(p)?.id !== zone.id) {
      b.notify("선택한 관리 구역 안에서 설치 위치를 지정해 주세요.");
      return;
    }
    locate(p);
  };
  const chooseZone = (z: Zone) => pick({ lat: z.lat, lng: z.lng });
  const start = () => {
    setDraft({ req: requests.map((x) => x.id), rep: reports.map((x) => x.id) });
    locate(null);
    setName("");
    choose([]);
  };
  const shown = groups.get(detail),
    bin = s.bins.find((x) => x.id === detail),
    hist = reports.filter((x) => x.bin_id === detail);
  const toggle = (k: "req" | "rep", id: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      [k]: draft[k].includes(id)
        ? draft[k].filter((v) => v !== id)
        : [...draft[k], id],
    });
  };
  // Capture the offers when siting starts. Live arrivals appear on the map but never enter this approval implicitly.
  const [offers, setOffers] = useState<{
    requests: typeof requests;
    reports: typeof reports;
  }>({ requests: [], reports: [] });
  return (
    <section id="management" className="panel review">
      <div className="title-row">
        <h2>
          <MapPin size={19} />
          {zone.name} 관리 구역
        </h2>
        {!draft && (
          <PressButton
            className="primary"
            disabled={!requests.length && !reports.length}
            onClick={() => {
              start();
              setOffers({ requests: [...requests], reports: [...reports] });
            }}
          >
            <Plus size={16} />
            설치 위치 지정
          </PressButton>
        )}
      </div>
      <CampusMap
        pins={pins}
        zone={zone}
        picking={!!draft}
        selected={detail}
        onPick={pick}
        onSelect={(p) => setDetail(p.id)}
      />
      {shown && (
        <div className="inspection">
          <h3>이 위치의 건의 {shown.length}건</h3>
          {shown.map((r) => (
            <p key={r.id}>
              <strong>
                {r.requested_waste_types.map((t) => labels[t]).join(", ")}
              </strong>{" "}
              / {r.reason} / {timeText(r.created_at)}
            </p>
          ))}
        </div>
      )}
      {bin && (
        <div className="inspection">
          <h3>{bin.name}</h3>
          {hist.length ? (
            hist.map((r) => (
              <p key={r.id}>
                {labels[r.waste_type]} 가득 참 신고 / {timeText(r.created_at)}
              </p>
            ))
          ) : (
            <p>미반영 포화 신고가 없습니다.</p>
          )}
        </div>
      )}
      {draft && (
        <form
          className="approval-form"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirm(true);
          }}
        >
          <h3>새 거점 설치안</h3>
          <p>지도에서 이 구역 안의 위치를 누르거나 건물 중심을 선택하세요.</p>
          <button type="button" onClick={() => chooseZone(zone)}>
            가상 위치로 건물 중심 선택
          </button>
          <p className="position">
            {candidate
              ? candidate.lat.toFixed(6) + ", " + candidate.lng.toFixed(6)
              : "설치 위치 미지정"}
          </p>
          <label>
            신규 거점명
            <input
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ItemPicker value={types} onChange={choose} />
          <fieldset>
            <legend>이번 승인에 반영할 건의·신고</legend>
            {offers.requests.map((r) => (
              <label className="checkline" key={r.id}>
                <input
                  type="checkbox"
                  checked={draft.req.includes(r.id)}
                  onChange={() => toggle("req", r.id)}
                />
                건의 / {r.reason} / {timeText(r.created_at)}
              </label>
            ))}
            {offers.reports.map((r) => (
              <label className="checkline" key={r.id}>
                <input
                  type="checkbox"
                  checked={draft.rep.includes(r.id)}
                  onChange={() => toggle("rep", r.id)}
                />
                신고 / {labels[r.waste_type]} / {timeText(r.created_at)}
              </label>
            ))}
          </fieldset>
          <div className="actions">
            <PressButton
              type="button"
              onClick={() => {
                setDraft(null);
                locate(null);
              }}
            >
              취소
            </PressButton>
            <PressButton
              className="primary"
              disabled={
                !candidate ||
                !name.trim() ||
                !types.length ||
                (!draft.req.length && !draft.rep.length) ||
                b.busy
              }
            >
              승인 대상 확인
            </PressButton>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="설치를 승인할까요?"
        description={
          name +
          " / 건의 " +
          (draft?.req.length ?? 0) +
          "건과 신고 " +
          (draft?.rep.length ?? 0) +
          "건을 이번 설치안에 반영합니다."
        }
      >
        <PressButton
          className="primary"
          disabled={b.busy}
          onClick={async () => {
            if (!draft || !candidate) return;
            const ok = await b.mutate(
              "admin/approve",
              {
                ...candidate,
                zone: zone.id,
                name,
                types,
                requestIds: draft.req,
                reportIds: draft.rep,
              },
              "설치 예정으로 등록했습니다.",
            );
            setConfirm(false);
            if (ok) {
              setDraft(null);
              locate(null);
            }
          }}
        >
          설치 승인
        </PressButton>
      </ConfirmDialog>
      {!draft && requests.length > 0 && (
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
function RankReason({ text }: { text: string }) {
  const [visible, show] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => show(false), 7000);
    return () => clearTimeout(timer);
  }, []);
  return visible ? <span>{text}</span> : null;
}
function RankRow({
  r,
  position,
  reason,
  selected,
  select,
}: {
  r: Rank;
  position: number;
  reason?: { text: string; revision: number };
  selected: boolean;
  select: () => void;
}) {
  const ref = useChangeHighlight<HTMLButtonElement>(
    [position, r.score, r.requests.length, r.reports.length].join("/"),
  );
  return (
    <motion.button
      layout="position"
      transition={tween(duration.layout)}
      ref={ref}

      aria-pressed={selected}
      className="rank-row"
      onClick={select}
    >
      <span>
        <small>{position}</small>
        {r.zone.name}
      </span>
      <span>
        <AnimatedNumber value={r.requests.length} />
      </span>
      <span>
        <AnimatedNumber value={r.reports.length} />
      </span>
      <b>
        <AnimatedNumber value={r.score} />
      </b>
      <span className="rank-explanation">
        {reason && <RankReason key={reason.revision} text={reason.text} />}
      </span>
    </motion.button>
  );
}
function Dashboard({ b, s }: { b: Booth; s: Snapshot }) {
  const [previous, remember] = useState(s);
  const [explanations, setExplanations] = useState(
    new Map<string, { text: string; revision: number }>(),
  );
  if (previous !== s) {
    remember(s);
    const changes = priorityChanges(previous, s);
    if (previous.epoch !== s.epoch) setExplanations(new Map());
    else if (changes.size) {
      const updated = new Map(explanations);
      for (const [id, text] of changes)
        updated.set(id, {
          text,
          revision:(updated.get(id)?.revision ?? 0)+1,
        });
      setExplanations(updated);
    }
  }
  const ranks = rankings(s),
    [id, setId] = useState(ranks[0].zone.id),
    rank = ranks.find((r) => r.zone.id === id)!,
    [reset, setReset] = useState(false);
  return (
    <>
      <Statistics s={s} />
      <div className="admin-grid">
        <section className="panel priority">
          <h2>건물별 설치 우선순위</h2>
          <p className="muted">미처리 건의 × 3 + 미반영 포화 신고</p>
          <div className="rank-head">
            <span>순위 / 건물</span>
            <span>건의</span>
            <span>신고</span>
            <span>점수</span>
          </div>
          {ranks.map((r, i) => (
            <RankRow
              key={r.zone.id}
              r={r}
              reason={explanations.get(r.zone.id)}
              position={i + 1}
              selected={r.zone.id === id}
              select={() => setId(r.zone.id)}
            />
          ))}
          <details className="queue">
            <summary>{rank.zone.name} 품목별 집계</summary>
            {items.map((t) => (
              <div key={t} className="item-stat">
                <strong>
                  <ItemIcon kind={t} size={14} />
                  {labels[t]}
                </strong>
                <span>
                  건의{" "}
                  {
                    rank.requests.filter((r) =>
                      r.requested_waste_types.includes(t),
                    ).length
                  }{" "}
                  / 신고 {rank.reports.filter((r) => r.waste_type === t).length}
                </span>
              </div>
            ))}
          </details>
        </section>
        <ZoneReview key={id} rank={rank} s={s} b={b} />
      </div>
      <div className="admin-grid lower">
        <Sensor s={s} b={b} />
        <section className="panel">
          <h2>설치 승인 및 완료</h2>
          {!s.batches.length && (
            <p className="empty">승인된 설치안이 여기에 표시됩니다.</p>
          )}
          <AnimatePresence initial={false}>
            {s.batches.map((x) => (
              <motion.div
                key={x.id}
                className="queue-row"
                layout="position"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <div>
                  <strong>{x.name}</strong>
                  <small>
                    {zoneName(x.zone_id)} /{" "}
                    {x.waste_types.map((t) => labels[t]).join(", ")} /{" "}
                    <StatusLabel status={x.status} />
                  </small>
                </div>
                {x.status === "approved" && (
                  <PressButton
                    disabled={b.busy}
                    onClick={() =>
                      b.mutate(
                        "admin/install",
                        { id: x.id },
                        "신규 거점을 설치했습니다.",
                      )
                    }
                  >
                    <Check size={15} />
                    설치 완료
                  </PressButton>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </section>
      </div>
      <div className="reset-area">
        <PressButton onClick={() => setReset(true)}>
          <RotateCcw size={16} />
          전역 데모 초기화
        </PressButton>
      </div>
      <ConfirmDialog
        open={reset}
        onOpenChange={setReset}
        title="전체 데모를 초기화할까요?"
        description="모든 접속 기기의 건의, 신고, 센서값, 설치 이력이 초기 시드로 복원됩니다. 이 작업은 되돌릴 수 없습니다."
      >
        <PressButton
          className="danger"
          disabled={b.busy}
          onClick={async () => {
            if (
              await b.mutate(
                "admin/reset",
                { confirm: true },
                "모든 기기에 초기 상태를 반영했습니다.",
              )
            )
              setReset(false);
          }}
        >
          전체 데이터 초기화
        </PressButton>
      </ConfirmDialog>
    </>
  );
}
export default function Admin() {
  const b = useBooth(true),
    router = useRouter();
  return (
    <>
      <Shell admin />
      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="location">체험 부스 운영</div>
            <h1>관리자 대시보드</h1>
          </div>
          <div className="actions">
            <PressButton
              onClick={async () => {
                const r = await fetch("/api/admin/logout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                if (r.ok) router.refresh();
                else b.notify("로그아웃하지 못했습니다. 다시 시도해 주세요.");
              }}
            >
              <LogOut size={16} />
              로그아웃
            </PressButton>
          </div>
        </div>
        <div className="admin-links">
          <a href="#stats">적재 통계</a>
          <ChevronRight size={12} />
          <a href="#management">구역 관리</a>
          <ChevronRight size={12} />
          <a href="#sensor">센서 설정</a>
        </div>
        {(!b.data || b.error) && (
          <LoadState error={b.error} retry={b.refresh} />
        )}{" "}
        {b.data && <Dashboard key={b.data.epoch} s={b.data} b={b} />}
        <Footer />
      </main>
      <Notice kind={b.noticeKind} text={b.notice} />
    </>
  );
}
