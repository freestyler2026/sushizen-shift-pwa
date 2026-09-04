#!/usr/bin/env python3
"""
アグリゲーターのポータルセッションが切れていないかを一目で出す。

なぜ要るか
----------
Grab の認証トークンは 48 時間で切れ、使っても延長されない（2026-09-04 実測:
API を叩く前後で mexusers_authn_token の有効期限は 0.0 時間しか動かない）。
そのため入金取込は 2026-09-02 から 3 日連続で SESSION_EXPIRED になり、
気づける場所が GitHub Actions の画面だけだった。

判定に使う手掛かりは2種類あり、確度が違う。混ぜずに分けて出す。

  1. GitHub Actions の直近の結果 …… 実際に失敗しているかどうかの事実。
     ただし cron を持つワークフローにしか使えない。
  2. ローカルのセッションファイル …… 次にいつ切れるかの予測。
     Grab と Keeta は認証Cookieに有効期限があるので実測値が読める。
     Careem / Noon は Cookie に期限が無く、保存時刻＋既知の寿命から推定する。
     Talabat / Foodpanda は認証が期限なしのセッションCookieで、寿命も
     確認できていない。**推定せず「判定できない」と出す。**
     見えないものを「問題なし」と表示するのが、この種の画面で最悪の嘘になる。

使い方:  python3 scripts/ops/session-health.py
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOW = datetime.now(timezone.utc)

# 認証Cookieに期限があるもの＝実測できる
AUTH_COOKIE = {
    "grab": "mexusers_authn_token",   # 48時間・延長なし（実測 2026-09-04）
    "keeta": "token",                 # 長期（2027-02まで／memory）
}

# 期限が読めないので「保存時刻＋寿命」で推定するもの
KNOWN_LIFETIME_H = {
    "careem": 72,    # 固定72時間（memory: careem-portal-limits）
    "noon": 62,      # 約2.6日（memory: noon-portal-notes）
}

# 自動実行があるもの＝失敗が事実として観測できる。
# covers は「そのワークフローが実際に読むシークレットの店舗」。ここを店舗全部に
# 広げると、今日更新したばかりの taft まで «失敗» と表示してしまう
# （grab の日次ジョブが読むのは GRAB_SESSION_PARANAQUE だけ）。
WORKFLOWS = {
    "grab": ("grab-manila-daily-payout.yml", {"paranaque"}),
    "foodpanda": ("foodpanda-manila-daily-payout.yml", {"paranaque", "taft", "qc"}),
    "keeta": ("keeta-dubai-payout.yml", {""}),
}

# 更新手順。ファイル名は実物を確認済み（存在しない手順を案内するのは教訓21）。
# noon だけ b64 を書き出さないので、シークレットには JSON をそのまま入れる。
REFRESH = {
    "grab": ("node scripts/grab/setup-session.js {store}",
             "gh secret set GRAB_SESSION_{STORE} < scripts/grab/{store}-session.b64.txt"),
    "foodpanda": ("node scripts/foodpanda/setup-session.js {store}",
                  "gh secret set FP_SESSION_{STORE} < scripts/foodpanda/{store}-session.b64.txt"),
    "careem": ("node scripts/careem/setup-session.js",
               "gh secret set CAREEM_SESSION < scripts/careem/careem-session.b64.txt"),
    "keeta": ("node scripts/keeta/setup-session.js",
              "gh secret set KEETA_RZ_SESSION < scripts/keeta/keeta-session.b64.txt"),
    "noon": ("node scripts/noon/setup-session.js",
             "gh secret set NOON_SESSION < scripts/noon/noon-session.json"),
    "talabat": ("node scripts/talabat/setup-session.js",
                "gh secret set TALABAT_SESSION_STATE < scripts/talabat/talabat-session.b64.txt"),
}


def session_files():
    out = []
    for platform in ("grab", "foodpanda", "careem", "keeta", "noon", "talabat"):
        d = os.path.join(ROOT, platform)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith("-session.json"):
                continue
            if "trimmed" in fn:          # 同じ資格情報の別保存。二重に数えない
                continue
            store = fn[:-len("-session.json")]
            out.append((platform, store if store != platform else "", os.path.join(d, fn)))
    return out


def expiry_from_file(platform, path):
    """(残り時間, 根拠) を返す。判定できないときは (None, 理由)。"""
    try:
        s = json.load(open(path))
    except Exception as e:
        return None, f"読めない ({e.__class__.__name__})"

    name = AUTH_COOKIE.get(platform)
    if name:
        for c in s.get("cookies") or []:
            if c.get("name") == name and (c.get("expires") or -1) > 0:
                t = datetime.fromtimestamp(c["expires"], timezone.utc)
                return (t - NOW).total_seconds() / 3600, f"{name} の実際の有効期限"

    hours = KNOWN_LIFETIME_H.get(platform)
    if hours:
        saved = s.get("savedAt")
        if saved:
            try:
                base = datetime.fromisoformat(saved.replace("Z", "+00:00"))
            except Exception:
                base = None
        else:
            base = None
        if base is None:
            base = datetime.fromtimestamp(os.path.getmtime(path), timezone.utc)
        left = (base + timedelta(hours=hours) - NOW).total_seconds() / 3600
        return left, f"保存時刻 + 既知の寿命 {hours}h（推定）"

    return None, "認証が期限なしのCookie／寿命も未確認"


def last_run(workflow):
    try:
        r = subprocess.run(
            ["gh", "run", "list", "--workflow", workflow, "-L", "6",
             "--json", "conclusion,createdAt"],
            cwd=ROOT, capture_output=True, text=True, timeout=60)
        rows = json.loads(r.stdout or "[]")
    except Exception:
        return None
    if not rows:
        return None
    fails = 0
    for x in rows:
        if x.get("conclusion") == "failure":
            fails += 1
        else:
            break
    return {"last": rows[0].get("conclusion"), "when": rows[0].get("createdAt", "")[:16].replace("T", " "),
            "consecutive_failures": fails}


def main():
    dead, soon, ok, unknown = [], [], [], []

    runs = {p: last_run(w) for p, (w, _) in WORKFLOWS.items()}

    for platform, store, path in session_files():
        label = f"{platform}" + (f" ({store})" if store else "")
        left, basis = expiry_from_file(platform, path)

        # 事実（CIの失敗）が最優先。予測より強い。ただしそのジョブが実際に
        # 読むシークレットの店舗にだけ適用する
        covered = WORKFLOWS.get(platform, (None, set()))[1]
        run = runs.get(platform) if store in covered else None
        if run and run["consecutive_failures"] > 0:
            dead.append((label, f"{run['when']} から {run['consecutive_failures']}回連続で失敗", platform, store))
            continue

        if left is None:
            unknown.append((label, basis, platform, store))
        elif left <= 0:
            dead.append((label, f"{-left:.0f}時間前に失効（{basis}）", platform, store))
        elif left < 24:
            soon.append((label, f"あと {left:.1f}時間（{basis}）", platform, store))
        else:
            ok.append((label, f"あと {left/24:.1f}日（{basis}）", platform, store))

    def how(platform, store):
        cmds = REFRESH.get(platform)
        if not cmds:
            return []
        return ["      " + c.format(store=store or "paranaque", STORE=(store or "paranaque").upper())
                for c in cmds]

    print(f"アグリゲーター・セッション状態  {NOW.astimezone().strftime('%Y-%m-%d %H:%M')}")
    print()
    if dead:
        print("🔴 いま止まっている — 更新が要る")
        for label, why, p, s in dead:
            print(f"   {label:<22} {why}")
            for line in how(p, s):
                print(line)
        print()
    if soon:
        print("🟡 まもなく切れる")
        for label, why, p, s in soon:
            print(f"   {label:<22} {why}")
        print()
    if ok:
        print("🟢 当面は問題なし")
        for label, why, _, _ in ok:
            print(f"   {label:<22} {why}")
        print()
    if unknown:
        print("⚪ 判定できない（推測しない）")
        for label, why, _, _ in unknown:
            print(f"   {label:<22} {why}")
        print()

    if not dead and not soon:
        print("更新が必要なものはありません。")
    return 1 if dead else 0


if __name__ == "__main__":
    sys.exit(main())
