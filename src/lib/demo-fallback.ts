/**
 * Runs a data call and falls back to the local demo data whenever the backend
 * has nothing to return (empty tables or an unreachable query).
 */
export async function withDemo<T>(load: () => Promise<T[]>, demo: () => T[]): Promise<T[]> {
  try {
    const rows = await load();
    if (Array.isArray(rows) && rows.length > 0) return rows;
  } catch {
    // fall through to demo data
  }
  return demo();
}
