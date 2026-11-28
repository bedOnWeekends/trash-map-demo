"use client";
import {
  createContext,
  useContext,
  useState,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useBooth, useEpochKey, type Booth } from "@/lib/use-booth";
import { StudentShell, useMobileStudent } from "./student-shell";
import { MobileMap } from "./student-mobile-map";

const StudentData = createContext<Booth | null>(null);
export function useStudentBooth() {
  const booth = useContext(StudentData);
  if (!booth) throw new Error("StudentLayout is required");
  return booth;
}

function MobileRoutes({
  children,
  onMap,
  booth,
}: {
  children: ReactNode;
  onMap: boolean;
  booth: Booth;
}) {
  const [visitedMap, setVisitedMap] = useState(onMap);
  if (onMap && !visitedMap) setVisitedMap(true);
  const mapLayer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = mapLayer.current;
    if (!onMap || !el || !("activeViewTransition" in document)) return;
    // Only the departing map bitmap participates. Naming the incoming map
    // during capture would also take its live buttons out of hit testing.
    let current = true;
    const arm = () => {
      if (current) el.dataset.captureDeparture = "";
    };
    const transition = (
      document as Document & {
        readonly activeViewTransition?: ReturnType<
          Document["startViewTransition"]
        > | null;
      }
    ).activeViewTransition;
    if (transition) void transition.finished.then(arm, arm);
    else arm();
    return () => {
      current = false;
      delete el.dataset.captureDeparture;
    };
  }, [onMap]);
  const epochKey = useEpochKey(booth.data?.epoch);
  return (
    <StudentShell>
      <div className="student-viewport">
        {visitedMap && (
          <div
            ref={mapLayer}
            className="student-map-view"
            inert={!onMap}
            aria-hidden={!onMap}
          >
            <MobileMap key={epochKey} booth={booth} active={onMap} />
          </div>
        )}
        <div className="student-page-view" hidden={onMap}>
          {children}
        </div>
      </div>
    </StudentShell>
  );
}
export function StudentLayout({ children }: { children: ReactNode }) {
  const mobile = useMobileStudent();
  const path = usePathname();
  const [needsData, startData] = useState(path !== "/guide");
  if (!needsData && path !== "/guide") startData(true);
  const booth = useBooth(false, needsData);
  return (
    <StudentData.Provider value={booth}>
      {mobile ? (
        <MobileRoutes booth={booth} onMap={path === "/"}>
          {children}
        </MobileRoutes>
      ) : (
        children
      )}
    </StudentData.Provider>
  );
}
