import { openApp, openBrowser, musicControl, setThemeByName, toggleWidget } from "@/lib/os-actions";
import type { MusicAction } from "@/lib/os-actions";
import { resolveAppId } from "@/lib/apps";
import type { WidgetType } from "@/types/widget";
import type { ActionRef } from "./actions";

/**
 * Client-only execution half of the marker protocol (controller ruling):
 * maps a parsed `ActionRef` onto the existing `os-actions.ts` choke point.
 * Kept out of `actions.ts` so the server route can import the PURE parser
 * without bundling the Zustand store.
 *
 * Never throws: an unknown verb or an unresolvable arg is a silent `false`
 * (actions are progressive enhancement, never load-bearing).
 */
export function executeMarkerAction(a: ActionRef): boolean {
  switch (a.verb) {
    case "open_app": {
      const id = a.arg ? resolveAppId(a.arg) : null;
      if (!id) return false;
      openApp(id);
      return true;
    }
    case "open_project": {
      if (!a.arg) return false;
      openBrowser(a.arg);
      return true;
    }
    case "set_theme":
      return a.arg ? setThemeByName(a.arg) : false;
    case "music": {
      if (!a.arg) return false;
      // The parser validated the arg against MUSIC_ACTIONS already; the cast
      // re-states that contract at the boundary (spec ruling).
      musicControl(a.arg as MusicAction);
      return true;
    }
    case "toggle_widget": {
      if (!a.arg) return false;
      // Same: parser validated against WIDGET_DEFS.
      toggleWidget(a.arg as WidgetType);
      return true;
    }
    default:
      // Unreachable for a parsed marker; guards hand-built refs at runtime.
      return false;
  }
}
