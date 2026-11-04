import { PDFName, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { publicToolUrl } from "./public-url";

const SIZE = 9;
const LINE_HEIGHT = 13;
const INK = rgb(0.25, 0.25, 0.25);
const RULE = rgb(0.82, 0.82, 0.82);
const LINKS = [
  { text: "Открыть инструмент", url: publicToolUrl() },
  { text: "make-it-done.pro", url: "https://make-it-done.pro/" },
  { text: "t.me/catsandcoaching", url: "https://t.me/catsandcoaching" },
];

function linkRows(font: PDFFont, width: number) {
  const gap = font.widthOfTextAtSize(" · ", SIZE);
  const rows: Array<Array<(typeof LINKS)[number]>> = [[]];
  let used = 0;
  for (const link of LINKS) {
    const w = font.widthOfTextAtSize(link.text, SIZE);
    if (used && used + gap + w > width) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1]?.push(link);
    used += (used ? gap : 0) + w;
  }
  return rows;
}

export function pdfContentBottom(font: PDFFont, width: number) {
  return 28 + linkRows(font, width).length * LINE_HEIGHT + 33 + 16;
}

export function drawPdfFooter(page: PDFPage, font: PDFFont, margin: number, index: number, total: number) {
  const width = page.getWidth() - 2 * margin;
  const rows = linkRows(font, width);
  const authorY = 28 + rows.length * LINE_HEIGHT + 7;
  const ruleY = authorY + 16;
  page.drawLine({ start: { x: margin, y: ruleY }, end: { x: page.getWidth() - margin, y: ruleY }, thickness: 0.5, color: RULE });
  page.drawText("Колесо баланса · Анна Доманицкая", { x: margin, y: authorY, size: SIZE, font, color: INK });
  const number = `${index + 1} / ${total}`;
  page.drawText(number, { x: page.getWidth() - margin - font.widthOfTextAtSize(number, SIZE), y: authorY, size: SIZE, font, color: INK });
  rows.forEach((row, rowIndex) => {
    let x = margin;
    const y = authorY - (rowIndex + 1) * LINE_HEIGHT;
    row.forEach((link, i) => {
      if (i) {
        page.drawText(" · ", { x, y, size: SIZE, font, color: INK });
        x += font.widthOfTextAtSize(" · ", SIZE);
      }
      const w = font.widthOfTextAtSize(link.text, SIZE);
      page.drawText(link.text, { x, y, size: SIZE, font, color: INK });
      if (link.url) {
        page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + w, y: y - 1.5 }, thickness: 0.5, color: INK });
        const annotation = page.doc.context.register(page.doc.context.obj({
          Type: "Annot", Subtype: "Link", Rect: [x, y - 3, x + w, y + SIZE],
          Border: [0, 0, 0], A: { Type: "Action", S: "URI", URI: PDFString.of(link.url) },
        }));
        page.node.addAnnot(annotation);
      }
      x += w;
    });
  });
}