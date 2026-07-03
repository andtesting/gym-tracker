import { quarantineOutbox } from './outbox';
import { clearActiveWorkout } from './sessionPersistence';

const OWNER_KEY = 'gym-tracker-owner';

// All local state (outbox, active workout, caches) is account-global in
// localStorage, and outbox payloads rely on the user_id default filling from
// the CURRENT auth session at sync time. If a different account signs in on
// this device, draining the previous user's queue would write their sets into
// the new user's data. Idempotent and cheap; call it as soon as the signed-in
// user is known, before any drain runs.
export function ensureLocalDataOwner(userId: string): void {
  const prev = localStorage.getItem(OWNER_KEY);
  if (prev === userId) return;
  if (prev !== null) {
    quarantineOutbox();
    clearActiveWorkout();
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('gym-tracker-cache-')) localStorage.removeItem(key);
    }
  }
  localStorage.setItem(OWNER_KEY, userId);
}
