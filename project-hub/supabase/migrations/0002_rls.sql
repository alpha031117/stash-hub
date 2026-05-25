-- 0002_rls.sql
-- Row-level security: enforces multi-company separation at the DB layer.
-- Scoping pattern:
--   * Direct company_id  -> filter by user_company_ids()
--   * Via project_id     -> filter by projects.company_id in user_company_ids()
--   * Via task_id        -> filter through tasks -> projects -> company

alter table companies        enable row level security;
alter table company_members  enable row level security;
alter table projects         enable row level security;
alter table tasks            enable row level security;
alter table milestones       enable row level security;
alter table meetings         enable row level security;
alter table github_activity  enable row level security;
alter table tags             enable row level security;
alter table task_tags        enable row level security;
alter table sync_state       enable row level security;

create or replace function user_company_ids() returns setof uuid
language sql security definer stable as $$
  select company_id from company_members where user_id = auth.uid()
$$;

-- companies
create policy "members read companies" on companies for select
  using (id in (select user_company_ids()));
create policy "owner writes companies" on companies for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- company_members
create policy "members read membership" on company_members for select
  using (company_id in (select user_company_ids()));

-- projects
create policy "members access projects" on projects for all
  using (company_id in (select user_company_ids()))
  with check (company_id in (select user_company_ids()));

-- tasks
create policy "members access tasks" on tasks for all
  using (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ))
  with check (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ));

-- milestones
create policy "members access milestones" on milestones for all
  using (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ))
  with check (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ));

-- meetings
create policy "members access meetings" on meetings for all
  using (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ))
  with check (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ));

-- github_activity
create policy "members access github_activity" on github_activity for all
  using (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ))
  with check (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ));

-- tags (scoped by company_id directly)
create policy "members access tags" on tags for all
  using (company_id in (select user_company_ids()))
  with check (company_id in (select user_company_ids()));

-- task_tags (scope through task -> project -> company)
create policy "members access task_tags" on task_tags for all
  using (task_id in (
    select t.id from tasks t
    join projects p on p.id = t.project_id
    where p.company_id in (select user_company_ids())
  ))
  with check (task_id in (
    select t.id from tasks t
    join projects p on p.id = t.project_id
    where p.company_id in (select user_company_ids())
  ));

-- sync_state
create policy "members access sync_state" on sync_state for all
  using (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ))
  with check (project_id in (
    select id from projects where company_id in (select user_company_ids())
  ));
