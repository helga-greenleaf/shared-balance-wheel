import { describe, expect, it } from "vitest";
import { docToView, formatDiff, initialFields, parseScore, UNTITLED, type Doc } from "@/lib/wheel/model";
import { parseWheelFile, viewToFile } from "@/lib/wheel/file-schema";
import { wheelSegments } from "@/lib/wheel/geometry";

const toDoc = (f: Record<string, unknown>): Doc =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { v, r: 1 }]));

describe("wheel model", () => {
  it("starts with six untitled spheres and no scores", () => {
    const v = docToView(toDoc(initialFields("2026-11-04")));
    expect(v.spheres).toHaveLength(6);
    expect(v.title).toBe("Колесо баланса 2027");
    expect(new Set(v.spheres.map((s) => s.id)).size).toBe(6);
    for (const s of v.spheres) {
      expect(s.name).toBe(UNTITLED);
      expect(s.now).toBeNull();
      expect(s.after).toBeNull();
    }
  });

  it("accepts 1 and 10, rejects 0, 11 and fractions", () => {
    expect(parseScore("1")).toBe(1);
    expect(parseScore("10")).toBe(10);
    expect(parseScore("")).toBeNull();
    expect(parseScore("0")).toBeUndefined();
    expect(parseScore("11")).toBeUndefined();
    expect(parseScore("5.5")).toBeUndefined();
  });

  it("formats differences neutrally", () => {
    expect(formatDiff(4, 6)).toBe("+2");
    expect(formatDiff(5, 5)).toBe("0");
    expect(formatDiff(5, 4)).toBe("−1");
    expect(formatDiff(null, 4)).toBeNull();
  });

  it("breaks contour on missing scores", () => {
    expect(wheelSegments([1, 2, null, 4, 5, null])).toEqual([[3, 4], [0, 1]]);
    expect(wheelSegments([null, null])).toEqual([]);
  });

  it("round-trips through the save file and rejects bad files", () => {
    const v = docToView(toDoc(initialFields("2026-11-04")));
    v.spheres[0]!.now = 4;
    v.spheres[0]!.max = "Абзац 1\n\nАбзац 2";
    const text = JSON.stringify(viewToFile(v));
    expect(text).not.toContain("secret");
    expect(parseWheelFile(text).ok).toBe(true);
    const bad = JSON.parse(text);
    bad.spheres[0].scoreNow = 11;
    expect(parseWheelFile(JSON.stringify(bad)).ok).toBe(false);
    const few = JSON.parse(text);
    few.spheres = few.spheres.slice(0, 5);
    expect(parseWheelFile(JSON.stringify(few)).ok).toBe(false);
    expect(parseWheelFile("not json").ok).toBe(false);
  });
});
