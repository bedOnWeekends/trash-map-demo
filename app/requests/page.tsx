"use client";
import Link from "next/link";
import { ClipboardList, ArrowRight } from "lucide-react";
import { Shell, Footer, LoadState, Sync } from "@/components/common";
import { useBooth } from "@/lib/use-booth";
import { labels, stateLabels, timeText, zoneName } from "@/lib/model";
export default function Requests() {
  const b = useBooth();
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
        {(!b.data || b.error) && (
          <LoadState error={b.error} retry={b.refresh} />
        )}
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
              <b className="status-tag">{stateLabels[r.status]}</b>
            </div>
            <small>{timeText(r.created_at)}</small>
            <p>{r.requested_waste_types.map((t) => labels[t]).join(" / ")}</p>
            <p>{r.reason}</p>
          </article>
        ))}
        <Footer />
      </main>
    </>
  );
}
