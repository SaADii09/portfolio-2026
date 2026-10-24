import { openApp, openBrowser, musicControl, setThemeByName, toggleWidget } from "@/lib/os-actions";
import type { MusicAction } from "@/lib/os-actions";
import { resolveAppId } from "@/lib/apps";
import type { WidgetType } from "@/types/widget";
import type { ActionRef, ChatActionVerb } from "./actions";

/**
 * Client-only execution half of the marker protocol (controller ruling):
 * maps a parsed `ActionRef` onto the existing `os-actions.ts` choke point.
 * Kept out of `actions.ts` so the server route can import the PURE parser
 * without bundling the Zustand store.
 *
 * Never throws: an unknown verb or an unresolvable arg is a silent `false`
 * (actions are progressive enhancement, never load-bearing).
 */
const MARKER_HANDLERS: Record<ChatActionVerb, (arg: string | undefined) => boolean> = {
  open_app: (arg) => {
    const id = arg ? resolveAppId(arg) : null;
    if (!id) return false;
    openApp(id);
    return true;
  },
  open_project: (arg) => {
    // Trust boundary: the parser already validated the slug against
    // PROJECTS (`ARG_VALIDATORS.open_project`); the executor just forwards it.
    if (!arg) return false;
    openBrowser(arg);
    return true;
  },
  set_theme: (arg) => (arg ? setThemeByName(arg) : false),
  music: (arg) => {
    if (!arg) return false;
    // The parser validated the arg against MUSIC_ACTIONS already; the cast
    // re-states that contract at the boundary (spec ruling).
    musicControl(arg as MusicAction);
    return true;
  },
  toggle_widget: (arg) => {
    if (!arg) return false;
    // Same: parser validated against WIDGET_DEFS.
    toggleWidget(arg as WidgetType);
    return true;
  },
};

export function executeMarkerAction(a: ActionRef): boolean {
  // A table lookup tolerates an unknown verb at runtime (hand-built refs)
  // where a switch would: undefined handler → false, never a throw.
  const handler = MARKER_HANDLERS[a.verb];
  return handler ? handler(a.arg) : false;
}
