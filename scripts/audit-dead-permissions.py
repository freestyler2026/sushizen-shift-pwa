#!/usr/bin/env python3
"""List permissions Role Management offers that no code can act on.

A toggle nobody reads is worse than a missing feature: an admin ticks it,
believes access was granted, and the person still cannot get in. Run this
after adding a channel.

Usage:  python3 scripts/audit-dead-permissions.py
"""
import ast
import pathlib
import re
import sys

FE = pathlib.Path(__file__).resolve().parents[1]
BE = FE.parent / "sushizen_shift_app_clean"
CATALOGUE = BE / "app" / "access_control.py"


def load(name):
    tree = ast.parse(CATALOGUE.read_text())
    for n in tree.body:
        if (isinstance(n, ast.Assign) and n.targets
                and isinstance(n.targets[0], ast.Name) and n.targets[0].id == name):
            return ast.literal_eval(n.value)
    raise SystemExit(f"{name} not found in {CATALOGUE}")


def corpus():
    out = []
    for root, globs in ((BE, ("app/**/*.py", "*.py")), (FE, ("src/**/*.ts", "src/**/*.tsx"))):
        for g in globs:
            for f in root.glob(g):
                # the catalogue lists every key by definition; " 2." files are
                # macOS duplicates that are not imported
                if f.name == "access_control.py" or " 2." in f.name:
                    continue
                out.append(f.read_text(errors="ignore"))
    return "\n".join(out)


def main():
    perms, channels = load("ACCESS_PERMISSIONS"), load("ACCESS_CHANNELS")
    blob = corpus()
    routed = {c["channel_key"] for c in channels if (c.get("route_path") or "").strip()}

    dead = []
    for p in perms:
        key, ck, ak = p["permission_key"], p["channel_key"], p["action_key"]
        literal = key in blob
        # hasChannelAccess("<channel>", ["<action>"]) / require_channel_permission(...)
        helper = re.search(rf'''["']{re.escape(ck)}["']\s*,\s*\[[^\]]*["']{re.escape(ak)}["']''', blob)
        # the generic route→channel fallthrough covers every routed channel's view
        generic = ak == "view" and ck in routed
        implied = any(i in blob for i in (p.get("implies") or []))
        if not (literal or helper or generic or implied):
            dead.append(p)

    print(f"permissions: {len(perms)}   unreadable: {len(dead)}")
    for p in sorted(dead, key=lambda p: p["permission_key"]):
        print(f"  {p['permission_key']:<52} ({p['label']})")
    if dead:
        print("\nEach line is a switch an admin can flip that changes nothing.")
    return 1 if dead else 0


if __name__ == "__main__":
    sys.exit(main())
