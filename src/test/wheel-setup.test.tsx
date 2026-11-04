import { describe, expect, it } from "vitest";
import { docToView, initialFields, MAX_SPHERES, type Doc } from "@/lib/wheel/model";
import { sectorColors } from "@/lib/wheel/colors";

const toDoc = (f: Record<string, unknown>): Doc =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { v, r: 1 }]));

describe("setup stage", () => {
  it("treats sessions without a setup flag as completed (old sessions and imports)", () => {
    const v = docToView(toDoc(initialFields("2026-11-04")));
    expect(v.setupDone).toBe(true);
    expect(v.spheres).toHaveLength(6);
  });

  it("new sessions start in setup with no spheres and no scores", () => {
    const f = initialFields("2026-11-04", [], { setup: false });
    expect(Object.keys(f).some((k) => k.startsWith("s:"))).toBe(false);
    const v = docToView(toDoc(f));
    expect(v.setupDone).toBe(false);
    expect(v.spheres).toHaveLength(0);
  });

  it("reads the synced draft list and ignores junk", () => {
    const f = initialFields("2026-11-04", [], { setup: false });
    f["setupList"] = ["Здоровье", " Семья ", 42, null];
    expect(docToView(toDoc(f)).setupList).toEqual(["Здоровье", " Семья "]);
    f["setupList"] = Array.from({ length: MAX_SPHERES + 3 }, (_, i) => `С${i}`);
    expect(docToView(toDoc(f)).setupList).toHaveLength(MAX_SPHERES);
    f["setupList"] = "не массив";
    expect(docToView(toDoc(f)).setupList).toEqual([]);
  });

  it("an explicit setup=true flag marks setup done even with no spheres", () => {
    const f = initialFields("2026-11-04", [], { setup: true });
    expect(docToView(toDoc(f)).setupDone).toBe(true);
  });
});

describe("sector colors", () => {
  it("are stable for the same id, with a distinct active variant", () => {
    const id = "4287b3ea-f39f-42bd-ae79-08ff83cdc6b1";
    expect(sectorColors(id)).toEqual(sectorColors(id));
    expect(sectorColors(id).base).not.toBe(sectorColors(id).active);
  });

  it("spread different ids across the palette", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
    const distinct = new Set(ids.map((id) => sectorColors(id).base));
    expect(distinct.size).toBeGreaterThanOrEqual(10);
  });
});
