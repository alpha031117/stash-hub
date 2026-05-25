# Project Hub — Implementation Guide

A multi-company project management desktop app for tracking tasks, progress, GitHub activity, and meeting schedules across separate jobs and freelance work.

---

## 1. Overview

### Goals
- Manage projects across multiple companies (main job, freelance) with strict separation.
- Kanban-style task and backlog management.
- Progress dashboards and analytics per project and across companies.
- GitHub integration: surface commits, PRs, and issues per project.
- Google Calendar integration: surface meetings and deadlines per project.
- Desktop app that syncs to a cloud database.
- Architected to optionally support collaborators in the future.

### Non-goals (for v1)
- Mobile app.
- Offline-first with conflict resolution (single-device assumption for v1).
- Real-time collaborative editing.
- Time tracking, invoicing, or CRM features.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | Tauri 2.x | ~10MB bundle, native OS integration, Rust backend for secure token storage |
| UI framework | React 18 + TypeScript | Team familiarity, ecosystem |
| Build tool | Vite | Fast dev server, first-class TS support |
| Styling | Tailwind CSS + shadcn/ui | Polished components without lock-in |
| Server state | TanStack Query v5 | Caching, background refetch, optimistic updates |
| Local state | Zustand | Lightweight, minimal boilerplate |
| Drag and drop | @dnd-kit | Accessible, performant Kanban interactions |
| Charts | Recharts | React-native API, sufficient for dashboards |
| Forms | React Hook Form + Zod | Type-safe validation |
| Routing | React Router v6 | Standard SPA routing |
| Backend | Supabase | Postgres + Auth + RLS + Realtime, generous free tier |
| Local cache | Tauri SQL plugin (SQLite) | Optional persistent cache for instant cold start |
| External APIs | GitHub REST/GraphQL, Google Calendar v3 | Industry standard |

---

## 3. Project structure

```
project-hub/
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/             # Tauri commands exposed to JS
│   │   │   ├── auth.rs           # OAuth flows
│   │   │   ├── secrets.rs        # Keyring access
│   │   │   └── mod.rs
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                          # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client singleton
│   │   ├── queryClient.ts        # TanStack Query config
│   │   ├── github.ts             # GitHub API client
│   │   ├── calendar.ts           # Google Calendar API client
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useCompanies.ts
│   │   ├── useProjects.ts
│   │   ├── useTasks.ts
│   │   ├── useMeetings.ts
│   │   └── useGitHubActivity.ts
│   ├── components/
│   │   ├── ui/                   # shadcn primitives
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── CompanySwitcher.tsx
│   │   │   └── TopBar.tsx
│   │   ├── kanban/
│   │   │   ├── Board.tsx
│   │   │   ├── Column.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   └── TaskDialog.tsx
│   │   ├── dashboard/
│   │   │   ├── ThroughputChart.tsx
│   │   │   ├── WipByCompany.tsx
│   │   │   └── UpcomingDeadlines.tsx
│   │   └── integrations/
│   │       ├── GitHubFeed.tsx
│   │       └── MeetingsList.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── ProjectList.tsx
│   │   ├── ProjectDetail.tsx
│   │   ├── Settings.tsx
│   │   └── Login.tsx
│   ├── stores/
│   │   ├── uiStore.ts            # active company, theme, sidebar state
│   │   └── filterStore.ts        # Kanban filters, search
│   ├── workers/
│   │   ├── githubSync.ts         # Background poll
│   │   └── calendarSync.ts       # Background poll
│   └── types/
│       └── database.ts           # Generated from Supabase schema
├── supabase/
│   ├── migrations/               # SQL migration files
│   └── seed.sql
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## 4. Database schema

All tables live in Supabase Postgres. Run these as migrations in order.

### 4.1 Core tables

```sql
-- Companies (e.g. "Main Job", "Freelance")
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6366f1',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Membership table (for future collaborator support)
create table company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- Projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'on_hold', 'completed', 'archived')),
  repo_url text,                  -- e.g. https://github.com/org/repo
  calendar_id text,               -- Google Calendar ID
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'backlog' check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  position numeric not null default 0,    -- for drag-and-drop ordering
  due_date timestamptz,
  assignee_id uuid references auth.users(id),
  github_issue_id text,
  github_issue_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Milestones
create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Meetings (synced from Google Calendar)
create table meetings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  calendar_event_id text not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meeting_url text,
  created_at timestamptz not null default now(),
  unique (project_id, calendar_event_id)
);

-- GitHub activity feed (synced)
create table github_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  type text not null check (type in ('commit', 'pr_opened', 'pr_merged', 'pr_closed', 'issue_opened', 'issue_closed', 'release')),
  external_id text not null,
  title text not null,
  url text not null,
  author text,
  occurred_at timestamptz not null,
  metadata jsonb,
  unique (project_id, type, external_id)
);

-- Tags (per company)
create table tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  color text,
  unique (company_id, name)
);

create table task_tags (
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

-- Sync state (when each integration last ran per project)
create table sync_state (
  project_id uuid not null references projects(id) on delete cascade,
  source text not null check (source in ('github', 'google_calendar')),
  last_synced_at timestamptz not null default now(),
  cursor text,                    -- for resumable syncs
  primary key (project_id, source)
);

-- Useful indexes
create index idx_projects_company on projects(company_id);
create index idx_tasks_project_status on tasks(project_id, status);
create index idx_tasks_due on tasks(due_date) where due_date is not null;
create index idx_meetings_project_starts on meetings(project_id, starts_at);
create index idx_github_activity_project_occurred on github_activity(project_id, occurred_at desc);

-- Auto-update updated_at trigger
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();
```

### 4.2 Row-level security policies

This is what enforces multi-company separation at the database level. Even a buggy frontend cannot leak data across companies.

```sql
alter table companies enable row level security;
alter table company_members enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table milestones enable row level security;
alter table meetings enable row level security;
alter table github_activity enable row level security;
alter table tags enable row level security;
alter table task_tags enable row level security;
alter table sync_state enable row level security;

-- Helper: companies the current user can access
create or replace function user_company_ids() returns setof uuid
language sql security definer stable as $$
  select company_id from company_members where user_id = auth.uid()
$$;

-- Companies: members can read; only owner can update/delete
create policy "members read companies" on companies for select
  using (id in (select user_company_ids()));
create policy "owner writes companies" on companies for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Company members: members of the company can read
create policy "members read membership" on company_members for select
  using (company_id in (select user_company_ids()));

-- Projects: scoped through company membership
create policy "members access projects" on projects for all
  using (company_id in (select user_company_ids()))
  with check (company_id in (select user_company_ids()));

-- Tasks: scoped through project -> company
create policy "members access tasks" on tasks for all
  using (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ))
  with check (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ));

-- Repeat the same pattern for milestones, meetings, github_activity, tags, sync_state.
-- task_tags requires checking task -> project -> company.
```

### 4.3 Auto-create membership when company is created

```sql
create or replace function auto_add_owner_membership() returns trigger as $$
begin
  insert into company_members (company_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_company_membership after insert on companies
  for each row execute function auto_add_owner_membership();
```

---

## 5. Authentication

### 5.1 Supabase Auth (app login)
- Email + password for v1. Add Google OAuth later if desired.
- The Supabase client stores the session in localStorage by default; Tauri's webview persists this between launches.

### 5.2 GitHub access
- Personal Access Token (PAT) with `repo` scope for private repos, or `public_repo` for public only.
- User pastes the PAT in Settings.
- Token is sent over the Tauri command bridge to Rust, which stores it in the OS keyring via the `keyring` crate.
- Never stored in Supabase or localStorage.

### 5.3 Google Calendar
- OAuth 2.0 with PKCE.
- The flow: app opens a browser to Google's consent screen; redirect URI is `http://localhost:<random-port>` that Tauri spins up; Rust exchanges the code for tokens and stores them in the keyring.
- Refresh token used to renew the access token silently.

### 5.4 Tauri commands for secrets

```rust
// src-tauri/src/commands/secrets.rs
use keyring::Entry;

#[tauri::command]
pub fn save_secret(service: String, key: String, value: String) -> Result<(), String> {
    let entry = Entry::new(&service, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_secret(service: String, key: String) -> Result<Option<String>, String> {
    let entry = Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
```

---

## 6. Integrations

### 6.1 GitHub sync worker

Polls every 10 minutes while the app is open, plus on demand.

```typescript
// src/workers/githubSync.ts
import { Octokit } from "@octokit/rest";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "@/lib/supabase";

const POLL_INTERVAL_MS = 10 * 60 * 1000;

export async function syncGitHubForProject(projectId: string, repoUrl: string) {
  const token = await invoke<string | null>("get_secret", {
    service: "project-hub",
    key: "github_pat",
  });
  if (!token) return;

  const { owner, repo } = parseRepoUrl(repoUrl);
  const octokit = new Octokit({ auth: token });

  const { data: state } = await supabase
    .from("sync_state")
    .select("last_synced_at")
    .eq("project_id", projectId)
    .eq("source", "github")
    .maybeSingle();

  const since = state?.last_synced_at ?? new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // Fetch in parallel
  const [commits, prs, issues] = await Promise.all([
    octokit.repos.listCommits({ owner, repo, since, per_page: 50 }),
    octokit.pulls.list({ owner, repo, state: "all", sort: "updated", direction: "desc", per_page: 50 }),
    octokit.issues.listForRepo({ owner, repo, state: "all", sort: "updated", since, per_page: 50 }),
  ]);

  const rows = [
    ...commits.data.map(c => ({
      project_id: projectId,
      type: "commit",
      external_id: c.sha,
      title: c.commit.message.split("\n")[0],
      url: c.html_url,
      author: c.commit.author?.name ?? null,
      occurred_at: c.commit.author?.date,
    })),
    ...prs.data.map(p => ({
      project_id: projectId,
      type: p.merged_at ? "pr_merged" : p.state === "closed" ? "pr_closed" : "pr_opened",
      external_id: String(p.number),
      title: p.title,
      url: p.html_url,
      author: p.user?.login ?? null,
      occurred_at: p.updated_at,
    })),
    ...issues.data
      .filter(i => !i.pull_request)
      .map(i => ({
        project_id: projectId,
        type: i.state === "closed" ? "issue_closed" : "issue_opened",
        external_id: String(i.number),
        title: i.title,
        url: i.html_url,
        author: i.user?.login ?? null,
        occurred_at: i.updated_at,
      })),
  ];

  await supabase.from("github_activity").upsert(rows, {
    onConflict: "project_id,type,external_id",
  });

  await supabase.from("sync_state").upsert({
    project_id: projectId,
    source: "github",
    last_synced_at: new Date().toISOString(),
  });
}

export function startGitHubSyncLoop() {
  const tick = async () => {
    const { data: projects } = await supabase
      .from("projects")
      .select("id, repo_url")
      .not("repo_url", "is", null);
    for (const p of projects ?? []) {
      try { await syncGitHubForProject(p.id, p.repo_url!); }
      catch (e) { console.error("GitHub sync failed for", p.id, e); }
    }
  };
  tick();
  return setInterval(tick, POLL_INTERVAL_MS);
}
```

### 6.2 Google Calendar sync worker

Same shape: poll every 15 minutes, upsert into the `meetings` table.

```typescript
// src/workers/calendarSync.ts (sketch)
export async function syncCalendarForProject(projectId: string, calendarId: string) {
  const accessToken = await getValidGoogleAccessToken(); // handles refresh
  const timeMin = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const { items } = await res.json();

  const rows = items.map((e: any) => ({
    project_id: projectId,
    calendar_event_id: e.id,
    title: e.summary ?? "(no title)",
    description: e.description,
    starts_at: e.start.dateTime ?? e.start.date,
    ends_at: e.end.dateTime ?? e.end.date,
    meeting_url: e.hangoutLink ?? extractMeetingUrl(e),
  }));

  await supabase.from("meetings").upsert(rows, {
    onConflict: "project_id,calendar_event_id",
  });
}
```

### 6.3 Linking projects to integrations
- `projects.repo_url` is plain text; user pastes the URL.
- `projects.calendar_id` is the Google Calendar ID; user picks from a dropdown of their calendars after OAuth.
- Both are nullable — a project doesn't need either.

---

## 7. Key UI flows

### 7.1 Company switcher
Top-left dropdown lists all companies. Selecting one filters the entire app (sidebar, dashboards, search). Selecting "All companies" gives a cross-company overview. The active company is held in Zustand and persisted to localStorage.

### 7.2 Kanban board
- One column per status: Backlog, To Do, In Progress, Review, Done.
- Tasks sorted by `position` within each column.
- Drag with @dnd-kit; on drop, optimistically update local state, then mutate Supabase with new status + position. Position is computed as the midpoint between adjacent tasks; rebalance periodically.
- Clicking a card opens a side panel for full editing (title, description, due date, priority, tags, linked GitHub issue).
- Filter bar: by assignee, tag, priority, due-date range, text search.

### 7.3 Dashboard
- Top row: KPI cards (open tasks, tasks due this week, overdue, completed this week).
- Throughput chart: tasks completed per day over last 30 days, stacked by company.
- WIP by company: horizontal bar chart.
- Upcoming meetings: list of next 7 days from `meetings`.
- Recent GitHub activity: last 20 items from `github_activity`.

### 7.4 Project detail page
Tabbed view: Overview, Board, Backlog, Milestones, Meetings, GitHub.

---

## 8. Build phases

Each phase is independently shippable. Don't move forward until the previous phase works end to end.

### Phase 1 — Foundation (week 1)
- Scaffold Tauri + React + Vite + Tailwind.
- Create Supabase project.
- Apply migrations from §4.1 and §4.2.
- Implement Supabase client and login page.
- Login flow works; protected routes redirect.
- Acceptance: user can sign up, log in, log out, and see an empty home page.

### Phase 2 — Companies & projects (week 2)
- Companies CRUD with color picker.
- Company switcher in the sidebar.
- Projects CRUD scoped to active company.
- Acceptance: user can create two companies, create projects in each, and confirm RLS by trying to query the other company's projects with the wrong context (should return empty).

### Phase 3 — Kanban tasks (week 2–3)
- Tasks CRUD.
- Board view with @dnd-kit.
- Task detail dialog with all fields.
- Tags management.
- Filtering and search.
- Acceptance: smooth drag-and-drop, no flicker, sub-100ms interaction; refresh preserves order.

### Phase 4 — Dashboards (week 3–4)
- KPI cards.
- Throughput, WIP, and deadline widgets with Recharts.
- Cross-company "All companies" view.
- Acceptance: dashboards reflect changes within 1 second of task updates (TanStack Query invalidation).

### Phase 5 — GitHub integration (week 4–5)
- Settings page for PAT entry via Tauri command.
- Sync worker on app start + 10-minute interval.
- Manual "Sync now" button on project page.
- GitHub feed component on project detail.
- Acceptance: PAT survives app restart; private repos sync; rate limit handled gracefully.

### Phase 6 — Google Calendar integration (week 5–6)
- OAuth flow via Tauri.
- Calendar picker per project.
- Sync worker on app start + 15-minute interval.
- Meetings widget on dashboard and project page.
- Acceptance: tokens refresh automatically; events from multiple calendars don't cross-pollinate.

### Phase 7 — Polish (week 6–7)
- Global keyboard shortcuts (cmd+k command palette, cmd+n new task).
- Empty states and loading skeletons.
- Error toast system.
- Auto-update via Tauri updater.
- Build signed installers for macOS and Windows.

### Phase 8 — Optional: collaborators
- Invite-by-email flow that adds a row to `company_members`.
- Role-based UI gating (viewer can't edit).
- This works "for free" thanks to RLS; only the UI changes.

---

## 9. Security considerations

### 9.1 Token storage
- GitHub PAT and Google OAuth tokens live in the OS keyring (macOS Keychain, Windows Credential Manager, libsecret on Linux) via the `keyring` Rust crate.
- The Supabase session token is in localStorage (web standard) — acceptable for a single-user desktop app, since localStorage is sandboxed per Tauri app identity.

### 9.2 Multi-company data isolation
- RLS policies (§4.2) are the source of truth. The frontend cannot bypass them.
- Test RLS by attempting a query with a different `auth.uid()` in the Supabase SQL editor; it must return zero rows.

### 9.3 Optional: client-side encryption for sensitive fields
If you want freelance data unreadable even by Supabase staff:
- Generate a per-user encryption key, derived from a passphrase the user enters at app launch.
- Encrypt sensitive fields (`tasks.description`, `tasks.title`, `meetings.title`) before insert using AES-GCM (via `@noble/ciphers`).
- Decrypt in the UI layer; never store the passphrase.
- Trade-off: server-side search and indexing on those fields stops working.

### 9.4 GitHub PAT scope
- Use the minimum required: `public_repo` for public, `repo` only if private. Never grant `admin:org`, `delete_repo`, etc.

### 9.5 Supabase service role key
- Never bundle it in the desktop app. The app uses the anonymous key only.
- The service role key is for migrations and admin scripts run on your dev machine.

---

## 10. Configuration

### 10.1 Environment variables (.env)

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_GOOGLE_OAUTH_CLIENT_ID=<client-id>
```

The Google client secret is **not** put in env vars. PKCE flow makes it unnecessary; if the OAuth provider requires it, store it as a Rust constant in `src-tauri/`.

### 10.2 Tauri config highlights (tauri.conf.json)
- `productName`: "Project Hub"
- `identifier`: `com.yourname.projecthub` (also used as keyring service name)
- `bundle.targets`: `["dmg", "msi"]` for macOS and Windows
- `app.security.csp`: restrict to Supabase URL, GitHub, and Google APIs

### 10.3 Free-tier limits to watch
- Supabase: 500MB database, 5GB egress/month, 50k MAU. Solo use stays well within these.
- GitHub API: 5,000 requests/hour with PAT. The sync worker uses 3–10 requests per project per cycle.
- Google Calendar API: 1M requests/day per project. Effectively unlimited for personal use.

---

## 11. Open decisions

Decide these before Phase 2:

1. **Single Supabase project vs two**: one DB with RLS is simpler; two DBs (one per company) give you total isolation at the cost of duplicated infrastructure. Recommend: one DB unless your main employer's policy explicitly forbids cloud storage of non-work data.
2. **Client-side encryption**: yes/no? Adds complexity but is hard to retrofit. Decide now.
3. **Polling vs webhooks**: v1 is polling. Webhooks need a public endpoint (Supabase Edge Function works) and only matter if you want sub-minute latency on GitHub activity.

---

## 12. Useful commands

```bash
# Create the project
npm create tauri-app@latest project-hub -- --template react-ts

# Install runtime dependencies
npm install @supabase/supabase-js @tanstack/react-query zustand \
  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities \
  react-router-dom react-hook-form zod @hookform/resolvers \
  recharts date-fns @octokit/rest

# Install dev dependencies
npm install -D tailwindcss postcss autoprefixer @types/node

# Add shadcn/ui
npx shadcn@latest init
npx shadcn@latest add button card dialog input select dropdown-menu

# Add Tauri plugins
npm install @tauri-apps/plugin-sql @tauri-apps/plugin-shell
cargo add keyring --manifest-path src-tauri/Cargo.toml

# Generate types from Supabase
npx supabase gen types typescript --project-id <id> > src/types/database.ts

# Run dev
npm run tauri dev

# Build production installers
npm run tauri build
```

---

## 13. Acceptance criteria for v1

The app is "done enough" when:
- Two companies exist with distinct color codes and clean separation everywhere.
- At least four projects across the two companies have working Kanban boards.
- Tasks can be created, edited, dragged between columns, and tagged.
- The dashboard shows real throughput data and upcoming deadlines.
- One project has a linked GitHub repo with activity visible in its feed.
- One project has a linked Google Calendar with meetings visible.
- The app survives a full restart with all state intact.
- A signed installer exists for at least one platform.
