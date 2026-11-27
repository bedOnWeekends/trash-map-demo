"use client";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Shell, StudentNav } from "./common";

const mobileQuery =
  "(max-width: 680px), (orientation: landscape) and (max-height: 540px) and (max-width: 980px)";
function subscribe(update: () => void) {
  const media = matchMedia(mobileQuery);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
export function useMobileStudent() {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(mobileQuery).matches,
    () => false,
  );
}
export function StudentShell({
  children,
  sync,
}: {
  children: ReactNode;
  sync?: string;
}) {
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const el = shell.current;
    if (!el || !viewport) return;
    const resize = () => {
      if (viewport.scale !== 1) return;
      el.style.setProperty("--visible-height", viewport.height + "px");
      el.style.setProperty("--visible-top", viewport.offsetTop + "px");
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, []);
  return (
    <div className="student-app" ref={shell}>
      <Shell sync={sync} />
      {children}
      <StudentNav bottom />
    </div>
  );
}
