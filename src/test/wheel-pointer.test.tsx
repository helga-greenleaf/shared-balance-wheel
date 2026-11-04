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
    fireEvent.pointerDown(sector, { pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith("sphere-0");
  });
});