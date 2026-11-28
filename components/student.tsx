"use client";
import { PressButton } from "./ui/press-button";
import { useCallback, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  MapPin,
  SlidersHorizontal,
  ChevronDown,
  Navigation,
} from "lucide-react";
import { useInstalledBins } from "./motion/data";
import CampusMap, { type Pin } from "./campus-map";
import { Shell, Footer, Notice, LoadState, ItemPicker } from "./common";
import {
  BinDetail,
  StationList,
  ReportDialog,
  binPin,
} from "./student-stations";
import { useMobileStudent } from "./student-shell";

import { AnimatedNumber, ContentReveal } from "./motion/patterns";
import { useStudentBooth } from "./student-layout";
import { type Booth, useEpochKey } from "@/lib/use-booth";
import {
  items,
  labels,
  zones,
  zoneName,
  zoneAt,
  type Waste,
  type Point,
} from "@/lib/model";
function StudentScreen({ booth }: { booth: Booth }) {
  const { data, error, mutate, busy, notice, notify, refresh } = booth;
  const [query, search] = useState(""),
    [filter, setFilter] = useState<Waste | null>(null),
    [selected, select] = useState(""),
    [requesting, request] = useState(false),
    [point, setPoint] = useState<Point | null>(null),
    [types, setTypes] = useState<Waste[]>([]),
    [reason, setReason] = useState(""),
    [report, confirmReport] = useState<{ id: string; item: Waste } | null>(
      null,
    ),
    [collapsed, collapse] = useState(false);
  const fresh = useInstalledBins(data?.bins, data?.epoch);
  const bins = data?.bins ?? [],
    filtered = bins.filter(
      (b) =>
        (!filter || b.waste_types.includes(filter)) &&
        (b.name + zoneName(b.zone_id) + b.location_description)
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    );
  const current = bins.find((b) => b.id === selected),
    zone = point ? zoneAt(point) : null;
  const clearSelection = useCallback(() => select(""), []);
  const choose = (p: Pin) => {
    if (requesting) return;
    select(p.id);
    collapse(false);
  };
  const pick = (p: Point) => {
    if (!requesting) return;
    if (!zoneAt(p)) {
      notify("캠퍼스 관리 구역 안을 선택해 주세요.");
      return;
    }
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
    request(false);
    setPoint(null);
    setReason("");
    setTypes([]);
  };
  const start = () => {
    back();
    request(true);
    collapse(false);
  };
  return (
    <>
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
                        )
                          back();
                      }}
                    >
                      <label>
                        가상 위치 선택
                        <select
                          value=""
                          onChange={(e) => {
                            const z = zones.find(
                              (z) => z.id === e.target.value,
                            );
                            if (z) setPoint({ lat: z.lat, lng: z.lng });
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
                      <ItemPicker value={types} onChange={setTypes} />
                      <label>
                        건의 사유
                        <textarea
                          value={reason}
                          maxLength={400}
                          required
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="이 위치에 수거함이 필요한 이유"
                          rows={3}
                        />
                      </label>
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
                  </>
                ) : current ? (
                  <>
                    <button className="back" onClick={back}>
                      <ArrowLeft size={16} />
                      거점 목록
                    </button>
                    <BinDetail
                      current={current}
                      confirmReport={confirmReport}
                    />
                  </>
                ) : (
                  <>
                    <div className="title-row">
                      <h2>거점 찾기</h2>
                      <SlidersHorizontal size={19} />
                    </div>
                    <label className="search">
                      <Search size={18} />
                      <input
                        aria-label="건물 및 수거함 검색"
                        placeholder="건물명 또는 수거함 검색"
                        value={query}
                        onChange={(e) => search(e.target.value)}
                      />
                    </label>
                    <div className="chips filter" aria-label="품목 필터">
                      <PressButton
                        aria-pressed={!filter}
                        onClick={() => setFilter(null)}
                      >
                        전체
                      </PressButton>
                      {items.map((t) => (
                        <PressButton
                          key={t}
                          aria-pressed={filter === t}
                          onClick={() => setFilter(filter === t ? null : t)}
                        >
                          <i className={"dot kind-" + t} />
                          {labels[t]}
                        </PressButton>
                      ))}
                    </div>
                    <div className="list-heading">
                      <h3>수거 거점</h3>
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
                      {data && filtered.length === 0 && (
                        <p className="empty">
                          검색 결과가 없어요. 다른 건물명이나 품목을 선택해
                          주세요.
                        </p>
                      )}
                      <StationList filtered={filtered} choose={choose} />
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
                  추가 설치 건의
                </PressButton>
              </div>
            )}
          </section>
          <section className="map-column">
            <CampusMap
              pins={pins}
              selected={current?.id}
              onSelect={choose}
              onDeselect={requesting ? undefined : clearSelection}
              onPick={pick}
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
      <Notice kind={booth.noticeKind} text={notice} />
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
