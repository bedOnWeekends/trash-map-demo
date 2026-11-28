import { useState } from "react";
import { motion } from "motion/react";
import { tween, duration } from "@/lib/motion";
import { AnimatedNumber, useMotionPreference } from "./motion/patterns";
import { sevenDays, type Rank } from "@/lib/admin-workflow";
import { items, labels, fillState, type Snapshot } from "@/lib/model";
import { Fill } from "./common";

export function Metrics({ s, ranks }: { s: Snapshot; ranks: Rank[] }) {
  const values = s.bins.flatMap((b) => b.waste_types.map((t) => b.fills[t]));
  const full = values.filter((v) => fillState(v) === "가득 참").length;
  const high = values.filter((v) => fillState(v) === "혼잡").length;
  return (
    <div className="kpis booth-metrics">
      <div>
        미처리 건의
        <strong>
          <AnimatedNumber
            value={ranks.reduce((n, r) => n + r.requests.length, 0)}
          />
          <small>건</small>
        </strong>
      </div>
      <div>
        혼잡·포화 품목
        <strong>
          <AnimatedNumber value={full + high} />
          <small>개</small>
        </strong>
        <span>
          가득 참 {full} · 혼잡 {high}
        </span>
      </div>
      <dl>
        {(
          [
            ["전체 수거 거점", s.bins.length, "곳"],
            ["검토할 구역", ranks.filter((r) => r.score > 0).length, "곳"],
            [
              "7일 포화 신고",
              sevenDays(s).reduce((n, d) => n + d.reports, 0),
              "건",
            ],
          ] as const
        ).map(([label, n, unit]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <AnimatedNumber value={n} />
              {unit}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
function Trend({ s }: { s: Snapshot }) {
  const transition = tween(useMotionPreference() ? 0 : duration.fast);
  const data = sevenDays(s);
  const [selected, select] = useState<string>();
  const current = data.find((d) => d.date === selected) ?? data[6];
  const max = Math.max(1, ...data.flatMap((d) => [d.entries, d.reports]));
  const x = (i: number) => 39 + 43 * i,
    y = (n: number) => 100 - (80 * n) / max;
  return (
    <div className="week-chart">
      <h2>최근 7일 추이</h2>
      <div className="chart-key">
        <span>센서 포화 진입</span>
        <span>학생 포화 신고</span>
      </div>
      <svg
        viewBox="0 0 321 130"
        role="img"
        aria-label="최근 7일 건수 · 센서 포화 진입 막대와 학생 포화 신고 선"
      >
        {[0, max].map((n) => (
          <g key={n}>
            <line x1="22" x2="315" y1={y(n)} y2={y(n)} className="chart-grid" />
            <text x="17" y={y(n) + 4} textAnchor="end">
              {n}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <motion.rect
            initial={false}
            transition={transition}
            key={d.date}
            className="chart-bar"
            x={x(i) - 8}
            animate={{ y: y(d.entries), height: 100 - y(d.entries) }}
            width="16"
          />
        ))}
        <motion.polyline
          initial={false}
          transition={transition}
          className="chart-line"
          animate={{
            points: data.map((d, i) => x(i) + "," + y(d.reports)).join(" "),
          }}
        />
        {data.map((d, i) => (
          <g key={d.date}>
            <motion.circle
              initial={false}
              transition={transition}
              className="chart-dot"
              data-current={current.date === d.date || undefined}
              cx={x(i)}
              animate={{ cy: y(d.reports) }}
              r={current.date === d.date ? 5 : 3.5}
            />
            <text x={x(i)} y="122" textAnchor="middle">
              {d.date.slice(5).replace("-", "/")}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-targets" aria-label="날짜별 건수">
        {data.map((d) => (
          <button
            key={d.date}
            type="button"
            aria-label={
              d.date + " 센서 " + d.entries + "건 신고 " + d.reports + "건"
            }
            onPointerEnter={() => select(d.date)}
            onFocus={() => select(d.date)}
            onClick={() => select(d.date)}
          />
        ))}
      </div>
      <p aria-live="polite">
        {current === data[6] ? "오늘" : current.date} · 센서 {current.entries}건
        · 신고 {current.reports}건
      </p>
    </div>
  );
}
export function Statistics({ s }: { s: Snapshot }) {
  const values = s.bins.flatMap((b) => b.waste_types.map((t) => b.fills[t]));
  const levels = ["여유", "보통", "혼잡", "가득 참", "정보 없음"];
  return (
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
      <Trend s={s} />
    </section>
  );
}
