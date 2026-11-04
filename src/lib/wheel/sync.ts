import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { applyOps, getSession } from "./session.functions";
import { docToView, isConflictChecked, sKey, type Doc, type WheelView } from "./model";

type PendingOp = { kind: "set" | "add" | "del"; v: unknown; base?: number };
type Pending = Record<string, PendingOp>;

export type SyncStatus = "loading" | "saving" | "saved" | "offline" | "local";
export type Conflict = { k: string; theirs: unknown; mine: unknown; r: number };

interface Stored {
  secret: string;
  rev: number;
  doc: Doc;
  pending: Pending;
}

const storeKey = (id: string) => `kb:session:${id}`;
export const LAST_KEY = "kb:last";

export function readStored(id: string): Stored | null {
  try {
    const raw = localStorage.getItem(storeKey(id));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

export function rememberSession(id: string, secret: string) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ id, secret }));
  } catch {
    /* ignore */
  }
}

function sphereOf(key: string): string | null {
  const m = /^s:([^:]+):/.exec(key);
  return m ? m[1] : null;
}

const POLL_MS = 1000;
const FLUSH_MS = 400;

export function useWheelSync(id: string, secret: string | null) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const st = useRef({
    loaded: false,
    rev: 0,
    doc: {} as Doc,
    pending: {} as Pending,
    inflight: false,
    online: true,
    error: null as null | "denied" | "load",
    conflicts: [] as Conflict[],
    notices: [] as string[],
  });
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    const s = st.current;
    if (!secret || !s.loaded) return;
    try {
      const data: Stored = { secret, rev: s.rev, doc: s.doc, pending: s.pending };
      localStorage.setItem(storeKey(id), JSON.stringify(data));
    } catch {
      /* quota — ignore */
    }
  }, [id, secret]);

  const update = useCallback(() => {
    persist();
    force();
  }, [persist]);

  const flush = useCallback(async () => {
    const s = st.current;
    if (!secret || s.inflight || !s.loaded || s.error) return;
    const entries = Object.entries(s.pending);
    if (entries.length === 0) return;
    const sent = new Map(entries);
    const rank = { add: 0, set: 1, del: 2 } as const;
    const ops = entries
      .sort((a, b) => rank[a[1].kind] - rank[b[1].kind])
      .map(([k, p]) =>
        p.kind === "set"
          ? { kind: "set" as const, k, v: p.v, ...(p.base !== undefined ? { base: p.base } : {}) }
          : { kind: p.kind, sid: sphereOf(k)!, v: p.v },
      );
    s.inflight = true;
    force();
    try {
      const res = await applyOps({ data: { id, secret, ops } });
      s.online = true;
      s.rev = res.rev;
      s.doc = res.data as Doc;
      const conflictKeys = new Set(res.conflicts.map((c) => c.k));
      for (const c of res.conflicts) {
        s.conflicts = s.conflicts.filter((x) => x.k !== c.k);
        const latest = s.pending[c.k];
        s.conflicts.push({
          k: c.k,
          theirs: c.v,
          mine: latest && latest !== sent.get(c.k) ? latest.v : c.mine,
          r: c.r,
        });
        delete s.pending[c.k];
      }
      for (const rj of res.rejected) {
        const key = rj.kind === "set" ? rj.k! : sKey(rj.sid!, rj.kind === "add" ? "pos" : "del");
        delete s.pending[key];
        if (rj.kind === "add") s.notices.push("Сфера не добавлена: достигнут максимум 15 сфер.");
        else if (rj.kind === "del") s.notices.push("Сфера не удалена: должно остаться не меньше 6 сфер.");
      }
      for (const [k, p] of sent) {
        if (conflictKeys.has(k)) continue;
        const cur = s.pending[k];
        if (cur === p) delete s.pending[k];
        else if (cur && cur.kind === "set" && isConflictChecked(k)) cur.base = s.doc[k]?.r;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "ACCESS_DENIED") s.error = "denied";
      s.online = false;
    } finally {
      s.inflight = false;
      update();
    }
  }, [id, secret, update]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => void flush(), FLUSH_MS);
  }, [flush]);

  // Initial load: local backup first, then server.
  useEffect(() => {
    if (!secret) return;
    const s = st.current;
    const local = readStored(id);
    if (local && local.secret === secret) {
      s.rev = local.rev;
      s.doc = local.doc;
      s.pending = local.pending ?? {};
      s.loaded = true;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getSession({ data: { id, secret } });
        if (cancelled) return;
        s.rev = res.rev;
        s.doc = (res.data ?? {}) as Doc;
        s.loaded = true;
        s.online = true;
        rememberSession(id, secret);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "";
        s.online = false;
        if (msg === "ACCESS_DENIED") s.error = "denied";
        else if (!s.loaded) s.error = "load";
      }
      update();
      void flush();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, secret, update, flush]);

  // Polling for remote changes.
  useEffect(() => {
    if (!secret) return;
    let stop = false;
    const tick = async () => {
      const s = st.current;
      if (stop) return;
      if (s.loaded && !s.inflight && !s.error && document.visibilityState !== "hidden") {
        try {
          const res = await getSession({ data: { id, secret, sinceRev: s.rev } });
          const wasOffline = !s.online;
          s.online = true;
          if (res.data && !s.inflight) {
            s.rev = res.rev;
            s.doc = res.data as Doc;
            update();
          } else if (wasOffline) force();
          if (Object.keys(s.pending).length) void flush();
        } catch (e) {
          if (e instanceof Error && e.message === "ACCESS_DENIED") s.error = "denied";
          if (s.online) {
            s.online = false;
            force();
          }
        }
      }
      if (!stop) setTimeout(tick, POLL_MS);
    };
    const t = setTimeout(tick, POLL_MS);
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => {
      stop = true;
      clearTimeout(t);
      window.removeEventListener("online", onOnline);
    };
  }, [id, secret, update, flush]);

  const s = st.current;

  // Doc with local pending changes applied on top.
  const doc = useMemo(() => {
    const d: Doc = { ...s.doc };
    for (const [k, p] of Object.entries(s.pending)) {
      d[k] = { v: p.v, r: s.doc[k]?.r ?? 0 };
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.doc, s.pending, s.rev, s.inflight, Object.keys(s.pending).length, JSON.stringify(s.pending)]);

  const view: WheelView = useMemo(() => docToView(doc), [doc]);

  const set = useCallback(
    (key: string, v: unknown) => {
      const s = st.current;
      const prev = s.pending[key];
      const base = isConflictChecked(key)
        ? prev && prev.kind === "set"
          ? prev.base
          : s.doc[key]?.r
        : undefined;
      s.pending = { ...s.pending, [key]: { kind: "set", v, base } };
      update();
      scheduleFlush();
    },
    [update, scheduleFlush],
  );

  const addSphere = useCallback(() => {
    const s = st.current;
    const sid = crypto.randomUUID();
    const maxPos = Math.max(0, ...view.spheres.map((x) => x.pos));
    s.pending = { ...s.pending, [sKey(sid, "pos")]: { kind: "add", v: maxPos + 1 } };
    update();
    void flush();
    return sid;
  }, [view.spheres, update, flush]);

  const deleteSphere = useCallback(
    (sid: string) => {
      const s = st.current;
      const next: Pending = {};
      for (const [k, p] of Object.entries(s.pending)) if (sphereOf(k) !== sid) next[k] = p;
      const isLocalOnly = s.pending[sKey(sid, "pos")]?.kind === "add";
      if (!isLocalOnly) next[sKey(sid, "del")] = { kind: "del", v: true };
      if (view.primary === sid) next.primary = { kind: "set", v: null };
      s.pending = next;
      s.conflicts = s.conflicts.filter((c) => sphereOf(c.k) !== sid);
      update();
      void flush();
    },
    [view.primary, update, flush],
  );

  const resolveConflict = useCallback(
    (k: string, keep: "mine" | "theirs") => {
      const s = st.current;
      const c = s.conflicts.find((x) => x.k === k);
      s.conflicts = s.conflicts.filter((x) => x.k !== k);
      if (c && keep === "mine") s.pending = { ...s.pending, [k]: { kind: "set", v: c.mine, base: c.r } };
      update();
      if (keep === "mine") void flush();
    },
    [update, flush],
  );

  const takeNotices = useCallback(() => {
    const n = st.current.notices;
    st.current.notices = [];
    return n;
  }, []);

  const pendingCount = Object.keys(s.pending).length;
  let status: SyncStatus;
  if (!s.loaded) status = "loading";
  else if (!s.online) status = pendingCount ? "local" : "offline";
  else if (s.inflight || pendingCount) status = "saving";
  else status = "saved";

  /** Consistent, immutable snapshot for export. */
  const snapshot = useCallback((): WheelView => structuredClone(view), [view]);

  return {
    loaded: s.loaded,
    error: s.error,
    status,
    online: s.online,
    view,
    conflicts: s.conflicts,
    set,
    addSphere,
    deleteSphere,
    resolveConflict,
    takeNotices,
    snapshot,
    flushNow: flush,
    hasPending: pendingCount > 0,
  };
}
