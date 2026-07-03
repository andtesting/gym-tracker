-- Session-level soft delete (applied to the live DB 2026-07-04).
-- Completes the Layer 2 keep-everything contract: sets went soft in the
-- Phase 3 UI batch, but deleting a session still hard-deleted the row and
-- cascaded its sets. Deleting a session now stamps deleted_at; its sets are
-- left untouched (they carry their own deleted_at independently and remain
-- exportable). Every session-reading query except the export filters
-- .is('deleted_at', null); set readers that join sessions filter on the
-- joined session too.
alter table sessions add column if not exists deleted_at timestamptz;
