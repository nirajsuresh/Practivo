# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start backend (Express + tsx hot-reload, port 5000)
npm run dev:client       # Start frontend only (Vite, port 5000)

# Build & Production
npm run build            # Build both frontend (Vite) and backend (esbuild → dist/index.cjs)
npm start                # Run production build

# Database
npm run db:push          # Push Drizzle schema changes to PostgreSQL (no migration files)

# Type Checking
npm run check            # Run tsc type check (no emit)
```

No test suite is currently configured.

## Environment Variables

Required in `.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` — Cloudflare R2 storage
- `GEMINI_API_KEY` — Google Gemini API for AI piece analysis
- `NODE_ENV` — `development` or `production`
- `SCOREBARS_PYTHON` — override Python command for bar detection (optional)
- `REPERTO_PDFTOPPM_PATH` / `POPPLER_PATH` — override Poppler binary path for PDF rendering (optional; falls back to Homebrew locations)

## Architecture

Réperto is a full-stack TypeScript app for classical musicians to track and learn musical repertoire.

### Stack
- **Frontend**: React 19 + Vite, Wouter (routing), TanStack React Query (server state), shadcn/ui + Tailwind CSS v4, Framer Motion, @dnd-kit
- **Backend**: Express 5 + TypeScript via `tsx`, Drizzle ORM, PostgreSQL, Multer (PDF uploads), Passport.js (installed but not yet wired up)
- **Storage**: Cloudflare R2 (S3-compatible) for PDFs and sheet music page images

### Path Aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*`

### Shared Schema
`shared/schema.ts` is the single source of truth — it defines all Drizzle ORM table definitions and Zod insert schemas. Both frontend and backend import from here. Never duplicate type definitions.

The file also exports `PHASE_TYPES` (ordered array) and `PHASE_LABELS` (label + description per phase). Always import phase constants from here rather than hardcoding strings.

### Data Flow
```
React (TanStack Query) → apiRequest() [x-user-id header] → Express routes → IStorage interface → Drizzle ORM → PostgreSQL
                                                                           → Cloudflare R2 (files)
```

### Auth
Authentication uses a mock pattern: the frontend stores a user ID in `localStorage` and sends it as the `x-user-id` header. Passport.js is installed but not integrated. Full session-based auth is a pending TODO.

### Key Backend Files
- `server/routes.ts` (~1750 lines): All REST API endpoints under `/api/*`
- `server/storage.ts` (~1000 lines): `IStorage` interface + full `DatabaseStorage` implementation; all DB access goes through this layer (~100+ methods)
- `server/r2.ts`: Cloudflare R2 S3-compatible client for file operations
- `server/auto-seed.ts`: Seeds composers/pieces/movements from `server/piano-library.json` on first run (89 composers, 2,616 pieces, 6,940 movements)
- `server/index.ts`: Express setup, global middleware (cache headers, request logging, error handler), startup migrations + auto-seeding

### Key Frontend Files
- `client/src/App.tsx`: Wouter router — all routes defined here
- `client/src/lib/queryClient.ts`: TanStack Query client + `apiRequest()` helper
- `client/src/lib/sheet-page.ts`: `useSheetPageUrl(sheetMusicId)` and `measuresUsePageGeometry(measures)` — used everywhere bar images are rendered
- `client/src/pages/`: One file per route page
- `client/src/components/ui/`: shadcn/ui component primitives — do not edit these directly
- `client/src/components/learning-plan-wizard.tsx`: Multi-step wizard (setup → upload → pageRange → processing → review → sectionMark → phases → confirm)
- `client/src/components/score-review-modal.tsx`: Full-screen bar detection editor (add/delete/move barlines)

### TanStack Query conventions
Query keys are URL strings (e.g. `` [`/api/learning-plans/${planId}/lessons`] ``). Default options: `staleTime: Infinity`, `refetchOnWindowFocus: false`, `retry: false`. When navigating between wizard steps that share a query, call `queryClient.invalidateQueries` on the key before transitioning so the next step fetches fresh data.

### API Conventions
- All endpoints prefixed with `/api/`
- No-cache headers set server-side for all API responses
- Returns JSON; errors use `{ error: "..." }` shape with standard HTTP status codes
- `x-user-id` header required for authenticated endpoints

### API Endpoint Groups
- `/api/composers`, `/api/pieces` — catalog search + detail
- `/api/repertoire` — user repertoire CRUD, reorder, milestone lifecycle (`started → read_through → notes_learned → up_to_speed → memorized → completed → performed`)
- `/api/learning-plans` — plan CRUD, lesson generation, today's lesson, suggestions
- `/api/lessons` — lesson day status, session context
- `/api/sheet-music` — PDF upload, processing status, page/measure APIs
- `/api/measures` — bounding box updates
- `/api/search/unified` — accent-insensitive fuzzy search (PostgreSQL `unaccent` + `pg_trgm`)
- `/api/auth`, `/api/users` — registration/login (mock), profile

### Database Schema (key tables)
- `composers`, `pieces`, `movements` — canonical music catalog
- `repertoireEntries` — user's personal repertoire; can be whole-piece or split per movement (`splitView` boolean)
- `pieceMilestones` — milestone tracking per piece/movement/cycle
- `sheetMusic` + `sheetMusicPages` + `measures` — uploaded PDFs → rendered pages → detected bar bounding boxes (normalized 0–1 `{x,y,w,h}` stored as JSONB)
- `learningPlans` + `lessonDays` + `measureProgress` — structured daily practice plans
- `planSections` — user-defined named regions within a plan (`name`, `measureStart/End`, `difficulty` 1–5)
- `planSectionPhases` — ordered phase assignments per section (`phaseType`, `repetitions`)
- `lessonDays` — daily sessions; fields include `sectionId`, `phaseType`, `tasks` (JSONB `SessionSection[]` with warmup + piece_practice task lists), `status` (upcoming | active | completed)
- `barFlags` — per-session difficulty flags on specific bars (`lessonDayId`, `measureId`, `note`, `resolved`)
- `planSuggestions` — server-generated suggestions to modify a plan (`type`: extra_sessions | revisit_phase, `status`: pending | accepted | dismissed)
- `userProfiles` — extended profile data separate from `users`

### Learning Phase System
Seven pedagogical phases in order: `orient → decode → chunk → coordinate → link → stabilize → shape`

Always reference `PHASE_TYPES` and `PHASE_LABELS` from `@shared/schema` — never hardcode phase strings.

### Lesson Generation Algorithm (`POST /api/learning-plans/:id/generate-lessons`)
Two strategies selected based on whether `planSections` exist:

- **With sections** (waterfall scheduler): Chunks each section by difficulty + playing level, allocates PHASE_BASE_EFFORT-weighted sessions per phase, then schedules intra-section linking (merging sub-chunks progressively), inter-section linking (combining all sections), and full-piece stabilize + shape. Each `lessonDay.tasks` is a JSONB array of `SessionSection` objects.
- **Flat fallback**: Evenly distributes measure ranges across lesson days if no sections are defined.

`computeSuggestions()` in `routes.ts` runs after each completed session: it inspects bar flag counts and generates `planSuggestions` records (extra sessions, revisit phase, etc.).

### Sheet Music Bar Detection Pipeline
PDF uploads go through: Multer → R2 → `pdfjs-dist` page rendering → `server/scorebars/detect_bars.py` (ML) → bounding boxes stored as JSONB in `measures` table with cropped image URLs on R2.

Key files in `server/scorebars/`:
- `index.ts` — `ScorebarService` orchestrator
- `pdf-processor.ts` — wraps `pdftoppm` (Poppler) to render pages at 220 DPI
- `bar-detector.ts` — wraps Python `detect_bars.py` via `spawnSync`; falls back to a 4-column grid if Python fails
- `concurrency.ts` — limits parallel renders (default 2–4) to avoid resource exhaustion
- `image-crop.ts` — crops bar images for R2 storage

### Sheet Music Rendering (frontend)
`measuresUsePageGeometry(measures)` → `true` if every measure has `pageNumber` + `boundingBox`. When true, use full-page images with absolute overlays. When false (no geometry), render bar strip images. Both session-page and plan-page use this pattern via `useSheetPageUrl`.
