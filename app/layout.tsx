import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "캠퍼스 순환지도 | 인하대학교 체험 부스",
    template: "%s | 캠퍼스 순환지도",
  },
  description:
    "인하대학교 창의융합세미나 부스에서 사용하는 학생 참여형 분리수거 지도 데모",
  applicationName: "trash-map-demo",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#164a37",
};
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
