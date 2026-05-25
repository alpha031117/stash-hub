-- 0001_core.sql
-- Project Hub core schema: companies, projects, tasks, milestones,
-- meetings, github_activity, tags, sync_state, plus updated_at triggers.

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6366f1',
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table company_members (
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'on_hold', 'completed', 'archived')),
  repo_url text,
  calendar_id text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'backlog' check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  position numeric not null default 0,
  due_date timestamptz,
  assignee_id uuid references auth.users(id),
  github_issue_id text,
  github_issue_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

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

create table sync_state (
  project_id uuid not null references projects(id) on delete cascade,
  source text not null check (source in ('github', 'google_calendar')),
  last_synced_at timestamptz not null default now(),
  cursor text,
  primary key (project_id, source)
);

create index idx_projects_company on projects(company_id);
create index idx_tasks_project_status on tasks(project_id, status);
create index idx_tasks_due on tasks(due_date) where due_date is not null;
create index idx_meetings_project_starts on meetings(project_id, starts_at);
create index idx_github_activity_project_occurred on github_activity(project_id, occurred_at desc);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();
create trigger trg_tasks_updated before update on tasks
  for each row execute function set_updated_at();
