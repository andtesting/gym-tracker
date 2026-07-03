import { useState, useEffect } from 'react';
import {
  loadOutbox,
  removeOutboxHead,
  deadLetterHead,
  isRetryableSyncError,
  OUTBOX_EVENT,
} from '../lib/outbox';
import { execOutboxItem } from '../api/outboxExec';
import { useToast } from './useToast';
import type { ShowToast } from './useToast';

// Single in-flight drain across all hook instances (App + HomeScreen both
// mount this; StrictMode double-runs effects).
let draining = false;

async function drain(onDeadLetter: ShowToast): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const queue = loadOutbox();
      if (queue.length === 0) return;
      try {
        await execOutboxItem(queue[0]);
      } catch (e) {
        if (isRetryableSyncError(e)) return; // offline/auth: retry on next kick
        console.error('Dropping unsyncable change:', queue[0], e);
        deadLetterHead();
        onDeadLetter('A change could not be synced; a copy was kept on this device.');
        continue;
      }
      removeOutboxHead();
    }
  } finally {
    draining = false;
  }
}

// Returns the number of pending (unsynced) writes and keeps the queue
// draining: on mount, whenever the queue changes, when connectivity returns,
// and on a slow heartbeat as a catch-all.
export function useSync(): number {
  const [pending, setPending] = useState(() => loadOutbox().length);
  const toast = useToast();

  useEffect(() => {
    const kick = () => {
      setPending(loadOutbox().length);
      void drain(toast);
    };
    window.addEventListener(OUTBOX_EVENT, kick);
    window.addEventListener('online', kick);
    const heartbeat = window.setInterval(kick, 30_000);
    void drain(toast);
    return () => {
      window.removeEventListener(OUTBOX_EVENT, kick);
      window.removeEventListener('online', kick);
      clearInterval(heartbeat);
    };
  }, [toast]);

  return pending;
}
