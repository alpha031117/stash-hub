-- 0004_task_blockers.sql
-- Adds a per-task blockers note. Aggregated into the daily stand-up
-- "Issues Faced" section alongside any ad-hoc free-text blockers.
-- The existing completed_at column is reused as the editable "completed date".

alter table tasks add column blockers text;
