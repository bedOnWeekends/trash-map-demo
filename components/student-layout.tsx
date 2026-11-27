"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
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
  const epochKey = useEpochKey(booth.data?.epoch);
  return (
    <StudentShell sync={booth.error ? "연결 확인 필요" : booth.sync}>
      <div className="student-viewport">
        {visitedMap && (
          <div className="student-map-view" inert={!onMap} aria-hidden={!onMap}>
            <MobileMap key={epochKey} booth={booth} active={onMap} />
          </div>
        )}
        {children}
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
