import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WindowSlice, createWindowSlice } from "./windowSlice";
import { ThemeSlice, createThemeSlice } from "./themeSlice";
import { WidgetSlice, createWidgetSlice } from "./widgetSlice";
import { ChatSlice, createChatSlice } from "./chatSlice";
import { MusicSlice, createMusicSlice } from "./musicSlice";

export type AppStore = WindowSlice & ThemeSlice & WidgetSlice & ChatSlice & MusicSlice;

export const useStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createWindowSlice(...a),
      ...createThemeSlice(...a),
      ...createWidgetSlice(...a),
      ...createChatSlice(...a),
      ...createMusicSlice(...a),
    }),
    {
      name: "devos-store",
      partialize: (state) => ({
        theme: state.theme,
        customTokens: state.customTokens,
        glassBlur: state.glassBlur,
        glassSaturate: state.glassSaturate,
        glassOpacity: state.glassOpacity,
        windows: state.windows,
        widgets: state.widgets,
        music: { volume: state.volume, currentTrack: state.currentTrack },
      }),
    },
  ),
);
