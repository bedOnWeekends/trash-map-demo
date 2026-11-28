"use client";
import { mapHref } from "@/lib/student-navigation";
import { useMobileStudent } from "@/components/student-shell";
import { useStudentBooth } from "@/components/student-layout";
import type { Booth } from "@/lib/use-booth";
import { AnimatePresence, motion } from "motion/react";
import {
  ContentReveal,
  useMotionPreference,
} from "@/components/motion/patterns";
import { StatusLabel, useChangeHighlight } from "@/components/motion/data";
import { duration, distance, tween } from "@/lib/motion";
import type { RequestRow } from "@/lib/model";
import Link from "next/link";
import { savedDraft } from "@/components/request-wizard";
import { ClipboardList, ArrowRight, ChevronDown } from "lucide-react";
import { Shell, Footer, LoadState } from "@/components/common";
import { labels, timeText, zoneName } from "@/lib/model";
function WriteLink({ epoch }: { epoch?: string }) {
  return (
    <Link href={mapHref({ type: "request" })} className="primary">
      {savedDraft(epoch) ? "작성 이어가기" : "지도에서 건의하기"}
      <ArrowRight size={16} />
    </Link>
  );
}
function InstalledLink({ r }: { r: RequestRow }) {
  if (r.status !== "installed") return null;
  return r.installed_bin_id ? (
    <Link
      className="text-link installed-link"
      href={mapHref({ type: "bin", id: r.installed_bin_id })}
    >
      설치된 수거함 보기 <ArrowRight size={15} />
    </Link>
  ) : (
    <p>
      설치된 거점 정보를 확인할 수 없어요. <Link href="/">지도에서 찾기</Link>
    </p>
  );
}
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
              <WriteLink epoch={b.data?.epoch} />
            </div>
          )}
          {b.data && b.data.requests.length > 0 && savedDraft(b.data.epoch) && (
            <WriteLink epoch={b.data.epoch} />
          )}
          <AnimatePresence initial={false}>
            {b.data?.requests.map((r, index) => (
              <RequestEntry key={r.id} r={r} index={index} />
            ))}
          </AnimatePresence>
        </ContentReveal>
      </div>
    </main>
  );
}
function DesktopRequests({ b }: { b: Booth }) {
  return (
    <>
      <Shell />
      <main className="reading">
        <div className="page-heading">
          <h1>내 설치 건의</h1>
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
              <WriteLink epoch={b.data?.epoch} />
            </div>
          )}
          {b.data && b.data.requests.length > 0 && savedDraft(b.data.epoch) && (
            <WriteLink epoch={b.data.epoch} />
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
              <InstalledLink r={r} />
            </article>
          ))}
        </ContentReveal>
        <Footer />
      </main>
    </>
  );
}

function RequestEntry({ r, index }: { r: RequestRow; index: number }) {
  const reduced = useMotionPreference();
  const ref = useChangeHighlight<HTMLDetailsElement>(r.status);
  return (
    <motion.details
      ref={ref}
      className="request-entry"
      layout="position"
      initial={{ opacity: 0, y: reduced ? 0 : distance.reveal }}
      animate={{
        opacity: 1,
        y: 0,
        transition: {
          ...tween(reduced ? 0 : duration.fast),
          delay: reduced ? 0 : Math.min(index, 3) * 0.035,
        },
      }}
      transition={tween(duration.fast)}
    >
      <summary>
        <span className="request-title">
          <strong>{zoneName(r.zone_id)}</strong>
          <StatusLabel status={r.status} />
        </span>
        <span>{r.requested_waste_types.map((t) => labels[t]).join(", ")}</span>
        <time dateTime={r.created_at}>{timeText(r.created_at)}</time>
        <ChevronDown size={16} />
      </summary>
      <div className="accordion-clip">
        <p>{r.reason}</p>
        <InstalledLink r={r} />
      </div>
    </motion.details>
  );
}
