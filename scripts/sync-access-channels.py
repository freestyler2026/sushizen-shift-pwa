#!/usr/bin/env python3
"""Regenerate src/lib/access-channels.ts from the backend's channel catalogue.

Role Management shows one toggle per channel. The nav has to derive the
permission from the route, or a page that nobody remembered to add to the
if-chain becomes invisible to everyone except HQ/ADMIN no matter what is
ticked. Generating the map means a new channel is wired up the moment it is
registered, instead of the next time someone notices.

Usage:  python3 scripts/sync-access-channels.py [--check]
"""
import ast
import pathlib
import sys

BACKEND = pathlib.Path(__file__).resolve().parents[2] / "sushizen_shift_app_clean"
SOURCE = BACKEND / "app" / "access_control.py"
TARGET = pathlib.Path(__file__).resolve().parents[1] / "src" / "lib" / "access-channels.ts"


def load_channels():
    tree = ast.parse(SOURCE.read_text())
    for node in tree.body:
        if (isinstance(node, ast.Assign) and node.targets
                and isinstance(node.targets[0], ast.Name)
                and node.targets[0].id == "ACCESS_CHANNELS"):
            return ast.literal_eval(node.value)
    raise SystemExit(f"ACCESS_CHANNELS not found in {SOURCE}")


def render(channels):
    rows = []
    for c in sorted(channels, key=lambda c: c.get("route_path") or ""):
        route = (c.get("route_path") or "").strip()
        key = (c.get("channel_key") or "").strip()
        if not route or not key:
            continue
        match = "exact" if (c.get("route_match") or "prefix") == "exact" else "prefix"
        admin = "true" if c.get("is_admin_channel") else "false"
        rows.append(f'  ["{route}", {{ channel: "{key}", match: "{match}", admin: {admin} }}],')
    body = "\n".join(rows)
    return f'''// GENERATED — do not edit by hand.
// Source: sushizen_shift_app_clean/app/access_control.py (ACCESS_CHANNELS)
// Regenerate: python3 scripts/sync-access-channels.py
//
// Maps a route to the channel Role Management controls it with, so nav
// visibility and page guards can ask "does this person hold
// channel.<key>.view?" instead of matching against a hardcoded role list.

export interface ChannelRoute {{
  channel: string;
  match: "exact" | "prefix";
  admin: boolean;
}}

export const CHANNEL_ROUTES: ReadonlyArray<readonly [string, ChannelRoute]> = [
{body}
];

/** The channel governing a route, longest match first so /admin/hr/onboarding
 *  is not swallowed by a shorter /admin/hr prefix. */
export function channelForRoute(href: string): ChannelRoute | null {{
  let best: ChannelRoute | null = null;
  let bestLen = -1;
  for (const [route, meta] of CHANNEL_ROUTES) {{
    const hit = meta.match === "exact" ? href === route : href === route || href.startsWith(route + "/");
    if (hit && route.length > bestLen) {{
      best = meta;
      bestLen = route.length;
    }}
  }}
  return best;
}}
'''


def main():
    channels = load_channels()
    out = render(channels)
    check = "--check" in sys.argv
    current = TARGET.read_text() if TARGET.exists() else ""
    if check:
        if current != out:
            print("access-channels.ts is stale — run: python3 scripts/sync-access-channels.py")
            return 1
        print(f"access-channels.ts is current ({len(channels)} channels)")
        return 0
    TARGET.write_text(out)
    print(f"wrote {TARGET.relative_to(pathlib.Path.cwd())} ({len(channels)} channels)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
