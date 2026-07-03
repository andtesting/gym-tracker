# HANDOFF.md

Snapshot of where the project is. Replace every session, never append.

## Current state — 2026-07-03

Branch: `main` (clean). The AND-37/38 work is now fully landed, including the production DB migration and the agent-verification setup.

Done this session:

- **AND-37 migration applied to prod** (`sql/migrations/2026-07-02-rest-before-set.sql`, via Supabase MCP `apply_migration`). Historical `rest_seconds` realigned to the "rest before this set" model; 192/197 rows shifted forward-by-one. Verification is two-part: the "0 mismatches vs an independent from-backup recompute" proves only *faithful, deterministic execution* (not the model itself, since both sides share the same `lag()`); the model was validated by eyeballing real sessions **on mobile**. Not losslessly reversible (each session's original last-set rest is discarded) and the in-DB backup table was dropped, so the pre-migration snapshot is preserved at `backups/sets-pre-and37-migration-2026-07-03.json` (gitignored) as the recovery source. Migration file annotated; re-run is a guarded no-op.
- **Agent-driven UI verification now works.** RLS-isolated Supabase test user `jchx.agent@gmail.com` (credentials in gitignored `.secrets.local.json`). Verified end to end: logged in via Chrome MCP against the deployed Pages app, saw an empty isolated account → RLS keeps it off Andy's real data. Caveat: Chrome MCP is a desktop viewport, not a real iPhone; it front-loads flow/logic/obvious-visual catches but does not replace a real-device check.
- **Supabase MCP hardened to read-only** (`&read_only=true`, local config in `~/.claude.json`). Re-add dropped the OAuth grant, so it needs a one-time `/mcp` → authenticate to reconnect.

## Next steps

- Nothing blocking. Backlog is in Linear (team `Andy C`, project Gym Tracker): AND-6 per-exercise rest defaults/countdown, AND-8 offline write queue, AND-9 notes/RPE, AND-10 supersets.
- Deferred by design: the CSV/JSON export `date` column uses the UTC split of the *session's* `started_at` (`HomeScreen.tsx:59`), which can drift from the local day. Note the export's own `started_at` column is the *per-set* timestamp (nullable), not the session's, so the true local session date is **not** reconstructable from the export. Low value; revisit only if the export *day* ever matters.
- Stale local branch `fix/and-10-pwa-loading-stuck` is still around (tracks origin); prune if that AND-10 approach is dead.

## Notes

- Linear AND-37 and AND-38 are marked Done.
