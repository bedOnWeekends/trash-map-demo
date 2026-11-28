"use client";
import { PressButton } from "./ui/press-button";
import { useCallback, useState, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  MapPin,
  ChevronDown,
  Navigation,
} from "lucide-react";
import { useInstalledBins } from "./motion/data";
import CampusMap, { type Pin, type MobileCamera } from "./campus-map";
import {
  Shell,
  Footer,
  Notice,
  LoadState,
  ItemPicker,
  ItemIcon,
} from "./common";
import {
  GroupPicker,
  CoffeeChoice,
  BinDetail,
  EmptySearch,
  StationList,
  ReportDialog,
  binPin,
} from "./student-stations";
import { ConfirmDialog } from "./ui/dialog";
import { useStationSearch } from "./use-station-search";
import { MapIntentReceiver } from "./map-intent";
import {
  emptyDraft,
  savedDraft,
  saveDraft,
  ReasonPresets,
  type Draft,
} from "./request-wizard";
import { useMobileStudent } from "./student-shell";

import { AnimatedNumber, ContentReveal } from "./motion/patterns";
import { useStudentBooth } from "./student-layout";
import { type Booth, useEpochKey } from "@/lib/use-booth";
import {
  items,
  labels,
  zones,
  searchBins,
  zoneAt,
  zoneName,
  type Waste,
  type Bin,
  type Point,
} from "@/lib/model";
function StudentScreen({ booth }: { booth: Booth }) {
  const { data, error, mutate, busy, notice, notify, refresh } = booth;
  const [query, search] = useState(""),
    [filter, setFilter] = useState<Waste | null>(null),
    [selected, select] = useState(""),
    [report, confirmReport] = useState<{ id: string; item: Waste } | null>(
      null,
    ),
    [collapsed, collapse] = useState(false);
  const camera = useRef<MobileCamera>(null);
  const column = useRef<HTMLElement>(null);
  const [draft, setDraft] = useState<Draft | null>(() =>
    savedDraft(data?.epoch),
  );
  const [epoch, setEpoch] = useState(data?.epoch);
  if (data && data.epoch !== epoch) {
    setEpoch(data.epoch);
    setDraft(savedDraft(data.epoch));
  }
  const [paused, pause] = useState(false);
  const requesting = !!draft && !paused,
    { point, types, reason } = draft ?? emptyDraft;
  function edit(next: Draft | null) {
    saveDraft(data?.epoch, next);
    setDraft(next);
  }
  function setPoint(point: Point | null) {
    if (draft) edit({ ...draft, point });
  }
  const fresh = useInstalledBins(data?.bins, data?.epoch);
  const bins = data?.bins ?? [];
  const [pickedWaste, prefer] = useState<Waste | null>(null),
    [discard, askDiscard] = useState(false);
  const {
    filtered,
    context,
    intent: searchInfo,
  } = useStationSearch(bins, query, filter, pickedWaste);
  const coffee = searchInfo.coffee && !filter && !pickedWaste;
  const current = bins.find((b) => b.id === selected),
    zone = requesting && point ? zoneAt(point) : null;
  const clearSelection = useCallback(() => {
    select("");
    prefer(null);
  }, []);
  const choose = (p: Pin) => {
    if (requesting) {
      pick(p);
      return;
    }
    select(p.id);
    collapse(false);
  };
  const pick = (p: Point) => {
    if (!requesting) return;
    if (!zoneAt(p)) {
      notify("캠퍼스 관리 구역 안을 선택해 주세요.");
      return;
    }
    notify("");
    setPoint(p);
  };
  const pins: Pin[] = filtered.map((b) => ({
    ...binPin(b),
    fresh: fresh.has(b.id),
  }));
  if (requesting && point)
    pins.push({
      ...point,
      id: "candidate",
      kind: "candidate",
      name: "건의 위치",
    });
  const back = () => {
    select("");
    prefer(null);
    if (requesting) pause(true);
  };
  function reveal(p: Point) {
    const rect = column.current
      ?.querySelector(".map-surface")
      ?.getBoundingClientRect();
    if (rect) camera.current?.reveal(p, rect);
  }
  function alternative(bin: Bin, item: Waste) {
    if (filter && filter !== item) setFilter(null);
    if (!searchBins([bin], query, null).length) search("");
    prefer(item);
    select(bin.id);
    reveal(bin);
  }
  const start = () => {
    pause(false);
    select("");
    edit(
      draft ??
        savedDraft(data?.epoch) ?? {
          ...emptyDraft,
          types: context ? [context] : [],
        },
    );
    collapse(false);
  };
  return (
    <>
      <MapIntentReceiver
        booth={booth}
        apply={(intent, bin) => {
          if (intent.type === "request") {
            start();
            return;
          }
          if (intent.type === "invalid" || (intent.type === "bin" && !bin)) {
            notify("요청한 거점을 확인할 수 없어요. 지도에서 다시 찾아주세요.");
            return;
          }
          pause(true);
          prefer(null);
          collapse(false);
          if (intent.type === "filter") {
            search("");
            setFilter(intent.waste);
            select("");
            return;
          }
          if (bin) {
            if (!searchBins([bin], query, filter).length) {
              search("");
              setFilter(null);
            }
            select(bin.id);
            reveal(bin);
          }
        }}
      />
      <Shell />
      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="location">
              <MapPin size={15} />
              인하대학교 용현캠퍼스
            </div>
            <h1>분리수거 지도</h1>
          </div>
        </div>
        <div className="map-workbench">
          <section
            className={"side-panel" + (collapsed ? " collapsed" : "")}
            aria-label="수거함 탐색"
          >
            <button
              className="sheet-toggle"
              aria-expanded={!collapsed}
              onClick={() => collapse((v) => !v)}
            >
              <span />
              {collapsed ? "목록 펼치기" : "목록 접기"}
              <ChevronDown size={14} />
            </button>
            {!collapsed && (
              <div
                className="side-content"
                key={requesting ? "request" : (current?.id ?? "list")}
              >
                {requesting ? (
                  <>
                    <button className="back" onClick={back}>
                      <ArrowLeft size={16} />
                      거점 목록
                    </button>
                    <h2>추가 설치 건의</h2>
                    <p className="muted">
                      지도를 눌러 필요한 위치를 지정해 주세요.
                    </p>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!point || !zone) return;
                        if (
                          await mutate(
                            "requests",
                            { ...point, types, reason },
                            "설치 건의를 접수했어요. 내 건의에서 확인할 수 있어요.",
                          )
                        ) {
                          edit(null);
                          select("");
                        }
                      }}
                    >
                      <label>
                        가상 위치 선택
                        <select
                          value={zone?.id ?? ""}
                          onChange={(e) => {
                            const z = zones.find(
                              (z) => z.id === e.target.value,
                            );
                            if (z) {
                              pick(z);
                              reveal(z);
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
                      <p className="position">
                        <MapPin size={15} />
                        {zone && point
                          ? zone.name +
                            " / " +
                            point.lat.toFixed(6) +
                            ", " +
                            point.lng.toFixed(6)
                          : "위치를 선택해 주세요"}
                      </p>
                      <ItemPicker
                        value={types}
                        onChange={(types) =>
                          edit({
                            ...draft!,
                            types,
                            step: point ? (types.length && reason ? 3 : 2) : 1,
                          })
                        }
                      />
                      <label>
                        건의 사유
                        <textarea
                          value={reason}
                          maxLength={400}
                          required
                          onChange={(e) =>
                            edit({
                              ...draft!,
                              reason: e.target.value,
                              step: point && types.length ? 3 : 1,
                            })
                          }
                          placeholder="이 위치에 수거함이 필요한 이유"
                          rows={3}
                        />
                      </label>
                      <ReasonPresets
                        reason={reason}
                        change={(reason) =>
                          edit({
                            ...draft!,
                            reason,
                            step: point && types.length ? 3 : 1,
                          })
                        }
                      />
                      <PressButton
                        className="primary wide"
                        disabled={
                          !point ||
                          !zone ||
                          !types.length ||
                          !reason.trim() ||
                          busy ||
                          !data
                        }
                      >
                        건의 제출
                        <ArrowRight size={16} />
                      </PressButton>
                    </form>
                    <button
                      className="back"
                      onClick={() => {
                        if (point || reason || types.length) askDiscard(true);
                        else edit(null);
                      }}
                    >
                      작성 취소
                    </button>
                  </>
                ) : current ? (
                  <>
                    <button className="back" onClick={back}>
                      <ArrowLeft size={16} />
                      거점 목록
                    </button>
                    <BinDetail
                      cooldowns={data?.report_cooldowns}
                      bins={bins}
                      onAlternative={alternative}
                      preferred={context}
                      current={current}
                      confirmReport={confirmReport}
                    />
                  </>
                ) : (
                  <>
                    <label className="search">
                      <Search size={18} />
                      <input
                        aria-label="건물 및 수거함 검색"
                        placeholder="건물명 또는 수거함 검색"
                        value={query}
                        onChange={(e) => {
                          prefer(null);
                          search(e.target.value);
                        }}
                      />
                    </label>
                    <div className="chips filter" aria-label="품목 필터">
                      <PressButton
                        aria-pressed={!filter}
                        onClick={() => {
                          prefer(null);
                          setFilter(null);
                        }}
                      >
                        전체
                      </PressButton>
                      {items.map((t) => (
                        <PressButton
                          key={t}
                          aria-pressed={filter === t}
                          onClick={() => {
                            prefer(null);
                            setFilter(filter === t ? null : t);
                          }}
                        >
                          <span className={"type-glyph kind-" + t}>
                            <ItemIcon kind={t} size={15} />
                          </span>
                          {labels[t]}
                        </PressButton>
                      ))}
                    </div>
                    <div className="list-heading">
                      <h2>
                        {context && (
                          <span className={"type-glyph kind-" + context}>
                            <ItemIcon kind={context} size={17} />
                          </span>
                        )}{" "}
                        {context ? labels[context] + " 수거 거점" : "수거 거점"}
                      </h2>
                      <b>
                        {data ? (
                          <AnimatedNumber value={filtered.length} />
                        ) : (
                          "—"
                        )}
                      </b>
                    </div>
                    <ContentReveal ready={!!data} error={error} kind="stations">
                      {error ? (
                        <LoadState error={error} retry={refresh} />
                      ) : null}
                      {coffee && (
                        <CoffeeChoice
                          drink={() => {
                            search(searchInfo.drinkQuery);
                            prefer(null);
                          }}
                        />
                      )}
                      {data && !coffee && filtered.length === 0 && (
                        <EmptySearch
                          query={query}
                          filter={filter}
                          clearFilter={() => setFilter(null)}
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
                        choose={(p) => {
                          choose(p);
                          reveal(p);
                        }}
                      />
                    </ContentReveal>
                  </>
                )}
              </div>
            )}
            {!requesting && !collapsed && (
              <div className="side-action">
                <PressButton
                  className="primary wide"
                  onClick={start}
                  disabled={!data}
                >
                  <Plus size={18} />
                  {draft || savedDraft(data?.epoch)
                    ? "작성 이어가기"
                    : "추가 설치 건의"}
                </PressButton>
              </div>
            )}
          </section>
          <section ref={column} className="map-column">
            <CampusMap
              pins={pins}
              selected={current?.id}
              onSelect={choose}
              onDeselect={requesting ? undefined : clearSelection}
              onPick={pick}
              groupContent={(ids, close) => (
                <GroupPicker
                  picking={requesting}
                  bins={filtered.filter((b) => ids.includes(b.id))}
                  context={context}
                  choose={choose}
                  close={close}
                />
              )}
              cameraRef={camera}
              showZones="student"
              pickedZone={zone ?? undefined}
              picking={requesting}
            />
            <div className="map-legend">
              <span>
                <Navigation size={15} />
                {requesting
                  ? "건의할 위치를 선택하세요"
                  : "거점을 눌러 품목과 포화도를 확인하세요"}
              </span>
              <span>
                <i className="dot kind-mixed" />
                종합 분리수거함
              </span>
            </div>
          </section>
        </div>
        <Footer />
      </main>
      <Notice
        kind={booth.noticeKind}
        text={notice}
        receipt={booth.receipt}
        receiptId={booth.receiptId}
        requestAction={booth.requestAction ? () => notify("") : undefined}
      />
      <ConfirmDialog
        open={discard}
        onOpenChange={askDiscard}
        title="건의 작성을 취소할까요?"
        description="취소하면 작성한 위치, 품목과 사유가 지워집니다."
      >
        <PressButton onClick={() => askDiscard(false)}>계속 작성</PressButton>
        <PressButton
          className="primary"
          onClick={() => {
            edit(null);
            askDiscard(false);
          }}
        >
          작성 취소
        </PressButton>
      </ConfirmDialog>
      <ReportDialog
        booth={booth}
        report={report}
        confirmReport={confirmReport}
      />
    </>
  );
}
function DesktopMap() {
  const booth = useStudentBooth();
  return <StudentScreen key={useEpochKey(booth.data?.epoch)} booth={booth} />;
}
export default function Student() {
  return useMobileStudent() ? null : <DesktopMap />;
}
