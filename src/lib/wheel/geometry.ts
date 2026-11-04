import type { Score } from "./model";

export function polar(cx: number, cy: number, r: number, a: number) {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Split circular sequence into runs of consecutive filled scores (contour breaks on gaps). */
export function wheelSegments(scores: Score[]): number[][] {
  const n = scores.length;
  if (n === 0) return [];
  if (scores.every((s) => s !== null)) return [scores.map((_, i) => i)];
  const start = scores.findIndex((s) => s === null);
  const segs: number[][] = [];
  let cur: number[] = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (scores[i] === null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else cur.push(i);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

/** Word-wrap by approximate character count; long words are hyphen-split. */
export function wrapByChars(text: string, maxChars: number, maxLines = 4): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let w of words) {
    while (w.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(w.slice(0, maxChars - 1) + "-");
      w = w.slice(maxChars - 1);
    }
    if (!line) line = w;
    else if ((line + " " + w).length <= maxChars) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/.?$/, "…");
    return kept;
  }
  return lines.length ? lines : [""];
}

export interface LabelLayout {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  lines: string[];
}

/** Place labels around a circle; vertical offset keeps multi-line blocks outside the ring. */
export function layoutLabels(
  names: string[],
  cx: number,
  cy: number,
  r: number,
  fontSize: number,
  maxChars: number,
): LabelLayout[] {
  const n = names.length;
  return names.map((name, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const lines = wrapByChars(name, maxChars);
    const lh = fontSize * 1.2;
    const blockH = lines.length * lh;
    const p = polar(cx, cy, r, a);
    const anchor: LabelLayout["anchor"] = Math.abs(cos) < 0.25 ? "middle" : cos > 0 ? "start" : "end";
    // y of first baseline
    let y: number;
    if (sin < -0.6) y = p.y - blockH + lh * 0.8;
    else if (sin > 0.6) y = p.y + lh * 0.85;
    else y = p.y - blockH / 2 + lh * 0.8;
    return { x: p.x, y, anchor, lines };
  });
}
