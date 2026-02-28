# Réperto - Classical Musician Repertoire Platform

## Overview

Réperto is a social network and repertoire tracking tool for classical musicians. The platform allows musicians to catalog their musical repertoire, track practice progress, connect with other musicians, and share recordings. The application follows a full-stack TypeScript architecture with a React frontend and Express backend, using PostgreSQL for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for client-side routing (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state management and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Forms**: React Hook Form with Zod validation via @hookform/resolvers
- **File Uploads**: Uppy with AWS S3 presigned URL uploads
- **Animations**: Framer Motion for page transitions and micro-interactions
- **Drag & Drop**: @dnd-kit for sortable repertoire table rows and Kanban board column drag-and-drop

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: Shared schema in `/shared/schema.ts` for type safety across frontend and backend
- **API Design**: RESTful endpoints under `/api/*` prefix
- **Static Serving**: Production builds served from `/dist/public`

### Data Storage
- **Primary Database**: PostgreSQL accessed via Drizzle ORM
- **Object Storage**: Google Cloud Storage integration via Replit's object storage service for file uploads (recordings, scores)
- **Session Storage**: Connect-pg-simple for PostgreSQL-backed sessions

### Key Design Patterns
- **Shared Types**: Schema definitions in `/shared/schema.ts` are used by both frontend and backend, ensuring type consistency
- **Storage Abstraction**: The `IStorage` interface in `/server/storage.ts` provides a clean abstraction layer over database operations
- **Presigned URL Uploads**: Two-step upload flow where backend provides presigned URLs and clients upload directly to object storage
- **Piano Library Seed**: `server/piano-library.json` contains the original piano repertoire catalog extracted from a user-provided SQLite database. Auto-seed in `server/auto-seed.ts` loads this on first run. Additional pieces were imported from `attached_assets/piano_additions_1772294001032.csv` (Tchaikovsky, Bartók, Stravinsky, Medtner, Barber, Kapustin, Ginastera, Satie, Janáček, Franck, Saint-Saëns, Albéniz, Granados, Busoni, plus transcription/arrangement entries). Total catalog: 48 composers, 2332 pieces, 6115 movements. Arrangements are filed under the arranger with the original composer prefixed in the piece title (e.g., "Bach: Chaconne in D minor BWV 1004 (arr. Busoni)" filed under Busoni).
- **Fuzzy Search**: All server-side search uses PostgreSQL `unaccent` (accent-insensitive) + `word_similarity` from `pg_trgm` (typo-tolerant). Multi-word queries are split into tokens and each token must ILIKE-match independently in the combined text (title + composer name), allowing queries like "brahms 119" to find "Four Pieces Op. 119" by Brahms. Scoring uses `GREATEST(word_similarity, tokenMatchRatio)` so results matching all tokens rank highest. Extensions created on startup in `auto-seed.ts`. Client-side `MultiSelectCombobox` uses NFD normalization for accent-insensitive local filtering.

### Build System
- **Development**: Vite dev server with HMR for frontend, tsx for backend hot reloading
- **Production**: Custom build script using esbuild for server bundling and Vite for client bundling
- **Output**: Server compiled to `/dist/index.cjs`, client assets to `/dist/public`

## External Dependencies

### Database
- **PostgreSQL**: Primary relational database (requires `DATABASE_URL` environment variable)
- **Drizzle Kit**: Schema migrations via `db:push` command

### Object Storage
- **Google Cloud Storage**: File storage for user uploads (recordings, score PDFs)
- **Replit Sidecar**: Token management for GCS authentication at `http://127.0.0.1:1106`

### Frontend Libraries
- **@tanstack/react-query**: Async state management
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, forms, etc.)
- **Recharts**: Data visualization for repertoire statistics
- **date-fns**: Date formatting and manipulation
- **Uppy**: File upload handling with dashboard UI

### Movement Management
- **Split/Rejoin**: `splitView` boolean column on `repertoire_entries` (default false); when true, each movement renders as its own card/row with independent status and progress; toggling via `PATCH /api/repertoire/piece/:pieceId` with `{ splitView: true/false }` updates all entries for that piece
- **Edit Movements**: `EditMovementsDialog` component allows adding/removing movements from a piece already in repertoire; fetches available movements from `GET /api/pieces/:pieceId/movements`, creates/deletes entries as needed; handles whole-piece entries (movementId null) by deleting them when switching to movement-based tracking
- **Board routing**: Split items use `PATCH /api/repertoire/:entryId` for individual status/progress updates; grouped items use `PATCH /api/repertoire/piece/:pieceId` for batch updates
- **Grouping logic**: `groupRepertoireData` in profile-page.tsx checks `splitView` per entry; split entries get ids like `entry-{id}`, grouped entries get ids like `{pieceId}`

### Unified Search
- **Endpoint**: `GET /api/search/unified?q=...` searches across pieces AND movements with full context
- **Result format**: `{ type: "piece"|"movement", composerId, composerName, pieceId, pieceTitle, movementId, movementName, score }`
- **Used in**: Add Piece dialog (top "Quick Search" field) and profile setup step 3 (above repertoire table)
- **Auto-fill logic**: Uses a counter-based `autoFillRef` (set to 2) to suppress cascading clear effects when composerId and pieceId change simultaneously; Add Piece dialog also stores `lastUnifiedResult` to avoid stale query data on submit
- **Profile setup**: `QuickSearchFill` component fills first empty row or creates a new one; passes `autoFilled` flag to `RepertoireSetupRow` which sets the counter before effects run

### AI-Powered Piece Analysis
- **Wikipedia + OpenAI Pipeline**: `GET /api/pieces/:pieceId/analysis` searches Wikipedia for the piece, fetches the article extract (up to 1500 chars), and uses OpenAI `gpt-5-nano` to generate a single short paragraph encyclopedia-style description
- **DB Caching**: Results are cached in the `piece_analyses` table (unique on `pieceId`); subsequent requests return instantly from cache
- **Upsert Safety**: Uses `onConflictDoUpdate` to handle concurrent first-visit requests without unique constraint errors
- **Error Handling**: Separate error paths for missing AI config (503), AI failures (502), and general errors (500)
- **Token Budget**: `max_completion_tokens: 4096` required because gpt-5-nano uses internal reasoning tokens; lower values cause empty responses

### Connections System
- **Two-way connection requests**: Users can search for other musicians, send connection requests, accept/deny received requests
- **Connection gating**: User profiles show limited preview (name, instrument, level) until connected; full profile + repertoire visible after connection accepted
- **`connections` table**: `id`, `requesterId`, `recipientId`, `status` (pending/accepted/denied), `createdAt`, `updatedAt`
- **API endpoints**: `GET /api/users/search`, `POST /api/connections`, `GET /api/connections/received|sent`, `GET /api/connections`, `PATCH /api/connections/:id`, `GET /api/connections/status/:userId`
- **Auth header**: All connection/search endpoints use `x-user-id` header (set automatically by `apiRequest` and `getQueryFn` from localStorage)
- **Frontend pages**: `/connections` (manage requests), `/user/:id` (public profile with connection gating), `/search` (real user search)

### Authentication (Partial Implementation)
- **Passport.js**: Authentication framework (dependencies present)
- **passport-local**: Username/password strategy
- **express-session**: Session management
- Current implementation uses localStorage mock auth - full auth needs completion

### Development Tools
- **Replit Plugins**: Vite plugins for Cartographer, dev banner, and runtime error overlay
- **TypeScript**: Strict mode enabled with path aliases (`@/*` and `@shared/*`)