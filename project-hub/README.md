# StashHub

A desktop project management app built with Tauri 2, React 19, and Supabase. Manage companies, projects, and tasks on a kanban board with Google Calendar integration.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/#windows) (Microsoft C++ Build Tools + WebView2)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

Create a project at [supabase.com](https://supabase.com), then run the migration:

```bash
npx supabase db push
# or apply manually via the Supabase SQL editor:
# supabase/migrations/0001_core.sql
```

### 3. Configure environment variables

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. (Optional) Google Calendar integration

To enable the Google Calendar widget on the dashboard:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project
2. Enable the **Google Calendar API** under *APIs & Services → Library*
3. Create an OAuth 2.0 Client ID under *APIs & Services → Credentials*
   - Application type: **Desktop app**
   - Add `http://localhost` as an authorised redirect URI (no port needed — Google allows any port on localhost for desktop apps)
4. Add to `.env.local`:

```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=your-client-secret
```

## Development

```bash
# Run the full desktop app (starts Vite dev server + Rust backend)
npm run tauri dev

# Frontend only (no Rust, opens in browser)
npm run dev
```

## Build

```bash
# Produce a distributable installer in src-tauri/target/release/bundle/
npm run tauri build
```

## Project structure

```
src/                  # React frontend
  components/         # UI components (kanban, dashboard, layout)
  hooks/              # Data fetching (React Query + Supabase)
  pages/              # Route-level components
  stores/             # Zustand state (active company, filters)
  lib/                # Supabase client, React Query client
src-tauri/
  src/
    lib.rs            # Tauri app setup, command registration
    google.rs         # Google OAuth + Calendar API commands
supabase/
  migrations/         # Database schema
```
