"use client";
import { PressButton } from "./ui/press-button";
import { AnimatedNumber, Swap, ContentReveal } from "./motion/patterns";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
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
  GroupPicker,
  CoffeeChoice,
  BinDetail,
  EmptySearch,
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
  searchBins,
  type Bin,
  type Point,
  type Waste,
} from "@/lib/model";
import type { Booth } from "@/lib/use-booth";

import { useStationSearch } from "./use-station-search";
import { MapIntentReceiver } from "./map-intent";
import { StationSheet, type Snap } from "./station-sheet";
const frequent: Waste[] = ["liquid", "plastic", "general"];
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
  const [pickedWaste, prefer] = useState<Waste | null>(null);
  const {
    filtered,
    context,
    intent: searchInfo,
  } = useStationSearch(bins, query, filter, pickedWaste);
  const coffee = searchInfo.coffee && !filter && !pickedWaste;
  const current = bins.find((b) => b.id === selected);
  const contentId = current?.id ?? "list";
  const [previous, remember] = useState(contentId);
  const [direction, setDirection] = useState(0);
  if (previous !== contentId) {
    remember(contentId);
    setDirection(contentId === "list" ? -1 : previous === "list" ? 1 : 0);
  }
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const listScroll = useRef(0);
  const visibleChips =
    filter && !frequent.includes(filter)
      ? [frequent[0], frequent[1], filter]
      : frequent;
  const reset = () => {
    prefer(null);
    search("");
    setFilter(null);
    select("");
  };
  const updateFilter = (next: Waste | null) => {
    if (!filterOpen && layer.current) delete layer.current.dataset.filterExit;
    prefer(null);
    setFilter(next);
    select("");
    openFilter(false);
    setSnap((value) => (value === "peek" ? "half" : value));
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
    if (next === "peek") {
      select("");
      prefer(null);
    }
  }, []);
  const closeDetail = useCallback(() => settleSheet("peek"), [settleSheet]);
  const revealRequest = useRef(0);
  const [destination, setDestination] = useState<{
    point: Point;
    request: number;
  } | null>(null);
  function cancelReveal() {
    revealRequest.current++;
  }
  function reveal(point: Point) {
    setDestination({ point, request: ++revealRequest.current });
  }
  useLayoutEffect(() => {
    if (!destination || !active) return;
    const { point, request } = destination;
    const overlay = layer.current;
    if (!overlay) return;
    let cancelled = false;
    // The new detail and its ResizeObserver can commit on different frames.
    // Sample the usable rectangle after both layout and the sheet transition settle.
    async function afterLayout(el: HTMLElement) {
      let previous: DOMRect | undefined;
      while (!cancelled && request === revealRequest.current) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        await Promise.allSettled(el.getAnimations().map((a) => a.finished));
        if (cancelled || request !== revealRequest.current || !el.isConnected)
          return;
        const space = el
          .querySelector(".map-tool-space")
          ?.getBoundingClientRect();
        if (!space) return;
        const tools = el.querySelector<HTMLElement>(".map-actions");
        const bottom =
          tools && getComputedStyle(tools).visibility === "visible"
            ? tools.getBoundingClientRect().top
            : space.bottom;
        const visible = new DOMRect(
          space.x,
          space.y,
          space.width,
          bottom - space.y,
        );
        if (
          previous &&
          previous.x === visible.x &&
          previous.y === visible.y &&
          previous.width === visible.width &&
          previous.height === visible.height
        ) {
          if (visible.height > 0) camera.current?.reveal(point, visible);
          revealRequest.current++;
          return;
        }
        previous = visible;
      }
    }
    void afterLayout(overlay);
    return () => {
      cancelled = true;
    };
  }, [destination, active]);
  useLayoutEffect(() => {
    layer.current
      ?.querySelector(".sheet-scroll")
      ?.scrollTo(0, contentId === "list" ? listScroll.current : 0);
  }, [contentId]);
  function alternative(bin: Bin, item: Waste) {
    if (filter && filter !== item) setFilter(null);
    if (!searchBins([bin], query, null).length) search("");
    prefer(item);
    select(bin.id);
    reveal(bin);
  }
  const startRequest = () => {
    select("");
    input.current?.blur();
    changeDraft(
      draft ??
        savedDraft(data?.epoch) ?? {
          ...emptyDraft,
          types: context ? [context] : [],
        },
    );
  };
  return (
    <>
      <MapIntentReceiver
        booth={booth}
        active={active}
        apply={(intent, bin) => {
          if (intent.type === "request") {
            startRequest();
            return;
          }
          if (intent.type === "invalid" || (intent.type === "bin" && !bin)) {
            notify("요청한 거점을 확인할 수 없어요. 지도에서 다시 찾아주세요.");
            return;
          }
          // Explicit exploration pauses the editor; its epoch-scoped draft stays saved.
          setDraft(null);
          openFilter(false);
          askDiscard(false);
          setReport(null);
          if (intent.type === "filter") {
            search("");
            updateFilter(intent.waste);
            return;
          }
          if (bin) {
            if (!searchBins([bin], query, filter).length) {
              search("");
              setFilter(null);
            }
            prefer(null);
            select(bin.id);
            setSnap("half");
            reveal(bin);
          }
        }}
      />
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
            showZones="student"
            pickedZone={
              draft?.step === 1 && draft.point ? zoneAt(draft.point) : undefined
            }
            picking={step === 1}
            active={active}
            groupContent={(ids, close) => (
              <GroupPicker
                picking={!!draft}
                bins={(draft ? bins : filtered).filter((b) =>
                  ids.includes(b.id),
                )}
                context={context}
                choose={choose}
                close={close}
              />
            )}
            mobile
            cameraRef={camera}
          />
        </div>
        <div
          className="map-overlays"
          ref={layer}
          onAnimationEnd={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.matches(".sheet-label")
            )
              delete layer.current?.dataset.filterExit;
          }}
        >
          <div className="map-space">
            {!draft && !current && (
              <div className="floating-search">
                <div className="map-search-field">
                  <Search size={20} />
                  <input
                    ref={input}
                    type="search"
                    aria-label="건물 및 수거함 검색"
                    placeholder="건물·수거함 검색"
                    value={query}
                    onChange={(e) => {
                      prefer(null);
                      search(e.target.value);
                      select("");
                      setSnap((value) => (value === "peek" ? "half" : value));
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
                  <PressButton
                    ref={filterTrigger}
                    aria-controls={
                      filterOpen ? "student-filter-options" : undefined
                    }
                    aria-expanded={filterOpen}
                    className="filter-trigger"
                    aria-label="전체 품목 필터"
                    aria-haspopup="dialog"
                    onClick={() => openFilter(true)}
                  >
                    <SlidersHorizontal size={19} />
                    <span className="filter-short-label">
                      {filter ? labels[filter] : "품목"}
                    </span>
                  </PressButton>
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
                        <span className={"type-glyph kind-" + t}>
                          <ItemIcon kind={t} size={15} />
                        </span>
                        {labels[t]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!draft && (
              <Notice
                kind={booth.noticeKind}
                text={booth.notice}
                receipt={booth.receipt}
                requestAction={
                  booth.requestAction ? () => notify("") : undefined
                }
              />
            )}
            <div className="map-tool-space">
              <div className="map-actions">
                {!draft && (
                  <PressButton
                    className="proposal-fab primary"
                    disabled={!data}
                    aria-label={
                      savedDraft(data?.epoch)
                        ? "작성 이어가기"
                        : "추가 설치 건의"
                    }
                    onClick={startRequest}
                  >
                    <Plus size={18} />
                    <span className="fab-short" aria-hidden>
                      {savedDraft(data?.epoch) ? "이어가기" : "건의"}
                    </span>
                    <span className="fab-label">
                      {savedDraft(data?.epoch)
                        ? "작성 이어가기"
                        : "추가 설치 건의"}
                    </span>
                  </PressButton>
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
              back={
                current && (
                  <button
                    className="sheet-edge"
                    aria-label="거점 목록"
                    onClick={() => {
                      select("");
                      prefer(null);
                      setSnap("half");
                    }}
                  >
                    <ArrowLeft size={18} />
                  </button>
                )
              }
              close={
                current && (
                  <button
                    className="sheet-edge"
                    aria-label="시트 닫기"
                    onClick={closeDetail}
                  >
                    <ChevronDown size={18} />
                  </button>
                )
              }
              onSnap={settleSheet}
              label={current ? "거점 상세" : "수거 거점 목록"}
              title={
                <>
                  {current ? (
                    <ItemIcon kind={binPin(current).kind} />
                  ) : context ? (
                    <span className={"type-glyph kind-" + context}>
                      <ItemIcon kind={context} size={18} />
                    </span>
                  ) : (
                    <List size={18} />
                  )}
                  {current
                    ? current.name
                    : context
                      ? labels[context] + " 수거 거점"
                      : "수거 거점"}
                  {!current && (
                    <b>
                      {data ? (
                        <>
                          <AnimatedNumber value={filtered.length} />곳
                        </>
                      ) : (
                        "…"
                      )}
                    </b>
                  )}
                </>
              }
            >
              {!current && (
                <div className="sheet-tools">
                  {(query || filter) && (
                    <button onClick={reset}>검색·필터 초기화</button>
                  )}
                  <button aria-label="시트 닫기" onClick={closeDetail}>
                    <ChevronDown size={16} />
                    닫기
                  </button>
                </div>
              )}
              <Swap identity={contentId} direction={direction}>
                {current ? (
                  <BinDetail
                    cooldowns={data?.report_cooldowns}
                    compact
                    bins={bins}
                    onAlternative={alternative}
                    preferred={context}
                    current={current}
                    confirmReport={setReport}
                  />
                ) : (
                  <>
                    <ContentReveal kind="stations" ready={!!data} error={error}>
                      {error && (
                        <LoadState error={error} retry={booth.refresh} />
                      )}
                      {coffee && (
                        <CoffeeChoice
                          drink={() => {
                            search(searchInfo.drinkQuery);
                            prefer(null);
                          }}
                        />
                      )}
                      {data && !coffee && !filtered.length && (
                        <EmptySearch
                          query={query}
                          filter={filter}
                          clearFilter={() => updateFilter(null)}
                          clearQuery={() => search("")}
                        />
                      )}
                      {searchInfo.aliases
                        .filter((a) =>
                          filtered.some(
                            (b) => zoneName(b.zone_id) === a.building,
                          ),
                        )
                        .map((a) => (
                          <small key={a.word} className="alias-match">
                            “{a.word}” · {a.building}
                          </small>
                        ))}
                      <StationList
                        filter={context}
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
            inert={!active || !filterOpen}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (active) filterTrigger.current?.focus({ preventScroll: true });
            }}
            id="student-filter-options"
            className="mobile-dialog filter-dialog"
            aria-describedby={undefined}
          >
            <Dialog.Title>품목 필터</Dialog.Title>
            <Dialog.Close className="close" aria-label="닫기">
              <X size={18} />
            </Dialog.Close>
            <div className="filter-grid">
              {items.map((t) => (
                <PressButton
                  key={t}
                  className={"kind-" + t}
                  aria-pressed={filter === t}
                  onClick={() => {
                    if (layer.current) layer.current.dataset.filterExit = "";
                    updateFilter(t);
                  }}
                >
                  <ItemIcon kind={t} />
                  {labels[t]}
                </PressButton>
              ))}
            </div>
            <button
              className="wide"
              onClick={() => {
                reset();
                openFilter(false);
                setSnap((value) => (value === "peek" ? "half" : value));
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
        <PressButton onClick={() => askDiscard(false)}>계속 작성</PressButton>
        <PressButton className="primary" onClick={closeDraft}>
          작성 취소
        </PressButton>
      </ConfirmDialog>
    </>
  );
}
