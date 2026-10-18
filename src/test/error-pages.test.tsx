import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorPage from "@/app/error";
import GlobalError from "@/app/global-error";

// Keep jsdom quiet: the tested modules import globals.css, and jsdom cannot
// parse Tailwind v4 output (color-mix, @property, nesting).
vi.mock("@/app/globals.css", () => ({}));

// Client renderers are mounted inside a <div> by RTL, and React refuses to
// nest raw <html> there — the raw-document contract is verified statically.
function globalErrorMarkup(): string {
  return renderToStaticMarkup(<GlobalError error={new Error("boom")} reset={vi.fn()} />);
}

function renderErrorPage(reset: () => void = vi.fn()) {
  return render(<ErrorPage error={new Error("boom")} reset={reset} />);
}

function renderGlobalError(reset: () => void = vi.fn()) {
  return render(<GlobalError error={new Error("boom")} reset={reset} />);
}

describe("ErrorPage", () => {
  it("renders the crash copy", () => {
    renderErrorPage();

    expect(screen.getByText("Something went wrong in the OS.")).toBeInTheDocument();
  });

  it("clicking Reset calls the reset prop", () => {
    const reset = vi.fn();
    renderErrorPage(reset);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("GlobalError", () => {
  it("renders the crash copy", () => {
    renderGlobalError();

    expect(screen.getByText("Something went wrong in the OS.")).toBeInTheDocument();
  });

  it("renders raw <html> and <body> (global-error replaces the root layout)", () => {
    const markup = globalErrorMarkup();

    expect(markup.startsWith("<html")).toBe(true);
    expect(markup).toContain("<body>");
    expect(markup).toContain("Something went wrong in the OS.");
  });

  it("clicking Reset calls the reset prop", () => {
    const reset = vi.fn();
    renderGlobalError(reset);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
