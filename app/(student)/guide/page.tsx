"use client";
import { mapHref } from "@/lib/student-navigation";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useMobileStudent } from "@/components/student-shell";
import { ConfirmDialog } from "@/components/ui/dialog";
import Link from "next/link";
import { Shell, Footer, ItemIcon } from "@/components/common";
import { items, labels, type Waste } from "@/lib/model";
const tips = {
  general: [
    "재활용이 어려운 폐기물",
    "오염을 제거하기 어려운 휴지, 영수증 등을 넣어 주세요.",
  ],
  plastic: [
    "비우고 헹군 뒤 분리",
    "음료를 비우고 라벨을 떼어 주세요. 투명 페트병 전용 표시가 있으면 따로 배출하세요.",
  ],
  paper: [
    "물기와 이물질 제거",
    "상자를 펼치고 테이프와 스테이플을 제거해 주세요. 코팅되거나 젖은 종이는 제외해요.",
  ],
  can: [
    "내용물을 비운 금속 캔",
    "깨끗이 헹군 뒤 배출하세요. 부탄가스 등 위험 용기는 부스에서 받지 않아요.",
  ],
  glass: [
    "깨지지 않은 빈 유리병",
    "뚜껑을 분리하고 헹궈 주세요. 깨진 유리, 도자기, 거울은 넣지 마세요.",
  ],
  liquid: [
    "컵과 음료는 따로",
    "남은 음료만 천천히 부어 주세요. 얼음, 빨대와 컵은 분리해 주세요.",
  ],
};
export default function Guide() {
  const mobile = useMobileStudent(),
    [item, choose] = useState<Waste | null>(null);
  if (mobile)
    return (
          <main className="mobile-reading">
            <div className="reading-heading">
              <h1>분리배출 안내</h1>
              <p>내용물을 비우고, 거점에 표시된 품목을 확인하세요.</p>
            </div>
            <div className="reading-scroll">
              <div className="guide-grid">
                {items.map((t) => (
                  <button
                    key={t}
                    className={"kind-" + t}
                    onClick={() => choose(t)}
                    aria-haspopup="dialog"
                  >
                    <span className="station-icon">
                      <ItemIcon kind={t} size={24} />
                    </span>
                    <strong>{labels[t]}</strong>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </div>
            <ConfirmDialog
              sheet
              open={!!item}
              onOpenChange={(open) => {
                if (!open) choose(null);
              }}
              title={item ? labels[item] : "배출 방법"}
              description={item ? tips[item][0] : ""}
              content={
                item && (
                  <div className={"guide-detail kind-" + item}>
                    <ItemIcon kind={item} size={24} />
                    <p>{tips[item][1]}</p>
                  </div>
                )
              }
            >
              {item && (
                <Link
                  className="primary"
                  href={mapHref({ type: "filter", waste: item })}
                >
                  {labels[item]} 수거함 찾기
                </Link>
              )}
            </ConfirmDialog>
          </main>

    );
  return (
    <>
      <Shell />
      <main className="reading">
        <h1>분리배출 안내</h1>
        <p className="intro">
          버리기 전 내용을 비우고, 거점에 표시된 품목을 확인하세요.
        </p>
        {items.map((t) => (
          <article className="guide-row" key={t}>
            <span className={"station-icon large kind-" + t}>
              <ItemIcon kind={t} size={25} />
            </span>
            <div>
              <h2>{labels[t]}</h2>
              <strong>{tips[t][0]}</strong>
              <p>{tips[t][1]}</p>
              <Link
                className="text-link"
                href={mapHref({ type: "filter", waste: t })}
              >
                {labels[t]} 수거함 찾기
              </Link>
            </div>
          </article>
        ))}
        <Link className="text-link" href="/">
          수거함 지도 열기
        </Link>
        <Footer />
      </main>
    </>
  );
}
