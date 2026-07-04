---
name: pr-loop
description: Use when shipping any change in this repo — encodes the standing per-PR workflow: branch, implement, verify, finder-agent review, steelman, amend, squash-merge, Linear update. Every PR goes through this loop; do not merge without a review pass on the exact diff being merged.
---

# The gym-tracker PR loop

Standing workflow (Andy's rule, applies to every PR, including docs-only ones — the merge permission gate expects a review pass on record).

## Steps

1. **Branch** from up-to-date `main`: `feature/and-NN-slug` or `fix/and-NN-slug` (Linear ID when one exists; create the issue first if the work is issue-worthy and none exists).
2. **Implement.** Follow AGENTS.md conventions. If the change touches `WorkoutSet`/`Session` fields, remember the full-row outbox contract: any column missing from `toSetRow` gets nulled server-side on the next upsert.
3. **Verify before review**: `npm run build` (tsc is the completeness checklist for type changes), `npx vitest run` (baseline currently 91), `npm run lint` (2-error pre-existing baseline in App.tsx/useAuth is expected — anything else is yours). UI changes: drive the flow in Chrome with the test account (creds in `.secrets.local.json`; dev server usually lands on **5174**, trust the vite banner).
4. **Commit and push** the branch. Conventional commits.
5. **Finder-agent review**: spawn `code-reviewer` on `git diff main...<branch>`. The prompt must carry: architecture context (local-first outbox, full-row upserts, soft-delete filters), the deliberate choices NOT to re-litigate, and named hunt areas with concrete failure-scenario framing. Demand file:line + severity + scenario + fix.
6. **Steelman every finding** before acting: argue the reviewer's strongest case, then accept (fix now), decline with a recorded reason (goes in the PR body), or defer (goes in HANDOFF). Do not perform agreement.
7. **Amend**: apply accepted fixes, re-run step 3, commit as `fix: review amendments - …`.
8. **PR**: `gh pr create` with `--body-file` (PowerShell 5.1 mangles inline bodies containing double quotes — this has bitten before). Body leads with the value, records review findings applied AND declined-with-reasons, ends with the Claude Code attribution line.
9. **Merge**: `gh pr merge <n> --squash --delete-branch`. Only after the review pass exists for the final diff.
10. **Linear**: mark the issue Done with PR links (`save_issue` works for issues created this session or already-yours; a permission denial here is non-fatal — record it in HANDOFF for a manual flip).

## Server-side changes (edge function / SQL)

Migrations: `apply_migration` via Supabase MCP + mirror file in `sql/migrations/` + update `sql/schema.sql`/`sql/health_schema.sql` (mirrors stay byte-identical to their migration where one exists). Edge function: redeploy via MCP after the code lands, then re-run `docs/fixtures/health-ingest/run.ps1` and clean up fixture rows (see the health-check skill).
