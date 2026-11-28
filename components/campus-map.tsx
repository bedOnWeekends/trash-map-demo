"use client";
import { useMotionPreference } from "@/components/motion/patterns";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  Plus,
  Minus,
  LocateFixed,
  Layers,
  Compass,
  TriangleAlert,
} from "lucide-react";
import { groupMarkers, markerHitSize } from "@/lib/marker-groups";
import { zones, type Point, type Zone } from "@/lib/model";
import buildings from "@/lib/footprints.json";
import landscapeData from "@/lib/landscape.json";
import { loadKakao } from "@/lib/kakao";
import { ConfirmDialog } from "./ui/dialog";
import { ItemIcon, type PinKind } from "./common";
import { duration, scale as motionScale } from "@/lib/motion";
export type Pin = Point & {
  fresh?: boolean;
  id: string;
  kind: PinKind;
  name: string;
  count?: number;
  warning?: number;
};
const doubleTapMs = 350;
const doubleTapRadius = 28;
const center = { lat: 37.45003, lng: 126.65384 };
const roads = landscapeData as [string, number[][]][];
const xy = (lng: number, lat: number) => [
  (lng - center.lng) * 95500,
  -(lat - center.lat) * 120000,
];
function extent(points: readonly Point[]) {
  const lats = points.map((p) => p.lat),
    lngs = points.map((p) => p.lng);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  };
}
const campusExtent = extent(zones);
const isCompactLandscape = (width: number, height: number) =>
  width >= 400 && width > height && height < 500;
function mapInsets(height: number, wide: boolean) {
  // Leave room for the search, the marker above its coordinate and the map toolbar.
  const top = Math.min(wide ? 108 : 144, height * 0.38);
  const bottom = Math.min(wide ? 76 : 162, height * 0.36);
  return { top, bottom, side: 40 };
}
// In compact landscape several buildings sit closer together than their names are wide.
// Place labels around their anchors, keeping clear of pins and previously placed names.
function landscapeLabels(project: (p: Point) => { x: number; y: number }) {
  const anchors = zones.map(project);
  const occupied = anchors.map(({ x, y }) => ({
    left: x - 19,
    right: x + 19,
    top: y - 38,
    bottom: y + 2,
  }));
  return zones.map((zone, i) => {
    const { x, y } = anchors[i];
    const width = Array.from(zone.name).reduce(
      (sum, char) => sum + (/[0-9]/.test(char) ? 8 : 12),
      0,
    );
    const options = [
      [-width / 2, 5],
      [-width - 20, -23],
      [20, -23],
      [-width / 2, -58],
      [-width, 6],
      [0, 6],
      [-width - 21, 6],
      [21, 6],
      [-width - 26, -51],
      [26, -51],
      [-width - 28, 26],
      [28, 26],
    ];
    const boxes = options.map(([dx, dy]) => ({
      dx,
      dy,
      left: x + dx,
      right: x + dx + width,
      top: y + dy,
      bottom: y + dy + 18,
    }));
    const overlap = (box: (typeof boxes)[number]) =>
      occupied.reduce(
        (area, other) =>
          area +
          Math.max(
            0,
            Math.min(box.right, other.right + 2) -
              Math.max(box.left, other.left - 2),
          ) *
            Math.max(
              0,
              Math.min(box.bottom, other.bottom + 2) -
                Math.max(box.top, other.top - 2),
            ),
        0,
      );
    const best = boxes.reduce((best, box) =>
      overlap(box) < overlap(best) ? box : best,
    );
    occupied.push(best);
    return `translate(${best.dx}px, ${best.dy}px)`;
  });
}
function fitKakao(
  map: kakao.maps.Map,
  box: typeof campusExtent,
  height: number,
  wide: boolean,
) {
  if (box.north === box.south && box.west === box.east) {
    map.setLevel(3);
    map.setCenter(new kakao.maps.LatLng(box.north, box.west));
    return;
  }
  const { top, bottom, side } = mapInsets(height, wide);
  const bounds = new kakao.maps.LatLngBounds();
  bounds.extend(new kakao.maps.LatLng(box.south, box.west));
  bounds.extend(new kakao.maps.LatLng(box.north, box.east));
  map.setBounds(bounds, top, side, bottom, side);
}
const path = (coords: number[][]) =>
  coords
    .map(
      ([x, y], i) =>
        (i ? "L" : "M") +
        xy(x, y)
          .map((n) => n.toFixed(1))
          .join(" "),
    )
    .join(" ");
const shapes = buildings.map(path),
  lines = roads.map(([kind, points]) => ({ kind, d: path(points) }));
function KakaoOverlay({
  map,
  pin,
  active,
  passiveCandidate,
  children,
}: {
  map: kakao.maps.Map;
  pin: Pin;
  active: boolean;
  passiveCandidate: boolean;
  children: ReactNode;
}) {
  const [el] = useState(() => document.createElement("div"));
  const overlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  useEffect(() => {
    const overlay = new kakao.maps.CustomOverlay({
      map,
      position: new kakao.maps.LatLng(pin.lat, pin.lng),
      content: el,
      clickable: !passiveCandidate,
      yAnchor: 1,
      zIndex: 3,
    });
    overlayRef.current = overlay;
    return () => overlay.setMap(null);
  }, [map, el, pin.lat, pin.lng, passiveCandidate]);
  useEffect(() => {
    overlayRef.current?.setZIndex(
      active ? 10 : passiveCandidate ? 2 : pin.kind === "candidate" ? 8 : 3,
    );
  }, [active, pin.kind, pin.lat, pin.lng, map, passiveCandidate]);
  return createPortal(children, el);
}
function PinControl({
  p,
  selected,
  onSelect,
  members,
  grouped,
  admin,
}: {
  members?: Pin[];
  grouped: boolean;
  admin: boolean;
  p: Pin;
  selected?: string;
  onSelect: (p: Pin) => void;
}) {
  const present = useIsPresent();
  const chosen = p.id === selected || !!members?.some((m) => m.id === selected);
  const label = members
    ? (admin ? "지도 항목 " : "수거 거점 ") +
      members.length +
      (admin ? "개 선택" : "곳 선택")
    : p.name;
  return (
    <button
      type="button"
      inert={!present || (admin && grouped && p.kind === "candidate")}
      aria-hidden={!present || undefined}
      title={label}
      data-new-installation={p.fresh || undefined}
      aria-label={
        label +
        (admin && p.warning ? " · 미반영 포화 신고 " + p.warning + "건" : "")
      }
      aria-pressed={chosen}
      data-bin-ids={members ? members.map((m) => m.id).join(" ") : p.id}
      data-group-size={members?.length}
      data-selected-bin={chosen ? selected : undefined}
      data-marker-id={p.id}
      className={"pin kind-" + p.kind + (chosen ? " chosen" : "")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(p);
      }}
    >
      {grouped ? (
        <span className="marker-face" key={chosen ? selected : "idle"}>
          {members ? (
            <strong>
              {members.length}
              {admin ? "개" : "곳"}
            </strong>
          ) : (
            <ItemIcon kind={p.kind} size={20} />
          )}
        </span>
      ) : (
        <ItemIcon kind={p.kind} size={20} />
      )}
      {!!p.warning && (
        <span className="pin-count warn">
          <TriangleAlert size={10} />
          {p.warning}
        </span>
      )}
      {!!p.count && p.count > 1 && <span className="pin-count">{p.count}</span>}
    </button>
  );
}
export type MobileCamera = {
  reveal: (point: Point, visible: DOMRect) => void;
  zoom: (direction: number) => void;
  reset: () => void;
};
export function MapControls({
  changeZoom,
  reset,
}: {
  changeZoom: (direction: number) => void;
  reset: () => void;
}) {
  return (
    <div className="map-controls">
      <button aria-label="지도 확대" onClick={() => changeZoom(1)}>
        <Plus />
      </button>
      <button aria-label="지도 축소" onClick={() => changeZoom(-1)}>
        <Minus />
      </button>
      <button aria-label="지도 범위 맞추기" onClick={reset}>
        <LocateFixed />
      </button>
    </div>
  );
}
export default function CampusMap({
  pins,
  selected,
  onSelect,
  onDeselect,
  onPick,
  zone,
  showZones = "admin",
  pickedZone,
  picking = false,
  mobile = false,
  cameraRef,
  groupContent,
  active = true,
}: {
  active?: boolean;
  groupContent?: (ids: string[], close: () => void) => ReactNode;
  pins: Pin[];
  selected?: string;
  onSelect: (p: Pin) => void;
  onDeselect?: () => void;
  onPick?: (p: Point) => void;
  zone?: Zone;
  showZones?: "admin" | "student";
  pickedZone?: Zone;
  picking?: boolean;
  mobile?: boolean;
  cameraRef?: Ref<MobileCamera>;
}) {
  const host = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<kakao.maps.Map | null>(null),
    [failure, setFailure] = useState(""),
    [attempt, setAttempt] = useState(0),
    [showFailure, setShowFailure] = useState(false),
    [size, setSize] = useState({ w: 800, h: 550 }),
    [scale, zoom] = useState(1),
    [pan, move] = useState({ x: 0, y: 0 });
  const box = campusExtent;
  const tween = useRef(0);
  const home = useRef<{ center: kakao.maps.LatLng; level: number } | null>(
    null,
  );
  const stopPan = () => cancelAnimationFrame(tween.current);
  useEffect(() => () => cancelAnimationFrame(tween.current), []);
  const wide = isCompactLandscape(size.w, size.h);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0, time: 0 });
  const lastTap = useRef<{ x: number; y: number; time: number } | null>(null);
  const deselectTimer = useRef<number | undefined>(undefined);
  const cancelDeselect = useCallback(
    () => window.clearTimeout(deselectTimer.current),
    [],
  );
  const singleTap = useCallback(() => {
    cancelDeselect();
    if (selected && onDeselect && !picking)
      deselectTimer.current = window.setTimeout(onDeselect, doubleTapMs);
  }, [cancelDeselect, selected, onDeselect, picking]);

  useEffect(() => {
    if (!onDeselect || picking) return;
    // A second interaction may start on a different pin, the sheet or a toolbar.
    // Cancel the first tap before that interaction can change the selection.
    const interrupt = (e: Event) => {
      cancelDeselect();
      if (
        !(e.target instanceof Element) ||
        !e.target.closest(".schematic") ||
        e.target.closest("button,a") ||
        e.type !== "pointerdown"
      )
        lastTap.current = null;
    };
    window.addEventListener("pointerdown", interrupt, true);
    window.addEventListener("wheel", interrupt, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", interrupt, true);
    return () => {
      cancelDeselect();
      lastTap.current = null;
      window.removeEventListener("pointerdown", interrupt, true);
      window.removeEventListener("wheel", interrupt, true);
      window.removeEventListener("keydown", interrupt, true);
    };
  }, [cancelDeselect, selected, onDeselect, picking, map]);
  const nativeClick = useEffectEvent(
    (e: kakao.maps.event.MouseEvent, handledGesture: boolean) => {
      if (picking || !onDeselect) {
        onPick?.({ lat: e.latLng.getLat(), lng: e.latLng.getLng() });
      } else if (!handledGesture) singleTap();
    },
  );
  const reduced = useMotionPreference();
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let release: () => void = () => {};
    loadKakao()
      .then(() => {
        if (cancelled || !host.current) return;
        const m = new kakao.maps.Map(host.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 4,
        });
        if (mobile)
          m.setCopyrightPosition(
            kakao.maps.CopyrightPosition.BOTTOMRIGHT,
            false,
          );
        const element = host.current;
        let handledGesture = false;
        const beginGesture = () => {
          handledGesture = false;
        };
        const skipTap = () => {
          handledGesture = true;
          cancelDeselect();
        };
        const onClick = (e: kakao.maps.event.MouseEvent) =>
          nativeClick(e, handledGesture);
        // The SDK reports background clicks after hit testing clickable overlays.
        // Some zoom sequences also emit a click, in either event order.
        const gestures = ["dblclick", "dragstart", "zoom_start"];
        element.addEventListener("pointerdown", beginGesture, true);
        kakao.maps.event.addListener(m, "click", onClick);
        for (const name of gestures)
          kakao.maps.event.addListener(m, name, skipTap);
        release = () => {
          element.removeEventListener("pointerdown", beginGesture, true);
          kakao.maps.event.removeListener(m, "click", onClick);
          for (const name of gestures)
            kakao.maps.event.removeListener(m, name, skipTap);
        };
        let width = host.current.clientWidth,
          height = host.current.clientHeight;
        observer = new ResizeObserver(([entry]) => {
          const size = entry.contentRect;
          if (
            !size.width ||
            !size.height ||
            (size.width === width && size.height === height)
          )
            return;
          width = size.width;
          height = size.height;
          const position = m.getCenter();
          m.relayout();
          m.setCenter(position);
        });
        observer.observe(host.current);
        setMap(m);
        setFailure("");
      })
      .catch((e) => {
        if (!cancelled) setFailure(e.message);
      });
    return () => {
      cancelled = true;
      observer?.disconnect();
      release();
    };
  }, [attempt, mobile, cancelDeselect]);
  useEffect(() => {
    if (!surface.current) return;
    const o = new ResizeObserver(([e]) => {
      if (e.contentRect.width && e.contentRect.height)
        setSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    o.observe(surface.current);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    if (!map || !host.current) return;
    const colors = getComputedStyle(host.current);
    const regions =
      showZones === "admin" ? zones : pickedZone ? [pickedZone] : [];
    const activeZone = pickedZone ?? zone;
    const layers = regions.map(
      (z) =>
        new kakao.maps.Polygon({
          map,
          path: z.polygon.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng)),
          strokeWeight: z.id === activeZone?.id ? 3 : 1,
          strokeColor: colors.getPropertyValue("--color-accent").trim(),
          strokeOpacity: z.id === activeZone?.id ? 1 : 0.32,
          fillColor: colors.getPropertyValue("--color-accent-2").trim(),
          fillOpacity: z.id === activeZone?.id ? 0.18 : 0.035,
        }),
    );
    return () => layers.forEach((p) => p.setMap(null));
  }, [map, zone, showZones, pickedZone]);
  useEffect(() => {
    if (!map || mobile) return;
    const points = zone ? zone.polygon : zones.flatMap((z) => z.polygon);
    const bounds = new kakao.maps.LatLngBounds();
    points.forEach(([lng, lat]) =>
      bounds.extend(new kakao.maps.LatLng(lat, lng)),
    );
    map.setBounds(bounds, 52, 38, 42, 38);
  }, [map, zone, mobile]);
  useEffect(() => {
    if (map && mobile && surface.current) {
      fitKakao(
        map,
        box,
        surface.current.clientHeight,
        isCompactLandscape(
          surface.current.clientWidth,
          surface.current.clientHeight,
        ),
      );
      home.current = { center: map.getCenter(), level: map.getLevel() };
    }
  }, [map, mobile, box]);
  // The schematic uses the same geographic coordinates and click inverse as the live map.
  const insets = mapInsets(size.h, wide);
  const overviewCenter = mobile
    ? { lng: (box.west + box.east) / 2, lat: (box.north + box.south) / 2 }
    : center;
  const target = zone ?? overviewCenter;
  const [targetX, targetY] = xy(target.lng, target.lat);
  const fittedScale = Math.min(
    1.2,
    (size.w - 2 * insets.side) / Math.max(1, (box.east - box.west) * 95500),
    (size.h - insets.top - insets.bottom) /
      Math.max(1, (box.north - box.south) * 120000),
  );
  const factor =
    Math.max(
      0.05,
      mobile ? fittedScale : Math.min(size.w / 870, size.h / 670),
    ) *
    scale *
    (zone ? 1.6 : 1);
  const offsetY = mobile ? (insets.top - insets.bottom) / 2 : 0;
  const width = size.w / factor,
    height = size.h / factor;
  const ox = targetX - width / 2 - pan.x / factor,
    oy = targetY - height / 2 - (pan.y + offsetY) / factor;
  const position = (p: Point) => {
    const [x, y] = xy(p.lng, p.lat);
    return {
      left: ((x - ox) / width) * 100 + "%",
      top: ((y - oy) / height) * 100 + "%",
    };
  };
  const labelOffsets =
    ((mobile && wide) || (showZones === "admin" && size.w < 520)) && !map
      ? landscapeLabels((p) => {
          const [x, y] = xy(p.lng, p.lat);
          return { x: (x - ox) * factor, y: (y - oy) * factor };
        })
      : undefined;
  function animateCamera(x: number, y: number, nextScale = scale) {
    stopPan();
    if (reduced) {
      move({ x, y });
      zoom(nextScale);
      return;
    }
    let start: number | undefined;
    function frame(time: number) {
      start ??= time;
      const t = Math.min(1, (time - start) / 320),
        ease = 1 - (1 - t) ** 3;
      move({ x: pan.x + (x - pan.x) * ease, y: pan.y + (y - pan.y) * ease });
      zoom(scale + (nextScale - scale) * ease);
      if (t < 1) tween.current = requestAnimationFrame(frame);
    }
    tween.current = requestAnimationFrame(frame);
  }
  const reset = () => {
    if (mobile) {
      if (map && home.current) {
        if (map.getLevel() !== home.current.level)
          map.setLevel(home.current.level);
        if (reduced) map.setCenter(home.current.center);
        else map.panTo(home.current.center);
      } else animateCamera(0, 0, 1);
      return;
    }
    move({ x: 0, y: 0 });
    zoom(1);
    if (map) {
      const bounds = new kakao.maps.LatLngBounds();
      (zone ? zone.polygon : zones.flatMap((z) => z.polygon)).forEach(
        ([x, y]) => bounds.extend(new kakao.maps.LatLng(y, x)),
      );
      map.setBounds(bounds, 50, 36, 45, 36);
    }
  };
  const changeZoom = (v: number) => {
    stopPan();
    if (map) map.setLevel(Math.max(1, Math.min(8, map.getLevel() - v)));
    else zoom((old) => Math.max(0.65, Math.min(4, old * 1.32 ** v)));
  };
  // A cold deep link can be consumed while the schematic is still on screen.
  // Replay just that explicit request after the native projection becomes ready.
  const [, setProjectionLevel] = useState<number | null>(null);
  const grouping = !!groupContent;
  useEffect(() => {
    if (!map || !grouping) return;
    const update = () => setProjectionLevel(map.getLevel());
    update();
    kakao.maps.event.addListener(map, "zoom_changed", update);
    return () => kakao.maps.event.removeListener(map, "zoom_changed", update);
  }, [map, grouping]);
  const projection = map?.getProjection();
  const groups = groupContent
    ? groupMarkers(
        pins.filter((p) => p.kind !== "candidate"),
        (p) => {
          if (projection)
            return projection.containerPointFromCoords(
              new kakao.maps.LatLng(p.lat, p.lng),
            );
          const [x, y] = xy(p.lng, p.lat);
          return { x: x * factor, y: y * factor };
        },
      )
    : [];
  const members = new Map(
    groups.filter((g) => g.members.length > 1).map((g) => [g.id, g.members]),
  );
  const visiblePins = groupContent
    ? [
        ...groups.map((g) =>
          g.members.length === 1
            ? g.anchor
            : {
                ...g.anchor,
                id: g.id,
                fresh: g.members.some((p) => p.fresh),
                warning: g.members.reduce(
                  (n, member) => n + (member.warning ?? 0),
                  0,
                ),
              },
        ),
        ...pins.filter((p) => p.kind === "candidate"),
      ]
    : pins;
  const [openGroup, showGroup] = useState("");
  const openMembers = members.get(openGroup);
  if (openGroup && (!openMembers || !active)) showGroup("");
  const movingNative = useRef(false);
  const pendingReveal = useRef<{ point: Point; visible: DOMRect } | null>(null);
  function reveal(point: Point, visible: DOMRect) {
    if (!map && !failure) pendingReveal.current = { point, visible };

    if (!surface.current) return;
    const r = surface.current.getBoundingClientRect();
    // Reveal the plotted representative of this exact member at the current zoom.
    const marker =
      groups.find((g) =>
        g.members.some((p) => p.id === ("id" in point ? point.id : undefined)),
      )?.anchor ?? point;
    const coord = map && new kakao.maps.LatLng(marker.lat, marker.lng);
    const projection = map?.getProjection();
    const [gx, gy] = xy(marker.lng, marker.lat);
    const screen =
      coord && projection
        ? projection.containerPointFromCoords(coord)
        : { x: (gx - ox) * factor, y: (gy - oy) * factor };
    const x = visible.x - r.x,
      y = visible.y - r.y;
    const covered =
      !mobile &&
      [
        ...surface.current.querySelectorAll<HTMLElement>(
          ".map-caption,.map-controls,.north,.map-credit,.map-error",
        ),
      ].some((el) => {
        const q = el.getBoundingClientRect(),
          sx = screen.x + r.left,
          sy = screen.y + r.top;
        return (
          sx + 24 > q.left &&
          sx - 24 < q.right &&
          sy > q.top &&
          sy - markerHitSize < q.bottom
        );
      });
    if (
      !covered &&
      screen.x > x + 24 &&
      screen.x < x + visible.width - 24 &&
      screen.y > y + 42 &&
      screen.y < y + visible.height - 12
    )
      return;
    const dx = x + visible.width / 2 - screen.x,
      dy = y + visible.height / 2 - screen.y;
    if (map && projection) {
      const goal = projection.coordsFromContainerPoint(
        new kakao.maps.Point(r.width / 2 - dx, r.height / 2 - dy),
      );
      if (reduced) map.setCenter(goal);
      else {
        movingNative.current = true;
        map.panTo(goal);
      }
    } else animateCamera(pan.x + dx, pan.y + dy);
  }
  const revealOnReady = useEffectEvent(() => {
    const pending = pendingReveal.current;
    pendingReveal.current = null;
    if (
      pending &&
      surface.current?.checkVisibility({ visibilityProperty: true }) &&
      !surface.current.closest("[inert]")
    )
      reveal(pending.point, pending.visible);
  });
  useEffect(() => {
    if (map) {
      const done = () => {
        movingNative.current = false;
      };
      const interrupt = () => {
        if (movingNative.current) {
          done();
          map.setCenter(map.getCenter());
        }
      };
      const element = surface.current;
      kakao.maps.event.addListener(map, "idle", done);
      element?.addEventListener("pointerdown", interrupt, true);
      element?.addEventListener("wheel", interrupt, {
        capture: true,
        passive: true,
      });
      revealOnReady();
      return () => {
        kakao.maps.event.removeListener(map, "idle", done);
        element?.removeEventListener("pointerdown", interrupt, true);
        element?.removeEventListener("wheel", interrupt, true);
      };
    }
    const cancel = () => {
      pendingReveal.current = null;
    };
    for (const name of ["pointerdown", "wheel", "keydown", "popstate"])
      window.addEventListener(name, cancel, true);
    return () => {
      for (const name of ["pointerdown", "wheel", "keydown", "popstate"])
        window.removeEventListener(name, cancel, true);
    };
  }, [map]);
  useImperativeHandle(cameraRef, () => ({ zoom: changeZoom, reset, reveal }));
  const pinButton = (pin: Pin) => (
    <PinControl
      p={pin}
      grouped={!!groupContent}
      admin={showZones === "admin"}
      members={members.get(pin.id)}
      selected={selected}
      onSelect={(p) => {
        cancelDeselect();
        if (members.has(p.id)) showGroup(p.id);
        else onSelect(p);
      }}
    />
  );
  return (
    <div
      className={"map-surface" + (picking ? " picking" : "")}
      data-grouping={groupContent ? true : undefined}
      style={{ "--marker-hit": markerHitSize + "px" } as CSSProperties}
      ref={surface}
      aria-label="캠퍼스 지도"
    >
      <div
        className="kakao"
        ref={host}
        style={{ visibility: map ? undefined : "hidden" }}
      />
      {!map && (
        <div
          className="schematic"
          onPointerDown={(e) => {
            stopPan();
            if (e.button !== 0) return;
            const multiple = pointers.current.size > 0 || !e.isPrimary;
            if (multiple) {
              moved.current = true;
              lastTap.current = null;
            }
            if ((e.target as Element).closest("button,a")) return;
            if (!multiple) {
              moved.current = false;
              start.current = { x: e.clientX, y: e.clientY, time: e.timeStamp };
            }
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const active = pointers.current,
              old = active.get(e.pointerId);
            if (!old) return;
            const next = { x: e.clientX, y: e.clientY };
            const other = [...active.entries()].find(
              ([id]) => id !== e.pointerId,
            )?.[1];
            active.set(e.pointerId, next);
            if (other) {
              const distance = (p: typeof next) =>
                Math.hypot(p.x - other.x, p.y - other.y);
              const nextScale = Math.max(
                0.65,
                Math.min(
                  4,
                  (scale * distance(next)) / Math.max(1, distance(old)),
                ),
              );
              const ratio = nextScale / scale;
              const r = e.currentTarget.getBoundingClientRect();
              const mx = (old.x + other.x) / 2 - r.left - r.width / 2,
                my = (old.y + other.y) / 2 - r.top - r.height / 2;
              move({
                x: mx - (mx - pan.x) * ratio + (next.x - old.x) / 2,
                y: my - (my - pan.y) * ratio + (next.y - old.y) / 2,
              });
              zoom(nextScale);
            } else {
              if (
                Math.hypot(next.x - start.current.x, next.y - start.current.y) >
                4
              )
                moved.current = true;
              if (moved.current) {
                lastTap.current = null;
                move((p) => ({
                  x: p.x + next.x - old.x,
                  y: p.y + next.y - old.y,
                }));
              }
            }
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            moved.current = true;
            lastTap.current = null;
          }}
          onLostPointerCapture={(e) => {
            if (pointers.current.delete(e.pointerId)) {
              moved.current = true;
              lastTap.current = null;
            }
          }}
          onPointerUp={(e) => {
            if (
              !pointers.current.delete(e.pointerId) ||
              moved.current ||
              pointers.current.size
            )
              return;
            if (
              Math.hypot(
                e.clientX - start.current.x,
                e.clientY - start.current.y,
              ) > 4
            )
              return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (!picking && onDeselect) {
              if (e.timeStamp - start.current.time > 500) {
                lastTap.current = null;
                return;
              }
              const previous = lastTap.current;
              if (
                previous &&
                e.timeStamp - previous.time <= doubleTapMs &&
                Math.hypot(e.clientX - previous.x, e.clientY - previous.y) <=
                  doubleTapRadius
              ) {
                lastTap.current = null;
                cancelDeselect();
                const nextScale = Math.min(4, scale * 1.32);
                const ratio = nextScale / scale;
                const x = e.clientX - rect.left - rect.width / 2,
                  y = e.clientY - rect.top - rect.height / 2 - offsetY;
                animateCamera(
                  x - (x - pan.x) * ratio,
                  y - (y - pan.y) * ratio,
                  nextScale,
                );
              } else {
                lastTap.current = {
                  x: e.clientX,
                  y: e.clientY,
                  time: e.timeStamp,
                };
                singleTap();
              }
              return;
            }
            onPick?.({
              lng: center.lng + (ox + (e.clientX - rect.left) / factor) / 95500,
              lat: center.lat - (oy + (e.clientY - rect.top) / factor) / 120000,
            });
          }}
        >
          <svg
            className="basemap"
            aria-hidden
            viewBox={[ox, oy, width, height].join(" ")}
          >
            <g>
              {lines
                .filter((l) => l.kind === "lawn" || l.kind === "water")
                .map((l, i) => (
                  <path className={l.kind} d={l.d + "Z"} key={i} />
                ))}
            </g>
            {(showZones === "admin"
              ? zones
              : pickedZone
                ? [pickedZone]
                : []
            ).map((z) => (
              <path
                key={z.id}
                data-zone={z.id}
                className={
                  "zone " + ((pickedZone ?? zone)?.id === z.id ? "active" : "")
                }
                d={path(z.polygon) + "Z"}
              />
            ))}
            <g>
              {lines
                .filter((l) => l.kind === "road" || l.kind === "walk")
                .map((l, i) => (
                  <path key={i} className={l.kind} d={l.d} />
                ))}
            </g>
            {shapes.map((d, i) => (
              <path key={i} className="building" d={d + "Z"} />
            ))}
          </svg>
          {(zone ? [zone] : zones).map((z, i) => (
            <span
              className="map-label"
              key={z.id}
              style={{ ...position(z), transform: labelOffsets?.[i] }}
            >
              {z.name}
            </span>
          ))}
          <AnimatePresence>
            {visiblePins.map((p) => (
              <motion.div
                key={
                  p.kind === "candidate"
                    ? p.id + ":" + p.lat + ":" + p.lng
                    : p.id
                }
                className="pin-anchor"
                style={position(p)}
                initial={{ opacity: 0, scale: motionScale.select }}
                animate={{
                  opacity: 1,
                  scale:
                    p.fresh && !reduced
                      ? [motionScale.select, motionScale.emphasis, 1]
                      : 1,
                }}
                exit={
                  groupContent
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { opacity: 0, scale: 0.85 }
                }
                transition={{
                  duration: reduced
                    ? 0
                    : p.fresh
                      ? duration.emphasis
                      : duration.fast,
                }}
              >
                {pinButton(p)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {map && (
        <AnimatePresence>
          {visiblePins.map((p) => (
            <KakaoOverlay
              key={p.id}
              map={map}
              pin={p}
              passiveCandidate={
                showZones === "admin" && grouping && p.kind === "candidate"
              }
              active={
                p.id === selected ||
                !!members.get(p.id)?.some((m) => m.id === selected)
              }
            >
              <motion.div
                key={p.kind === "candidate" ? p.lat + ":" + p.lng : p.id}
                initial={{ opacity: 0, scale: motionScale.select }}
                animate={{
                  opacity: 1,
                  scale:
                    p.fresh && !reduced
                      ? [motionScale.select, motionScale.emphasis, 1]
                      : 1,
                }}
                exit={
                  groupContent
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { opacity: 0, scale: 0.85 }
                }
                transition={{
                  duration: reduced
                    ? 0
                    : p.fresh
                      ? duration.emphasis
                      : duration.fast,
                }}
              >
                {pinButton(p)}
              </motion.div>
            </KakaoOverlay>
          ))}
        </AnimatePresence>
      )}
      {openMembers &&
        groupContent?.(
          openMembers.map((m) => m.id),
          () => showGroup(""),
        )}
      <div className="map-caption">
        <Layers size={15} />
        {map ? "카카오맵" : "캠퍼스 배치도"}
      </div>
      <div className="north" title="북쪽">
        <Compass size={19} />N
      </div>
      {!mobile && <MapControls changeZoom={changeZoom} reset={reset} />}
      {!map && (
        <div className="map-credit">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap
          </a>
        </div>
      )}
      {mobile && failure && (
        <>
          <button
            className="map-error map-error-trigger"
            onClick={() => setShowFailure(true)}
          >
            가상 배치도 안내
          </button>
          <ConfirmDialog
            open={showFailure}
            onOpenChange={setShowFailure}
            title="가상 배치도 안내"
            description={failure}
            sheet
          >
            <button
              className="wide"
              onClick={() => {
                setShowFailure(false);
                setAttempt((n) => n + 1);
              }}
            >
              다시 연결
            </button>
          </ConfirmDialog>
        </>
      )}
      {!mobile && failure && (
        <details className="map-error">
          <summary>가상 배치도 안내</summary>
          <div>
            {failure}{" "}
            <button onClick={() => setAttempt((n) => n + 1)}>다시 연결</button>
          </div>
        </details>
      )}
    </div>
  );
}
