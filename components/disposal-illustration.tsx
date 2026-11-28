import { useEffect, useRef } from "react";
import type { Waste } from "@/lib/model";

// Each drawing shows the object, a moving part, and its destination.
const drawings = {
  liquid: (
    <>
      <path d="m20 19 18 9 7-16-17-6zM49 37h17l-2 13H51z" />
      <path className="illustrated-action" d="M41 25q11 0 14 9m-4-1 4 2 1-5" />
    </>
  ),
  plastic: (
    <>
      <path d="M28 7h12v7l5 7v24q0 4-4 4H27q-4 0-4-4V21l5-7zM29 11h10" />
      <path
        className="illustrated-action"
        d="M24 25h18q6 1 12-5l5 8q-8 8-17 7H24z"
      />
    </>
  ),
  paper: (
    <>
      <path d="m16 28 17-8 16 8-16 9zM16 28v10l17 9 16-9V28M33 37v9" />
      <path
        className="illustrated-action"
        d="m16 28-10-7 17-8 10 7 10-7 16 8-10 7"
      />
    </>
  ),
  can: (
    <>
      <g transform="rotate(32 33 24)">
        <ellipse cx="33" cy="13" rx="12" ry="4" />
        <path d="M21 13v23c0 6 24 6 24 0V13M29 14l5-2" />
      </g>
      <path className="illustrated-action" d="M49 16q10 7 11 19m-4-3 4 5 3-6" />
      <path d="M52 45h16" />
    </>
  ),
  glass: (
    <>
      <path d="M27 19h13v8q0 3 5 9v11q0 3-4 3H26q-4 0-4-3V36q5-6 5-9zM27 23h13" />
      <g className="illustrated-action">
        <rect
          x="40"
          y="7"
          width="16"
          height="6"
          rx="2"
          transform="rotate(12 48 10)"
        />
        <path d="m33 14 4-6" />
      </g>
    </>
  ),
  general: (
    <>
      <path d="M38 31h27l-3 19H41zM35 31h33" />
      <g className="illustrated-action">
        <path d="m18 10 9-3 5 5 7-1-2 10-8 4-9-6zM22 12l5 4 6-2" />
        <path d="m39 17 9 7m-1-5 2 6-6-1" />
      </g>
    </>
  ),
};
export function DisposalIllustration({ item }: { item: Waste }) {
  const art = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const element = art.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        element.dataset.shown = "true";
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [item]);
  return (
    <svg
      ref={art}
      className={"disposal-art kind-" + item}
      viewBox="0 0 76 56"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawings[item]}
    </svg>
  );
}
