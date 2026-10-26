# DevOS — Complete User Guide

Everything the portfolio can do, how to use it, and where it lives in the code. Feature → file details live in [`FeatureMap.md`](./FeatureMap.md); design tokens and constraints in [`docs/Design.md`](./docs/Design.md); architecture in [`docs/Architecture.md`](./docs/Architecture.md).

DevOS is a fully functional desktop environment that runs in the browser: a boot screen, a desktop with icons, draggable windows, a dock, widgets, three themes, a terminal, a file-browser with real websites, and an AI assistant that can actually operate the OS for you.

---

## 1. First visit — a 60-second walkthrough

1. **Boot screen** — a short fake-OS boot with glitch effects, then the desktop fades in.
2. **The desktop** — app icons down the left side (double-click, or press `Enter` after focusing), widgets stacked on the right, a live canvas wallpaper behind everything.
3. **Open your first window** — double-click **About Me**. A window appears with a glass header (drag it), 8 resize handles, minimize/maximize/close buttons.
4. **Look at the top bar** — "DevOS" on the left; the live clock in the center (hover for the full date, click for a calendar); the grid icon on the right opens the **control center** (theme dots, volume, music transport, settings shortcut).
5. **Look at the bottom** — the **dock** appears once a window is open (it shows only open windows; hover for tooltips, click to focus, right-click for window actions).
6. **Press `Ctrl/Cmd + K`** — the **command palette** opens. Type "neon", hit `Enter`: the whole OS re-skins to Neon City.
7. **Open the Terminal** (`>_` icon) and type `help` — every command is listed; try `neofetch` and `open about`.
8. **Open the Browser** (globe icon) — a Chrome-style start page with shortcut tiles and your live projects.
9. **Open Dev Chat** (bottom-left icon) — the AI assistant. Ask "What projects has Saad built?" or tell it "open the terminal" — it answers **and** acts.
10. Reload the page — theme, open windows, widget positions, chat history, and music state all come back.

---

## 2. Desktop & window management

| Action | How |
| --- | --- |
| Open an app | Double-click a desktop icon · right-click desktop → app · Start menu · command palette · terminal `open <app>` |
| Move a window | Drag its header (anywhere on the header; context menu on right-click / long-press) |
| Resize | Drag any of the 8 edges/corners (desktop) or the 3 grip handles (mobile) |
| Focus | Click anywhere on a window; it rises in z-order and the dock highlights it |
| Minimize / maximize / restore | Header buttons, dock/taskbar right-click menu, or `Alt+↑` / `Alt+↓` |
| Snap left / right half | `Alt+←` / `Alt+→` (half the screen, full safe-zone height) |
| Close | Header ✕ · `Ctrl/Cmd+W` · `Escape` when focused · dock/taskbar right-click |
| Geometry memory | Each app remembers its last size/position across close **and** reload (`lastGeometry`) |
| Floors | Every app has a minimum height (contact 500px … terminal 200px) — you cannot shrink a window past the point where its main action disappears; a stale saved size from before this rule clamps back up automatically |
| Safe zones | Windows can never overlap the top bar or dock (desktop) or status bar / task bar (mobile); the browser start page compacts itself in short windows |

Windows cascade on open at per-app default sizes and anchor slots. Position/size are GPU-composited (`translate`) and rAF-batched, so dragging stays smooth.

## 3. Right-click & long-press menus

Glass context menus (keyboard-traversable, focus-restoring) open on: desktop (Refresh + all apps), window headers (window actions), widget headers, dock icons, taskbar items, desktop icons. On touch devices, **long-press (500 ms)** replaces right-click. Desktop **Refresh** blinks the icons and reloads the page.

## 4. Command palette — `Ctrl/Cmd + K`

Fuzzy-searches and runs: **all 8 apps**, **3 themes**, **widget show/hide** (4), **music transport** (play/pause/next/prev), and **focus/restore for each open window** (dynamic). `↑`/`↓` to move, `Enter` to run, `Tab` traps focus, `Escape` closes. Works even while typing in a text field.

## 5. Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Ctrl/Cmd + K` | Command palette |
| `Ctrl/Cmd + W` | Close the focused window |
| `Escape` | Close the topmost transient surface (context menu → dropdowns → palette); with a window focused and nothing else open, closes that window |
| `Alt + ←` / `Alt + →` | Snap active window to left / right half |
| `Alt + ↑` / `Alt + ↓` | Maximize / restore |
| `Enter` (on a focused icon/menu item) | Launch / activate |
| `←` `→` `Home` `End` `Delete` | Browser tab-strip navigation |

All shortcuts yield to text entry (except `Ctrl/Cmd+K`) and honour `prefers-reduced-motion`.

## 6. Terminal

Open from the `>_` icon. Every command (full engine: `src/lib/terminal-commands.ts`):

| Command | Effect |
| --- | --- |
| `help` | Command list |
| `whoami` | Saad — title |
| `about` | Bio summary |
| `projects` | Numbered project list |
| `resume` | Experience + education summary |
| `contact` | Email / LinkedIn / GitHub |
| `theme` | Print current theme |
| `theme retro\|neon\|editorial` | **Switch the OS theme** |
| `open <app>` | **Open any app** (aliases: `settings` → control-panel, `cv` → resume) |
| `music` | Now playing |
| `music play\|pause\|toggle\|next\|prev` | **Drive the music player** |
| `apps` | All apps with ids |
| `ls` | App ids |
| `date` / `echo <text>` / `clear` | Utilities |
| `banner` | ASCII "DEVOS" |
| `neofetch` | Fake system info (Uptime: way too long) |
| `sudo` | ⛔ Nice try. |

## 7. The apps

- **About Me** — bio, skills, summary (content from `src/lib/portfolio-data.ts`).
- **Projects** — the project grid. Clicking a card opens it in the **Browser** as a project tab.
- **DevOS Browser** — see §9.
- **Control Panel** (alias `settings`) — theme swatches, the **glass sliders** (blur / saturation / light+dark opacity / edge / specular), custom accent + background colors, widget toggles + reset positions, music transport.
- **Resume** (`cv`) — experience, education, certifications.
- **Contact** — email + socials.
- **Terminal** — §6.
- **Dev Chat** — §8.

## 8. Dev Chat — the AI assistant

Open via the desktop icon, palette, Start menu, `open chat` (terminal), or the mobile FAB. It is grounded on Saad's real knowledge base (`data/portfolio-knowledge.md`) and answers in the third person — it never invents facts.

**It can operate the OS.** Ask it to do something and it emits an action marker that the OS executes:

| You say | It does |
| --- | --- |
| "open the terminal" / "show me the resume" / "open settings" | Opens that app |
| "open the CRM project" | Opens the project in a Browser tab |
| "switch to neon" / "use the retro theme" | Switches theme |
| "play some music" / "pause" / "next track" | Controls the synth player |
| "hide the weather widget" / "show the notes" | Toggles widgets |

Extras: one-time concierge greeting · starter-chip prompts · **Retry** on a failed answer · unread badge on the desktop edge tab / mobile FAB · history + unread count persist (last 50 messages) · markdown with links restricted to Saad's real sites · reset from the header.

**Limits & troubleshooting**: without provider env vars it says "The assistant is not configured yet." (expected); a provider rate limit answers *"The assistant is getting a lot of questions — give it a few seconds."*; the local limiter is 15 requests/min/IP. If an action can't execute, dev builds log `[chat] action not executed: <verb:arg>`.

## 9. DevOS Browser

One singleton browser window (`type:"browser"`) with a Chrome-like experience:

- **Tab strip** — per-tab history (back/forward), roving keyboard navigation, editable address bar, external-open, side-panel toggle. Closing the last tab re-opens Home.
- **Home tab** — greeting, 8 shortcut tiles (Google/YouTube/GitHub are knowingly blocked; Wikipedia, DevOS live, and the three projects are embeddable), recently-visited chips, live projects row.
- **Project tabs** — the repo's GitHub README, sanitized (scripts/iframes/inline-style-colors stripped, event handlers removed), cached 6 h with a 60 s degraded/failure recovery window.
- **Web tabs** — sandboxed iframe. A server-side verdict (`/api/embed-check`, SSRF-guarded) decides whether the site allows framing; a genuine refuser renders a **fallback preview card** (server-captured screenshot, Reader mode via `r.jina.ai`, honest "this site blocks embedding" copy).
- **Side panel** — project About / Tech / Timeline (real release dates from GitHub) / Links; 264px rail on desktop, ≤45% drawer on mobile.
- **Warm tabs** — only the active + 2 most-recent tabs stay mounted; sleeping tabs wake with zero network.
- Browser state deliberately does **not** persist across reloads; closing the window releases it.

## 10. Widgets

| Widget | What it does |
| --- | --- |
| **Weather** | Live temperature/humidity via the Open-Meteo proxy (defaults to Multan, PK), retry on failure |
| **CPU** | Simulated live usage graph (OS flavour) |
| **Music** | Transport + CSS visualizer; the audio is a built-in **Web Audio synth** (no audio files) — play/pause/prev/next, volume in the control center |
| **Notes** | Sticky notes with color variants; persisted |

Drag widgets anywhere (collisions resolve on drop), collapse, pin-to-top, or remove via the header menu; **Reset Widget Positions** in Control Panel or the desktop menu restores the default column.

## 11. Themes & glass

Three complete themes — **Retro 2D** (warm browns, pixel fonts, bevels), **Neon City** (dark, cyan/magenta glow), **Classic Editorial** (cream, serif) — each with its own wallpaper scene and glass preset. Switch via: control-center theme dots, palette, terminal `theme <name>`, Control Panel, or the mobile shade. Six CSS variables drive all glass (blur, saturation, light/dark opacity, edge, specular); Control Panel sliders rewrite them live and your tweaks persist. Windows keep a readability floor even at minimum tint. `prefers-reduced-motion` stills the wallpaper and all motion.

## 12. Mobile (≤ 768px)

- **Status bar** (time) + **pull-down shade**: drag the knob for quick toggles (decorative), brightness, volume, theme dots, settings, and a "Search & commands" row that opens the palette.
- **Bottom tab bar**: Home + open apps (52px zone; taskbar is mobile-only).
- **Windows** float with a move-only header and three grip handles; fill-clamped to the safe zone.
- **Chat** is a bottom sheet above the taskbar, opened by a FAB with an unread badge.
- Widgets form a horizontal strip; icons a 3-column grid; all touch targets ≥ 44px; pinch-zoom allowed.

## 13. What persists across reloads

| Persisted (`devos-store` v2) | Not persisted (by design) |
| --- | --- |
| Theme + glass settings + custom tokens | Browser tabs/history/caches |
| Open windows (size/position/z) + `lastGeometry` | Command-palette open state |
| Widgets (type/position/collapsed/notes) | Chat "is typing" state |
| Chat history (50) + unread count + greeted flag | Streaming state |
| Music volume + current track | — |

## 14. Troubleshooting

| Symptom | Meaning / fix |
| --- | --- |
| Chat says "The assistant is not configured yet." | Provider env vars missing (`AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`) — see README's recipes |
| "The assistant is getting a lot of questions…" | Provider rate limit — wait a few seconds (free tiers: ~2 turns/min on Groq) |
| A site shows a preview card instead of loading | That site sends `X-Frame-Options: DENY` / blocks framing — the preview + Reader mode are the designed fallback |
| A project tab shows a degraded notice | GitHub rate-limited the shared unauthenticated quota (60/h/IP); it recovers automatically in ≤ 60 s |
| Weather shows Retry | Upstream hiccup — click Retry |
| Widget/window off-screen after a resize | It self-clamps back into the safe zone on the next interaction; desktop menu → Refresh also re-clamps everything |
| Chat actions don't fire | Ask again with a fresh server — the prompt mandates markers; failed executions log `[chat] action not executed: …` in devtools |

---

*Generated during the Phase 19 verification round (2026-10-26) from a full feature audit; cross-checked against the commit history through `c281b74`. Maintained alongside `FeatureMap.md` — see its maintenance rule.*
