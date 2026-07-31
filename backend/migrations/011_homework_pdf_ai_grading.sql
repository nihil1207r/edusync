-- Phase 7: "Teams-style" homework — PDF submissions stored inline (no
-- object-storage bucket credentials in this environment, same constraint
-- already noted in migrations/005 for the Documents feature — see NOTES.md
-- for the honest tradeoff), teacher grading, and AI auto-evaluation.
--
-- Idempotent / safe to re-run: every statement below uses `if not exists`.

-- homework itself had no `class` column at all before this pass — every
-- assignment was school-wide regardless of who posted it, which didn't
-- match a real multi-class school (see the Phase 6 class-1-12 fix). It's
-- nullable + defaults via the teacher's own class in the Go handler,
-- exactly like `picnics.class`/`ptm_schedules.class` from Phase 6.
alter table homework add column if not exists class text;
create index if not exists idx_homework_class on homework(class);
update homework set class = '10A' where class is null;

alter table homework_submissions add column if not exists file_name text;
alter table homework_submissions add column if not exists file_base64 text; -- the PDF itself, base64-encoded
alter table homework_submissions add column if not exists file_size_bytes int;

-- Teacher's own grade, separate from the pre-existing free-text `grade`
-- column (kept, untouched, for backward compatibility with anything that
-- already wrote to it) — this one is a real number out of homework.points,
-- so it can be averaged/aggregated.
alter table homework_submissions add column if not exists marks_awarded int;
alter table homework_submissions add column if not exists graded_by text;
alter table homework_submissions add column if not exists graded_at timestamptz;

-- AI auto-evaluation (Gemini, same GEMINI_API_KEY / same honest
-- rules-fallback-if-unset pattern as generateSummaryViaLLM in insight.go).
-- Populated by a background goroutine right after a student submits, not
-- inline in the request — grading a PDF can take a few seconds and the
-- student shouldn't have to wait on it to get their "submitted" receipt.
alter table homework_submissions add column if not exists ai_suggested_score int;
alter table homework_submissions add column if not exists ai_feedback text;          -- 2-4 sentences, addressed to the student
alter table homework_submissions add column if not exists ai_mistake_tags text[];    -- short machine-comparable tags, for cross-student aggregation
alter table homework_submissions add column if not exists ai_mistakes jsonb;         -- [{tag, explanation}], the detail behind ai_mistake_tags
alter table homework_submissions add column if not exists ai_strengths text[];
alter table homework_submissions add column if not exists ai_generated_by text;      -- 'llm' | 'unavailable' | 'error' -- never fabricated, always says which
alter table homework_submissions add column if not exists ai_evaluated_at timestamptz;

create index if not exists idx_homework_submissions_homework on homework_submissions(homework_id);

-- One school-wide setting: does homework 001_base_schema `points` need a
-- ceiling check for marks_awarded? Enforced in the Go handler instead of a
-- DB constraint, since it depends on the specific homework row's `points`,
-- not a fixed number.
