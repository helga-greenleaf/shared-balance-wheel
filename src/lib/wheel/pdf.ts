import { PDFDocument, rgb, type PDFFont, type PDFPage, LineCapStyle } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { fileSlug, formatDateRu, SPHERE_TEXT_FIELDS, TEXT_LABELS, type WheelView } from "./model";
import { polar, wheelSegments } from "./geometry";

const W = 595.28;
const H = 841.89;
const M = 42.5; // ~15mm
const CW = W - 2 * M;

const INK = rgb(0.13, 0.12, 0.11);
const MUTED = rgb(0.38, 0.36, 0.34);
const GRID = rgb(0.82, 0.81, 0.79);
const GRID_STRONG = rgb(0.68, 0.67, 0.65);
const NOW = rgb(0.1, 0.33, 0.32);
const AFTER = rgb(0.68, 0.3, 0.1);
const WHITE = rgb(1, 1, 1);

let fontCache: Promise<[ArrayBuffer, ArrayBuffer]> | null = null;
function loadFonts() {
  fontCache ??= Promise.all([
    fetch("/fonts/PTSans-Regular.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/PTSans-Bold.ttf").then((r) => r.arrayBuffer()),
  ]);
  return fontCache;
}

function sanitizer(font: PDFFont) {
  const set = new Set(font.getCharacterSet());
  const fallback: Record<string, string> = { "→": "->", "−": "-", "★": "*", "…": "...", "\t": "  " };
  return (s: string) =>
    Array.from(s)
      .map((ch) => (set.has(ch.codePointAt(0)!) ? ch : fallback[ch] ?? (ch === "\n" ? ch : "?")))
      .join("");
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (let word of para.split(/ +/)) {
      while (font.widthOfTextAtSize(word, size) > maxW) {
        let k = word.length - 1;
        while (k > 1 && font.widthOfTextAtSize(word.slice(0, k) + "-", size) > maxW) k--;
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(word.slice(0, k) + "-");
        word = word.slice(k);
      }
      const test = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(test, size) <= maxW) line = test;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  // trim trailing empty lines
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

export function pdfFileName(v: WheelView) {
  return `${fileSlug(v.title)}_${v.date || "bez-daty"}.pdf`;
}

export async function buildPdf(view: WheelView): Promise<Uint8Array> {
  const v: WheelView = structuredClone(view);
  const [regBytes, boldBytes] = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(regBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const clean = sanitizer(reg);
  doc.setTitle(v.title);
  doc.setCreator("Колесо баланса");

  // ---------- Page 1: wheel ----------
  const p1 = doc.addPage([W, H]);
  let y = H - M;
  const titleLines = wrap(clean(v.title), bold, 22, CW);
  for (const l of titleLines) {
    y -= 24;
    p1.drawText(l, { x: M, y, size: 22, font: bold, color: INK });
  }
  y -= 18;
  p1.drawText(clean(`Дата составления: ${formatDateRu(v.date)}`), { x: M, y, size: 11, font: reg, color: MUTED });
  y -= 14;

  const n = v.spheres.length;
  const labelSize = n > 11 ? 8.5 : 9.5;
  const labelW = n > 11 ? 82 : 96;
  const R = n > 11 ? 150 : 158;
  const cx = W / 2;
  const cy = y - 60 - R - 10;
  drawWheel(p1, v, { cx, cy, R, reg, bold, labelSize, labelW, clean });

  // Legend
  let ly = cy - R - 100;
  drawLegend(p1, M, ly, reg);
  ly -= 30;
  const note =
    "Подписи у названий: «Сейчас / После» — оценки по шкале 1–10; «—» — оценка не задана.";
  for (const l of wrap(clean(note), reg, 9, CW)) {
    p1.drawText(l, { x: M, y: ly, size: 9, font: reg, color: MUTED });
    ly -= 12;
  }

  // ---------- Comments ----------
  let page: PDFPage | null = null;
  let cy2 = 0;
  const top = H - M;
  const bottom = M + 24;
  const newPage = () => {
    page = doc.addPage([W, H]);
    cy2 = top;
  };
  const ensure = (h: number) => {
    if (!page || cy2 - h < bottom) newPage();
  };

  const BODY = 10.5;
  const LH = 14.5;
  const hasComments = v.spheres.some((s) => SPHERE_TEXT_FIELDS.some((f) => s[f].trim()));

  const section = (text: string) => {
    ensure(40);
    cy2 -= 20;
    page!.drawText(clean(text), { x: M, y: cy2, size: 16, font: bold, color: INK });
    cy2 -= 10;
  };

  if (n > 0) {
    newPage();
    section("Сферы и комментарии");
    if (!hasComments) {
      cy2 -= 14;
      page!.drawText(clean("Комментарии не заполнены."), { x: M, y: cy2, size: BODY, font: reg, color: MUTED });
      cy2 -= 6;
    }
  }

  v.spheres.forEach((s, i) => {
    const headLines = wrap(clean(`${i + 1}. ${s.name}`), bold, 13, CW);
    const sc = (x: number | null) => (x === null ? "не задано" : `${x}/10`);
    const scoreLine = clean(`Сейчас: ${sc(s.now)} → После продвижения: ${sc(s.after)}`);
    const blocks = SPHERE_TEXT_FIELDS.filter((f) => s[f].trim()).map((f) => ({
      label: TEXT_LABELS[f],
      lines: wrap(clean(s[f]), reg, BODY, CW - 10),
    }));
    const headH = headLines.length * 17 + 18 + (s.id === v.primary ? 14 : 0) + 14;
    const totalH = headH + blocks.reduce((a, b) => a + 18 + b.lines.length * LH + 6, 0);
    const avail = top - bottom;
    // keep short cards whole; never leave a heading alone at the bottom
    if (totalH <= avail * 0.6) ensure(totalH);
    else ensure(headH + 18 + 3 * LH);

    cy2 -= 6;
    for (const l of headLines) {
      cy2 -= 17;
      page!.drawText(l, { x: M, y: cy2, size: 13, font: bold, color: INK });
    }
    if (s.id === v.primary) {
      cy2 -= 14;
      page!.drawText(clean("Основная сфера продвижения"), { x: M, y: cy2, size: 9.5, font: bold, color: NOW });
    }
    cy2 -= 16;
    page!.drawText(scoreLine, { x: M, y: cy2, size: 10.5, font: reg, color: MUTED });
    cy2 -= 4;

    for (const b of blocks) {
      ensure(18 + 2 * LH);
      cy2 -= 16;
      page!.drawText(clean(b.label), { x: M, y: cy2, size: 10, font: bold, color: INK });
      cy2 -= 2;
      for (const l of b.lines) {
        if (cy2 - LH < bottom) {
          newPage();
          page!.drawText(clean(`${s.name} — ${b.label} (продолжение)`), { x: M, y: cy2 - 10, size: 8.5, font: reg, color: MUTED });
          cy2 -= 18;
        }
        cy2 -= LH;
        if (l) page!.drawText(l, { x: M + 10, y: cy2, size: BODY, font: reg, color: INK });
      }
      cy2 -= 4;
    }
    cy2 -= 8;
    if (i < n - 1 && cy2 > bottom + 10) {
      page!.drawLine({ start: { x: M, y: cy2 }, end: { x: W - M, y: cy2 }, thickness: 0.5, color: GRID });
    }
  });

  if (v.firstSteps.trim()) {
    const lines = wrap(clean(v.firstSteps), reg, BODY, CW);
    ensure(60 + Math.min(lines.length, 4) * LH);
    cy2 -= 10;
    cy2 -= 20;
    page!.drawText(clean("Первые шаги"), { x: M, y: cy2, size: 16, font: bold, color: INK });
    cy2 -= 6;
    for (const l of lines) {
      if (cy2 - LH < bottom) newPage();
      cy2 -= LH;
      if (l) page!.drawText(l, { x: M, y: cy2, size: BODY, font: reg, color: INK });
    }
  }

  // Page numbers
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const t = clean(`${i + 1} / ${pages.length}`);
    const w = reg.widthOfTextAtSize(t, 9);
    pg.drawText(t, { x: W - M - w, y: M - 14, size: 9, font: reg, color: MUTED });
    const tt = clean(v.title);
    pg.drawText(tt.length > 70 ? tt.slice(0, 70) + "..." : tt, { x: M, y: M - 14, size: 9, font: reg, color: MUTED });
  });

  return doc.save();
}

function drawLegend(p: PDFPage, x: number, y: number, reg: PDFFont) {
  p.drawLine({ start: { x, y: y + 3 }, end: { x: x + 40, y: y + 3 }, thickness: 2.6, color: NOW });
  p.drawCircle({ x: x + 20, y: y + 3, size: 3.4, color: NOW, borderColor: WHITE, borderWidth: 0.8 });
  p.drawText("Сейчас — толстая сплошная линия, круглые маркеры", { x: x + 48, y, size: 10, font: reg, color: INK });
  const y2 = y - 16;
  p.drawLine({ start: { x, y: y2 + 3 }, end: { x: x + 40, y: y2 + 3 }, thickness: 1.3, color: AFTER, dashArray: [5, 3] });
  p.drawRectangle({ x: x + 17, y: y2, width: 6, height: 6, color: WHITE, borderColor: AFTER, borderWidth: 1.3 });
  p.drawText("После продвижения — тонкая пунктирная линия, квадратные маркеры", {
    x: x + 48,
    y: y2,
    size: 10,
    font: reg,
    color: INK,
  });
}

function drawWheel(
  p: PDFPage,
  v: WheelView,
  o: {
    cx: number;
    cy: number;
    R: number;
    reg: PDFFont;
    bold: PDFFont;
    labelSize: number;
    labelW: number;
    clean: (s: string) => string;
  },
) {
  const { cx, cy, R, reg, bold, labelSize, labelW, clean } = o;
  const n = v.spheres.length;
  // PDF y axis is up; angle measured clockwise from top
  const ang = (i: number) => Math.PI / 2 - (i * 2 * Math.PI) / n;
  const at = (i: number, val: number) => polar(cx, cy, (val / 10) * R, ang(i));

  for (let k = 1; k <= 10; k++) {
    p.drawCircle({
      x: cx,
      y: cy,
      size: (k / 10) * R,
      borderColor: k === 5 || k === 10 ? GRID_STRONG : GRID,
      borderWidth: k === 10 ? 0.9 : 0.5,
    });
  }
  for (let i = 0; i < n; i++) {
    const e = polar(cx, cy, R, ang(i));
    p.drawLine({ start: { x: cx, y: cy }, end: e, thickness: 0.5, color: GRID });
  }
  for (const k of [2, 4, 6, 8, 10]) {
    p.drawText(String(k), { x: cx + 2, y: cy + (k / 10) * R - 8, size: 6.5, font: reg, color: MUTED });
  }

  const now = v.spheres.map((s) => s.now);
  const after = v.spheres.map((s) => s.after);
  const drawSegs = (scores: (number | null)[], cb: (a: { x: number; y: number }, b: { x: number; y: number }) => void) => {
    for (const seg of wheelSegments(scores)) {
      const closed = seg.length === n && n > 0;
      for (let j = 0; j < seg.length - (closed ? 0 : 1); j++) {
        const a = seg[j]!;
        const b = seg[(j + 1) % seg.length]!;
        cb(at(a, scores[a]!), at(b, scores[b]!));
      }
    }
  };
  // 1) thick solid "now"
  drawSegs(now, (a, b) =>
    p.drawLine({ start: a, end: b, thickness: 2.6, color: NOW, lineCap: LineCapStyle.Round }),
  );
  // 2) light gap under dashed, 3) thin dashed "after"
  drawSegs(after, (a, b) => p.drawLine({ start: a, end: b, thickness: 2.8, color: WHITE, dashArray: [5, 3] }));
  drawSegs(after, (a, b) => p.drawLine({ start: a, end: b, thickness: 1.3, color: AFTER, dashArray: [5, 3] }));
  // markers
  v.spheres.forEach((s, i) => {
    if (s.now !== null) {
      const q = at(i, s.now);
      p.drawCircle({ x: q.x, y: q.y, size: 3.6, color: NOW, borderColor: WHITE, borderWidth: 0.8 });
    }
  });
  v.spheres.forEach((s, i) => {
    if (s.after !== null) {
      const q = at(i, s.after);
      p.drawRectangle({ x: q.x - 3, y: q.y - 3, width: 6, height: 6, color: WHITE, borderColor: AFTER, borderWidth: 1.4 });
    }
  });

  // labels
  const lh = labelSize * 1.22;
  v.spheres.forEach((s, i) => {
    const a = ang(i);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const isP = s.id === v.primary;
    const f = isP ? bold : reg;
    let lines = wrap(clean(s.name), f, labelSize, labelW);
    if (lines.length > 4) lines = [...lines.slice(0, 3), lines[3] + "..."];
    const fmt = (x: number | null) => (x === null ? "—" : String(x));
    const scoreTxt = clean(`${fmt(s.now)} / ${fmt(s.after)}`);
    const all = [...lines.map((t) => ({ t, f, size: labelSize, color: INK })), { t: scoreTxt, f: bold, size: labelSize, color: MUTED }];
    if (isP) all.push({ t: clean("основная сфера"), f: reg, size: labelSize - 1.5, color: NOW });
    const blockH = all.length * lh;
    const anchor = polar(cx, cy, R + 12, a);
    let topY: number;
    if (sin > 0.6) topY = anchor.y + blockH; // above circle
    else if (sin < -0.6) topY = anchor.y - 2;
    else topY = anchor.y + blockH / 2;
    all.forEach((ln, j) => {
      const w = ln.f.widthOfTextAtSize(ln.t, ln.size);
      const x = Math.abs(cos) < 0.25 ? anchor.x - w / 2 : cos > 0 ? anchor.x : anchor.x - w;
      p.drawText(ln.t, { x, y: topY - (j + 1) * lh + 2, size: ln.size, font: ln.f, color: ln.color });
    });
  });
}
