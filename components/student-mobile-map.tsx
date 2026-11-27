"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import CampusMap, { type Pin } from "./campus-map";
import { ItemIcon, LoadState, Notice } from "./common";
import { StudentShell } from "./student-shell";
import {
  BinDetail,
  StationList,
  ReportDialog,
  binPin,
  type ReportTarget,
} from "./student-stations";
import {
  emptyDraft,
  RequestWizard,
  savedDraft,
  saveDraft,
  type Draft,
} from "./request-wizard";
import { ConfirmDialog } from "./ui/dialog";
import {
  items,
  labels,
  zoneAt,
  zoneName,
  type Point,
  type Waste,
} from "@/lib/model";
import type { Booth } from "@/lib/use-booth";

type Snap = "peek" | "half" | "expanded";
const stops: Snap[] = ["peek", "half", "expanded"];
const frequent: Waste[] = ["general", "plastic", "paper"];
export function MobileMap({ booth }: { booth: Booth }) {
  const { data, error, sync, busy, mutate, notify } = booth;
  const [query, search] = useState(""),
    [filter, setFilter] = useState<Waste | null>(null);
  const [selected, select] = useState(""),
    [snap, setSnap] = useState<Snap>("peek");
  const [filterOpen, openFilter] = useState(false),
    [discard, askDiscard] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [draft, setDraft] = useState<Draft | null>(() =>
    savedDraft(data?.epoch),
  );
  const [draftEpoch, rememberDraftEpoch] = useState(data?.epoch);
  if (data && draftEpoch !== data.epoch) {
    rememberDraftEpoch(data.epoch);
    setDraft(savedDraft(data.epoch));
  }
  const region = useRef<HTMLElement>(null),
    gesture = useRef<{
      axis: "x" | "y";
      start: number;
      length: number;
      dragged: boolean;
    } | null>(null),
    skipClick = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const changeDraft = (next: Draft | null) => {
    if (next && booth.notice) notify("");
    saveDraft(data?.epoch, next);
    setDraft(next);
  };
  const bins = data?.bins ?? [];
  const filtered = bins.filter(
    (b) =>
      (!filter || b.waste_types.includes(filter)) &&
      (b.name + zoneName(b.zone_id) + b.location_description)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const current = bins.find((b) => b.id === selected);
  const visibleChips =
    filter && !frequent.includes(filter)
      ? [frequent[0], frequent[1], filter]
      : frequent;
  const reset = () => {
    search("");
    setFilter(null);
    select("");
  };
  const updateFilter = (next: Waste | null) => {
    setFilter(next);
    select("");
    openFilter(false);
    setSnap("half");
  };
  const choose = (pin: Pin) => {
    if (draft) {
      pick(pin);
      return;
    }
    if (pin.id === selected && snap !== "peek") {
      select("");
      setSnap("peek");
      return;
    }
    select(pin.id);
    setSnap("half");
    input.current?.blur();
  };
  const pick = (p: Point) => {
    if (draft?.step !== 1) return;
    if (!zoneAt(p)) {
      changeDraft({ ...draft, point: null });
      notify("캠퍼스 관리 구역 안을 선택해 주세요.");
      return;
    }
    changeDraft({ ...draft, point: { lat: p.lat, lng: p.lng } });
  };
  const pins = (draft ? bins : filtered).map(binPin);
  if (draft?.point)
    pins.push({
      ...draft.point,
      id: "candidate",
      kind: "candidate",
      name: "건의 위치",
    });
  const closeDraft = () => {
    changeDraft(null);
    askDiscard(false);
    setSnap("peek");
  };
  const step = draft?.step;
  const snapTo = (next: Snap) => {
    setSnap(next);
    if (next === "peek") select("");
  };
  const finishDrag = (e: PointerEvent<HTMLButtonElement>, cancel = false) => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    region.current?.style.removeProperty("--drag-size");
    if (!g.dragged || cancel) return;
    skipClick.current = true;
    const delta = g.start - (g.axis === "x" ? e.clientX : e.clientY);
    if (Math.abs(delta) <= 20 || !region.current) return;
    const length =
      g.axis === "x" ? region.current.clientWidth : region.current.clientHeight;
    const peek = parseFloat(
      getComputedStyle(region.current).getPropertyValue("--peek"),
    );
    const sizes =
      g.axis === "x"
        ? [0, Math.max(170, length * 0.34), length * 0.66]
        : [peek, length * 0.5, length * 0.86];
    const end = g.length + delta;
    const nearest = sizes.reduce(
      (best, size, i) =>
        Math.abs(size - end) < Math.abs(sizes[best] - end) ? i : best,
      0,
    );
    const from = stops.indexOf(snap);
    snapTo(
      stops[
        nearest === from
          ? Math.max(0, Math.min(2, from + Math.sign(delta)))
          : nearest
      ],
    );
  };
  useEffect(() => {
    if (snap !== "peek")
      region.current?.querySelector(".sheet-scroll")?.scrollTo(0, 0);
  }, [selected, snap]);
  return (
    <StudentShell sync={error ? "연결 확인 필요" : sync}>
      <main
        className="mobile-workbench"
        ref={region}
        data-snap={snap}
        data-step={step}
        data-feedback={draft && booth.notice ? true : undefined}
      >
        <h1 className="visually-hidden">분리수거 지도</h1>
        <div className="mobile-map-stage" inert={!!step && step > 1}>
          <CampusMap
            pins={pins}
            selected={draft?.point ? "candidate" : selected}
            onSelect={choose}
            onPick={pick}
            picking={step === 1}
            mobile
            focusPoint={
              draft?.point ?? (snap === "half" && current ? current : undefined)
            }
          />
          {!draft && snap !== "expanded" && !current && (
            <div className="floating-search">
              <div className="map-search-field">
                <Search size={20} />
                <input
                  ref={input}
                  type="search"
                  aria-label="건물 및 수거함 검색"
                  placeholder="건물명 또는 수거함 검색"
                  value={query}
                  onChange={(e) => {
                    search(e.target.value);
                    select("");
                    setSnap("half");
                  }}
                />
                {query && (
                  <button
                    aria-label="검색어 지우기"
                    onClick={() => {
                      search("");
                      input.current?.focus();
                    }}
                  >
                    <X size={17} />
                  </button>
                )}
                <button
                  className="filter-trigger"
                  aria-label="전체 품목 필터"
                  aria-haspopup="dialog"
                  onClick={() => openFilter(true)}
                >
                  <SlidersHorizontal size={19} />
                </button>
              </div>
              <div className="quick-filters" aria-label="품목 필터">
                <button
                  aria-pressed={!filter}
                  onClick={() => updateFilter(null)}
                >
                  전체
                </button>
                {visibleChips.map((t) => (
                  <button
                    key={t}
                    aria-pressed={filter === t}
                    onClick={() => updateFilter(filter === t ? null : t)}
                  >
                    <i className={"dot kind-" + t} />
                    {labels[t]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!draft && snap !== "expanded" && (
            <button
              className="proposal-fab primary"
              disabled={!data}
              onClick={() => {
                select("");
                changeDraft({ ...emptyDraft });
                input.current?.blur();
              }}
            >
              <Plus size={18} />
              추가 설치 건의
            </button>
          )}
        </div>
        {draft ? (
          <section className="mobile-sheet wizard-sheet" aria-label="건의 작성">
            <RequestWizard
              notice={booth.notice}
              draft={draft}
              change={changeDraft}
              busy={busy}
              cancel={() => {
                if (draft.point || draft.types.length || draft.reason)
                  askDiscard(true);
                else closeDraft();
              }}
              submit={async () => {
                if (
                  draft.point &&
                  (await mutate(
                    "requests",
                    {
                      ...draft.point,
                      types: draft.types,
                      reason: draft.reason,
                    },
                    "설치 건의를 접수했어요.",
                  ))
                )
                  closeDraft();
              }}
            />
          </section>
        ) : (
          <section
            className="mobile-sheet"
            aria-label={current ? "거점 상세" : "수거 거점 목록"}
          >
            <button
              className="sheet-handle"
              aria-label={
                snap === "peek"
                  ? "목록 펼치기"
                  : snap === "half"
                    ? "시트 최대로 펼치기"
                    : "목록 접기"
              }
              aria-expanded={snap !== "peek"}
              onPointerDown={(e) => {
                skipClick.current = false;
                const side =
                  snap !== "peek" &&
                  matchMedia("(orientation:landscape) and (max-height:540px)")
                    .matches;
                const bounds =
                  e.currentTarget.parentElement!.getBoundingClientRect();
                gesture.current = {
                  axis: side ? "x" : "y",
                  start: side ? e.clientX : e.clientY,
                  length: side ? bounds.width : bounds.height,
                  dragged: false,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const g = gesture.current,
                  el = region.current;
                if (!g || !el) return;
                const delta =
                  g.start - (g.axis === "x" ? e.clientX : e.clientY);
                if (Math.abs(delta) > 5) g.dragged = true;
                if (g.dragged)
                  el.style.setProperty(
                    "--drag-size",
                    Math.max(
                      64,
                      Math.min(
                        (g.axis === "x" ? el.clientWidth : el.clientHeight) *
                          0.87,
                        g.length + delta,
                      ),
                    ) + "px",
                  );
              }}
              onPointerCancel={(e) => finishDrag(e, true)}
              onPointerUp={(e) => finishDrag(e)}
              onClick={() => {
                if (skipClick.current) {
                  skipClick.current = false;
                  return;
                }
                snapTo(stops[(stops.indexOf(snap) + 1) % 3]);
              }}
            >
              <span className="grabber" />
              <span className="sheet-label">
                {current ? (
                  <ItemIcon kind={binPin(current).kind} />
                ) : (
                  <List size={18} />
                )}
                {current ? current.name : "수거 거점"}
                {!current && <b>{data ? filtered.length : "…"}</b>}
              </span>
              {snap === "expanded" ? <ChevronDown /> : <ChevronUp />}
            </button>
            {snap !== "peek" && (
              <div className="sheet-scroll" key={current?.id ?? "list"}>
                <div className="sheet-tools">
                  {current ? (
                    <button
                      onClick={() => {
                        select("");
                        setSnap("half");
                      }}
                    >
                      <ArrowLeft size={15} />
                      거점 목록
                    </button>
                  ) : query || filter ? (
                    <button onClick={reset}>검색·필터 초기화</button>
                  ) : null}
                  <button
                    aria-label="시트 닫기"
                    onClick={() => {
                      select("");
                      setSnap("peek");
                    }}
                  >
                    <ChevronDown size={16} />
                    닫기
                  </button>
                </div>
                {current ? (
                  <BinDetail
                    compact
                    current={current}
                    confirmReport={setReport}
                  />
                ) : (
                  <>
                    {(!data || error) && (
                      <LoadState error={error} retry={booth.refresh} />
                    )}
                    {data && !filtered.length && (
                      <p className="empty">
                        일치하는 거점이 없어요. 검색어나 품목을 바꿔 보세요.
                      </p>
                    )}
                    <StationList filtered={filtered} choose={choose} />
                  </>
                )}
              </div>
            )}
          </section>
        )}
        {!draft && <Notice text={booth.notice} />}
      </main>
      <Dialog.Root open={filterOpen} onOpenChange={openFilter}>
        <Dialog.Portal>
          <Dialog.Overlay className="scrim" />
          <Dialog.Content
            className="mobile-dialog"
            aria-describedby={undefined}
          >
            <Dialog.Title>품목 필터</Dialog.Title>
            <Dialog.Close className="close" aria-label="닫기">
              <X size={18} />
            </Dialog.Close>
            <div className="filter-grid">
              {items.map((t) => (
                <button
                  key={t}
                  className={"kind-" + t}
                  aria-pressed={filter === t}
                  onClick={() => updateFilter(t)}
                >
                  <ItemIcon kind={t} />
                  {labels[t]}
                </button>
              ))}
            </div>
            <button
              className="wide"
              onClick={() => {
                reset();
                openFilter(false);
                setSnap("half");
              }}
            >
              검색·필터 초기화
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ReportDialog report={report} confirmReport={setReport} booth={booth} />
      <ConfirmDialog
        open={discard}
        onOpenChange={askDiscard}
        title="건의 작성을 취소할까요?"
        description="취소하면 작성한 위치, 품목과 사유가 지워집니다."
      >
        <button className="wide" onClick={() => askDiscard(false)}>
          계속 작성
        </button>
        <button className="primary wide" onClick={closeDraft}>
          작성 취소
        </button>
      </ConfirmDialog>
    </StudentShell>
  );
}
