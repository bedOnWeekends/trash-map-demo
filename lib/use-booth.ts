"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { day, type Snapshot } from "./model";
let browserClient: ReturnType<typeof createClient> | undefined;
export function useBooth(admin = false) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [sync, setSync] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const active = useRef(true),
    writing = useRef(false),
    retry = useRef<{ body: string; key: string } | null>(null),
    last = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++last.current;
    try {
      const res = await fetch(admin ? "/api/admin/snapshot" : "/api/snapshot", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw Error(json.error);
      if (active.current) {
        setData((prev) =>
          !prev ||
          json.version > prev.version ||
          (json.version === prev.version && json.as_of >= prev.as_of)
            ? json
            : prev,
        );
        if (seq === last.current) setError("");
      }
    } catch (e) {
      if (active.current && seq === last.current)
        setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
    }
  }, [admin]);
  useEffect(() => {
    active.current = true;
    let online = false,
      timer: ReturnType<typeof setTimeout>,
      cancel = false;
    const queue = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 120);
    };
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const client =
      url && key
        ? (browserClient ??= createClient(url, key, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          }))
        : null;
    const ch = client
      ?.channel("booth-revision-" + crypto.randomUUID())
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "demo_revision",
          filter: "id=eq.1",
        },
        queue,
      )
      .subscribe((status) => {
        if (cancel) return;
        online = status === "SUBSCRIBED";
        setSync(online ? "" : "주기적 동기화");
        if (online) queue();
      });
    queue();
    let date = day(Date.now());
    const poll = setInterval(() => {
      const today = day(Date.now());
      if (!online) {
        setSync(navigator.onLine ? "주기적 동기화" : "오프라인");
        queue();
      } else if (today !== date) queue();
      date = today;
    }, 7000);
    const visible = () => {
      if (!document.hidden) queue();
    };
    const offline = () => {
      online = false;
      setSync("오프라인");
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", queue);
    window.addEventListener("offline", offline);
    return () => {
      active.current = false;
      cancel = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (ch) void client?.removeChannel(ch);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", queue);
      window.removeEventListener("offline", offline);
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(t);
  }, [notice]);
  const mutate = async (
    path: string,
    payload: Record<string, unknown>,
    success: string,
  ) => {
    if (!data || writing.current) return false;
    writing.current = true;
    setBusy(true);
    const body = JSON.stringify([path, data.epoch, payload]);
    const key =
      retry.current?.body === body ? retry.current.key : crypto.randomUUID();
    retry.current = { body, key };
    try {
      const r = await fetch("/api/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, epoch: data.epoch, key }),
      });
      const json = await r.json();
      if (!r.ok) {
        if (r.status < 500) retry.current = null;
        throw Error(json.error);
      }
      retry.current = null;
      setNotice(success);
      await refresh();
      return true;
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "연결을 확인한 뒤 다시 시도해 주세요.",
      );
      await refresh();
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };
  return {
    data,
    error,
    sync,
    busy,
    notice,
    notify: setNotice,
    refresh,
    mutate,
  };
}
export type Booth = ReturnType<typeof useBooth>;
