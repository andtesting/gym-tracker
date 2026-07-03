// RPE free-text normalisation shared by the set editors. Empty clears;
// otherwise clamp to 1-10 and snap to the UI's half steps so a typo can never
// violate the DB's 1-10 check constraint (which would dead-letter the upsert).
export function normalizeRpe(value: string): number | null {
  if (value.trim() === '') return null;
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n * 2) / 2));
}
