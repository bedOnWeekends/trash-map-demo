"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Map,
  ClipboardList,
  BookOpen,
  ArrowUpRight,
  Radio,
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
export function Shell({
  admin = false,
  sync,
}: {
  admin?: boolean;
  sync?: string;
}) {
  const pathname = usePathname();
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
        {!admin && (
          <nav aria-label="학생 메뉴">
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
                <Icon size={17} />
                {name}
              </Link>
            ))}
          </nav>
        )}
        <span className="booth-label">
          {admin ? "관리자 콘솔" : "인하대학교 체험 부스"}
          <span className="demo">데모</span>
        </span>
      </div>
      {sync && <span className="visually-hidden">{sync}</span>}
    </header>
  );
}
export function Sync({ text }: { text: string }) {
  return (
    <span className="sync">
      <Radio size={15} />
      {text}
    </span>
  );
}
export function Notice({ text }: { text: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={text ? "toast" : "visually-hidden"}
    >
      {text && <Info size={18} />} {text}
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
          <button
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
            {value.includes(t) && <Check size={13} />}
          </button>
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
