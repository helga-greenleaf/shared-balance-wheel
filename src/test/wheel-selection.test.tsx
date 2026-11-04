import { describe, expect, it } from "vitest";
import { canSelectAdditional, docToView, initialFields, scoreTargetsForMode, type Doc } from "@/lib/wheel/model";
import { viewToFile, wheelFileSchema } from "@/lib/wheel/file-schema";

const doc: Doc = Object.fromEntries(Object.entries(initialFields("2026-11-04")).map(([k, v]) => [k, {v, r: 1}]));
const view = docToView(doc);
const ids = view.spheres.map(s => s.id);

describe("sphere selection", () => {
  it("allows up to two additional spheres, but blocks a third", () => {
    expect(canSelectAdditional({ primary: null, additional: ids.slice(0, 1) }, ids[2] ?? "")).toBe(true);
    expect(canSelectAdditional({ primary: null, additional: ids.slice(0, 2) }, ids[2] ?? "")).toBe(false);
    expect(canSelectAdditional({ primary: null, additional: ids.slice(0, 2) }, ids[0] ?? "")).toBe(true);
  });
  it("excludes the primary sphere from additional choices", () => {
    expect(canSelectAdditional({ primary: ids[0] ?? null, additional: [] }, ids[0] ?? "")).toBe(false);
  });
  it("preserves two additional selections in saved files and accepts legacy files", () => {
    const f = viewToFile({...view, primary: ids[0] ?? null, additional: ids.slice(1, 3)});
    expect(wheelFileSchema.parse(f).additionalSphereIds).toEqual(ids.slice(1, 3));
    delete f.additionalSphereIds;
    expect(wheelFileSchema.parse(f).additionalSphereIds).toEqual([]);
  });
  it("rejects saved files with three additional spheres or a primary overlap", () => {
    expect(wheelFileSchema.safeParse(viewToFile({...view, additional: ids.slice(0, 3)})).success).toBe(false);
    expect(wheelFileSchema.safeParse(viewToFile({...view, primary: ids[0] ?? null, additional: ids.slice(0, 1)})).success).toBe(false);
  });
  it("matches card score targets to each wheel mode", () => {
    expect(scoreTargetsForMode("now")).toEqual(["now"]);
    expect(scoreTargetsForMode("after")).toEqual(["after"]);
    expect(scoreTargetsForMode("both")).toEqual(["now", "after"]);
  });
});