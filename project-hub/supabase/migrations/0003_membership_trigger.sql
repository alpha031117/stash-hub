-- 0003_membership_trigger.sql
-- When a company is created, auto-insert the owner into company_members.
-- This is what makes the RLS policies (which use user_company_ids()) work
-- for the user who just created the company.

create or replace function auto_add_owner_membership() returns trigger as $$
begin
  insert into company_members (company_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_company_membership after insert on companies
  for each row execute function auto_add_owner_membership();
