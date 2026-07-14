"use client";

import { useEffect } from "react";
import { useStore } from "@/store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useStore((s) => s.theme);
  const customTokens = useStore((s) => s.customTokens);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);

    const overrides: string[] = [];
    for (const [key, value] of Object.entries(customTokens)) {
      const prop = `--${key}`;
      root.style.setProperty(prop, value);
      overrides.push(prop);
    }

    return () => {
      for (const prop of overrides) {
        root.style.removeProperty(prop);
      }
    };
  }, [theme, customTokens]);

  return <>{children}</>;
}
