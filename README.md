# DevOS Portfolio

Interactive Web OS portfolio — a fully functional desktop environment in the browser. Built with Next.js 16, Tailwind v4, Zustand, and Framer Motion.

**Live demo**: [saadahmad.dev](https://saadahmad.dev) _(placeholder)_

## Features

- **3 switchable themes** — Retro 2D, Neon City, Classic Editorial with live CSS variable swapping
- **Window management** — drag, 8-edge resize, minimize, maximize, restore, close, snap-to-half, cascading placement, z-index focus
- **Command palette** — `Ctrl/Cmd+K` fuzzy-searches every app, widget, and command with arrow-key navigation
- **Global shortcuts** — `Esc` ownership chain, `Alt+Arrow` snap-to-half, `Ctrl/Cmd+W` closes the focused window
- **6 functional apps** — About, Projects, Terminal, Contact, Resume, Control Panel
- **DevOS Browser** — one browser window with a tab strip: project tabs render each repo's sanitized GitHub README, web tabs run the sandboxed iframe pipeline (a server-side framing verdict decides whether a site may be embedded, and a genuine refuser gets a live preview with a reader fallback), and the home tab is a Chrome-style start page (shortcut tiles, recently visited, your live projects) — with a warm-tab cache and a project side panel (about, tech, timeline, links)
- **4 live widgets** — CPU monitor, Weather (Open-Meteo API), Music player (Web Audio synth), Sticky notes
- **Terminal ↔ OS bridge** — `theme`, `open <app>`, `music <action>`, and `apps` drive real OS state
- **AI chat assistant** — provider-agnostic streaming (Anthropic or any OpenAI-compatible API), full knowledge-base grounding with BM25 fallback, markdown answers, and OS actions
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
# AI chat (optional — the terminal, apps, and widgets work without it)
ANTHROPIC_API_KEY=sk-ant-...

# Canonical site origin used for metadata, OpenGraph, sitemap, robots.txt
NEXT_PUBLIC_SITE_URL=https://saadahmad.dev
```

`NEXT_PUBLIC_SITE_URL` falls back to `http://localhost:3000`, so set it in your host's environment before deploying — canonical and social URLs must be absolute.

### AI provider (chat assistant)

The chat route is provider-agnostic: a registry picks the adapter from env vars at request time, so swapping vendors never touches client code or the SSE shape.

| Var                      | Meaning                                                              | Default                     |
| ------------------------ | -------------------------------------------------------------------- | --------------------------- |
| `AI_PROVIDER`            | `anthropic` \| `openai-compat`                                        | `anthropic` (compat)        |
| `AI_API_KEY`             | generic key (per-adapter fallback; `ANTHROPIC_API_KEY` wins for anthropic) | —                       |
| `AI_BASE_URL`            | openai-compat base, `…/v1` root, no trailing slash                    | `https://api.openai.com/v1` |
| `AI_MODEL`               | model id                                                              | `claude-sonnet-4-20250514` / **required** for openai-compat |
| `AI_TEMPERATURE`         | sampling temperature (kept low for grounded answers)                  | `0.3`                       |
| `AI_MAX_OUTPUT_TOKENS`   | hard output cap                                                       | `1024`                      |
| `AI_RATE_LIMIT_PER_MIN`  | per-IP chat rate limit                                                | `15`                        |
| `AI_MAX_CONTEXT_MESSAGES`| conversation trim window (route hard max stays 20)                    | `8`                         |
| `AI_KB_FULL_THRESHOLD`   | KB chars under which the whole knowledge base is injected             | `24000`                     |
| `AI_CACHE_SYSTEM`        | Anthropic prompt caching on the system prompt                         | `false`                     |

**Swap recipes** — all first-class, no code changes:

```bash
# Groq
AI_PROVIDER=openai-compat
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=llama-3.3-70b-versatile
AI_API_KEY=gsk_...

# OpenRouter (free models carry a `:free` suffix)
AI_PROVIDER=openai-compat
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=meta-llama/llama-3.3-70b-instruct:free
AI_API_KEY=sk-or-v1-...

# Ollama / LM Studio (local, keyless)
AI_PROVIDER=openai-compat
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.1

# OpenAI
AI_PROVIDER=openai-compat
AI_MODEL=gpt-4o-mini
AI_API_KEY=sk-...

# Anthropic (legacy default)
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Keyless operation is allowed **only** for `openai-compat` (the `Authorization` header is omitted). An unknown `AI_PROVIDER` fails fast with HTTP 500 — it never silently falls back. Answers are grounded on `data/portfolio-knowledge.md`: the full KB is injected while it fits under `AI_KB_FULL_THRESHOLD`, otherwise the route falls back to BM25 retrieval.

## Commands

| Command                              | Description                                                            |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `npm run dev`                        | Development server                                                     |
| `npm run build` / `npm start`        | Production build and serve                                             |
| `npm run validate:all`               | Full quality gate: lint → format check → typecheck → tests → audit     |
| `npm run lint`                       | ESLint (flat config)                                                   |
| `npm run format:check`               | Prettier check (`npm run format` to write)                             |
| `npm run typecheck`                  | `tsc --noEmit`                                                         |
| `npm run test`                       | Vitest unit/component tests                                            |
| `npm run test:e2e`                   | Playwright E2E tests (chromium/firefox/webkit)                         |
| `npx tsx scripts/validate-design.ts` | Design-token audit (flags hardcoded colors and inline styles)          |
| `npx fallow audit`                   | Dead code / duplication / complexity audit (new code vs `origin/main`) |

## Project Structure

```
src/
├── app/                    # Next.js App Router + API routes
│   └── api/                # /chat, /screenshot, /project-meta, /weather
├── components/
│   ├── os/                 # Window, Desktop, Dock, TopBar, Taskbar, ChatPanel, CommandPalette
│   ├── apps/               # AboutApp, BrowserApp, ProjectGrid, ProjectSidePanel, ReadmeView, TerminalApp, ContactApp, ResumeApp, ControlPanelApp, ChatApp (+ chat-internal)
│   ├── widgets/            # CPU, Weather, Music, Notes (+ WidgetWrapper)
│   └── theme/              # ThemeProvider
├── store/                  # Zustand slices (window, theme, widget, chat, music, ui, browser)
├── hooks/                  # Drag, glass glare, keyboard shortcuts, palette, long-press, viewport clamp
├── types/                  # TypeScript interfaces
└── lib/                    # App registry, shortcuts, palette data/DOM, terminal commands, RAG, ai/ (registry, adapters, prompt)
```

## Design System

Three themes defined entirely via CSS custom properties — no hardcoded colors in components:

- **Retro 2D** — warm browns, pixel fonts, sharp corners, glowing shadows
- **Neon City** — dark background, cyan/magenta/green accents, neon glow effects
- **Classic Editorial** — cream/sepia tones, serif typography, subtle shadows

Theming tokens live in `src/app/globals.css` via `@theme inline`; glass behaviour is driven by six CSS variables (`--glass-blur`, `--glass-saturate`, `--glass-opacity-*`, `--glass-edge-opacity`, `--glass-specular-opacity`) with per-theme presets. Design tokens live in `lib/design-tokens.ts` (root-level, imported by the validator) and are checked by `scripts/validate-design.ts`.

## Testing

- **Unit/component tests** (Vitest) — all seven Zustand slices, fuzzy scoring, shortcuts, terminal commands, drag boundaries, palette, Window, Taskbar, ControlPanel, sliders, selectors
- **E2E tests** (Playwright) on chromium, firefox, and webkit — window lifecycle, theme switching, mobile layout and the 768px boundary, persistence, drag, shortcuts, command palette, terminal, and metadata
- `npm run validate:all` is the gate: lint + format + typecheck + unit tests + `fallow audit`

## Deployment

```bash
npm run build
npm start
```

Deploy to Vercel, Netlify, or any Node.js host. Everything is prerendered except the five API routes (`/api/chat`, `/api/embed-check`, `/api/screenshot`, `/api/project-meta`, `/api/weather`). Set `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_SITE_URL` in the host's environment.

## License

MIT — see [`LICENSE`](./LICENSE).
