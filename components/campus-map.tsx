"use client";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Plus,
  Minus,
  LocateFixed,
  Layers,
  Compass,
  TriangleAlert,
} from "lucide-react";
import { zones, type Point, type Zone } from "@/lib/model";
import buildings from "@/lib/footprints.json";
import landscapeData from "@/lib/landscape.json";
import { loadKakao } from "@/lib/kakao";
import { ConfirmDialog } from "./ui/dialog";
import { ItemIcon, type PinKind } from "./common";
export type Pin = Point & {
  id: string;
  kind: PinKind;
  name: string;
  count?: number;
  warning?: number;
};
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
  width >= 480 && width > height && height < 500;
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
  children,
}: {
  map: kakao.maps.Map;
  pin: Pin;
  active: boolean;
  children: ReactNode;
}) {
  const [el] = useState(() => document.createElement("div"));
  useEffect(() => {
    const overlay = new kakao.maps.CustomOverlay({
      map,
      position: new kakao.maps.LatLng(pin.lat, pin.lng),
      content: el,
      clickable: true,
      yAnchor: 1,
      zIndex: active ? 10 : pin.kind === "candidate" ? 8 : 3,
    });
    return () => overlay.setMap(null);
  }, [map, el, pin.lat, pin.lng, pin.kind, active]);
  return createPortal(children, el);
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
  onPick,
  zone,
  picking = false,
  mobile = false,
  cameraRef,
}: {
  pins: Pin[];
  selected?: string;
  onSelect: (p: Pin) => void;
  onPick?: (p: Point) => void;
  zone?: Zone;
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
  const start = useRef({ x: 0, y: 0 });
  const pickRef = useRef(onPick);
  useEffect(() => {
    pickRef.current = onPick;
  }, [onPick]);
  const reduced = useReducedMotion();
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
        const onClick = (e: kakao.maps.event.MouseEvent) =>
          pickRef.current?.({ lat: e.latLng.getLat(), lng: e.latLng.getLng() });
        kakao.maps.event.addListener(m, "click", onClick);
        release = () => kakao.maps.event.removeListener(m, "click", onClick);
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
          if (mobile) m.setCenter(position);
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
  }, [attempt, mobile]);
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
    const layers = zones.map(
      (z) =>
        new kakao.maps.Polygon({
          map,
          path: z.polygon.map(([lng, lat]) => new kakao.maps.LatLng(lat, lng)),
          strokeWeight: z.id === zone?.id ? 3 : 1,
          strokeColor: colors.getPropertyValue("--color-accent").trim(),
          strokeOpacity: z.id === zone?.id ? 1 : 0.32,
          fillColor: colors.getPropertyValue("--color-accent-2").trim(),
          fillOpacity: z.id === zone?.id ? 0.18 : 0.035,
        }),
    );
    const points = zone ? zone.polygon : zones.flatMap((z) => z.polygon);
    const bounds = new kakao.maps.LatLngBounds();
    points.forEach(([lng, lat]) =>
      bounds.extend(new kakao.maps.LatLng(lat, lng)),
    );
    if (!mobile) map.setBounds(bounds, 52, 38, 42, 38);
    return () => layers.forEach((p) => p.setMap(null));
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
    mobile && wide && !map
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
    const start = performance.now();
    function frame(time: number) {
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
  useImperativeHandle(cameraRef, () => ({
    zoom: changeZoom,
    reset,
    reveal(point, visible) {
      if (!surface.current) return;
      const r = surface.current.getBoundingClientRect();
      const coord = map && new kakao.maps.LatLng(point.lat, point.lng);
      const projection = map?.getProjection();
      const [gx, gy] = xy(point.lng, point.lat);
      const screen =
        coord && projection
          ? projection.containerPointFromCoords(coord)
          : { x: (gx - ox) * factor, y: (gy - oy) * factor };
      const x = visible.x - r.x,
        y = visible.y - r.y;
      if (
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
        else map.panTo(goal);
      } else animateCamera(pan.x + dx, pan.y + dy);
    },
  }));
  const pinButton = (p: Pin) => (
    <button
      type="button"
      title={p.name}
      aria-label={p.name}
      aria-pressed={selected === p.id}
      className={"pin kind-" + p.kind + (selected === p.id ? " chosen" : "")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(p);
      }}
    >
      <ItemIcon kind={p.kind} size={20} />
      {!!p.warning && (
        <span className="pin-count warn">
          <TriangleAlert size={10} />
          {p.warning}
        </span>
      )}
      {!!p.count && p.count > 1 && <span className="pin-count">{p.count}</span>}
    </button>
  );
  return (
    <div
      className={"map-surface" + (picking ? " picking" : "")}
      ref={surface}
      aria-label="캠퍼스 지도"
    >
      <div
        className="kakao"
        ref={host}
        style={{ visibility: map ? "visible" : "hidden" }}
      />
      {!map && (
        <div
          className="schematic"
          onPointerDown={(e) => {
            stopPan();
            if ((e.target as Element).closest("button,a")) return;
            if (!pointers.current.size) {
              moved.current = false;
              start.current = { x: e.clientX, y: e.clientY };
            } else moved.current = true;
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
              if (moved.current)
                move((p) => ({
                  x: p.x + next.x - old.x,
                  y: p.y + next.y - old.y,
                }));
            }
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId);
            moved.current = true;
          }}
          onPointerUp={(e) => {
            if (
              !pointers.current.delete(e.pointerId) ||
              moved.current ||
              pointers.current.size
            )
              return;
            const rect = e.currentTarget.getBoundingClientRect();
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
            {zones.map((z) => (
              <path
                key={z.id}
                className={"zone " + (zone?.id === z.id ? "active" : "")}
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
            {pins.map((p) => (
              <motion.div
                key={
                  p.kind === "candidate"
                    ? p.id + ":" + p.lat + ":" + p.lng
                    : p.id
                }
                className="pin-anchor"
                style={position(p)}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
              >
                {pinButton(p)}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {map && (
        <AnimatePresence>
          {pins.map((p) => (
            <KakaoOverlay
              key={p.id}
              map={map}
              pin={p}
              active={p.id === selected}
            >
              <motion.div
                key={p.kind === "candidate" ? p.lat + ":" + p.lng : p.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: reduced ? 0 : 0.18 }}
              >
                {pinButton(p)}
              </motion.div>
            </KakaoOverlay>
          ))}
        </AnimatePresence>
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
