"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  children,
}: {
  map: kakao.maps.Map;
  pin: Pin;
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
      zIndex: pin.kind === "candidate" ? 8 : 3,
    });
    return () => overlay.setMap(null);
  }, [map, el, pin.lat, pin.lng, pin.kind]);
  return createPortal(children, el);
}
export default function CampusMap({
  pins,
  selected,
  onSelect,
  onPick,
  zone,
  picking = false,
}: {
  pins: Pin[];
  selected?: string;
  onSelect: (p: Pin) => void;
  onPick?: (p: Point) => void;
  zone?: Zone;
  picking?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<kakao.maps.Map | null>(null),
    [failure, setFailure] = useState(""),
    [attempt, setAttempt] = useState(0),
    [size, setSize] = useState({ w: 800, h: 550 }),
    [scale, zoom] = useState(1),
    [pan, move] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
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
        const onClick = (e: kakao.maps.event.MouseEvent) =>
          pickRef.current?.({ lat: e.latLng.getLat(), lng: e.latLng.getLng() });
        kakao.maps.event.addListener(m, "click", onClick);
        release = () => kakao.maps.event.removeListener(m, "click", onClick);
        observer = new ResizeObserver(() => m.relayout());
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
  }, [attempt]);
  useEffect(() => {
    if (!surface.current) return;
    const o = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
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
          fillColor: colors.getPropertyValue("--liquid").trim(),
          fillOpacity: z.id === zone?.id ? 0.18 : 0.035,
        }),
    );
    const points = zone ? zone.polygon : zones.flatMap((z) => z.polygon);
    const bounds = new kakao.maps.LatLngBounds();
    points.forEach(([lng, lat]) =>
      bounds.extend(new kakao.maps.LatLng(lat, lng)),
    );
    map.setBounds(bounds, 52, 38, 42, 38);
    return () => layers.forEach((p) => p.setMap(null));
  }, [map, zone]);
  // The schematic uses the same geographic coordinates and click inverse as the live map.
  const target = zone ? xy(zone.lng, zone.lat) : [0, 0],
    focusZoom = zone ? 1.6 : 1;
  const factor = Math.min(size.w / 870, size.h / 670) * scale * focusZoom;
  const width = size.w / factor,
    height = size.h / factor,
    ox = target[0] - width / 2 - pan.x / factor,
    oy = target[1] - height / 2 - pan.y / factor;
  const position = (p: Point) => {
    const [x, y] = xy(p.lng, p.lat);
    return {
      left: ((x - ox) / width) * 100 + "%",
      top: ((y - oy) / height) * 100 + "%",
    };
  };
  const reset = () => {
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
  const changeZoom = (v: number) =>
    map
      ? map.setLevel(Math.max(1, Math.min(8, map.getLevel() - v)))
      : zoom((old) => Math.max(0.65, Math.min(4, old * 1.32 ** v)));
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
            if ((e.target as Element).closest("button,a")) return;
            drag.current = {
              x: e.clientX,
              y: e.clientY,
              startX: pan.x,
              startY: pan.y,
              moved: false,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
            if (d.moved) move({ x: d.startX + dx, y: d.startY + dy });
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (!d || d.moved) return;
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
          {zones.map((z) => (
            <span className="map-label" key={z.id} style={position(z)}>
              {z.name}
            </span>
          ))}
          <AnimatePresence>
            {pins.map((p) => (
              <motion.div
                key={p.id}
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
            <KakaoOverlay key={p.id} map={map} pin={p}>
              <motion.div
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
      {failure && (
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
