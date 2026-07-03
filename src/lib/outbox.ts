// FIFO queue of pending writes, persisted in localStorage. Items are full-row
// upserts (or deletes) keyed by client-minted UUIDs, so replaying the queue in
// order is idempotent: no merging or coalescing is needed for correctness,
// and an item that is in flight while new items are appended stays safe.

export interface OutboxItem {
  table: 'sessions' | 'sets';
  op: 'upsert' | 'delete';
  rowId: string;
  payload?: Record<string, unknown>;
}

const KEY = 'gym-tracker-outbox';
const DEAD_KEY = 'gym-tracker-outbox-dead';
export const OUTBOX_EVENT = 'gym-tracker-outbox-changed';

export function loadOutbox(): OutboxItem[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(queue: OutboxItem[]): void {
  if (queue.length === 0) {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, JSON.stringify(queue));
  }
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export function pushOutbox(item: OutboxItem): void {
  save([...loadOutbox(), item]);
}

// Removal is keyed to the item that was actually executed, not positional:
// with two tabs draining the same localStorage queue, a positional shift
// could discard a write the other tab never executed. If the head no longer
// matches, another tab already removed it; this becomes a no-op and the
// caller's next loop iteration re-reads the queue.
export function removeOutboxHead(executed: OutboxItem): void {
  const queue = loadOutbox();
  if (queue.length === 0 || JSON.stringify(queue[0]) !== JSON.stringify(executed)) return;
  save(queue.slice(1));
}

function appendDead(items: OutboxItem[]): void {
  if (items.length === 0) return;
  const raw = localStorage.getItem(DEAD_KEY);
  let dead: OutboxItem[];
  try {
    dead = raw ? JSON.parse(raw) : [];
  } catch {
    dead = [];
  }
  localStorage.setItem(DEAD_KEY, JSON.stringify([...dead, ...items]));
}

// Permanently failed items are kept aside rather than deleted, so the data
// survives for manual recovery even when the server rejects it.
export function deadLetterHead(executed: OutboxItem): void {
  const queue = loadOutbox();
  if (queue.length === 0 || JSON.stringify(queue[0]) !== JSON.stringify(executed)) return;
  appendDead([queue[0]]);
  save(queue.slice(1));
}

// Quarantines the entire queue (account switch on this device: the writes
// belong to the previous user and must never sync under the new session).
export function quarantineOutbox(): void {
  const queue = loadOutbox();
  appendDead(queue);
  save([]);
}

// Network-level failures (offline, DNS, aborted) throw TypeError from fetch;
// auth expiry surfaces as a JWT/PGRST301 error until the client refreshes.
// Both heal with time, so the queue waits. Anything else (constraint
// violation, RLS rejection) will fail identically on every retry.
// Note: supabase-js reports fetch failures as PLAIN objects ({message, code}),
// not Error instances, so the message must be read structurally.
export function isRetryableSyncError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const obj = typeof e === 'object' && e !== null ? (e as { message?: unknown; code?: unknown }) : {};
  const msg = typeof obj.message === 'string' ? obj.message : String(e);
  const code = typeof obj.code === 'string' ? obj.code : '';
  return code === 'PGRST301' || /jwt|fetch|network|timeout/i.test(msg);
}
