import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDiff, type Score, type Sphere } from "@/lib/wheel/model";
import { layoutLabels, polar, wheelSegments } from "@/lib/wheel/geometry";
import { sectorColors } from "@/lib/wheel/colors";

export type ViewMode = "now" | "after" | "both";
export type ScoreTarget = "now" | "after";

interface Props {
  spheres: Sphere[];
  mode: ViewMode;
  target: ScoreTarget;
  primary: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onScore: (id: string, target: ScoreTarget, v: number) => void;
  onRename: (id: string, name: string) => void;
}

const SIZE = 820;
const C = SIZE / 2;
const R = 250;

export function WheelChart({ spheres, mode, target, primary, selectedId, onSelect, onScore, onRename }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const drag = useRef<string | null>(null);
  const n = spheres.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const fontSize = n > 11 ? 14 : 16;
  const labels = useMemo(
    () => layoutLabels(spheres.map((s) => s.name), C, C, R + 22, fontSize, n > 11 ? 13 : 16),
    [spheres, fontSize, n],
  );
  const effectiveTarget: ScoreTarget = mode === "both" ? target : mode;

  const scoreFromPointer = (e: PointerEvent, i: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    const a = angle(i);
    const proj = (p.x - C) * Math.cos(a) + (p.y - C) * Math.sin(a);
    return Math.max(1, Math.min(10, Math.round((proj / R) * 10)));
  };

  const onDown = (e: PointerEvent, i: number) => {
    const s = spheres[i]!;
    onSelect(s.id);
    const v = scoreFromPointer(e, i);
    if (v !== null) onScore(s.id, effectiveTarget, v);
    drag.current = s.id;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent, i: number) => {
    const s = spheres[i]!;
    if (drag.current !== s.id) return;
    const v = scoreFromPointer(e, i);
    if (v !== null && v !== s[effectiveTarget]) onScore(s.id, effectiveTarget, v);
  };
  const onKey = (e: KeyboardEvent, s: Sphere) => {
    const cur = s[effectiveTarget];
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = Math.min(10, (cur ?? 0) + 1);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = Math.max(1, (cur ?? 2) - 1);
    else if (/^[1-9]$/.test(e.key)) next = Number(e.key);
    else if (e.key === "0") next = 10;
    else if (e.key === "Enter") onSelect(s.id);
    if (next !== null) {
      e.preventDefault();
      onScore(s.id, effectiveTarget, next);
    }
  };

  const pt = (i: number, v: number) => polar(C, C, (v / 10) * R, angle(i));
  const showNow = mode !== "after";
  const showAfter = mode !== "now";
  const info = spheres.find((s) => s.id === (hover ?? selectedId));

  const contour = (key: ScoreTarget) => {
    const scores = spheres.map((s) => s[key]);
    const segs = wheelSegments(scores);
    const complete = scores.every((v) => v !== null);
    return { segs, complete, scores };
  };
  const now = contour("now");
  const after = contour("after");
  const segPath = (seg: number[], scores: Score[]) =>
    seg.map((i, j) => {
      const p = pt(i, scores[i]!);
      return `${j ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(" ") + (seg.length === n && n > 0 ? " Z" : "");
  const polyPath = (scores: Score[]) =>
    scores.map((v, i) => {
      const p = pt(i, v!);
      return `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(" ") + " Z";

  const sectorPath = (i: number) => {
    const a0 = angle(i) - Math.PI / n;
    const a1 = angle(i) + Math.PI / n;
    const p0 = polar(C, C, R, a0);
    const p1 = polar(C, C, R, a1);
    const large = (2 * Math.PI) / n > Math.PI ? 1 : 0;
    return `M${C},${C} L${p0.x},${p0.y} A${R},${R} 0 ${large} 1 ${p1.x},${p1.y} Z`;
  };

  const editingIndex = editing ? spheres.findIndex((s) => s.id === editing.id) : -1;
  const saveRename = () => {
    if (!editing) return;
    const s = spheres.find((x) => x.id === editing.id);
    const t = editing.draft.trim();
    // Empty input restores the previous name; unchanged text is not re-sent.
    if (s && t && t !== s.name) onRename(editing.id, t);
    setEditing(null);
  };

  return (
    <div className="relative">
      <div className="relative mx-auto w-full max-w-[640px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="block h-auto w-full touch-none select-none"
        role="group"
        aria-label="Колесо баланса"
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => setHover(null)}
      >
        {/* pastel sector backgrounds, under grid and data */}
        {spheres.map((s, i) => {
          const col = sectorColors(s.id);
          const active = s.id === selectedId || s.id === hover;
          return <path key={s.id} d={sectorPath(i)} fill={active ? col.active : col.base} pointerEvents="none" />;
        })}

        {/* grid */}
        {Array.from({ length: 10 }, (_, k) => (
          <circle
            key={k}
            cx={C}
            cy={C}
            r={((k + 1) / 10) * R}
            fill="none"
            className={k === 9 || k === 4 ? "stroke-[var(--wheel-grid-strong)]" : "stroke-wheel-grid"}
            strokeWidth={k === 9 ? 1.5 : 1}
          />
        ))}
        {spheres.map((s, i) => {
          const end = polar(C, C, R, angle(i));
          return (
            <line key={s.id} x1={C} y1={C} x2={end.x} y2={end.y} className="stroke-wheel-grid" strokeWidth={1} />
          );
        })}
        {[2, 4, 6, 8, 10].map((v) => (
          <text
            key={v}
            x={C + 4}
            y={C - (v / 10) * R + 12}
            className="fill-muted-foreground"
            fontSize={11}
          >
            {v}
          </text>
        ))}

        {/* hit areas (transparent; backgrounds are painted below the grid) */}
        {spheres.map((s, i) => {
          return (
            <path
              key={s.id}
              d={sectorPath(i)}
              fill="transparent"
              style={{ cursor: "pointer" }}
              tabIndex={0}
              role="slider"
              aria-label={`${s.name}: ${effectiveTarget === "now" ? "Сейчас" : "После продвижения"}`}
              aria-valuemin={1}
              aria-valuemax={10}
              aria-valuenow={s[effectiveTarget] ?? undefined}
              aria-valuetext={s[effectiveTarget] === null ? "не задано" : String(s[effectiveTarget])}
              onPointerDown={(e) => onDown(e, i)}
              onPointerMove={(e) => onMove(e, i)}
              onPointerEnter={() => setHover(s.id)}
              onFocus={() => setHover(s.id)}
              onBlur={() => setHover(null)}
              onKeyDown={(e) => onKey(e, s)}
            />
          );
        })}

        {/* data */}
        <g pointerEvents="none">
          {showNow && now.complete && n > 0 && (
            <path d={polyPath(now.scores)} className="fill-wheel-now" fillOpacity={mode === "both" ? 0.08 : 0.14} />
          )}
          {showAfter && after.complete && n > 0 && (
            <path d={polyPath(after.scores)} className="fill-wheel-after" fillOpacity={mode === "both" ? 0.07 : 0.13} />
          )}
          {showNow &&
            now.segs.map((seg, k) => (
              <path key={k} d={segPath(seg, now.scores)} fill="none" className="stroke-wheel-now" strokeWidth={4} strokeLinejoin="round" />
            ))}
          {showAfter &&
            after.segs.map((seg, k) => (
              <g key={k}>
                {showNow && (
                  <path d={segPath(seg, after.scores)} fill="none" className="stroke-card" strokeWidth={4.5} strokeLinejoin="round" strokeDasharray="10 7" />
                )}
                <path d={segPath(seg, after.scores)} fill="none" className="stroke-wheel-after" strokeWidth={2.5} strokeLinejoin="round" strokeDasharray="10 7" />
              </g>
            ))}
          {showNow &&
            spheres.map((s, i) =>
              s.now === null ? null : (
                <circle key={s.id} cx={pt(i, s.now).x} cy={pt(i, s.now).y} r={7} className="fill-wheel-now stroke-card" strokeWidth={2} />
              ),
            )}
          {showAfter &&
            spheres.map((s, i) => {
              if (s.after === null) return null;
              const p = pt(i, s.after);
              const same = showNow && s.now === s.after;
              const h = same ? 5 : 6;
              return (
                <rect
                  key={s.id}
                  x={p.x - h}
                  y={p.y - h}
                  width={h * 2}
                  height={h * 2}
                  className={same ? "fill-card stroke-wheel-after" : "fill-wheel-after stroke-card"}
                  strokeWidth={same ? 2.5 : 2}
                />
              );
            })}
        </g>

        {/* labels */}
        {spheres.map((s, i) => {
          const L = labels[i]!;
          const isSel = s.id === selectedId;
          return (
            <text
              key={s.id}
              x={L.x}
              y={L.y}
              textAnchor={L.anchor}
              fontSize={fontSize}
              className={s.id === primary ? "fill-primary font-semibold" : "fill-[var(--wheel-label)]"}
              fontWeight={isSel || s.id === primary ? 600 : 400}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(s.id)}
            >
              {L.lines.map((line, j) => (
                <tspan key={j} x={L.x} dy={j === 0 ? 0 : fontSize * 1.2}>
                  {line}
                </tspan>
              ))}
              {s.id === primary && (
                <tspan x={L.x} dy={fontSize * 1.15} fontSize={11} className="fill-primary">
                  ★ основная
                </tspan>
              )}
            </text>
          );
        })}
      </svg>

      {info && (
        <div className="pointer-events-none absolute left-2 top-2 max-w-[220px] rounded-lg border bg-card/95 px-3 py-2 text-sm shadow-soft">
          <div className="font-medium leading-snug">{info.name}</div>
          <div className="mt-1 text-muted-foreground">
            Сейчас: <span className="text-foreground">{info.now ?? "—"}</span> · После:{" "}
            <span className="text-foreground">{info.after ?? "—"}</span>
            {formatDiff(info.now, info.after) !== null && (
              <> · Разница: <span className="text-foreground">{formatDiff(info.now, info.after)}</span></>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function WheelLegend({ mode }: { mode: ViewMode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
      {mode !== "after" && (
        <span className="inline-flex items-center gap-2">
          <svg width="44" height="14" aria-hidden>
            <line x1="2" y1="7" x2="42" y2="7" className="stroke-wheel-now" strokeWidth={4} />
            <circle cx="22" cy="7" r="5" className="fill-wheel-now stroke-card" strokeWidth={1.5} />
          </svg>
          Сейчас
        </span>
      )}
      {mode !== "now" && (
        <span className="inline-flex items-center gap-2">
          <svg width="44" height="14" aria-hidden>
            <line x1="2" y1="7" x2="42" y2="7" className="stroke-wheel-after" strokeWidth={2.5} strokeDasharray="7 5" />
            <rect x="17" y="2" width="10" height="10" className="fill-wheel-after stroke-card" strokeWidth={1.5} />
          </svg>
          После продвижения
        </span>
      )}
      {mode === "both" && <span className="text-xs">Пустой квадрат — оценки совпадают</span>}
    </div>
  );
}
