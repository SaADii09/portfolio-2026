import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WindowSlice, createWindowSlice } from "./windowSlice";
import { ThemeSlice, createThemeSlice } from "./themeSlice";
import { WidgetSlice, createWidgetSlice } from "./widgetSlice";
import { ChatSlice, createChatSlice } from "./chatSlice";
import { MusicSlice, createMusicSlice } from "./musicSlice";
import { UiSlice, createUiSlice } from "./uiSlice";
import { BrowserSlice, createBrowserSlice } from "./browserSlice";

export type AppStore = WindowSlice &
  ThemeSlice &
  WidgetSlice &
  ChatSlice &
  MusicSlice &
  UiSlice &
  BrowserSlice;

/**
 * The slice of `AppStore` written to localStorage.
 *
 * Every key is a real store field, so rehydration lands on the same field it was
 * read from. In particular music is persisted as top-level `volume` /
 * `currentTrack` (the names the music slice declares) rather than nested under a
 * synthetic `music` key, which rehydrated as a stray key and silently dropped the
 * user's volume and current track.
 *
 * The browser slice's state (`browserWindows`, `readmeLru`, `metaLru`,
 * `pendingSlug`, `sidePanelOpen`) is deliberately NOT persisted — browser
 * sessions are ephemeral per spec §7, and the migrator below drops any stray
 * browser keys an old localStorage blob might carry.
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
  | "lastGeometry"
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
    lastGeometry: state.lastGeometry,
    volume: state.volume,
    currentTrack: state.currentTrack,
  };
}

/**
 * Defaults for every persisted key, captured from the real slices at module
 * load so this mapping can never drift from what the slices actually declare.
 * (The audio engine is only touched by actions, never at slice construction.)
 */
function createPersistedDefaults(): PersistedAppState {
  const store = {} as AppStore;
  const set = (partial: Partial<AppStore> | ((s: AppStore) => Partial<AppStore>)) => {
    Object.assign(store, typeof partial === "function" ? partial(store) : partial);
  };
  const get = () => store;
  // Same reasoning as the test harness: slices only use `set`/`get`.
  const api = {} as never;
  Object.assign(
    store,
    createWindowSlice(set, get, api),
    createThemeSlice(set, get, api),
    createWidgetSlice(set, get, api),
    createMusicSlice(set, get, api),
  );
  return persistPartialize(store);
}

const PERSISTED_DEFAULTS = createPersistedDefaults();

/**
 * Migration for zustand-persist: merges an old persisted value over the
 * current defaults, then reshapes through `persistPartialize` so unknown or
 * obsolete keys drop and every persisted key rehydrates onto its own field.
 * Merge order is pinned: defaults first, persisted values on top — the
 * reverse would clobber the user's state with defaults.
 */
export function persistMigrator(persisted: unknown, _fromVersion: number): PersistedAppState {
  return persistPartialize(mergePersisted(persisted));
}

function mergePersisted(persisted: unknown): AppStore {
  const old = isRecord(persisted) ? persisted : {};
  return { ...PERSISTED_DEFAULTS, ...old } as AppStore;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
      ...createBrowserSlice(...a),
    }),
    {
      name: "devos-store",
      version: 1,
      partialize: persistPartialize,
      migrate: persistMigrator,
    },
  ),
);
