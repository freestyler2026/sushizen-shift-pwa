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


def corpus_files():
    out = []
    for root, globs in ((BE, ("app/**/*.py", "*.py")), (FE, ("src/**/*.ts", "src/**/*.tsx"))):
        for g in globs:
            for f in root.glob(g):
                # the catalogue lists every key by definition; " 2." files are
                # macOS duplicates that are not imported
                if f.name == "access_control.py" or " 2." in f.name:
                    continue
                out.append(f.read_text(errors="ignore"))
    return out


def resolver_channels():
    """Channels reached through a path->channel map rather than a literal key.

    Only the named maps count. An earlier version matched any dotted string in
    a file that composed keys, which whitelisted 79 channels including
    "receipt.jpg" — an audit that excuses everything is worse than none.
    """
    MAPS = [
        (BE / "app" / "main.py", "_HR_PATH_CHANNELS"),
        (BE / "app" / "api_authz.py", "_EXPLICIT"),
    ]
    found = set()
    for path, name in MAPS:
        if not path.exists():
            continue
        try:
            tree = ast.parse(path.read_text(errors="ignore"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Assign) and node.targets
                    and isinstance(node.targets[0], ast.Name)
                    and node.targets[0].id == name):
                continue
            try:
                value = ast.literal_eval(node.value)
            except Exception:
                continue
            if isinstance(value, dict):
                found.update(str(v) for v in value.values())
            else:
                for item in value:
                    if isinstance(item, (list, tuple)) and len(item) >= 2:
                        found.update(str(x) for x in item[1:])
    return found


def main():
    perms, channels = load("ACCESS_PERMISSIONS"), load("ACCESS_CHANNELS")
    files = corpus_files()
    blob = "\n".join(files)
    resolver_set = resolver_channels()
    routed = {c["channel_key"] for c in channels if (c.get("route_path") or "").strip()}

    dead = []
    for p in perms:
        key, ck, ak = p["permission_key"], p["channel_key"], p["action_key"]
        literal = key in blob
        # hasChannelAccess("<channel>", ["<action>"]) / require_channel_permission(...)
        helper = re.search(rf'''["']{re.escape(ck)}["']\s*,\s*\[[^\]]*["']{re.escape(ak)}["']''', blob)
        # the generic route→channel fallthrough covers every routed channel's view
        generic = ak == "view" and ck in routed
        # Prefix tests, e.g. any(p.startswith("channel.admin.hr") for p in perms).
        # A prefix only counts when it selects a subset — "channel.admin." matches
        # every admin permission, so trusting it would silence this whole report.
        # A resolver builds the key at run time from a path->channel map: e.g.
        # _hr_auth_check composes f"channel.{channel}.{action}" out of
        # _HR_PATH_CHANNELS. Only channels that actually appear in such a
        # map, in a file that composes keys that way, count here — this
        # must not become a blanket excuse.
        resolved = ck in resolver_set
        # _require_channel(request, "admin.xxx", write=...) builds the key at
        # run time, so the literal never appears in the source.
        dynamic = re.search(
            r"_require_channel\(\s*\w+\s*,\s*[\"']" + re.escape(ck) + r"[\"']", blob
        ) is not None
        family = "channel." + ck.split(".")[0] + "."
        prefixed = any(
            key.startswith(pre) and len(pre) > len(family)
            for pre in re.findall(r'startswith\(\s*["\']([a-z0-9_.]+)["\']', blob)
        )
        implied = any(i in blob for i in (p.get("implies") or []))
        if not (literal or helper or generic or implied or prefixed or dynamic or resolved):
            dead.append(p)

    print(f"permissions: {len(perms)}   unreadable: {len(dead)}")
    for p in sorted(dead, key=lambda p: p["permission_key"]):
        print(f"  {p['permission_key']:<52} ({p['label']})")
    if dead:
        print("\nEach line is a switch an admin can flip that changes nothing.")
    return 1 if dead else 0


if __name__ == "__main__":
    sys.exit(main())
