// Network-first fetch with a localStorage fallback, so small reference lists
// (routines, exercises, muscle groups) survive offline gym sessions.
export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const storageKey = `gym-tracker-cache-${key}`;
  try {
    const value = await fetcher();
    localStorage.setItem(storageKey, JSON.stringify(value));
    return value;
  } catch (e) {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw e;
      }
    }
    throw e;
  }
}
