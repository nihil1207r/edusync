-- Phase 7.1: teachers can attach the actual question paper (PDF) when
-- assigning homework, not just a text description. Same storage tradeoff
-- as homework_submissions.file_base64 (see migrations/011 and NOTES.md) —
-- no object-storage bucket is configured in this environment, so the PDF
-- itself lives in the row, base64-encoded.
--
-- Idempotent / safe to re-run.

alter table homework add column if not exists question_file_name text;
alter table homework add column if not exists question_file_base64 text;
alter table homework add column if not exists question_file_size_bytes int;
