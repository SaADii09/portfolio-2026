import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlassSlider } from "@/components/os/GlassSlider";

describe("GlassSlider", () => {
  it("renders label, formatted readout, and a range input bound to the value", () => {
    render(
      <GlassSlider
        label="Blur"
        value={20}
        min={0}
        max={40}
        step={5}
        onChange={vi.fn()}
        format={(v) => `${v}px`}
        ariaLabel="Glass blur intensity"
      />,
    );
    expect(screen.getByText("Blur")).toBeDefined();
    expect(screen.getByText("20px")).toBeDefined();
    const slider = screen.getByLabelText("Glass blur intensity");
    expect(slider).toHaveValue("20");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "40");
    expect(slider).toHaveAttribute("step", "5");
  });

  it("calls onChange with a number when the slider moves", () => {
    const onChange = vi.fn();
    render(
      <GlassSlider
        label="Blur"
        value={20}
        min={0}
        max={40}
        onChange={onChange}
        format={(v) => `${v}px`}
        ariaLabel="Glass blur intensity"
      />,
    );
    fireEvent.change(screen.getByLabelText("Glass blur intensity"), { target: { value: "32" } });
    expect(onChange).toHaveBeenCalledWith(32);
  });

  it("omits the readout when no formatter is given", () => {
    render(
      <GlassSlider label="" value={70} min={0} max={100} onChange={vi.fn()} ariaLabel="Volume" />,
    );
    expect(screen.getByLabelText("Volume")).toHaveValue("70");
    expect(screen.queryByText("70")).toBeNull();
  });

  it("renders no label element for an empty label (icon-only rows)", () => {
    const { container } = render(
      <GlassSlider label="" value={70} min={0} max={100} onChange={vi.fn()} ariaLabel="Volume" />,
    );
    expect(container.querySelector("label")).toBeNull();
  });

  it("compact drops the fixed label width", () => {
    const { container } = render(
      <GlassSlider
        label="Volume"
        value={70}
        min={0}
        max={100}
        onChange={vi.fn()}
        ariaLabel="Volume"
        compact
      />,
    );
    expect(container.querySelector("label")?.className).not.toContain("w-12");
  });
});
