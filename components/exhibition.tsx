import { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { labels, zoneName, zones, type Snapshot } from "@/lib/model";
import type { Rank } from "@/lib/admin-workflow";
import type { EventDeck } from "@/lib/booth-events";
import { PressButton } from "./ui/press-button";
import CampusMap from "./campus-map";
import { binPin, GroupPicker } from "./student-stations";

export function EventCard({
  deck,
  next,
}: {
  deck: EventDeck;
  next: () => void;
}) {
  const { current, waiting, compressed } = deck;
  return (
    <section className="recent-change" aria-label="최근 변화">
      <span className="event-caption">최근 변화</span>
      <div aria-live="polite" aria-atomic="true">
        {current ? (
          <div className="event-record" key={current.key}>
            <strong>{zoneName(current.zone)}</strong>
            <span>
              {current.types.map((t) => labels[t]).join(" · ")} {current.label}{" "}
              {current.label !== "우선순위 집계 변경" && current.count + "건"}
            </span>
            {current.window && (
              <small>
                이번 갱신 합계 ·{" "}
                <b>
                  {current.window.delta > 0 ? "+" : ""}
                  {current.window.delta}점
                </b>
                {current.window.from !== current.window.to &&
                  " · " +
                    current.window.from +
                    "위 → " +
                    current.window.to +
                    "위"}
              </small>
            )}
          </div>
        ) : (
          <span>새로 확인된 변화가 없습니다.</span>
        )}
      </div>
      {!!waiting.length && (
        <PressButton onClick={next}>
          다음 변화 보기 <ArrowRight size={15} />
          <span>{waiting.length}묶음</span>
        </PressButton>
      )}
      {compressed > 0 && (
        <details className="event-summary">
          <summary>이전 변화 {compressed}묶음</summary>
          {Object.entries(deck.summary).map(([label, n]) => (
            <small key={label}>
              {label} {n}건
            </small>
          ))}
        </details>
      )}
    </section>
  );
}
export function Exhibition({
  s,
  ranks,
  deck,
  next,
}: {
  s: Snapshot;
  ranks: Rank[];
  deck: EventDeck;
  next: () => void;
}) {
  const [selected, select] = useState("");
  const [highlight, mark] = useState("");
  const event = deck.current;
  useEffect(() => {
    if (!event) return;
    const start = requestAnimationFrame(() => mark(event.zone));
    const end = setTimeout(() => mark(""), 1750);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(end);
    };
  }, [event]);
  const bin = s.bins.find((b) => b.id === selected);
  return (
    <section className="exhibition" aria-label="관람객 화면">
      <div className="exhibit-map">
        <h2>
          <MapPin size={20} /> 수거 거점 <small>{s.bins.length}곳</small>
        </h2>
        <CampusMap
          pins={s.bins.map(binPin)}
          pickedZone={zones.find((z) => z.id === highlight)}
          selected={selected}
          onSelect={(p) => select(p.id)}
          onDeselect={() => select("")}
          groupContent={(ids, close) => (
            <GroupPicker
              bins={s.bins.filter((b) => ids.includes(b.id))}
              context={null}
              close={close}
              choose={(p) => select(p.id)}
            />
          )}
        />
        {bin && (
          <p>
            {bin.name} · {bin.waste_types.map((t) => labels[t]).join(" · ")}
          </p>
        )}
      </div>
      <aside>
        <EventCard deck={deck} next={next} />
        <section className="exhibit-ranks">
          <h2>설치 우선순위</h2>
          <ol>
            {ranks.slice(0, 3).map((r, i) => (
              <li key={r.zone.id}>
                <span>{i + 1}위</span>
                <strong>{r.zone.name}</strong>
                <b>
                  {r.score}
                  <small>점</small>
                </b>
              </li>
            ))}
          </ol>
          <p>미처리 건의 × 3 + 미반영 포화 신고</p>
        </section>
      </aside>
    </section>
  );
}
