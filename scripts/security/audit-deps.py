#!/usr/bin/env python3
"""Dependency audit with an allowlist that cannot rot quietly.

Two things this has to get right, both learned the hard way in this repo:

  * A job that is permanently red is a job nobody reads (lesson 39). There are
    findings here with no published fix, so failing on every advisory would
    paint the build red forever and the next real one would arrive invisible.
    Known findings go in the allowlist with a reason and a date.

  * An allowlist with no expiry becomes the place things go to be forgotten.
    Every entry carries review_by. Past that date the entry stops suppressing
    and the job goes red -- which is the only way a "we'll deal with it later"
    ever gets dealt with.

Run it anywhere:

    python3 scripts/security/audit-deps.py                 # npm, production tree
    python3 scripts/security/audit-deps.py --requirements ../sushizen_shift_app_clean/requirements.txt
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
from datetime import date

HERE = pathlib.Path(__file__).resolve().parent
ALLOWLIST = HERE / "audit-allowlist.json"
FAIL_AT = ("critical", "high")
RANK = {"critical": 0, "high": 1, "moderate": 2, "low": 3, "info": 4}


def load_allowlist() -> dict:
    if not ALLOWLIST.exists():
        return {}
    data = json.loads(ALLOWLIST.read_text())
    return {e["package"]: e for e in data.get("allow", [])}


def run(cmd: list[str], cwd: pathlib.Path | None = None) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return p.returncode, p.stdout


def npm_findings(project: pathlib.Path) -> list[dict]:
    """Production dependencies only — dev tooling is not shipped to anyone."""
    code, out = run(["npm", "audit", "--omit=dev", "--json"], cwd=project)
    if not out.strip():
        raise SystemExit("npm audit produced no output — is there a lockfile?")
    data = json.loads(out)
    found = []
    for name, v in (data.get("vulnerabilities") or {}).items():
        titles = [x.get("title") for x in v.get("via", []) if isinstance(x, dict)]
        fix = v.get("fixAvailable")
        found.append({
            "ecosystem": "npm",
            "package": name,
            "severity": v.get("severity", "unknown"),
            "titles": [t for t in titles if t],
            "fix": ("a version bump" if fix is True
                    else f"{fix['name']}@{fix['version']} (major)" if isinstance(fix, dict)
                    else "none published"),
        })
    return found


def pip_findings(requirements: pathlib.Path) -> list[dict]:
    code, out = run([sys.executable, "-m", "pip_audit", "-r", str(requirements),
                     "--format", "json", "--progress-spinner", "off"])
    if not out.strip():
        raise SystemExit("pip-audit produced no output — pip install pip-audit")
    data = json.loads(out)
    deps = data.get("dependencies", data if isinstance(data, list) else [])
    found = []
    for dep in deps:
        vulns = dep.get("vulns") or []
        if not vulns:
            continue
        # pip-audit reports no severity. An advisory with a published fix that
        # nobody has applied is the thing this job exists to surface, so treat
        # it as high and let the allowlist carry the judgement.
        found.append({
            "ecosystem": "pip",
            "package": dep["name"],
            "severity": "high",
            "titles": sorted({v["id"] for v in vulns}),
            "fix": ", ".join(sorted({f for v in vulns for f in (v.get("fix_versions") or [])}))
                   or "none published",
        })
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=str(HERE.parent.parent))
    ap.add_argument("--requirements")
    ap.add_argument("--skip-npm", action="store_true")
    args = ap.parse_args()

    allow = load_allowlist()
    findings: list[dict] = []
    if not args.skip_npm:
        findings += npm_findings(pathlib.Path(args.project))
    if args.requirements:
        findings += pip_findings(pathlib.Path(args.requirements))

    today = date.today().isoformat()
    blocking, allowed, expired = [], [], []
    for f in sorted(findings, key=lambda x: (RANK.get(x["severity"], 9), x["package"])):
        entry = allow.get(f["package"])
        if entry and entry.get("review_by", "9999-12-31") < today:
            expired.append((f, entry))
        elif entry:
            allowed.append((f, entry))
        elif f["severity"] in FAIL_AT:
            blocking.append(f)
        else:
            allowed.append((f, None))

    def show(f):
        print(f"  {f['severity']:8s} {f['ecosystem']:4s} {f['package']}")
        for t in f["titles"][:3]:
            print(f"           {t[:96]}")
        print(f"           fix: {f['fix']}")

    print(f"\n=== dependency audit · {today} ===")
    print(f"findings: {len(findings)}   blocking: {len(blocking)}   "
          f"accepted: {len(allowed)}   expired acceptances: {len(expired)}\n")

    if blocking:
        print("NEW OR UNACCEPTED, at high or critical:")
        for f in blocking:
            show(f)
        print()
    if expired:
        print("ACCEPTED, BUT THE REVIEW DATE HAS PASSED — decide again:")
        for f, e in expired:
            print(f"  {f['package']}: accepted {e.get('accepted')} until {e['review_by']}")
            print(f"           reason was: {e.get('reason','')[:96]}")
        print()
    if allowed:
        print("Known and accepted:")
        for f, e in allowed:
            note = f" — {e['reason'][:70]}" if e else " — below the failing threshold"
            print(f"  {f['severity']:8s} {f['ecosystem']:4s} {f['package']}{note}")
        print()

    if blocking or expired:
        print("FAIL: something here has not been looked at.")
        return 1
    print("PASS: every finding at high or critical has been seen and accepted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
