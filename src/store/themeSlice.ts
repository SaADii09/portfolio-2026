import { StateCreator } from "zustand";
import { ThemeName } from "@/types/theme";

export interface ThemeSlice {
  theme: ThemeName;
  customTokens: Record<string, string>;
  setTheme: (theme: ThemeName) => void;
  updateCustomToken: (key: string, value: string) => void;
  resetCustomTokens: () => void;
}

export const createThemeSlice: StateCreator<ThemeSlice> = (set) => ({
  theme: "retro",
  customTokens: {},

  setTheme: (theme) => set({ theme }),

  updateCustomToken: (key, value) => {
    set((s) => ({
      customTokens: { ...s.customTokens, [key]: value },
    }));
  },

  resetCustomTokens: () => set({ customTokens: {} }),
});
