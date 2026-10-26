# DevOS Feature Map (feature → files)

**Maintained reference**: every feature of the portfolio mapped to the exact file(s) that implement it. Paths relative to repo root; `src/…` unless noted.

> **Maintenance rule** — when you add or change a feature, update in the same change:
> 1. the row(s) here,
> 2. the matching section in [`UserGuide.md`](./UserGuide.md) if it changes how the feature is used,
> 3. the README feature table if it is visitor-facing.

Last full audit: 2026-10-26 (Phase 19 verification round; commit history cross-checked through `c281b74`).

---

## 1. Desktop shell & window management

| Feature | Files | Notes |
| --- | --- | --- |
| Root page composition (Boot → Theme → Cursor → Desktop) | `src/app/page.tsx` | Boots `BootScreen > ThemeProvider > CustomCursor + Desktop`. |
| Desktop surface (windows zone, icons, chrome mounting) | `src/components/os/Desktop.tsx` | Content zone `top:36/bottom:76` desktop, `32/52` mobile; mounts Dock, TopBar, Taskbar, ChatPanel, Wallpaper, ContextMenu, CommandPalette; `MotionConfig reducedMotion="user"`. |
| Per-component app renderer table | `src/components/os/Desktop.tsx` (`APP_RENDERERS`) | One renderer per known `component`; browser row receives the window id. |
| Desktop icons (double-click + keyboard launch, 3-col mobile grid, blink refresh) | `src/components/os/Desktop.tsx`, `src/components/os/appIcons.ts` | Icons launch through `openApp`; refresh blinks then reloads. |
| Desktop right-click context menu (Refresh + all apps) | `src/components/os/Desktop.tsx`, `src/components/os/ContextMenu.tsx` | Desktop-level menu; long-press on mobile. |
| Window component (drag/resize/focus/z-order chrome) | `src/components/os/Window.tsx` | Transform-based `translate()` positioning, rAF-batched; 8 desktop edge handles, mobile grips; header context menu; enter fade keyframes. |
| Window drag engine | `src/hooks/useDragPosition.ts` | Pointer drag + rAF batching, `onRelease` for drop effects (collision, commit). |
| Header drag + long-press merge | `src/hooks/useHeaderDragHandlers.ts` | One header can arm long-press AND start drag without double-handling. |
| Touch long-press (500 ms, 10 px threshold) | `src/hooks/useLongPress.ts`, `src/hooks/useContextMenuLongPress.ts` | Long-press opens the same context menu as right-click. |
| Window z-index / focus / minimize / maximize / restore | `src/store/windowSlice.ts` | `openWindow` (cascade), `focusWindow`, `minimize/maximize/restore`, `activeWindowId`. |
| Window CRUD + geometry clamp actions | `src/store/windowSlice.ts` | `updateWindowPosition/Size` (floored via `clampResizedHeight`), `setWindowOpacity`, `clampToViewport` on resize, `closeWindow` reaches browser cleanup seam. |
| Per-app default geometry (sizes/slots) | `src/lib/window-geometry.ts` (`APP_SIZES`, `APP_SLOTS`) | Content-fit sizes + first-open anchor slots; `webview:<url>` keys; legacy fallback 400×320 @ 80/60 + cascade. |
| Per-app height floors (all six height paths) | `src/lib/window-geometry.ts` (`APP_MIN_HEIGHTS`, `minHeightFor`, `clampResizedHeight`) | contact 500 · about 480 · chat 380 · control-panel 420 · browser 380 · projects 360 · resume 320 · terminal 200. |
| Geometry memory across close/reload | `src/store/windowSlice.ts` (`lastGeometry`) + `src/lib/window-geometry.ts` | Per-key remembered geometry, re-clamped through `clampRemembered`. |
| Safe-zone geometry (bars, clamps) | `src/lib/boundaries.ts` | `getViewportBounds` (36/76 vs 32/52), `clampWindowSize/Position`, `clampDragPosition` (½ visible), `availableWindowHeight` (mobile-conditional). |
| Window constants | `src/lib/constants.ts` | MIN 280×200, default 400×320, breakpoint 768, `MOBILE_FILL_H` 140. |
| Widget drag + collision resolution | `src/hooks/useDragPosition.ts`, `src/lib/boundaries.ts` (`resolveWidgetCollisions`) | Viewport bounds + inter-widget push-out (4 vectors, smallest wins, 4px gap). |
| Widget wrapper (drag, collapse, pin-to-top, context menu) | `src/components/widgets/WidgetWrapper.tsx`, `src/store/widgetSlice.ts` | Pin z-index 9996, collapse, remove, reset positions. |
| Dock (open-windows-only pill, tooltips, hover scale, active dot, right-click) | `src/components/os/Dock.tsx` | Hidden when no windows open; z 9999. |
| Top bar (DevOS label, live clock/date, calendar dropdown, control center) | `src/components/os/TopBar.tsx` | HH:MM:SS client timezone, month grid calendar, glass control-center dropdown (theme dots, volume, music transport, settings). |
| Taskbar (mobile-only home + open apps) | `src/components/os/Taskbar.tsx` | Right-click menu (Focus/Minimize/Maximize/Close); z fixed bottom. |
| Start menu (app list, staggered entrance) | `src/components/os/StartMenu.tsx` | Launches via `openApp`; glass + spring entrance. |
| Context menu component (glass, clamp, focus trap, 44px) | `src/components/os/ContextMenu.tsx` | Keyboard traversal + focus restore; items are `<button role="menuitem">`. |
| Global keyboard layer (Escape ownership chain) | `src/hooks/useKeyboardShortcuts.ts`, `src/lib/shortcuts.ts` | Esc→blur-or-close fallback; Alt+Arrow snaps; Mod+K/W; stands down on `defaultPrevented`. |
| Command palette (modal, fuzzy, keyboard nav) | `src/components/os/CommandPalette.tsx`, `src/lib/paletteItems.ts`, `src/lib/paletteDom.ts`, `src/hooks/usePaletteNav.ts`, `src/hooks/usePaletteOverlay.ts` | Fuzzy ranking, categories (App/Theme/Widget/Music/Window), scroll lock, focus trap, aria listbox. |
| Fuzzy scorer | `src/lib/fuzzy.ts` (`fuzzyScore`) | Subsequence ranking used by palette. |
| Palette open state | `src/store/uiSlice.ts` (`isPaletteOpen`, `togglePalette`) | Transient — not persisted. |
| Live canvas wallpaper (3 per-theme scenes) | `src/components/os/Wallpaper.tsx` | Retro embers / neon grid+glow / editorial curves; dual-depth mouse-reactive particles, noise grain, DPR cap 2, debounced resize regen, reduced-motion repaint. |
| Boot screen | `src/components/os/BootScreen.tsx` | Fake OS boot overlay before Desktop mounts. |
| Custom cursor (scales on interactives) | `src/components/os/CustomCursor.tsx` | Cursor dot/ring with hover scale. |
| Scroll affordance (sticky-bottom fade) | `src/hooks/useScrollFade.ts`, `src/app/globals.css` (`data-scrollable` / `data-scrolled-end` + `::after`) | Wired to window body, tab panel, terminal, side panel, chat list. |
| Mouse-follow glass spotlight | `src/hooks/useGlassGlare.ts` | Delegated body mousemove writes `--mouse-x/--mouse-y` on nearest `.glass*`; desktop ≥1024 only, rAF-batched. |
| Shared glass/volume slider row | `src/components/os/GlassSlider.tsx` | 10 call sites (control panel, control center, mobile shade); compact/icon variants. |
| Theme provider + FOUC guard | `src/components/theme/ThemeProvider.tsx` | Applies `data-theme` before paint. |
| Single app-launch choke point | `src/lib/os-actions.ts` (`openApp`, `APP_LAUNCHERS`) | Unknown id = silent no-op; new AppId = compile error until launcher row exists. |
| Singleton browser launcher / widget toggle / music control / theme-by-name | `src/lib/os-actions.ts` (`openBrowser`, `toggleWidget`, `musicControl`, `setThemeByName`) | `openBrowser(slug)` seeds `pendingSlug`; `musicControl` never crashes on unknown action. |
| App registry (AppId, defs, aliases) | `src/lib/apps.ts` | AppIds: about, projects, browser, control-panel, resume, terminal, contact, chat; aliases `settings`/`cv`; also `WIDGET_DEFS`, `THEME_DEFS`. |

## 2. Apps (per app)

Shared: renderer wiring `src/components/os/Desktop.tsx`; registry `src/lib/apps.ts`; launch `src/lib/os-actions.ts`; portfolio content `src/lib/portfolio-data.ts` (PERSONAL_INFO, SKILLS, EXPERIENCE, PROJECTS + `projectBySlug`, EDUCATION, CERTIFICATIONS, TOP_SKILLS).

| App / feature | Files | Notes |
| --- | --- | --- |
| About window (bio, skills, summary) | `src/components/apps/AboutApp.tsx` | Content-fit 560×620, floor 480. |
| Projects window shell (grid + side panel) | `src/components/apps/ProjectsApp.tsx` | Legacy shell: cards moved to `ProjectGrid`; card activation opens a Browser tab (`openBrowser(slug)`). |
| Project card grid | `src/components/apps/ProjectGrid.tsx` | Card activation callback with slug; keyboard-operable cards. |
| Project side panel (About/Tech/Timeline/Links) | `src/components/apps/ProjectSidePanel.tsx` | 264px rail desktop, ≤45% mobile drawer inside Browser; timeline via `src/lib/repo-timeline.ts` (`deriveTimeline` → real `YYYY-MM` release rows). |
| README renderer (re-sanitized at render) | `src/components/apps/ReadmeView.tsx` | Runs `sanitizeReadmeHtml` again defensively; token-class styling. |
| Control Panel — Theme section (swatches per theme) | `src/components/apps/ControlPanelApp.tsx` | accent-1/2/3 palette previews from token source. |
| Control Panel — Glass section (blur/saturate/opacity sliders) | `src/components/apps/ControlPanelApp.tsx`, `src/components/os/GlassSlider.tsx`, `src/hooks/useOsSelectors.ts` | Writes glass state + `customTokens`; synced to THEME_GLASS_DEFAULTS on theme switch. |
| Control Panel — Customize / Widgets / Now Playing sections | `src/components/apps/ControlPanelApp.tsx` | Custom-token rows, widget toggles + reset positions, music transport. |
| Resume window (experience, education, certs) | `src/components/apps/ResumeApp.tsx` | 700×760, floor 320; data from `portfolio-data.ts`. |
| Terminal app (history, injected context) | `src/components/apps/TerminalApp.tsx` | Builds `TerminalContext` from store + os-actions, renders `executeCommand` output. |
| Terminal command engine (pure, table-driven) | `src/lib/terminal-commands.ts` | 17 commands (table in §8); banner ASCII art; derived unknown-app hints. |
| Contact window (email + socials + form info) | `src/components/apps/ContactApp.tsx` | 480×520, floor 500; links from PERSONAL_INFO. |
| Dev Chat window body (desktop) | `src/components/apps/ChatApp.tsx` | Shared chat internals: transcript, starter chips, composer. |
| Mobile chat chrome (FAB, bottom sheet, edge tab, unread badge) | `src/components/os/ChatPanel.tsx` | Always mounted; visibility rule + mobile FAB/sheet above taskbar. |
| Chat slice (SSE stream to /api/chat) | `src/store/chatSlice.ts` | `sendMessage`, `applyEvent`, `finalizeFailure` (Retry), `toggleChat`, unread badges, greeting; v2 persisted history. |
| Chat action executor (markers → OS actions) | `src/components/apps/chat-internal/useChatActionExecutor.ts`, `src/lib/ai/actions-client.ts` | Per-message cap; routes through `os-actions`. |
| Assistant markdown (marker stripping + link allow-list) | `src/components/apps/chat-internal/AssistantMarkdown.tsx`, `src/lib/chat-links.ts` | Only `CHAT_LINKS`/`CHAT_PROJECT_LINKS` origins render as links; rest plain text. |
| Composer (textarea, Enter/Shift+Enter) | `src/components/apps/chat-internal/ChatComposer.tsx` | Draft state, trim before send. |
| Message list (avatars, gradient user bubbles, timestamps) | `src/components/apps/chat-internal/MessageList.tsx` | Streaming cursor on assistant bubble. |
| Starter chips (owner-finalized copy) | `src/components/apps/chat-internal/StarterChips.tsx` | Chips hand literal text to `onPick`. |
| One-shot concierge greeting | `src/components/apps/chat-internal/useChatGreeting.ts`, `src/store/chatSlice.ts` | Fires once (`chatGreeted` persisted); unread badges on edge tab/FAB. |

## 3. AI Chat assistant (backend + protocol)

| Feature | Files | Notes |
| --- | --- | --- |
| Chat API route (SSE proxy, validation, rate limit) | `src/app/api/chat/route.ts` | Max 20 messages × 10k chars, role allow-list, per-IP limiter, token/error SSE contract. |
| Provider registry (env-only decision point) | `src/lib/ai/registry.ts` | `anthropic` \| `openai-compat`; closed error union `not_configured/invalid_provider/missing_model`; unknown provider fails fast (HTTP 500). |
| Provider protocol + friendly 429 copy | `src/lib/ai/provider.ts` | `ModelProvider` interface, normalized stream events, `FRIENDLY_429_COPY`. |
| Anthropic adapter (hand-rolled SSE) | `src/lib/ai/adapters/anthropic.ts` | Prompt caching capable; 20 s idle / 90 s total timeouts. |
| OpenAI-compatible adapter (Groq/OpenRouter/Ollama/OpenAI) | `src/lib/ai/adapters/openai-compat.ts` | Keyless allowed (Ollama); `AI_BASE_URL` + `AI_MODEL` required. |
| Read timeouts | `src/lib/ai/timeout.ts` | Idle + total deadline helper shared by adapters. |
| System prompt + KB injection | `src/lib/ai/prompt.ts` | Third-person mandate, no invented facts; full-KB injection under `AI_KB_FULL_THRESHOLD`, else BM25 subset. |
| BM25-ish retrieval over knowledge file | `src/lib/rag.ts` (`retrieveRelevantContext`) | Chunk + term-frequency scoring over `data/portfolio-knowledge.md`. |
| Action marker protocol (pure) | `src/lib/ai/actions.ts` | Closed verb table `open_app/open_project/set_theme/music/toggle_widget`; `ACTIONS_DOCS` prompt text; linear, idempotent parser with held-back partial tail. |
| Client-side action execution | `src/lib/ai/actions-client.ts`, `src/components/apps/chat-internal/useChatActionExecutor.ts` | `executeMarkerAction` routes to `os-actions`; dev-only warn on failed actions. |
| Chat link allow-list | `src/lib/chat-links.ts` | `normalizeChatUrl`, `isAllowedChatLink`; closed origin table. |
| Chat rate limiting | `src/lib/rate-limit.ts` | Sliding-window per-IP limiter shared with embed-check; fixed 429 body. |
| Chat types | `src/types/chat.ts` (`Message`) | role/content/timestamp/streaming/error. |
| Rate limit env | `AI_RATE_LIMIT_PER_MIN` (see §15) | Default 15/min per IP. |

## 4. Browser (DevOS Browser)

| Feature | Files | Notes |
| --- | --- | --- |
| Browser shell (toolbar + tab strip + content router) | `src/components/apps/BrowserApp.tsx` | Back/forward over per-tab `localHistory`, reload, editable address bar, external-open, side-panel toggle. |
| Tab strip (roving tabindex, ←/→/Home/End/Delete) | `src/components/apps/BrowserApp.tsx`, `src/store/browserSlice.ts` | `role=tab/tabpanel`; last-tab close reseeds Home. |
| Home tab (start page: greeting, shortcuts grid, recent chips, live projects row) | `src/components/apps/BrowserApp.tsx`, `src/lib/browser-apps.ts` | Container-query compaction at ≤299px height (short windows). |
| Curated app tiles (8) | `src/lib/browser-apps.ts` (`BROWSER_TILES`) | Google/YouTube/GitHub (blocked) + Wikipedia, DevOS live, Auth Kit, Venuze, MegaBlog (web). |
| Warm-tail mounting (active + 2 MRU) | `src/lib/warm-set.ts` (`computeWarmSet`, `evictLru`), `src/store/browserSlice.ts` | Sleeping tabs wake with zero network (README/meta cached in slice). |
| Browser state (tabs, recency, README/meta LRUs, pendingSlug, sidePanelOpen) | `src/store/browserSlice.ts` | Deliberately NOT persisted; `closeBrowserWindow` releases state on window close. |
| WebView iframe pipeline (embed probe) | `src/components/os/WebView.tsx` | Keeps iframe mounted; swaps to fallback only on positive blocked verdict; unreadable cross-origin ≠ refusal. |
| Fallback panel (preview card + escape hatch) | `src/components/os/FallbackPanel.tsx` | Full-width capture, header/actions above the fold, Reader mode via r.jina.ai; alt announces host. |
| Host-based embed classification | `src/lib/embed-rules.ts` | `EMBED_BLOCKED_HOSTS` suffix match (trailing-dot normalized); reasons `blocked` \| `insecure`; https-only fail-closed. |
| Embed verdict API | `src/app/api/embed-check/route.ts` | SSRF-guarded framing verdicts (`x-frame-options`/`csp-frame-ancestors` judged against the embedder); hand-walked redirects; private-DNS rejection. |
| README sanitizer (linear, quote-aware, fail-closed) | `src/lib/readme-sanitize.ts` | Drops script/iframe/style/link/base/meta + on* attrs; scheme allow-list; style color/background stripping; idempotent. |
| Screenshot allow-list | `src/lib/screenshot-allowlist.ts` | PROJECTS repo/demo origins ∪ tile origins ∪ github.com; two-clause check (also refuser hosts); failure-safe derivation. |
| Project metadata fetch/caching | `src/app/api/project-meta/route.ts` | 3 parallel GitHub fetches; 6h full / 60s degraded+failure TTLs; sanitized README cached. |
| Screenshot proxy | `src/app/api/screenshot/route.ts` | Microlink capture → sharp resize 1280×720 JPEG q70; 6h cache cap 32 keyed origin+pathname. |
| Side panel + README inside browser | `src/components/apps/ProjectSidePanel.tsx`, `src/components/apps/ReadmeView.tsx` | Panel keyed to WINDOW width (container query `.browser-shell`), rail capped 45%. |
| Legacy iframe windows (persisted visitors) | `src/lib/window-geometry.ts` (`WEBVIEW_GEOMETRY_KEY`), `src/components/os/WebView.tsx` | Still renderable; nothing new produces `type:"iframe"`. |
| Browser launch flow | `src/lib/os-actions.ts` (`openBrowser`, `launchBrowser`) | Singleton `type:"browser"` window; relaunch dedupe + cold-record seeding. |

## 5. Widgets

| Feature | Files | Notes |
| --- | --- | --- |
| Widget wrapper (drag/collapse/pin/menu) | `src/components/widgets/WidgetWrapper.tsx`, `src/store/widgetSlice.ts` | transform-based drag; pin z 9996; collision on drop. |
| Weather widget (Open-Meteo proxy) | `src/components/widgets/WeatherWidget.tsx`, `src/app/api/weather/route.ts` | Validated lat/lon with anchored regex; defaults 30.18/71.55; cache; Retry affordance. |
| CPU widget (mock live usage graph) | `src/components/widgets/CpuWidget.tsx` | Simulated CPU history for OS feel. |
| Music widget (transport + visualizer) | `src/components/widgets/MusicWidget.tsx`, `src/hooks/useOsSelectors.ts` | Now-playing + prev/play/next; CSS visualizer; 44px transport targets. |
| Music state (queue, volume, persistence) | `src/store/musicSlice.ts` | DEFAULT_TRACKS, `Track` interface; `tryAudio()` keeps state updates when AudioContext absent. |
| Synth audio engine | `src/lib/audio-engine.ts` (`SynthEngine`, `getSynthEngine`) | WebAudio oscillator presets per track; silent degradation without AudioContext; retry path. |
| Sticky notes widget (color variants, persist) | `src/components/widgets/NotesWidget.tsx`, `src/store/widgetSlice.ts` | Editable notes persisted with widgets. |
| Widget types | `src/types/widget.ts` | `WidgetType` = cpu/weather/music/notes; `WidgetInstance`. |

## 6. Themes & glass

| Feature | Files | Notes |
| --- | --- | --- |
| Theme definitions (retro / neon / editorial) | `src/app/globals.css` (`[data-theme="retro"|"neon"|"editorial"]`), `src/lib/apps.ts` (`THEME_DEFS`: "Retro 2D", "Neon City", "Classic Editorial") | Accent, fonts (Press Start 2P / VT323 / Orbitron+Rajdhani / IBM Plex Sans), radii, glass presets per theme. |
| Tailwind v4 theme bridge | `src/app/globals.css` (`@theme inline`) | `--color-os-*`, `--font-family-*` map CSS vars to utilities; no tailwind.config. |
| Dynamic glass variable set | `src/app/globals.css` | `--glass-blur`, `--glass-saturate`, `--glass-opacity-light/dark`, `--glass-edge-opacity`, `--glass-specular-opacity`; `.glass/.glass-heavy/.glass-light` + per-theme overrides + spotlight `::after`. |
| Glass state + theme sync | `src/store/themeSlice.ts` (`THEME_GLASS_DEFAULTS`, `setTheme`, `setGlassBlur/Saturate/Opacity`, `setCustomToken`) | Switching a theme resets glass to its preset; `customTokens` persisted. |
| Theme switching plumbing | `src/components/theme/ThemeProvider.tsx`, `src/store/themeSlice.ts` | `data-theme` attribute + persisted `theme` key. |
| Retro dither/bevel, neon glow, editorial acrylic treatments | `src/app/globals.css` | Per-theme `.glass` overrides; `os-window-surface` readability floors. |
| Design-token validator source | `lib/design-tokens.ts` (repo-root `lib/`, NOT `src/lib`) | `THEMES`, `TAILWIND_TOKEN_MAP`, `ALLOWED_INLINE_STYLE_PROPS`, literal-color predicates, `// design-token-exempt:` markers. |
| Design validation script + test | `scripts/validate-design.ts`, `src/test/validate-design.test.ts` | `npx tsx scripts/validate-design.ts`; error/warn/info audit of hardcoded styles. |
| Mobile glass reduction | `src/app/globals.css` | 8px blur / 140% saturation at ≤767.98px. |

## 7. Keyboard shortcuts & command palette

Global shortcuts (`src/lib/shortcuts.ts` match table + `src/hooks/useKeyboardShortcuts.ts` handlers):

| Key | Action | File | Notes |
| --- | --- | --- | --- |
| `Escape` | Owning transient surface closes itself (context menu → TopBar dropdowns → palette; each `preventDefault()`); global fallback next tick: blur editable, else **close the active window** | `src/hooks/useKeyboardShortcuts.ts`, `src/lib/paletteDom.ts`, `src/components/os/ContextMenu.tsx`, `src/components/os/TopBar.tsx` | Stands down on `defaultPrevented` — exactly one handler fires. |
| `Ctrl/Cmd + K` | Toggle command palette (fires even while typing) | `src/lib/shortcuts.ts`, `src/hooks/useKeyboardShortcuts.ts`, `src/store/uiSlice.ts` | Sole Mod-combo exempt from editable-target guard. |
| `Ctrl/Cmd + W` | Close focused window (yields to text entry) | `src/lib/shortcuts.ts`, `src/hooks/useKeyboardShortcuts.ts` | Browser may reserve it; still honored in PWAs/app windows. |
| `Alt + ←` / `Alt + →` | Snap active window to left / right half (zone-frame position, ignored while maximized/minimized) | `src/lib/shortcuts.ts` (`snapZonePosition`), `src/hooks/useKeyboardShortcuts.ts` (`snapWindow`) | Width = ½ vw, full zone height. |
| `Alt + ↑` | Maximize active window | `src/hooks/useKeyboardShortcuts.ts` | Alt-only combos; suppressed in editables. |
| `Alt + ↓` | Restore maximized window | `src/hooks/useKeyboardShortcuts.ts` | No-op when not maximized. |

Palette-internal keys (`src/hooks/usePaletteNav.ts`, `usePaletteOverlay.ts`, `src/components/os/CommandPalette.tsx`):

| Key | Action | Notes |
| --- | --- | --- |
| `↑` / `↓` | Move highlighted row (scrolls into view) | Roving highlight over ranked items. |
| `Enter` | Run highlighted item | Apps open via `openApp`; windows focus/restore. |
| `Tab` / `Shift+Tab` | Focus trap inside modal | Focus restored on close (`usePaletteOverlay`). |
| `Escape` | Close palette, claims the event (Esc chain) | Scroll lock + initial focus managed in `paletteDom`/`usePaletteOverlay`. |

Palette item sources (`src/lib/paletteItems.ts`): Apps (8) · Themes (3) · Widget show/hide (4) · Music play/pause + next/prev (3) · Focus each open window (dynamic). Ranked by `src/lib/fuzzy.ts`.

## 8. Terminal commands

All in `src/lib/terminal-commands.ts` (pure executor; `TerminalApp.tsx` injects `TerminalContext`):

| Command | Args | Effect |
| --- | --- | --- |
| `help` | — | Prints the command list. |
| `whoami` | — | Name — title. |
| `about` | — | First two summary paragraphs (from `portfolio-data.ts`). |
| `projects` | — | Numbered project list (title — description). |
| `resume` | — | Name/title + experience + education summary. |
| `contact` | — | Email / LinkedIn / GitHub. |
| `theme` | none | Prints current theme. |
| `theme` | `<retro\|neon\|editorial>` | Switches theme via `setThemeByName` (OS bridge). |
| `date` | — | Current date/time string. |
| `echo` | `<text…>` | Echoes args. |
| `clear` | — | Clears the terminal (`clear: true`). |
| `neofetch` | — | Fake system info (OS/kernel/resolution/theme/uptime). |
| `banner` | — | ASCII "DEVOS" welcome banner. |
| `sudo` | — | "⛔ Nice try." joke. |
| `ls` | — | Lists all AppIds (derived from registry). |
| `open` | `<app>` (aliases `settings`, `cv`) | Opens app via OS bridge; unknown prints derived hint. |
| `music` | none | Prints `♪ title — artist [playing/paused]`. |
| `music` | `<play\|pause\|toggle\|next\|prev>` | Controls music via `musicControl` (OS bridge). |
| `apps` | — | `id — title` list of all apps. |
| *(unknown)* | — | "Command not found" + hint. |

## 9. Mobile experience

| Feature | Files | Notes |
| --- | --- | --- |
| Mobile detection (768 breakpoint) | `src/hooks/useMediaQuery.ts` (`useIsMobile`), `src/lib/boundaries.ts` | jsdom matchMedia guard. |
| Android-style status bar (24px, time only) + centered drag knob | `src/components/os/TopBar.tsx` | Pull-down shade anchor. |
| Pull-down control shade (pointer-drag, snap open/closed) | `src/components/os/TopBar.tsx` | Quick toggles (WiFi/BT/DND/Flashlight, decorative), brightness (decorative), volume, theme dots, settings, "Search & commands" row. |
| Bottom tab bar (Home + open app icons) | `src/components/os/Taskbar.tsx` | 52px zone; taskbar is mobile-only. |
| Mobile windows (floating, header move-only, 3 grip handles) | `src/components/os/Window.tsx` | Fill clamp `vw−32 × vh−140`; bottom/left/right 20px grips. |
| Mobile geometry (centered, under status bar) | `src/lib/window-geometry.ts` (`mobileSize`, `mobilePosition`), `src/lib/boundaries.ts` | `availableWindowHeight` mobile-conditional. |
| Chat FAB + bottom sheet (above taskbar) | `src/components/os/ChatPanel.tsx`, `src/components/apps/chat-internal/*` | Device-aware launcher `chatLauncher` in `src/lib/os-actions.ts`. |
| Widgets as horizontal strip; icons 3-col grid | `src/components/os/Desktop.tsx`, `src/components/widgets/WidgetWrapper.tsx` | Long-press context menus. |
| Touch drag/resize (`touch-action: none`) | `src/hooks/useDragPosition.ts`, `src/components/os/Window.tsx`, `src/app/globals.css` | Pointer events; rAF batching. |
| 44px touch targets | `src/components/os/GlassSlider.tsx`, `src/components/os/ContextMenu.tsx`, `src/components/widgets/MusicWidget.tsx` | Mobile rows and menu items. |
| Viewport meta + pinch zoom | `src/app/layout.tsx` (`viewport` export) | Correct mobile detection, zoom allowed. |

## 10. API routes

| Route | Files | Purpose / guards / caches |
| --- | --- | --- |
| `POST /api/chat` | `src/app/api/chat/route.ts` | AI SSE proxy. Validates roles/lengths (20 msgs × 10k), env-driven provider via `src/lib/ai/registry.ts`, rate limit `AI_RATE_LIMIT_PER_MIN` (default 15/min/IP) via `src/lib/rate-limit.ts`, RAG/full-KB via `src/lib/ai/prompt.ts` + `src/lib/rag.ts`; friendly 429 copy; token/error SSE. |
| `GET /api/weather` | `src/app/api/weather/route.ts` | Open-Meteo proxy. Anchored-regex coord validation with defaults; cache; tested in `src/test/weather-route.test.ts`. |
| `GET /api/screenshot` | `src/app/api/screenshot/route.ts`, `src/lib/screenshot-allowlist.ts` | Microlink capture fallback. https + origin allow-list (projects ∪ tiles ∪ github.com, plus refuser hosts); sharp resize 1280×720 JPEG q70; 6h TTL cache cap 32 keyed by **origin+pathname**; image/* + timeout guards. |
| `GET /api/project-meta` | `src/app/api/project-meta/route.ts` | GitHub repo facts + sanitized README + derived timeline. Repo allow-set (4 known repos; unknown → 400, zero fetches); 6h full-answer cache (cap 16), 60s degraded cache (403/429/404), 60s negative failure cache; GitHub 403/429 → `degraded:true` 200; upstream failure → 502 fixed body. |
| `GET /api/embed-check` | `src/app/api/embed-check/route.ts` | Framing verdicts `{embeddable, reason}`. https-only, SSRF-guarded (private DNS, IPv4-mapped IPv6 normalized, pinned lookup), hand-walked redirects ≤3 hops each re-vetted, headers-only, per-IP rate limit, 400/429/502 contract. |
| `/embed-refusal` (page, not API) | `src/app/embed-refusal/page.tsx`, `next.config.ts` | Deterministic fixture: always `X-Frame-Options: DENY` + `frame-ancestors 'none'` for engine calibration tests. |

## 11. State & persistence

| Concern | Files | Notes |
| --- | --- | --- |
| Composed store (7 slices) | `src/store/index.ts` | window, theme, widget, chat, music, ui, browser slices composed into `AppStore`. |
| Persist config | `src/store/index.ts` | `name:"devos-store"`, `version: 2`, `partialize: persistPartialize`, `migrate: persistMigrator`. |
| Persisted keys | `src/store/index.ts` (`PersistedAppState`) | `theme`, `customTokens`, `glassBlur`, `glassSaturate`, `glassOpacity`, `windows`, `widgets`, `lastGeometry`, `volume`, `currentTrack`, `messages` (last 50, streaming finalized), `unreadCount`, `chatGreeted`. |
| Deliberately NOT persisted | `src/store/index.ts`, `src/store/browserSlice.ts`, `src/store/uiSlice.ts` | Browser slice state (tabs/LRUs/pendingSlug/sidePanelOpen), `isPaletteOpen`, `isLoading`, `chatOpen`. |
| Window slice | `src/store/windowSlice.ts` | Window CRUD, z-order, geometry clamps, `lastGeometry`, browser close seam (`Pick<BrowserSlice,"closeBrowserWindow">`). |
| Theme slice | `src/store/themeSlice.ts` | Theme + glass state, `THEME_GLASS_DEFAULTS`, customTokens. |
| Widget slice | `src/store/widgetSlice.ts` | Add/move/collapse/pin/remove, `resetWidgetPositions`. |
| Chat slice | `src/store/chatSlice.ts` | SSE lifecycle, retry/finalize, greeting, unread, v2 history (trim 50). |
| Music slice | `src/store/musicSlice.ts` | Queue, volume, currentTrack, transport; `tryAudio()` degradation. |
| UI slice | `src/store/uiSlice.ts` | `isPaletteOpen` (+ `isPaletteOpen` not persisted). |
| Browser slice | `src/store/browserSlice.ts` | Per-window tab records, recency, README LRU (cap 5), meta LRU (cap 8), pendingSlug, sidePanelOpen, visitRecency/Counts. |
| Window/widget types | `src/types/window.ts`, `src/types/widget.ts`, `src/types/theme.ts`, `src/types/chat.ts` | `WindowType` = app/iframe/terminal/browser; `WindowInstance`/`WindowConfig`; `WidgetInstance`; `ThemeName`; `Message`. |
| Persist migrator tests | `src/test/stores.test.ts`, `src/test/chat-slice-v2.test.ts` | v0/v1/v2 migration through defaults-merge. |

## 12. SEO & metadata

| Feature | Files | Notes |
| --- | --- | --- |
| Root metadata + fonts + viewport | `src/app/layout.tsx` | Title/description, `metadataBase` from `siteUrl`, 5 Google fonts (Press Start 2P, VT323, Orbitron, Rajdhani, IBM Plex Sans), Vercel Analytics. |
| Canonical site URL util | `src/lib/site.ts` | `NEXT_PUBLIC_SITE_URL` with localhost fallback, trailing-slash strip, build-time warning on malformed; pinned `SITE_LAST_UPDATED`. |
| Sitemap | `src/app/sitemap.ts` | Single URL, pinned lastModified. |
| Robots | `src/app/robots.ts` | Allow `/`, disallow `/api/`, sitemap link. |
| OpenGraph image (generated) | `src/app/opengraph-image.tsx` | 1200×630 via `next/og`, deliberate literal colors (non-themed surface). |
| Twitter image (generated) | `src/app/twitter-image.tsx` | Same renderer. |
| Themed error pages | `src/app/error.tsx`, `src/app/global-error.tsx` | `role="alert"` crash pages with reset. |
| Security headers / CSP | `next.config.ts` | Stage-1 CSP (prod drops unsafe-eval), `frame-ancestors 'self' <prod origin>`, object-src none, base-uri self; per-route XFO fixture override. |
| Metadata e2e pins | `e2e/metadata.spec.ts`, `src/test/robots-sitemap.test.ts`, `src/test/site.test.ts` | Canonical/sitemap/robots contract incl. malformed-env tolerance. |

## 13. Testing

### E2E (Playwright, `e2e/`, chromium/firefox/webkit unless noted)

| Suite | What it pins |
| --- | --- |
| `e2e/window-lifecycle.spec.ts` | Open/focus/minimize/maximize/close through real UI (desktop icons, dock). |
| `e2e/window-content-fit.spec.ts` | Every app opens content-fit across 1440×900 / 1366×768 / 375×812; ≥90% usable height rules. |
| `e2e/drag.spec.ts` | Window drag tolerance and position commit. |
| `e2e/theme-switching.spec.ts` | `data-theme` switching via control center; persisted theme. |
| `e2e/persistence.spec.ts` | localStorage persistence of theme + store rehydration. |
| `e2e/mobile.spec.ts` | 375×812 layout: taskbar/home, status bar, sheet, mobile windows. |
| `e2e/terminal.spec.ts` | Terminal → OS bridge (theme/apps/music commands drive real state). |
| `e2e/command-palette.spec.ts` | Palette open/search/run/exit; row heights (44px), enter-spring settlement. |
| `e2e/shortcuts.spec.ts` | Keyboard shortcuts incl. synthetic Ctrl+W dispatch (browsers reserve it). |
| `e2e/short-windows.spec.ts` | G1–G4 contract: per-app height floors through resize; safe-zone containment. |
| `e2e/browser.spec.ts` | Browser matrix: stand-alone app identity, tiles, tabs, side panel (spec D6–D8). |
| `e2e/browser-reload.spec.ts` | Reload persistence (chromium-pinned): rehydrated shell usable; 480px drawer vs 960px rail. |
| `e2e/embed-verdict.spec.ts` | Embed round trip: host-blocked / route verdicts / insecure paths. |
| `e2e/chat-assistant.spec.ts` | Chat launch + greeting with zero API traffic, marker actions, error copy (chromium). |
| `e2e/css-integrity.spec.ts` | Served CSS keeps standard `backdrop-filter` (lightningcss regression pin). |
| `e2e/metadata.spec.ts` | Canonical/OG/sitemap survive malformed `NEXT_PUBLIC_SITE_URL`. |
| `e2e/visual-pass.spec.ts` | Permanent chromium pin: 3 themes × 3 viewports screenshots for human verification. |
| `e2e/example.spec.ts` | Smoke: homepage loads with portfolio title. |
| `e2e/spike-short-windows.spec.ts` | Untracked throwaway spike (preserved, not a permanent pin). |
| `e2e/utils.ts` | Shared helpers (`gotoApp`, drag helpers, localStorage seeding). |

### Unit / component (`src/test/`, vitest + jsdom)

| Area | Files |
| --- | --- |
| Stores & slices | `stores.test.ts`, `chat-slice-v2.test.ts`, `music-slice-audio.test.ts`, `widget-reset.test.ts`, `browser-slice.test.ts`, `window-geometry.test.ts`, `boundaries.test.ts`, `zone-clamp.test.ts`, `warm-set.test.ts`, `os-actions.test.ts` |
| OS components | `Window.test.tsx`, `TopBar.test.tsx`, `Taskbar.test.tsx`, `CommandPalette.test.tsx`, `ContextMenu.test.tsx`, `GlassSlider.test.tsx`, `wallpaper.test.tsx`, `desktop-browser.test.tsx`, `useOsSelectors.test.tsx`, `use-scroll-fade.test.tsx` |
| Apps | `ControlPanelApp.test.tsx`, `project-grid.test.tsx`, `project-side-panel.test.tsx`, `readme-view.test.tsx`, `browser-app.test.tsx`, `browser-apps.test.tsx`, `fallback-panel.test.tsx`, `webview-refusal.test.tsx`, `ChatApp.test.tsx`, `chat-panel-mobile.test.tsx`, `chat-panel-edge-tab.test.tsx` |
| AI chat | `ai-registry.test.ts`, `ai-anthropic.test.ts`, `ai-openai-compat.test.ts`, `ai-prompt.test.ts`, `chat-actions.test.ts`, `chat-action-executor.test.ts`, `chat-stream.test.ts`, `chat-route.test.ts`, `assistant-markdown.test.tsx` |
| Routes | `weather-route.test.ts`, `screenshot-route.test.ts`, `project-meta-route.test.ts`, `embed-check-route.test.ts` |
| Libs | `shortcuts.test.ts`, `terminal-commands.test.ts`, `fuzzy.test.ts`, `rate-limit.test.ts`, `readme-sanitize.test.ts`, `embed-rules.test.ts`, `screenshot-allowlist.test.ts`, `repo-timeline.test.ts`, `site.test.ts`, `robots-sitemap.test.ts`, `portfolio-data-browser.test.ts`, `audio-engine.test.ts`, `browser-window-plumbing.test.ts` |
| Meta | `validate-design.test.ts`, `error-pages.test.tsx`, `example.test.ts`, `setup.ts` (jsdom setup), `ai-fixture.ts` (shared fixture loader) |

## 14. Scripts & tooling

| Script | Purpose |
| --- | --- |
| `scripts/validate-design.ts` | Design-token audit (error/warn/info) over source; consumed by validate pipeline. |
| `scripts/validate-fallow.ts` | Wraps `fallow` / `dead-code` / `health` / `dupes` audits (fail-on-NEW vs baselines). |
| `scripts/smoke-chat.ts` | MANUAL golden-Q&A smoke of `POST /api/chat` (grounding + marker turns); needs running server + key. |
| `scripts/smoke-project-meta.ts` | MANUAL spot-check of `/api/project-meta` + `/api/screenshot`; burns shared quotas. |
| `scripts/capture-ai-fixture.ts` | MANUAL network capture freezing a REAL provider SSE body into `src/test/fixtures/ai/` (Groq fixture present); TPM pacing included. |
| `scripts/capture-project-meta-fixture.ts` | MANUAL network capture freezing real GitHub envelopes into `src/test/fixtures/github/`. |
| Baselines / config | `fallow-health-baseline.json`, `fallow-dupes-baseline.json` (repo root), `playwright.config.ts` (workers capped 2), `postcss.config.mjs` (inline un-lower plugin fixing lightningcss `backdrop-filter`), `eslint.config.mjs`, `vitest` config (excludes `.superpowers/**`). |
| NPM scripts | `dev`, `build`, `lint`, `validate:all` (lint+format+typecheck+test+fallow), `test`, `test:e2e`, `fallow:audit`. |

## 15. Environment variables (names + purpose only — values never copied)

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Legacy/anthropic provider key (still wins for `anthropic`). |
| `AI_PROVIDER` | Adapter selector: `anthropic` (default) \| `openai-compat`; unknown value fails fast. |
| `AI_API_KEY` | Generic provider key (anthropic fallback; openai-compat optional — keyless allowed). |
| `AI_BASE_URL` | openai-compat `…/v1` root (Groq/OpenRouter/Ollama/OpenAI). |
| `AI_MODEL` | Model id (required for openai-compat; anthropic has a default). |
| `AI_TEMPERATURE` | Sampling temperature (default 0.3, pinned low for grounding). |
| `AI_MAX_OUTPUT_TOKENS` | Hard output cap (default 1024). |
| `AI_RATE_LIMIT_PER_MIN` | Per-IP chat rate limit (default 15). |
| `AI_MAX_CONTEXT_MESSAGES` | Conversation trim window (route hard max 20). |
| `AI_KB_FULL_THRESHOLD` | KB char size under which the full knowledge base is injected (default 24000). |
| `AI_CACHE_SYSTEM` | Anthropic prompt caching toggle on the system prompt. |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for metadata/OG/sitemap/robots (localhost fallback; malformed tolerated). |

## 16. Data & assets

| Item | Files | Notes |
| --- | --- | --- |
| AI knowledge base | `data/portfolio-knowledge.md` | ~8.3k chars; full-injected into the system prompt under threshold; BM25 fallback above. |
| Personal detail source | `data/mydetail.md` | Owner's long-form details (source material for content). |
| Portfolio content module | `src/lib/portfolio-data.ts` | PERSONAL_INFO, SKILLS, EXPERIENCE, PROJECTS (slug/repoUrl/demoUrl), EDUCATION, CERTIFICATIONS, TOP_SKILLS, `projectBySlug` (module-scope Map). |
| Public assets | `public/file.svg`, `public/globe.svg`, `public/window.svg` | Starter SVGs (unused by OS chrome — icons are lucide-react). |
| Frozen upstream fixtures (prettier-ignored, byte-exact) | `src/test/fixtures/github/` (repo/readme/release JSON+HTML), `src/test/fixtures/ai/groq.sse` | Real provider/GitHub bodies captured manually; never reformat. |
| Docs corpus | `docs/Architecture.md`, `docs/Design.md`, `docs/Rules.md`, `docs/Phases.md`, `docs/Memory.md`, `docs/PRD.md`, `docs/devos_technical_specification.md`, `docs/code-quality.md` (+snapshot), `docs/superpowers/specs/*`, `docs/superpowers/plans/*` | Design system, constraints, phase history, governing specs for every phase. |
