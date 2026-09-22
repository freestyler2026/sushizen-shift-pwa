#!/usr/bin/env python3
"""Who can get in, and what answers them once they are in.

Run from a machine that can reach the production database, or on a one-off
dyno. It writes nothing.

    heroku run -a sushizen-shift-app python scripts/security/audit-auth-posture.py

Two questions, because in this system they compound. Authentication is a name
plus a PIN, and names are printed on every shift table in the app; authorization
on /api/admin/* is in observe-only mode, so anything a logged-in person asks
for is answered. A weak PIN on one HQ account is therefore not one account.

The output deliberately counts rather than lists, except for the accounts that
carry a role beyond STAFF -- those are the ones somebody has to act on, and a
list of 163 names is not an action.
"""

from __future__ import annotations

import sys
from collections import Counter

# The PINs that get handed out, typed by habit, or tried first.
CANDIDATES = ["1111", "0000", "1234", "1212", "2222", "123456", "1230", "1122", "4321"]


def main() -> int:
    import bcrypt
    from app.db import get_conn

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT a.staff_name, a.pin_hash,
                          COALESCE(s.status, '(not on the roster)'), COALESCE(s.city, ''),
                          COALESCE(s.role, '')
                     FROM staff_auth a
                     LEFT JOIN staff_master s
                       ON regexp_replace(lower(trim(s.staff_name)), '\\s+', ' ', 'g')
                        = regexp_replace(lower(trim(a.staff_name)), '\\s+', ' ', 'g')"""
            )
            accounts = cur.fetchall()
            cur.execute(
                """SELECT staff_name, STRING_AGG(DISTINCT role_key, ',')
                     FROM staff_role_assignments WHERE is_active GROUP BY 1"""
            )
            assigned = dict(cur.fetchall())
            cur.execute(
                """SELECT s.staff_name, COALESCE(s.status, '?')
                     FROM staff_master s
                    WHERE COALESCE(s.status, '') <> 'ACTIVE'
                      AND NOT EXISTS (SELECT 1 FROM staff_account_freeze f
                                       WHERE f.staff_name = s.staff_name
                                         AND f.unfrozen_at IS NULL)
                    ORDER BY 2, 1"""
            )
            thawed = cur.fetchall()
            cur.execute(
                """SELECT channel_key, COUNT(*), SUM(hits),
                          COUNT(DISTINCT role_key)
                     FROM api_authz_observations GROUP BY 1 ORDER BY 3 DESC"""
            )
            observations = cur.fetchall()
    finally:
        conn.close()

    weak = {}
    for name, h, status, city, role in accounts:
        if not h or not h.startswith("$2"):
            continue
        for pin in CANDIDATES:
            try:
                if bcrypt.checkpw(pin.encode(), h.encode()):
                    weak[name] = (pin, status, city, role)
                    break
            except Exception:
                break

    print(f"\n=== who can get in ===")
    print(f"accounts: {len(accounts)}   on a PIN from the guess list: {len(weak)}")
    print(f"  by PIN:    {dict(Counter(v[0] for v in weak.values()))}")
    print(f"  by status: {dict(Counter(v[1] for v in weak.values()))}")

    privileged = []
    for name, (pin, status, city, role) in sorted(weak.items()):
        effective = assigned.get(name) or role or "STAFF"
        if effective.upper() != "STAFF":
            privileged.append((name, pin, effective, status, city))
    print(f"\n  of those, carrying a role beyond STAFF: {len(privileged)}")
    for name, pin, role, status, city in privileged:
        print(f"    {name:30s} {role:44s} {status:10s} {city}")

    print(f"\n=== accounts that should not be logging in but can ===")
    print(f"non-ACTIVE on the roster and not frozen: {len(thawed)}")
    for name, status in thawed:
        print(f"    {name:30s} {status}")

    print(f"\n=== what answers them once in (ADMIN_AUTHZ_MODE=log) ===")
    total = sum(r[2] for r in observations)
    print(f"{len(observations)} channels, {total:,} requests that would be refused if it were enforced")
    for channel, paths, hits, roles in observations:
        print(f"    {channel:40s} paths={paths:<4} hits={hits:<7} roles={roles}")
    print("\nBefore enforcing any channel, read the names in api_authz_observations")
    print("for it. Most of admin.payroll's denials are staff opening their own")
    print("payslip -- /api/admin/payroll/my-pay/* is a personal endpoint that")
    print("happens to live under an admin prefix, and enforcing the channel as it")
    print("stands would take 78 people's payslips away from them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
