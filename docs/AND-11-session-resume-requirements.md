---
title: "AND-11: Session Resume on Page Reload"
date: 2026-05-02
status: approved
---

# AND-11: Session Resume on Page Reload

## Problem

All active workout state lives in React useState. When the phone's browser evicts the PWA (screen lock, background cleanup, memory pressure), state is destroyed. The user lands on the home screen with no way to resume their in-progress session. Sets already logged to Supabase are safe, but the active workout context (which exercise is selected, timer state, routine info) is lost.

## Requirements

1. **Persist active workout context to localStorage** on every meaningful state change (screen navigation, exercise add/remove, set logged). Restore on app mount if present.

2. **Auto-resume into active workout** when tapping an in-progress session on the home screen. If `finished_at` is null, navigate to `activeWorkout` screen instead of `sessionDetail`.

3. **Auto-resume on cold start**: if localStorage contains an active workout and the session is still unfinished in Supabase, navigate directly to the active workout screen on app load.

4. **Clean up localStorage** when a workout is finished or explicitly abandoned.

## Non-goals

- Offline write queue (AND-8, separate issue)
- Persisting timer state across reloads (timer resets to 0 on resume; acceptable)
- Handling sessions started on a different device

## Key decisions

- **Storage**: localStorage (simple, synchronous, sufficient for a single JSON blob)
- **Resume UX**: no confirmation dialog; tap in-progress session = resume immediately
- **Cold start**: auto-navigate to active workout if unfinished session found
- **Stale detection**: verify session still exists and is unfinished via Supabase before resuming; clear localStorage if session was finished or deleted elsewhere
