"use client";
import { PressButton } from "./ui/press-button";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { duration, tween } from "@/lib/motion";
import type { NoticeKind } from "@/lib/use-booth";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Map,
  ClipboardList,
  BookOpen,
  ArrowUpRight,
  Recycle,
  Trash2,
  Milk,
  Newspaper,
  Cylinder,
  Wine,
  CupSoda,
  Check,
  MapPin,
  Plus,
  TriangleAlert,
  Info,
  Navigation,
} from "lucide-react";
import { items, labels, fillState, type Waste } from "@/lib/model";
export const icons = {
  general: Trash2,
  plastic: Milk,
  paper: Newspaper,
  can: Cylinder,
  glass: Wine,
  liquid: CupSoda,
  mixed: Recycle,
  request: TriangleAlert,
  candidate: Plus,
};
export type PinKind = keyof typeof icons;
export function ItemIcon({
  kind,
  size = 18,
}: {
  kind: PinKind;
  size?: number;
}) {
  const Icon = icons[kind];
  return <Icon size={size} strokeWidth={1.8} aria-hidden />;
}
export function StudentNav({ bottom = false }: { bottom?: boolean }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  return (
    <nav className={bottom ? "student-tabs" : undefined} aria-label="학생 메뉴">
      {(
        [
          ["/", "수거함 지도", Map],
          ["/requests", "내 건의", ClipboardList],
          ["/guide", "배출 안내", BookOpen],
        ] as const
      ).map(([href, name, Icon]) => (
        <Link
          key={href}
          aria-current={pathname === href ? "page" : undefined}
          href={href}
        >
          {bottom && pathname === href && (
            <motion.span
              className="tab-highlight"
              layoutId="student-tab"
              aria-hidden
              transition={tween(reduced ? 0 : duration.standard)}
            />
          )}
          <Icon size={17} />
          <span>{name}</span>
        </Link>
      ))}
    </nav>
  );
}
export function Shell({ admin = false }: { admin?: boolean }) {
  return (
    <header className="top">
      <div className="top-inner">
        <Link className="brand" href="/">
          <Image
            src="/icon.svg"
            className="brand-mark"
            width={38}
            height={38}
            alt=""
            unoptimized
          />
          <span>캠퍼스 순환지도</span>
        </Link>
        {!admin && <StudentNav />}
        <span className="booth-label">
          <span className="campus-name">
            {admin ? "관리자 콘솔" : "인하대학교 체험 부스"}
          </span>
        </span>
      </div>
    </header>
  );
}
export function Notice({
  text,
  kind = "info",
}: {
  text: string;
  kind?: NoticeKind;
}) {
  const Icon =
    kind === "success" ? Check : kind === "error" ? TriangleAlert : Info;
  return (
    <div role="status" aria-live="polite" className="notice-region">
      <AnimatePresence initial={false}>
        {text && (
          <motion.div
            key={kind + text}
            className="toast"
            data-kind={kind}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={tween(duration.fast)}
          >
            <Icon size={18} aria-hidden /> {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
export function LoadState({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return error ? (
    <div className="problem" role="alert">
      <Info size={18} />
      <span>{error}</span>
      <button onClick={retry}>다시 연결</button>
    </div>
  ) : (
    <div className="loading" role="status">
      공유 데이터를 불러오는 중…
    </div>
  );
}
export function ItemPicker({
  value,
  onChange,
}: {
  value: Waste[];
  onChange: (v: Waste[]) => void;
}) {
  return (
    <fieldset>
      <legend>필요한 품목</legend>
      <div className="chips">
        {items.map((t) => (
          <PressButton
            key={t}
            type="button"
            aria-pressed={value.includes(t)}
            onClick={() =>
              onChange(
                value.includes(t)
                  ? value.filter((v) => v !== t)
                  : [...value, t],
              )
            }
          >
            <ItemIcon kind={t} size={15} />
            {labels[t]}
            <Check className="pick-check" size={13} aria-hidden />
          </PressButton>
        ))}
      </div>
    </fieldset>
  );
}
export function Fill({ value }: { value: number | null | undefined }) {
  const state = fillState(value);
  return (
    <div className="fill" data-level={state}>
      <span className="meter">
        <i style={{ transform: "scaleX(" + (value ?? 0) / 100 + ")" }} />
      </span>
      <span className="fill-value">{value == null ? "—" : value + "%"}</span>
      <span>{state}</span>
    </div>
  );
}
export function Footer() {
  return (
    <footer>
      <span>
        <MapPin size={14} />
        인하대학교 용현캠퍼스
      </span>
      <span>수거함 위치와 관리 구역은 체험용 가상 데이터입니다.</span>
    </footer>
  );
}
export { ArrowUpRight, Navigation };
