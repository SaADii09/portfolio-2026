import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WindowSlice, createWindowSlice } from "./windowSlice";
import { ThemeSlice, createThemeSlice } from "./themeSlice";

export type AppStore = WindowSlice & ThemeSlice;

export const useStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createWindowSlice(...a),
      ...createThemeSlice(...a),
    }),
    {
      name: "devos-store",
      partialize: (state) => ({
        theme: state.theme,
        windows: state.windows,
      }),
    }
  )
);
