// Core data model for a «Колесо баланса» session.
// The server stores a flat map of fields: key -> { v: value, r: revision }.
// Sphere fields use keys "s:<sphereId>:<field>".

export const DEFAULT_TITLE = "Колесо баланса 2027";
export const UNTITLED = "Без названия";
export const MIN_SPHERES = 6;
export const MAX_SPHERES = 15;
export const MAX_ADDITIONAL = 2;

export type FieldEntry = { v: unknown; r: number };
export type Doc = Record<string, FieldEntry>;

export type SphereField = "name" | "now" | "after" | "max" | "cur" | "aft";
export const SPHERE_TEXT_FIELDS = ["max", "cur", "aft"] as const;
export type SphereTextField = (typeof SPHERE_TEXT_FIELDS)[number];

export const TEXT_LABELS: Record<SphereTextField, string> = {
  max: "Максимальный результат",
  cur: "Где я сейчас",
  aft: "Развитие",
};
export const TEXT_HINTS: Record<SphereTextField, string> = {
  max: "Что означает 10 именно для вас?",
  cur: "Что происходит в этой сфере сейчас?",
  aft: "Каким станет состояние и что для этого изменится?",
};

export type Score = number | null;

export interface Sphere {
  id: string;
  pos: number;
  name: string;
  now: Score;
  after: Score;
  max: string;
  cur: string;
  aft: string;
}

export interface WheelView {
  title: string;
  date: string;
  primary: string | null;
  additional: string[];
  firstSteps: string;
  /** false only while the explicit initial sphere-list step is unfinished. */
  setupDone: boolean;
  /** Draft sphere names from the setup step (synced between participants). */
  setupList: string[];
  spheres: Sphere[];
}

/** Fields where simultaneous edits must be resolved explicitly (texts). */
export function isConflictChecked(key: string): boolean {
  if (key === "title" || key === "firstSteps") return true;
  if (key.startsWith("setupRow:")) return true;
  const f = key.split(":")[2];
  return f === "name" || f === "max" || f === "cur" || f === "aft";
}

export const sKey = (id: string, f: SphereField | "pos" | "del" | "additional") => `s:${id}:${f}`;

export function canSelectAdditional(view: Pick<WheelView, "primary" | "additional">, id: string): boolean {
  return id !== view.primary && (view.additional.includes(id) || view.additional.length < MAX_ADDITIONAL);
}

export function scoreTargetsForMode(mode: "now" | "after" | "both"): Array<"now" | "after"> {
  return mode === "both" ? ["now", "after"] : [mode];
}

export function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 10;
}

/** Parse user input into a score. Returns undefined for invalid input, null for empty. */
export function parseScore(raw: string): Score | undefined {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return isValidScore(n) ? n : undefined;
}

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const score = (v: unknown): Score => (isValidScore(v) ? v : null);

export function docToView(doc: Doc): WheelView {
  const ids: string[] = [];
  for (const k of Object.keys(doc)) {
    const m = /^s:([^:]+):pos$/.exec(k);
    if (m?.[1] && doc[`s:${m[1]}:del`]?.v !== true) ids.push(m[1]);
  }
  const spheres: Sphere[] = ids
    .map((id) => {
      const g = (f: string) => doc[`s:${id}:${f}`]?.v;
      const name = str(g("name")).trim();
      return {
        id,
        pos: Number(g("pos")) || 0,
        name: name || UNTITLED,
        now: score(g("now")),
        after: score(g("after")),
        max: str(g("max")),
        cur: str(g("cur")),
        aft: str(g("aft")),
      };
    })
    .sort((a, b) => a.pos - b.pos || a.id.localeCompare(b.id));
  const primary = str(doc["primary"]?.v) || null;
  // Draft list lives in per-row keys so two participants editing different
  // rows never overwrite each other. A null/absent key ends the list.
  const rows: string[] = [];
  for (let i = 0; i < MAX_SPHERES; i++) {
    const v = doc[`setupRow:${i}`]?.v;
    if (typeof v === "string") rows.push(v);
    else break;
  }
  const rawList = doc["setupList"]?.v; // legacy whole-list field
  const setupList = rows.length
    ? rows
    : Array.isArray(rawList)
      ? rawList.filter((x): x is string => typeof x === "string").slice(0, MAX_SPHERES)
      : [];
  return {
    title: str(doc["title"]?.v, DEFAULT_TITLE),
    date: str(doc["date"]?.v),
    primary: primary && spheres.some((s) => s.id === primary) ? primary : null,
    additional: spheres.filter((s) => s.id !== primary && doc[sKey(s.id, "additional")]?.v === true).slice(0, MAX_ADDITIONAL).map((s) => s.id),
    firstSteps: str(doc["firstSteps"]?.v),
    // Sessions created before the setup step existed have no "setup" field.
    setupDone: doc["setup"]?.v !== false,
    setupList,
    spheres,
  };
}

export function sphereHasData(s: Sphere): boolean {
  return (
    s.now !== null ||
    s.after !== null ||
    !!s.max.trim() ||
    !!s.cur.trim() ||
    !!s.aft.trim() ||
    (s.name !== UNTITLED && !!s.name.trim())
  );
}

export function formatDiff(now: Score, after: Score): string | null {
  if (now === null || after === null) return null;
  const d = after - now;
  if (d === 0) return "0";
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDateRu(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function fileSlug(title: string): string {
  const s = title
    .toLowerCase()
    .split("")
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "koleso-balansa";
}

/** Build a fresh doc map for a new session (all revisions = 1). */
export function initialFields(
  date: string,
  spheres?: Array<Partial<Sphere> & { id: string }>,
  extra?: { title?: string; primary?: string | null; additional?: string[]; firstSteps?: string; setup?: boolean },
): Record<string, unknown> {
  const f: Record<string, unknown> = {
    title: extra?.title ?? DEFAULT_TITLE,
    date,
  };
  if (extra?.primary) f["primary"] = extra.primary;
  if (extra?.firstSteps) f["firstSteps"] = extra.firstSteps;
  if (extra?.setup !== undefined) f["setup"] = extra.setup;
  const list: Array<Partial<Sphere> & { id: string }> =
    spheres ?? Array.from({ length: MIN_SPHERES }, () => ({ id: crypto.randomUUID() as string }));
  list.forEach((s, i) => {
    if (extra?.additional?.includes(s.id) && s.id !== extra.primary) f[sKey(s.id, "additional")] = true;
    f[sKey(s.id, "pos")] = i + 1;
    f[sKey(s.id, "name")] = s.name ?? UNTITLED;
    if (s.now != null) f[sKey(s.id, "now")] = s.now;
    if (s.after != null) f[sKey(s.id, "after")] = s.after;
    for (const t of SPHERE_TEXT_FIELDS) if (s[t]) f[sKey(s.id, t)] = s[t];
  });
  return f;
}
