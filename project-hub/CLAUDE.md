# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `project-hub/` (the app lives in this subdirectory of the repo root, not at the root).

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
  App.tsx          # Router — public: /login /signup; protected: /dashboard /projects
                   #   /projects/:projectId /standup /notes /claude-code /settings. Calls useAppUpdater() at mount.
  lib/
    supabase.ts    # Single Supabase client instance (throws if env vars missing)
    queryClient.ts # Single QueryClient with defaults
    utils.ts       # cn() helper
    standup.ts     # Pure functions: lookback windows, task filtering, template rendering
  stores/
    uiStore.ts       # activeCompanyId + sidebarOpen, persisted to localStorage as 'stashhub-ui'
    filterStore.ts   # Kanban search/priority/tag filters (not persisted)
    standupStore.ts  # Per-scope standup config, persisted as 'stashhub-standup' (versioned w/ migrate)
    notesStore.ts    # Per-scope note HTML, persisted as 'stashhub-notes'
  hooks/           # One file per domain — all data fetching lives here
  pages/           # Thin: import hooks + components, assemble layout
  components/
    ui/            # shadcn/ui primitives (base-ui-backed — no asChild, onSelect→onClick)
    layout/        # AppLayout, Sidebar, CompanySwitcher
    kanban/        # Board (dnd-kit), Column, TaskCard, TaskDialog, FilterBar
    dashboard/     # KpiCards, ThroughputChart, WipChart, MeetingsWidget, TodoTasks
```

### Rust backend (`src-tauri/src/`)

Two feature modules beyond the Tauri boilerplate: `google.rs` and `claude_code.rs`. Commands:

| Command | Description |
|---|---|
| `google_is_connected` | Checks if token file exists for company |
| `google_exchange_code` | Completes OAuth PKCE flow, saves tokens to disk |
| `google_fetch_meetings` | Fetches next 30 days from Google Calendar API |
| `google_disconnect` | Deletes token file |
| `cc_list_projects` | Lists Claude Code projects under `~/.claude/projects` |
| `cc_project_detail` | Sessions + reconstructed task lists + memory + recent prompts for one project |
| `cc_mavis_brain` | Parses the user's installed "Mavis" long-term-memory brain |

Google tokens are stored as JSON at `{app_data_dir}/google_tokens_{company_id}.json` (i.e. `%APPDATA%\StashHub\`). Adding new Tauri commands requires registering them in `lib.rs`'s `invoke_handler`.

### Key patterns

**Task positioning**: Tasks use integer `position` values spaced by 1000 (Lexorank-style). `useTasks.ts` calculates midpoints for insertion and rebalances the column when gaps shrink below a threshold.

**Google OAuth**: PKCE flow runs entirely client-side. `useGoogleConnect` starts a local HTTP listener (via `tauri-plugin-oauth`), opens the Google auth URL in the system browser, waits for the redirect callback (5-min timeout), then calls `google_exchange_code` to exchange the code and persist tokens. Connected state is set optimistically via `setQueryData` — no immediate re-verification.

**Multi-company Google tokens**: One token file per `companyId`. `useGoogleConnected` / `useGoogleMeetings` scope their React Query keys to `companyId` so per-company state is cached independently.

**Local-only features (Standup & Notes)**: Unlike projects/tasks, Standup config and Notes content live entirely in `localStorage` via Zustand `persist` — not in Supabase. Both are keyed by a **scope** string = `activeCompanyId` or `'__global__'` when no company is active (see `useStandupScope`, `NOTES_GLOBAL_SCOPE`). `standupStore` is versioned (`version: 2`) with a `migrate` that lifts pre-scope flat config into the `__global__` scope — bump the version and extend `migrate` when changing its shape.

**Standup rendering**: `lib/standup.ts` is pure (no React/IO) and unit-testable. The Standup page reads completed tasks within a lookback window (`lookbackWindow` accounts for weekends in `last-workday` mode) and renders a `{{token}}` template; add a token in both `renderStandup`'s replace chain and the `PLACEHOLDERS` list.

**Notes**: TipTap rich-text editor (`@tiptap/react` + starter-kit, link, image). Content is stored as HTML strings per scope.

**Auto-updater**: `useAppUpdater` (called once in `App.tsx`) checks the GitHub Releases `latest.json` endpoint on startup, prompts via `window.confirm`, then `downloadAndInstall()` + `relaunch()`. Requires the `updater` + `process` Tauri plugins (registered in `lib.rs`) and the `pubkey`/`endpoints` config in `tauri.conf.json`. Releases must be signed with the matching private key for the update to be accepted.

**Claude Code integration** (`/claude-code` page, `claude_code.rs`, `useClaudeCode.ts`): read-only view of the user's *own* Claude Code activity from `~/.claude`. There is no Claude Code API — everything is parsed from local files in Rust:
- **Task progress is reconstructed, not stored.** Session transcripts (`projects/<slug>/<sessionId>.jsonl`) contain `TaskCreate`/`TaskUpdate` tool calls; `parse_session` replays them. `TaskCreate`'s result text is `"Task #N created successfully: …"` — the `#N` is the id that later `TaskUpdate`s reference.
- **Project path comes from the *first* `cwd` in a transcript**, not the last. The shell can `cd` mid-session, but `history.jsonl`'s `project` field (used to match Recent Activity) equals the launch dir = first `cwd`. Matching on the last cwd silently yields zero activity rows.
- The folder slug (e.g. `C--Users-alpha-Documents-Stash`) is lossy (`-` is ambiguous with path separators) — never decode it for matching; derive the real path from `cwd`.
- `CcCounts` uses `#[serde(rename_all = "camelCase")]`, so `in_progress` crosses the boundary as `inProgress`. `tsc` won't catch a snake/camel mismatch since the JSON is untyped at `invoke`.

**Mavis brain** (`cc_mavis_brain`, Memory tab): "Mavis" is a separate long-term-memory system the user may have installed. The brain root is **discovered from `~/.claude/commands/mavis.md`** (parse the backticked `…\CLAUDE.md` path, take its parent) — never hardcode it. The brain is a markdown repo (`identity/`, `daily-memories/<date>.md`, `projects/<name>/{index,progress,notes}.md`, `topic_index.md`). The integration's hook: each Mavis project's `index.md` frontmatter has a `path:` field that equals a real working dir, so the Memory tab **links a Claude Code project to its Mavis project by comparing that `path` to the project's `cwd`** (normalize separators + case for Windows). If `mavis.md` or the brain dir is absent, `cc_mavis_brain` returns `{ installed: false }` and the UI falls back to the `.claude` auto-memory.

## Environment variables

Required in `.env.local`:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_CLIENT_ID=      # OAuth client from Google Cloud Console
VITE_GOOGLE_CLIENT_SECRET=  # Must have Calendar API enabled on the GCP project
```

The Google OAuth redirect URI is `http://localhost:{port}` (dynamic port assigned by `tauri-plugin-oauth`). Add `http://localhost` as an authorised redirect URI in the GCP console (with no port — Google allows any port on localhost for desktop apps).
