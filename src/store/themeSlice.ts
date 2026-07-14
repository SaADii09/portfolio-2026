import { StateCreator } from "zustand";
import { ThemeName } from "@/types/theme";

export interface ThemeSlice {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

export const createThemeSlice: StateCreator<ThemeSlice> = (set) => ({
  theme: "retro",
  setTheme: (theme) => set({ theme }),
});
