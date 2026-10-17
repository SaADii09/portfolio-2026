# DevOS Portfolio

Interactive Web OS portfolio — a fully functional desktop environment in the browser. Built with Next.js 16, Tailwind v4, Zustand, and Framer Motion.

**Live demo**: [saadahmad.dev](https://saadahmad.dev) _(placeholder)_

## Features

- **3 switchable themes** — Retro 2D, Neon City, Classic Editorial with live CSS variable swapping
- **Window management** — drag, 8-edge resize, minimize, maximize, restore, close, snap-to-half, cascading placement, z-index focus
- **Command palette** — `Ctrl/Cmd+K` fuzzy-searches every app, widget, and command with arrow-key navigation
- **Global shortcuts** — `Esc` ownership chain, `Alt+Arrow` snap-to-half, `Ctrl/Cmd+W` closes the focused window
- **6 functional apps** — About, Projects (sandboxed iframe previews), Terminal, Contact, Resume, Control Panel
- **4 live widgets** — CPU monitor, Weather (Open-Meteo API), Music player (Web Audio synth), Sticky notes
- **Terminal ↔ OS bridge** — `theme`, `open <app>`, `music <action>`, and `apps` drive real OS state
- **AI chat assistant** — Anthropic streaming API with BM25 RAG over a local knowledge base
- **Live wallpapers** — canvas-rendered per theme (retro embers, neon grid, editorial curves) with mouse-reactive particles
- **Dynamic glassmorphism** — variable-driven blur/saturation/spotlight with per-theme presets and live glass controls
- **Desktop chrome** — glass dock (open windows only), top bar with clock/calendar and control centre, right-click and long-press context menus
- **Full mobile support** — pull-down control shade, floating windows with corner grips, bottom tab bar, 44px touch targets
- **Persistence** — theme, window, widget, music, and glass settings saved to localStorage
- **SEO/social** — metadata, generated OpenGraph/Twitter images, sitemap, robots.txt, canonical URL
- **Accessibility** — keyboard-navigable surfaces, focus-trapped modal, `prefers-reduced-motion` honoured throughout

## Tech Stack

| Layer     | Technology                            |
| --------- | ------------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack)    |
| Styling   | Tailwind CSS v4                       |
| State     | Zustand 5 (persist middleware)        |
| Animation | Framer Motion 12                      |
| Icons     | Lucide React                          |
| AI        | Anthropic Claude (streaming SSE)      |
| Testing   | Vitest + Testing Library + Playwright |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Create a `.env.local` (see `.env.example`):

```
# Required for the AI chat panel — optional, chat degrades gracefully without it
ANTHROPIC_API_KEY=sk-ant-...

# Canonical site origin used for metadata, OpenGraph, sitemap, robots.txt
NEXT_PUBLIC_SITE_URL=https://saadahmad.dev
```

`NEXT_PUBLIC_SITE_URL` falls back to `http://localhost:3000`, so set it in your host's environment before deploying — canonical and social URLs must be absolute.

## Commands

| Command                              | Description                                                            |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `npm run dev`                        | Development server                                                     |
| `npm run build` / `npm start`        | Production build and serve                                             |
| `npm run validate:all`               | Full quality gate: lint → format check → typecheck → tests → audit     |
| `npm run lint`                       | ESLint (flat config)                                                   |
| `npm run format:check`               | Prettier check (`npm run format` to write)                             |
| `npm run typecheck`                  | `tsc --noEmit`                                                         |
| `npm run test`                       | Vitest unit/component tests (180 tests, 15 files)                      |
| `npm run test:coverage`              | Vitest with coverage report                                            |
| `npm run test:e2e`                   | Playwright E2E — 141 tests across chromium/firefox/webkit              |
| `npx tsx scripts/validate-design.ts` | Design-token audit (flags hardcoded colors and inline styles)          |
| `npx fallow audit`                   | Dead code / duplication / complexity audit (new code vs `origin/main`) |

## Project Structure

```
src/
├── app/                    # Next.js App Router + API routes
│   └── api/                # /chat, /screenshot, /weather
├── components/
│   ├── os/                 # Window, Desktop, Dock, TopBar, Taskbar, ChatPanel, CommandPalette
│   ├── apps/               # AboutApp, ProjectsApp, TerminalApp, ContactApp, ResumeApp, ControlPanelApp
│   ├── widgets/            # CPU, Weather, Music, Notes (+ WidgetWrapper)
│   └── theme/              # ThemeProvider
├── store/                  # Zustand slices (window, theme, widget, chat, music, ui)
├── hooks/                  # Drag, glass glare, keyboard shortcuts, palette, long-press, viewport clamp
├── types/                  # TypeScript interfaces
└── lib/                    # App registry, shortcuts, palette data/DOM, terminal commands, RAG, design tokens
```

## Design System

Three themes defined entirely via CSS custom properties — no hardcoded colors in components:

- **Retro 2D** — warm browns, pixel fonts, sharp corners, glowing shadows
- **Neon City** — dark background, cyan/magenta/green accents, neon glow effects
- **Classic Editorial** — cream/sepia tones, serif typography, subtle shadows

Theming tokens live in `src/app/globals.css` via `@theme inline`; glass behaviour is driven by six CSS variables (`--glass-blur`, `--glass-saturate`, `--glass-opacity-*`, `--glass-edge-opacity`, `--glass-specular-opacity`) with per-theme presets. Design tokens are mirrored in `src/lib/design-tokens.ts` and checked by `scripts/validate-design.ts`.

## Testing

- **180 unit/component tests** across 15 files — all six Zustand slices, fuzzy scoring, shortcuts, terminal commands, drag boundaries, palette, Window, Taskbar, ControlPanel, sliders, selectors
- **141 E2E tests** across 10 specs on chromium, firefox, and webkit — window lifecycle, theme switching, mobile layout and the 768px boundary, persistence, drag, shortcuts, command palette, terminal, and metadata
- `npm run validate:all` is the gate: lint + format + typecheck + unit tests + `fallow audit`

## Deployment

```bash
npm run build
npm start
```

Deploy to Vercel, Netlify, or any Node.js host. Everything is prerendered except the three API routes (`/api/chat`, `/api/screenshot`, `/api/weather`). Set `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_SITE_URL` in the host's environment.

## License

MIT
