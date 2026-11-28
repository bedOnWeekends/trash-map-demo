"use client";
import { boothEvents, emptyDeck, enqueue, advance } from "@/lib/booth-events";
import { EventCard, Exhibition } from "./exhibition";
import { ChevronDown } from "lucide-react";
import { priorityChanges } from "@/lib/priority-change";
import { PressButton } from "./ui/press-button";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { StatusLabel, useChangeHighlight } from "./motion/data";
import { AnimatedNumber } from "./motion/patterns";
import { duration, tween } from "@/lib/motion";
import { AnimatePresence, motion } from "motion/react";
import {
  LockKeyhole,
  ArrowRight,
  LogOut,
  RotateCcw,
  Check,
} from "lucide-react";
import { Shell, LoadState, Notice, Footer, ItemIcon } from "./common";
import { ConfirmDialog } from "./ui/dialog";
import { type MobileCamera } from "./campus-map";
import { type Plan, type Rank } from "@/lib/admin-workflow";
import { ZoneReview } from "./admin-zone";
import { Sensor, type SensorIntent } from "./admin-sensor";
import { Statistics, Metrics } from "./admin-statistics";
import { useBooth, type Booth } from "@/lib/use-booth";
import { items, labels, rankings, zoneName, type Snapshot } from "@/lib/model";
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
function RankRow({
  r,
  position,
  reason,
  selected,
  drafting,
  select,
}: {
  r: Rank;
  position: number;
  reason?: { text: string; revision: number };
  selected: boolean;
  drafting: boolean;
  select: () => void;
}) {
  const ref = useChangeHighlight<HTMLButtonElement>(reason?.revision ?? 0);
  const [expanded, expand] = useState(false);
  const requestTerm = useChangeHighlight<HTMLSpanElement>(r.requests.length);
  const reportTerm = useChangeHighlight<HTMLSpanElement>(r.reports.length);
  return (
    <motion.div
      className="rank-record"
      layout="position"
      transition={tween(duration.layout)}
    >
      <button
        ref={ref}

        data-zone-id={r.zone.id}
        aria-pressed={selected}
        className="rank-row"
        onClick={select}
      >
        <span>
          <small>{position}</small>
          {r.zone.name}
          {drafting && <em>작성 중</em>}
          {reason && <span className="rank-explanation">{reason.text}</span>}
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
      </button>
      <button
        type="button"
        className="formula-toggle"
        aria-label={r.zone.name + " 점수 계산식"}
        aria-expanded={expanded}
        aria-controls={"formula-" + r.zone.id}
        onClick={() => expand(!expanded)}
      >
        <ChevronDown size={16} />
      </button>
      <div
        className="score-formula"
        id={"formula-" + r.zone.id}
        hidden={!expanded}
      >
        <span ref={requestTerm}>미처리 건의 {r.requests.length}건 × 3</span> +{" "}
        <span ref={reportTerm}>미반영 신고 {r.reports.length}건 × 1</span> ={" "}
        <b>{r.score}점</b>
        {reason && <small>{reason.text}</small>}
      </div>
    </motion.div>
  );
}
function Dashboard({
  b,
  s,
  exhibit,
}: {
  b: Booth;
  s: Snapshot;
  exhibit: boolean;
}) {
  const [previous, remember] = useState(s);
  const [explanations, setExplanations] = useState(
    new Map<string, { text: string; revision: number }>(),
  );
  const [deck, setDeck] = useState(emptyDeck);
  const [plans, setPlans] = useState<Record<string, Plan | undefined>>({});
  const [target, setTarget] = useState<SensorIntent | null>(null);
  const camera = useRef<MobileCamera>(null);
  if (previous !== s) {
    remember(s);
    const events = boothEvents(previous, s);
    if (events.length) setDeck(enqueue(deck, events));
    const changes = priorityChanges(previous, s);
    if (previous.epoch !== s.epoch) setExplanations(new Map());
    else if (changes.size) {
      const updated = new Map(explanations);
      for (const [id, text] of changes)
        updated.set(id, {
          text,
          revision: (updated.get(id)?.revision ?? 0) + 1,
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
      {exhibit && (
        <Exhibition
          s={s}
          ranks={ranks}
          deck={deck}
          next={() => setDeck(advance)}
        />
      )}
      <div className="operation-view" hidden={exhibit} inert={exhibit}>
        <Metrics s={s} ranks={ranks} />
        <nav className="booth-shortcuts" aria-label="운영 도구">
          <a href="#management">구역 지도</a>
          <a href="#stats">적재 통계</a>
          <a href="#sensor">센서 설정</a>
        </nav>
        <EventCard deck={deck} next={() => setDeck(advance)} />
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
                drafting={!!plans[r.zone.id]}
                select={() => {
                  setId(r.zone.id);
                  const rect = document
                    .querySelector("#management .map-surface")
                    ?.getBoundingClientRect();
                  if (rect) camera.current?.reveal(r.zone, rect);
                  if (matchMedia("(max-width: 850px)").matches) {
                    const heading =
                      document.querySelector<HTMLElement>("#management h2");
                    heading?.focus({ preventScroll: true });
                    heading?.scrollIntoView({
                      block: "start",
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "instant"
                        : "smooth",
                    });
                  }
                }}
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
                    / 신고{" "}
                    {rank.reports.filter((r) => r.waste_type === t).length}
                  </span>
                </div>
              ))}
            </details>
          </section>
          <ZoneReview
            rank={rank}
            s={s}
            b={b}
            camera={camera}
            plan={plans[id]}
            save={(plan) => setPlans((prev) => ({ ...prev, [id]: plan }))}
            onSensor={(intent) => {
              if (
                !s.bins
                  .find((x) => x.id === intent.binId)
                  ?.waste_types.includes(intent.item)
              ) {
                b.notify("거점 또는 품목을 다시 확인해 주세요.");
                return;
              }
              setTarget(intent);
              const heading = document.querySelector<HTMLElement>("#sensor h2");
              heading?.focus({ preventScroll: true });
              heading?.scrollIntoView({
                block: "nearest",
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "instant"
                  : "smooth",
              });
            }}
          />
        </div>
        <Statistics s={s} />
        <div className="admin-grid lower">
          <Sensor s={s} b={b} target={target} select={setTarget} />
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
      </div>
    </>
  );
}
export default function Admin() {
  const b = useBooth(true),
    router = useRouter();
  const [exhibit, setExhibit] = useState(false);
  const scroll = useRef(0);
  function switchMode(next: boolean) {
    if (next === exhibit) return;
    if (next) scroll.current = window.scrollY;
    setExhibit(next);
    requestAnimationFrame(() =>
      window.scrollTo({ top: next ? 0 : scroll.current, behavior: "instant" }),
    );
  }
  return (
    <>
      <Shell admin />
      <main className="workspace admin-workspace">
        <div className="page-heading">
          <div>
            <h1>관리자 대시보드</h1>
          </div>
          <div className="actions">
            {b.data && (
              <div
                className="admin-modes"
                role="group"
                aria-label="대시보드 화면"
              >
                <PressButton
                  aria-pressed={!exhibit}
                  onClick={() => switchMode(false)}
                >
                  운영 화면
                </PressButton>
                <PressButton
                  aria-pressed={exhibit}
                  onClick={() => switchMode(true)}
                >
                  관람객 화면
                </PressButton>
              </div>
            )}
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
        {(!b.data || b.error) && (
          <LoadState error={b.error} retry={b.refresh} />
        )}{" "}
        {b.data && (
          <Dashboard key={b.data.epoch} s={b.data} b={b} exhibit={exhibit} />
        )}
        <Footer />
      </main>
      <Notice kind={b.noticeKind} text={b.notice} />
    </>
  );
}
