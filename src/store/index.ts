import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WindowSlice, createWindowSlice } from "./windowSlice";
import { ThemeSlice, createThemeSlice } from "./themeSlice";
import { WidgetSlice, createWidgetSlice } from "./widgetSlice";
import { ChatSlice, createChatSlice } from "./chatSlice";
import { MusicSlice, createMusicSlice } from "./musicSlice";
import { UiSlice, createUiSlice } from "./uiSlice";

export type AppStore = WindowSlice & ThemeSlice & WidgetSlice & ChatSlice & MusicSlice & UiSlice;

/**
 * The slice of `AppStore` written to localStorage.
 *
 * Every key is a real store field, so rehydration lands on the same field it was
 * read from. In particular music is persisted as top-level `volume` /
 * `currentTrack` (the names the music slice declares) rather than nested under a
 * synthetic `music` key, which rehydrated as a stray key and silently dropped the
 * user's volume and current track.
 */
export type PersistedAppState = Pick<
  AppStore,
  | "theme"
  | "customTokens"
  | "glassBlur"
  | "glassSaturate"
  | "glassOpacity"
  | "windows"
  | "widgets"
  | "volume"
  | "currentTrack"
>;

export function persistPartialize(state: AppStore): PersistedAppState {
  return {
    theme: state.theme,
    customTokens: state.customTokens,
    glassBlur: state.glassBlur,
    glassSaturate: state.glassSaturate,
    glassOpacity: state.glassOpacity,
    windows: state.windows,
    widgets: state.widgets,
    volume: state.volume,
    currentTrack: state.currentTrack,
  };
}

export const useStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createWindowSlice(...a),
      ...createThemeSlice(...a),
      ...createWidgetSlice(...a),
      ...createChatSlice(...a),
      ...createMusicSlice(...a),
      ...createUiSlice(...a),
    }),
    {
      name: "devos-store",
      partialize: persistPartialize,
    },
  ),
);
