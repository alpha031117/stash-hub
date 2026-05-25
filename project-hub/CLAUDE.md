# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (port 5173)
npm run dev

# Full Tauri desktop app (runs dev server + Rust backend)
npm run tauri dev

# Type-check + build frontend to dist/
npm run build

# Build desktop app for distribution
npm run tauri build

# Lint
npm run lint
```

No test suite exists yet.

## Architecture

**StashHub** is a Tauri 2 desktop app: a React 19 SPA frontend talking directly to Supabase, with a Rust backend that handles native OS features (Google OAuth, file storage).

### Data flow

- **Supabase** is the database and auth provider. The frontend calls it directly via the JS client — there is no intermediate API server. Row-level security is assumed.
- **Active company** (`uiStore.activeCompanyId`) gates almost every query. All hooks that fetch projects, tasks, and calendar data read this from Zustand and use it as a React Query cache key segment. Switching company invalidates nothing automatically — keys just change, so old data stays cached separately.
- **React Query** is the async state layer. Default: `staleTime: 30s`, `refetchOnWindowFocus: false`, `retry: 1`. Individual hooks override these where needed.

### Frontend structure

```
src/
  App.tsx          # Router — public: /login /signup; protected: /dashboard /projects /settings
  lib/
    supabase.ts    # Single Supabase client instance (throws if env vars missing)
    queryClient.ts # Single QueryClient with defaults
    utils.ts       # cn() helper
  stores/
    uiStore.ts     # activeCompanyId + sidebarOpen, persisted to localStorage as 'stashhub-ui'
    filterStore.ts # Kanban search/priority/tag filters (not persisted)
  hooks/           # One file per domain — all data fetching lives here
  pages/           # Thin: import hooks + components, assemble layout
  components/
    ui/            # shadcn/ui primitives (base-ui-backed — no asChild, onSelect→onClick)
    layout/        # AppLayout, Sidebar, CompanySwitcher
    kanban/        # Board (dnd-kit), Column, TaskCard, TaskDialog, FilterBar
    dashboard/     # KpiCards, ThroughputChart, WipChart, MeetingsWidget, UpcomingDeadlines
```

### Rust backend (`src-tauri/src/`)

Only one module beyond the Tauri boilerplate: `google.rs`. It exposes four Tauri commands:

| Command | Description |
|---|---|
| `google_is_connected` | Checks if token file exists for company |
| `google_exchange_code` | Completes OAuth PKCE flow, saves tokens to disk |
| `google_fetch_meetings` | Fetches next 30 days from Google Calendar API |
| `google_disconnect` | Deletes token file |

Tokens are stored as JSON at `{app_data_dir}/google_tokens_{company_id}.json` (i.e. `%APPDATA%\StashHub\`). Adding new Tauri commands requires registering them in `lib.rs`'s `invoke_handler`.

### Key patterns

**Task positioning**: Tasks use integer `position` values spaced by 1000 (Lexorank-style). `useTasks.ts` calculates midpoints for insertion and rebalances the column when gaps shrink below a threshold.

**Google OAuth**: PKCE flow runs entirely client-side. `useGoogleConnect` starts a local HTTP listener (via `tauri-plugin-oauth`), opens the Google auth URL in the system browser, waits for the redirect callback (5-min timeout), then calls `google_exchange_code` to exchange the code and persist tokens. Connected state is set optimistically via `setQueryData` — no immediate re-verification.

**Multi-company Google tokens**: One token file per `companyId`. `useGoogleConnected` / `useGoogleMeetings` scope their React Query keys to `companyId` so per-company state is cached independently.

## Environment variables

Required in `.env.local`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_CLIENT_ID=      # OAuth client from Google Cloud Console
VITE_GOOGLE_CLIENT_SECRET=  # Must have Calendar API enabled on the GCP project
```

The Google OAuth redirect URI is `http://localhost:{port}` (dynamic port assigned by `tauri-plugin-oauth`). Add `http://localhost` as an authorised redirect URI in the GCP console (with no port — Google allows any port on localhost for desktop apps).
