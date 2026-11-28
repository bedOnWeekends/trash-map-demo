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
export function StudentShell({ children }: { children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const el = shell.current;
    if (!el || !viewport) return;
    const resize = () => {
      if (viewport.scale !== 1) return;
      const editing = document.activeElement?.matches(
        'input[type="search"], textarea',
      );
      el.toggleAttribute(
        "data-keyboard",
        !!editing && window.innerHeight - viewport.height > 100,
      );
      el.style.setProperty("--visible-height", viewport.height + "px");
      el.style.setProperty("--visible-top", viewport.offsetTop + "px");
    };
    resize();
    el.addEventListener("focusin", resize);
    el.addEventListener("focusout", resize);
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      el.removeEventListener("focusin", resize);
      el.removeEventListener("focusout", resize);
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, []);
  return (
    <div className="student-app" ref={shell}>
      <Shell />
      {children}
      <StudentNav bottom />
    </div>
  );
}
