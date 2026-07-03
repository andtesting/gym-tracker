import { supabase } from '../supabase';
import type { OutboxItem } from '../lib/outbox';

// Executes one queued write. Upserts are full-row and keyed by client-minted
// UUIDs, so re-execution after an ambiguous failure converges to the same row.
export async function execOutboxItem(item: OutboxItem): Promise<void> {
  if (item.op === 'upsert') {
    const { error } = await supabase.from(item.table).upsert(item.payload!);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(item.table).delete().eq('id', item.rowId);
  if (error) throw error;
}
