import { StateCreator } from "zustand";
import { ThemeName } from "@/types/theme";

const THEME_GLASS_DEFAULTS: Record<ThemeName, { blur: number; saturate: number; opacity: number }> = {
  retro: { blur: 0, saturate: 100, opacity: 70 },
  neon: { blur: 24, saturate: 225, opacity: 60 },
  editorial: { blur: 20, saturate: 160, opacity: 70 },
};

export interface ThemeSlice {
  theme: ThemeName;
  customTokens: Record<string, string>;
  glassBlur: number;
  glassSaturate: number;
  glassOpacity: number;
  setTheme: (theme: ThemeName) => void;
  updateCustomToken: (key: string, value: string) => void;
  resetCustomTokens: () => void;
  setGlassBlur: (v: number) => void;
  setGlassSaturate: (v: number) => void;
  setGlassOpacity: (v: number) => void;
  resetGlass: () => void;
}

export const createThemeSlice: StateCreator<ThemeSlice> = (set) => ({
  theme: "retro",
  customTokens: {},
  glassBlur: 0,
  glassSaturate: 100,
  glassOpacity: 70,

  setTheme: (theme) =>
    set((state) => {
      const g = THEME_GLASS_DEFAULTS[theme];
      const ct = { ...state.customTokens };
      ct["glass-blur"] = `${g.blur}px`;
      ct["glass-saturate"] = `${g.saturate}%`;
      ct["glass-opacity-light"] = `${Math.round(g.opacity * 0.67)}%`;
      ct["glass-opacity-dark"] = `${g.opacity}%`;
      return {
        theme,
        glassBlur: g.blur,
        glassSaturate: g.saturate,
        glassOpacity: g.opacity,
        customTokens: ct,
      };
    }),

  updateCustomToken: (key, value) => {
    set((s) => ({
      customTokens: { ...s.customTokens, [key]: value },
    }));
  },

  resetCustomTokens: () => set({ customTokens: {} }),

  setGlassBlur: (v) =>
    set((s) => ({
      glassBlur: v,
      customTokens: { ...s.customTokens, "glass-blur": `${v}px` },
    })),

  setGlassSaturate: (v) =>
    set((s) => ({
      glassSaturate: v,
      customTokens: { ...s.customTokens, "glass-saturate": `${v}%` },
    })),

  setGlassOpacity: (v) =>
    set((s) => ({
      glassOpacity: v,
      customTokens: {
        ...s.customTokens,
        "glass-opacity-light": `${Math.round(v * 0.67)}%`,
        "glass-opacity-dark": `${v}%`,
      },
    })),

  resetGlass: () =>
    set((s) => {
      const ct = { ...s.customTokens };
      delete ct["glass-blur"];
      delete ct["glass-saturate"];
      delete ct["glass-opacity-light"];
      delete ct["glass-opacity-dark"];
      const g = THEME_GLASS_DEFAULTS[s.theme];
      return {
        glassBlur: g.blur,
        glassSaturate: g.saturate,
        glassOpacity: g.opacity,
        customTokens: ct,
      };
    }),
});
