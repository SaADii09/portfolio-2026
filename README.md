# DevOS Portfolio

Interactive Web OS portfolio — a fully functional desktop environment in the browser. Built with Next.js 16, Tailwind v4, Zustand, and Framer Motion.

**Live demo**: [saadahmad.dev](https://saadahmad.dev) _(placeholder)_

## Features

- **3 switchable themes** — Retro 2D, Neon City, Classic Editorial with live CSS variable swapping
- **Window management** — drag, resize (all edges/corners), minimize, maximize, restore, close, opacity control
- **6 functional apps** — About, Projects (iframe previews), Terminal, Contact, Resume, Control Panel
- **5 live widgets** — Clock, CPU monitor, Weather (Open-Meteo API), Music player, Sticky notes
- **AI chat assistant** — Anthropic streaming API with RAG from local knowledge base
- **Live wallpapers** — Canvas-rendered per theme (retro embers, neon grid, editorial curves)
- **Full mobile support** — floating windows with drag/resize, bottom tab bar, chat bottom sheet, 44px touch targets
- **Persistence** — theme, windows, widgets, music state saved to localStorage

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

Create a `.env.local` for the AI chat:

```
ANTHROPIC_API_KEY=sk-ant-...
```

The app works without this — chat shows an error message if the key is missing.

## Commands

| Command                  | Description                                |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Development server                         |
| `npm run build`          | Production build                           |
| `npm run lint`           | ESLint                                     |
| `npm run test`           | Vitest unit/component tests (47 tests)     |
| `npm run test:e2e`       | Playwright E2E tests (requires dev server) |
| `npx prettier --check .` | Check formatting                           |

## Project Structure

```
src/
├── app/                    # Next.js App Router + API routes
│   └── api/                # /chat, /screenshot, /weather
├── components/
│   ├── os/                 # Window, Desktop, Taskbar, ChatPanel, Wallpaper
│   ├── apps/               # AboutApp, ProjectsApp, TerminalApp, etc.
│   ├── widgets/            # Clock, CPU, Weather, Music, Notes
│   └── theme/              # ThemeProvider
├── store/                  # Zustand slices (window, theme, widget, chat, music)
├── hooks/                  # useMediaQuery
├── types/                  # TypeScript interfaces
└── lib/                    # Constants, RAG pipeline, utilities
```

## Design System

Three themes defined entirely via CSS custom properties — no hardcoded colors in components:

- **Retro 2D** — warm browns, pixel fonts, sharp corners, glowing shadows
- **Neon City** — dark background, cyan/magenta/green accents, neon glow effects
- **Classic Editorial** — cream/sepia tones, serif typography, subtle shadows

All theming tokens live in `src/app/globals.css` via `@theme inline`.

## Testing

- **47 unit/component tests** across 5 files (all Zustand slices, Window, Taskbar, ControlPanel)
- **4 E2E specs** (theme switching, window lifecycle, mobile layout, localStorage persistence)
- Run `npm run test` for unit tests, `npm run test:e2e` for Playwright (needs dev server running)

## Deployment

```bash
npm run build
npm start
```

Deploy to Vercel, Netlify, or any Node.js hosting. The app is fully static except for the 3 API routes (`/api/chat`, `/api/screenshot`, `/api/weather`).

## License

MIT
