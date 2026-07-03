import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadOutbox,
  pushOutbox,
  removeOutboxHead,
  deadLetterHead,
  isRetryableSyncError,
  OUTBOX_EVENT,
} from '../../src/lib/outbox';
import type { OutboxItem } from '../../src/lib/outbox';

const setUpsert: OutboxItem = {
  table: 'sets',
  op: 'upsert',
  rowId: 'set-1',
  payload: { id: 'set-1', reps: 8, weight_kg: 60 },
};
const setDelete: OutboxItem = { table: 'sets', op: 'delete', rowId: 'set-1' };
const sessionUpsert: OutboxItem = {
  table: 'sessions',
  op: 'upsert',
  rowId: 'sess-1',
  payload: { id: 'sess-1', routine_id: 'r-1', started_at: '2026-07-03T00:00:00Z' },
};

describe('outbox queue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts empty', () => {
    expect(loadOutbox()).toEqual([]);
  });

  it('pushes in FIFO order', () => {
    pushOutbox(sessionUpsert);
    pushOutbox(setUpsert);
    pushOutbox(setDelete);
    expect(loadOutbox()).toEqual([sessionUpsert, setUpsert, setDelete]);
  });

  it('removes only the head', () => {
    pushOutbox(sessionUpsert);
    pushOutbox(setUpsert);
    removeOutboxHead();
    expect(loadOutbox()).toEqual([setUpsert]);
  });

  it('clears storage when the queue empties', () => {
    pushOutbox(setUpsert);
    removeOutboxHead();
    expect(localStorage.getItem('gym-tracker-outbox')).toBeNull();
  });

  it('survives corrupted storage', () => {
    localStorage.setItem('gym-tracker-outbox', '{not json');
    expect(loadOutbox()).toEqual([]);
  });

  it('dead-letters the head instead of losing it', () => {
    pushOutbox(setUpsert);
    pushOutbox(setDelete);
    deadLetterHead();
    expect(loadOutbox()).toEqual([setDelete]);
    const dead = JSON.parse(localStorage.getItem('gym-tracker-outbox-dead')!);
    expect(dead).toEqual([setUpsert]);
  });

  it('dispatches a change event on push and remove', () => {
    const listener = vi.fn();
    window.addEventListener(OUTBOX_EVENT, listener);
    pushOutbox(setUpsert);
    removeOutboxHead();
    window.removeEventListener(OUTBOX_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('isRetryableSyncError', () => {
  it('retries network-level failures', () => {
    expect(isRetryableSyncError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryableSyncError(new Error('Network request failed'))).toBe(true);
  });

  it('retries supabase-js plain-object fetch failures (not Error instances)', () => {
    expect(isRetryableSyncError({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' })).toBe(true);
  });

  it('retries auth expiry until the client refreshes', () => {
    expect(isRetryableSyncError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(isRetryableSyncError(new Error('JWT expired'))).toBe(true);
  });

  it('does not retry permanent server rejections', () => {
    expect(isRetryableSyncError({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isRetryableSyncError(new Error('new row violates row-level security policy'))).toBe(false);
  });
});
