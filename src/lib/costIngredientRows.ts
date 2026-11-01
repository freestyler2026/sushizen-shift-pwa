// Cost Calculation, Ingredient Master: a new row that has been saved is no longer a local row.
//
// Reloading the list keeps the rows the user added but has not saved (`_new`), so they are not
// lost. A row that had just been POSTed still carried `_new`, so it was kept too, next to the
// item the server had created: the list showed it twice and the Save count stayed up. The next
// Save POSTed it again, the server said the name was in use, and "Proceed" renamed the real item
// "<name> [old]" and created another (staff report, 2026-11-01). Drop the saved rows first.
export function withoutSavedNewRows<T extends { id: string | number; _new?: boolean }>(rows: T[], savedIds: Set<string>): T[] {
  if (!savedIds.size) return rows;
  return rows.filter((row) => !(row._new && savedIds.has(String(row.id))));
}
