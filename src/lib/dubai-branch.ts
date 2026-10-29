/** One branch with two names in the cancellation tables.
 *
 * The OS calls it **Al Mina** everywhere else — `app/branches.py` maps the code
 * `AM` to it, `shift_excel`'s alias table folds `HUDAIBA` into `AM`, and `db.py`
 * normalises `/hudaiba/` to `Al Mina` in two places. But the Dubai cancellation
 * input form offered "Al Hudaiba" from the start, so `dubai_cancellations` holds
 * 177 rows under that name and 615 under `Al Mina`.
 *
 * Every filter compared the strings exactly, so choosing "Al Hudaiba" returned
 * 177 rows and there was no selection that reached the other 615. Rather than
 * rewrite records that are not wrong — only differently spelled — the two names
 * resolve to the same branch here, and in `app/db_dubai_cancellations.py` on the
 * server. New entries store the canonical name.
 */

const SAME_PLACE: readonly string[][] = [["Al Mina", "Al Hudaiba"]];

/** The name to show and group under, so one branch is one row in a breakdown. */
export function canonicalBranch(branch: string | null | undefined): string {
  const b = (branch ?? "").trim();
  const group = SAME_PLACE.find((names) =>
    names.some((n) => n.toLowerCase() === b.toLowerCase()),
  );
  return group ? group[0] : b;
}

/** Does this row belong to the branch the person picked? */
export function sameBranch(
  rowBranch: string | null | undefined,
  picked: string | null | undefined,
): boolean {
  return canonicalBranch(rowBranch) === canonicalBranch(picked);
}
