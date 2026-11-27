"use client";
import { AnimatedNumber, Swap, ContentReveal } from "./motion/patterns";
import {
  useCallback,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ChevronDown,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useInstalledBins } from "./motion/data";
import CampusMap, {
  MapControls,
  type MobileCamera,
  type Pin,
} from "./campus-map";
import { ItemIcon, LoadState, Notice } from "./common";

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

import { StationSheet, type Snap } from "./station-sheet";
const frequent: Waste[] = ["general", "plastic", "paper"];
export function MobileMap({
  booth,
  active,
}: {
  booth: Booth;
  active: boolean;
}) {
  const { data, error, busy, mutate, notify } = booth;
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
  const layer = useRef<HTMLDivElement>(null);
  const camera = useRef<MobileCamera>(null);
  const input = useRef<HTMLInputElement>(null);
  const changeDraft = (next: Draft | null) => {
    if (next && booth.notice) notify("");
    saveDraft(data?.epoch, next);
    setDraft(next);
  };
  const fresh = useInstalledBins(data?.bins, data?.epoch);
  const bins = data?.bins ?? [];
  const filtered = bins.filter(
    (b) =>
      (!filter || b.waste_types.includes(filter)) &&
      (b.name + zoneName(b.zone_id) + b.location_description)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const current = bins.find((b) => b.id === selected);
  const contentId = current?.id ?? "list";
  const [previous, remember] = useState(contentId);
  const [direction, setDirection] = useState(0);
  if (previous !== contentId) {
    remember(contentId);
    setDirection(contentId === "list" ? -1 : previous === "list" ? 1 : 0);
  }
  const listScroll = useRef(0);
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
  const pins: Pin[] = (draft ? bins : filtered).map((b) => ({
    ...binPin(b),
    fresh: fresh.has(b.id),
  }));
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
  const settleSheet = useCallback((next: Snap) => {
    setSnap(next);
    if (next === "peek") select("");
  }, []);
  const closeDetail = useCallback(() => settleSheet("peek"), [settleSheet]);
  const revealRequest = useRef(0);
  function cancelReveal() {
    revealRequest.current++;
  }
  useEffect(() => () => cancelReveal(), []);
  function reveal(point: Point) {
    const request = ++revealRequest.current;
    // Only an explicit list/building selection schedules this operation. Measure its
    // destination after layout settles, and yield to any intervening map gesture.
    requestAnimationFrame(async () => {
      const overlay = layer.current;
      if (!overlay || revealRequest.current !== request) return;
      await Promise.allSettled(
        overlay.getAnimations().map((animation) => animation.finished),
      );
      if (revealRequest.current !== request || !overlay.isConnected) return;
      const space = overlay
        .querySelector(".map-tool-space")
        ?.getBoundingClientRect();
      if (!space) return;
      const tools = overlay.querySelector<HTMLElement>(".map-actions");
      const bottom =
        tools && getComputedStyle(tools).visibility === "visible"
          ? tools.getBoundingClientRect().top
          : space.bottom;
      if (bottom > space.top)
        camera.current?.reveal(
          point,
          new DOMRect(space.x, space.y, space.width, bottom - space.y),
        );
    });
  }
  useLayoutEffect(() => {
    layer.current
      ?.querySelector(".sheet-scroll")
      ?.scrollTo(0, contentId === "list" ? listScroll.current : 0);
  }, [contentId]);
  return (
    <>
      <main
        className="mobile-workbench"
        onPointerDownCapture={cancelReveal}
        onWheelCapture={cancelReveal}
        onKeyDownCapture={cancelReveal}
        onScrollCapture={(e) => {
          if (
            !current &&
            e.target instanceof Element &&
            e.target.matches(".sheet-scroll")
          )
            listScroll.current = e.target.scrollTop;
        }}
        data-snap={snap}
        data-step={step}
        data-feedback={draft && booth.notice ? true : undefined}
      >
        <h1 className="visually-hidden">분리수거 지도</h1>
        <div className="mobile-map-stage" inert={!!step && step > 1}>
          <CampusMap
            pins={pins}
            selected={draft?.point ? "candidate" : current?.id}
            onSelect={choose}
            onDeselect={draft ? undefined : closeDetail}
            onPick={pick}
            picking={step === 1}
            mobile
            cameraRef={camera}
          />
        </div>
        <div className="map-overlays" ref={layer}>
          <div className="map-space">
            {!draft && !current && (
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
                  {
                    <button
                      className="clear-search"
                      data-visible={!!query}
                      inert={!query}
                      aria-hidden={!query}
                      aria-label="검색어 지우기"
                      onClick={() => {
                        search("");
                        input.current?.focus();
                      }}
                    >
                      <X size={17} />
                    </button>
                  }
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
                    <span className="chip-pill">전체</span>
                  </button>
                  {visibleChips.map((t) => (
                    <button
                      key={t}
                      aria-pressed={filter === t}
                      onClick={() => updateFilter(filter === t ? null : t)}
                    >
                      <span className="chip-pill">
                        <i className={"dot kind-" + t} />
                        {labels[t]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!draft && <Notice kind={booth.noticeKind} text={booth.notice} />}
            <div className="map-tool-space">
              <div className="map-actions">
                {!draft && (
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
                {(step === undefined || step === 1) && (
                  <MapControls
                    changeZoom={(v) => camera.current?.zoom(v)}
                    reset={() => camera.current?.reset()}
                  />
                )}
              </div>
            </div>
          </div>
          {draft ? (
            <section
              className="mobile-sheet wizard-sheet"
              aria-label="건의 작성"
            >
              <RequestWizard
                notice={booth.notice}
                draft={draft}
                change={changeDraft}
                revealBuilding={reveal}
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
            <StationSheet
              snap={snap}
              onSnap={settleSheet}
              label={current ? "거점 상세" : "수거 거점 목록"}
              title={
                <>
                  {current ? (
                    <ItemIcon kind={binPin(current).kind} />
                  ) : (
                    <List size={18} />
                  )}
                  {current ? current.name : "수거 거점"}
                  {!current && (
                    <b>
                      {data ? <AnimatedNumber value={filtered.length} /> : "…"}
                    </b>
                  )}
                </>
              }
            >
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
                <button aria-label="시트 닫기" onClick={closeDetail}>
                  <ChevronDown size={16} />
                  닫기
                </button>
              </div>
              <Swap identity={contentId} direction={direction}>
                {current ? (
                  <BinDetail
                    compact
                    current={current}
                    confirmReport={setReport}
                  />
                ) : (
                  <>
                    <ContentReveal kind="stations" ready={!!data} error={error}>
                      {error && (
                        <LoadState error={error} retry={booth.refresh} />
                      )}
                      {data && !filtered.length && (
                        <p className="empty empty-reveal">
                          <Search size={18} aria-hidden />
                          일치하는 거점이 없어요. 검색어나 품목을 바꿔 보세요.
                        </p>
                      )}
                      <StationList
                        filtered={filtered}
                        choose={(pin) => {
                          choose(pin);
                          reveal(pin);
                        }}
                      />
                    </ContentReveal>
                  </>
                )}
              </Swap>
            </StationSheet>
          )}
        </div>
      </main>
      <Dialog.Root open={active && filterOpen} onOpenChange={openFilter}>
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
      <ReportDialog
        report={active ? report : null}
        confirmReport={setReport}
        booth={booth}
      />
      <ConfirmDialog
        open={active && discard}
        onOpenChange={askDiscard}
        title="건의 작성을 취소할까요?"
        description="취소하면 작성한 위치, 품목과 사유가 지워집니다."
      >
        <button onClick={() => askDiscard(false)}>계속 작성</button>
        <button className="primary" onClick={closeDraft}>
          작성 취소
        </button>
      </ConfirmDialog>
    </>
  );
}
