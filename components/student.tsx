"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Plus,
  Search,
  MapPin,
  SlidersHorizontal,
  TriangleAlert,
  ChevronDown,
  Check,
  Navigation,
} from "lucide-react";
import CampusMap, { type Pin } from "./campus-map";
import {
  Shell,
  Sync,
  Footer,
  Fill,
  Notice,
  LoadState,
  ItemIcon,
  ItemPicker,
} from "./common";
import { ConfirmDialog } from "./ui/dialog";
import { useBooth } from "@/lib/use-booth";
import {
  items,
  labels,
  zones,
  zoneName,
  zoneAt,
  type Waste,
  type Point,
  type Bin,
} from "@/lib/model";
export const binPin = (b: Bin): Pin => ({
  ...b,
  kind: b.waste_types.length > 1 ? "mixed" : b.waste_types[0],
});
function StudentScreen({ booth }: { booth: ReturnType<typeof useBooth> }) {
  const { data, error, sync, mutate, busy, notice, notify, refresh } = booth;
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
  const pins: Pin[] = filtered.map(binPin);
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
          <Sync text={error ? "연결 확인 필요" : sync} />
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
                      <button
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
                      </button>
                    </form>
                  </>
                ) : current ? (
                  <>
                    <button className="back" onClick={back}>
                      <ArrowLeft size={16} />
                      거점 목록
                    </button>
                    <span
                      className={
                        "station-icon large kind-" + binPin(current).kind
                      }
                    >
                      <ItemIcon kind={binPin(current).kind} size={26} />
                    </span>
                    <h2>{current.name}</h2>
                    <p className="muted">
                      {zoneName(current.zone_id)} /{" "}
                      {current.location_description}
                    </p>
                    <div className="divider" />
                    <h3>품목별 포화도</h3>
                    {current.waste_types.map((t) => (
                      <div className="item-detail" key={t}>
                        <div className="title-row">
                          <strong>
                            <ItemIcon kind={t} />
                            {labels[t]}
                          </strong>
                          <button
                            className="report"
                            onClick={() =>
                              confirmReport({ id: current.id, item: t })
                            }
                          >
                            <TriangleAlert size={14} />
                            가득 참 신고
                          </button>
                        </div>
                        <Fill value={current.fills[t]} />
                      </div>
                    ))}
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
                      <button
                        aria-pressed={!filter}
                        onClick={() => setFilter(null)}
                      >
                        전체
                      </button>
                      {items.map((t) => (
                        <button
                          key={t}
                          aria-pressed={filter === t}
                          onClick={() => setFilter(filter === t ? null : t)}
                        >
                          <i className={"dot kind-" + t} />
                          {labels[t]}
                        </button>
                      ))}
                    </div>
                    <div className="list-heading">
                      <h3>수거 거점</h3>
                      <b>{data ? filtered.length : "—"}</b>
                    </div>
                    {!data || error ? (
                      <LoadState error={error} retry={refresh} />
                    ) : null}
                    {data && filtered.length === 0 && (
                      <p className="empty">
                        검색 결과가 없어요. 다른 건물명이나 품목을 선택해
                        주세요.
                      </p>
                    )}
                    <div className="stations">
                      {filtered.map((b) => (
                        <button
                          className="station"
                          key={b.id}
                          onClick={() => choose(binPin(b))}
                        >
                          <span
                            className={"station-icon kind-" + binPin(b).kind}
                          >
                            <ItemIcon kind={binPin(b).kind} />
                          </span>
                          <span>
                            <strong>{b.name}</strong>
                            <small>
                              {b.waste_types.map((t) => labels[t]).join(" / ")}
                            </small>
                          </span>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {!requesting && !collapsed && (
              <div className="side-action">
                <button
                  className="primary wide"
                  onClick={start}
                  disabled={!data}
                >
                  <Plus size={18} />
                  추가 설치 건의
                </button>
              </div>
            )}
          </section>
          <section className="map-column">
            <CampusMap
              pins={pins}
              selected={selected}
              onSelect={choose}
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
      <Notice text={notice} />
      <ConfirmDialog
        open={!!report}
        onOpenChange={(v) => {
          if (!v) confirmReport(null);
        }}
        title="수거함이 가득 찼나요?"
        description={
          report
            ? labels[report.item] +
              " 수거함이 현장에서 가득 찬 경우에 신고해 주세요. 센서 측정값은 유지됩니다."
            : ""
        }
      >
        <button
          className="primary wide"
          disabled={busy}
          onClick={async () => {
            if (report) {
              await mutate("reports", report, "가득 참 신고를 접수했어요.");
              confirmReport(null);
            }
          }}
        >
          <Check size={16} />
          확인하고 신고
        </button>
      </ConfirmDialog>
    </>
  );
}
export default function Student() {
  const booth = useBooth();
  return <StudentScreen key={booth.data?.epoch ?? "loading"} booth={booth} />;
}
