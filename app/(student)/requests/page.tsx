"use client";
import { useMobileStudent } from "@/components/student-shell";
import { useStudentBooth } from "@/components/student-layout";
import type { Booth } from "@/lib/use-booth";
import { AnimatePresence, motion } from "motion/react";
import { ContentReveal } from "@/components/motion/patterns";
import { StatusLabel, useChangeHighlight } from "@/components/motion/data";
import { duration, tween } from "@/lib/motion";
import type { RequestRow } from "@/lib/model";
import Link from "next/link";
import { ClipboardList, ArrowRight, ChevronDown } from "lucide-react";
import { Shell, Footer, LoadState, Sync } from "@/components/common";
import { labels, timeText, zoneName } from "@/lib/model";
export default function Requests() {
  const booth = useStudentBooth();
  return useMobileStudent() ? (
    <MobileRequests b={booth} />
  ) : (
    <DesktopRequests b={booth} />
  );
}
function MobileRequests({ b }: { b: Booth }) {
  return (
    <>
      <main className="mobile-reading">
        <div className="reading-heading">
          <h1>내 설치 건의</h1>
          <p>이 브라우저에서 접수한 건의</p>
        </div>
        <div className="reading-scroll">
          <ContentReveal ready={!!b.data} error={b.error} kind="requests">
            {b.error && <LoadState error={b.error} retry={b.refresh} />}
            {b.data?.requests.length === 0 && (
              <div className="request-empty">
                <ClipboardList size={36} />
                <h2>아직 접수한 건의가 없어요</h2>
                <Link href="/" className="primary">
                  지도에서 건의하기
                  <ArrowRight size={16} />
                </Link>
              </div>
            )}
            <AnimatePresence initial={false}>
              {b.data?.requests.map((r) => (
                <RequestEntry key={r.id} r={r} />
              ))}
            </AnimatePresence>
          </ContentReveal>
        </div>
      </main>
    </>
  );
}
function DesktopRequests({ b }: { b: Booth }) {
  return (
    <>
      <Shell />
      <main className="reading">
        <div className="page-heading">
          <h1>내 설치 건의</h1>
          <Sync text={b.error ? "연결 확인 필요" : b.sync} />
        </div>
        <p className="intro">
          이 브라우저에서 접수한 건의와 처리 상태를 확인하세요.
        </p>
        <ContentReveal ready={!!b.data} error={b.error} kind="requests">
          {b.error && <LoadState error={b.error} retry={b.refresh} />}
          {b.data?.requests.length === 0 && (
            <div className="empty-block">
              <ClipboardList size={32} />
              <h2>아직 접수한 건의가 없어요</h2>
              <Link href="/" className="primary">
                지도에서 건의하기
                <ArrowRight size={16} />
              </Link>
            </div>
          )}
          {b.data?.requests.map((r) => (
            <article key={r.id} className="history">
              <div className="title-row">
                <h2>{zoneName(r.zone_id)}</h2>
                <StatusLabel status={r.status} />
              </div>
              <small>{timeText(r.created_at)}</small>
              <p>{r.requested_waste_types.map((t) => labels[t]).join(" / ")}</p>
              <p>{r.reason}</p>
            </article>
          ))}
        </ContentReveal>
        <Footer />
      </main>
    </>
  );
}

function RequestEntry({ r }: { r: RequestRow }) {
  const ref = useChangeHighlight<HTMLDetailsElement>(r.status);
  return (
    <motion.details
      ref={ref}
      className="request-entry"
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={tween(duration.fast)}
    >
      <summary>
        <span className="request-title">
          <strong>{zoneName(r.zone_id)}</strong>
          <StatusLabel status={r.status} />
        </span>
        <span>{r.requested_waste_types.map((t) => labels[t]).join(" · ")}</span>
        <time dateTime={r.created_at}>{timeText(r.created_at)}</time>
        <ChevronDown size={16} />
      </summary>
      <div className="accordion-clip">
        <p>{r.reason}</p>
      </div>
    </motion.details>
  );
}
