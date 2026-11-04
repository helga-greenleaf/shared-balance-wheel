import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WheelChart } from "@/components/wheel/WheelChart";

describe("mouse-only wheel scores", () => {
  it("does not change a score through arrows or number keys", () => {
    const onScore = vi.fn();
    const onSelect = vi.fn();
    const { getByLabelText } = render(
      <WheelChart spheres={Array.from({ length: 6 }, (_, i) => ({
        id: `sphere-${i}`, pos: i, name: `Сфера ${i}`, now: 4, after: null,
        max: "", cur: "", aft: "",
      }))} mode="now" target="now" primary={null} selectedId={null}
        onSelect={onSelect} onScore={onScore} onRename={vi.fn()} />,
    );
    const sector = getByLabelText("Сфера 0: Сейчас");
    for (const key of ["ArrowUp", "ArrowDown", "5", "0", "Enter"]) fireEvent.keyDown(sector, { key });
    expect(onScore).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    const svg = sector.closest("svg");
    if (!svg) throw new Error("Wheel SVG missing");
    Object.defineProperty(svg, "createSVGPoint", { value: () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 410, y: 272.5 }) }) });
    Object.defineProperty(svg, "getScreenCTM", { value: () => ({ inverse: () => ({}) }) });
    fireEvent.pointerDown(sector, { pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith("sphere-0");
    expect(onScore).toHaveBeenCalledWith("sphere-0", "now", 5);
  });
});