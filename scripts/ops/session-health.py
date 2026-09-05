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
#
# シークレットの中身は6つとも base64。noon だけ setup-session.js が b64 を
# ファイルに書かず標準出力に出すので、ここで詰め替える。
# 2026-09-05 まで「noon だけ JSON をそのまま入れる」と案内していたが、
# get-payouts.js:71 は Buffer.from(b64,'base64') してから JSON.parse するので、
# 生JSONを入れると復号が壊れて翌朝の取込が落ちる。実際に一度そう入れさせた。
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
             "base64 < scripts/noon/noon-session.json | tr -d '\\n' | gh secret set NOON_SESSION"),
    "talabat": ("node scripts/talabat/setup-session.js",
                "gh secret set TALABAT_SESSION_STATE < scripts/talabat/talabat-session.b64.txt"),
}

# 上の2行目が書き込むシークレットと、その材料になるローカルファイル。
# encoding は「そのコマンドを実行した結果、シークレットに入る中身」。
#   b64      … ファイルが既に base64（gzip されていることもある）
#   file2b64 … ファイルは素の JSON で、コマンド側で base64 にする
SECRET_OF = {
    "grab":      ("GRAB_SESSION_{STORE}",   "grab/{store}-session.b64.txt",      "b64"),
    "foodpanda": ("FP_SESSION_{STORE}",     "foodpanda/{store}-session.b64.txt", "b64"),
    "careem":    ("CAREEM_SESSION",         "careem/careem-session.b64.txt",     "b64"),
    "keeta":     ("KEETA_RZ_SESSION",       "keeta/keeta-session.b64.txt",       "b64"),
    "noon":      ("NOON_SESSION",           "noon/noon-session.json",            "file2b64"),
    "talabat":   ("TALABAT_SESSION_STATE",  "talabat/talabat-session.b64.txt",   "b64"),
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


# 期限を見ても無意味なもの＝実際に試すしかないもの。
# Foodpanda / Talabat（どちらも Delivery Hero）の accessToken は寿命4時間の JWT で、
# 保存直後から数時間で必ず切れる。実測でも 294時間前に期限切れのトークンを持つ
# Talabat セッションが問題なく生きていた。ポータルを開くと SPA が保存済み
# セッションを新しい JWT に交換するので、健全性は「まだ交換できるか」に等しい。
PROBE = {"foodpanda", "talabat"}


def probe(platform, store):
    """実際にポータルを開いてトークンを発行できるか試す。(生きているか, 説明)"""
    cmd = ["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "probe-session.js"),
           platform]
    if store:
        cmd.append(store)
    env = dict(os.environ, NODE_PATH=os.path.join(os.path.dirname(ROOT), "node_modules"))
    try:
        r = subprocess.run(cmd, cwd=os.path.dirname(ROOT), capture_output=True,
                           text=True, timeout=150, env=env)
    except Exception as e:
        return None, f"確認できず（{e.__class__.__name__}）"
    msg = (r.stdout or r.stderr or "").strip().split(": ", 1)
    detail = msg[1] if len(msg) > 1 else (r.stdout or "").strip()
    if r.returncode == 0:
        return True, detail
    if r.returncode == 1:
        return False, detail
    return None, detail or "判定不能"


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


# ── シークレット側の点検 ─────────────────────────────────────────────────────
#
# GitHub のシークレットは値が読めない（write-only）。だから「中身が正しいか」は
# 原理的に確かめられない。2026-09-05 に NOON_SESSION へ生JSONを入れたまま
# この画面が 🟢 を出し続けたのはそのため。
#
# 読めないものを推測するのではなく、**確実に言えることだけ**を出す:
#   1. ワークフローが読むシークレットが存在しない        → 確実な障害
#   2. 更新コマンドが作る中身を、取込側が復号できない     → 確実な障害（今回のNoon）
#   3. そのシークレットをどのワークフローも読んでいない   → 更新しても何も起きない
#
# 「ローカルの方がシークレットより新しい」は検知しない。実測すると Foodpanda
# (+236h) と Talabat (+298h) が該当するが、どちらも取込は動いている（保存済み
# セッションをポータルが新しいトークンに交換するので、古い値のまま機能する）。
# 押し忘れと区別がつかない以上、🔴 にすれば毎朝2件の誤報になる（教訓45）。

def gh_secrets():
    """{シークレット名: 更新日時}。gh が使えなければ None（点検を諦める）。"""
    try:
        r = subprocess.run(["gh", "secret", "list", "--json", "name,updatedAt"],
                           cwd=ROOT, capture_output=True, text=True, timeout=60)
        rows = json.loads(r.stdout or "[]")
    except Exception:
        return None
    out = {}
    for x in rows:
        try:
            out[x["name"]] = datetime.fromisoformat(x["updatedAt"].replace("Z", "+00:00"))
        except Exception:
            pass
    return out


def workflow_readers():
    """{シークレット名: [そのシークレットを読むワークフロー]}。

    表に持たず毎回 .github/workflows を読む。ワークフローが増減しても
    自動で追従させるため（手で写した一覧は必ずどこかで古くなる）。
    """
    wf_dir = os.path.join(os.path.dirname(ROOT), ".github", "workflows")
    readers = {}
    if not os.path.isdir(wf_dir):
        return readers
    for fn in sorted(os.listdir(wf_dir)):
        if not fn.endswith((".yml", ".yaml")):
            continue
        try:
            body = open(os.path.join(wf_dir, fn)).read()
        except Exception:
            continue
        for name in set(re.findall(r"secrets\.([A-Z0-9_]+)", body)):
            readers.setdefault(name, []).append(fn)
    return readers


def decodes_like_ci(path, encoding):
    """更新コマンドが作る中身を、取込スクリプトと同じ手順で復号してみる。

    取込側は例外なく base64 → (gzipなら展開) → JSON.parse。シークレットの
    中身は読めないが、**そこに入るはずの中身**はここで作れるので検証できる。
    """
    import base64
    import gzip
    if not os.path.exists(path):
        return False, "材料のファイルが無い"
    try:
        raw = open(path, "rb").read()
        blob = base64.b64encode(raw) if encoding == "file2b64" else raw
        buf = base64.b64decode(bytes(blob).strip(), validate=False)
        if buf[:2] == b"\x1f\x8b":
            buf = gzip.decompress(buf)
        json.loads(buf.decode("utf-8"))
    except Exception as e:
        return False, f"復号できない（{e.__class__.__name__}）"
    return True, ""


def secret_findings(secrets, readers):
    """更新手順そのものの欠陥を返す。[(深刻度, 見出し, 詳細)]"""
    out = []
    for platform, (tmpl, art, enc) in sorted(SECRET_OF.items()):
        stores = sorted({s for p, s, _ in session_files() if p == platform}) or [""]
        for store in stores:
            key = store or "paranaque"
            name = tmpl.format(STORE=key.upper())
            path = os.path.join(ROOT, art.format(store=key))
            label = platform + (f" ({store})" if store else "")

            ok, why = decodes_like_ci(path, enc)
            if not ok:
                out.append(("bad", f"{label} の更新コマンドが壊れている",
                            f"{name} に入る中身を取込側と同じ手順で復号できない — {why}"))

            used = readers.get(name) or []
            if not used:
                out.append(("info", f"{name} を読むワークフローが無い",
                            f"{label} を更新しても取込には影響しない（手元の作業専用）"))
            elif secrets is not None and name not in secrets:
                out.append(("bad", f"{name} が存在しない",
                            f"{', '.join(used)} が読もうとしている"))
    return out


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
    findings = secret_findings(gh_secrets(), workflow_readers())

    # プローブは1件あたりブラウザを1つ起動するので直列だと4分近くかかる。
    # 毎朝の確認が数分止まると実行されなくなるため、まとめて走らせる。
    from concurrent.futures import ThreadPoolExecutor
    targets = [(p, s) for p, s, _ in session_files() if p in PROBE]
    with ThreadPoolExecutor(max_workers=4) as ex:
        probed = dict(zip(targets, ex.map(lambda t: probe(*t), targets)))

    for platform, store, path in session_files():
        label = f"{platform}" + (f" ({store})" if store else "")

        # 期限が意味を持たないものは、予測せずに実際に試す
        if platform in PROBE:
            alive, detail = probed[(platform, store)]
            if alive is True:
                ok.append((label, detail, platform, store))
            elif alive is False:
                dead.append((label, detail, platform, store))
            else:
                unknown.append((label, detail, platform, store))
            continue

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

    bad = [f for f in findings if f[0] == "bad"]
    info = [f for f in findings if f[0] == "info"]
    if bad:
        print("🔧 更新手順そのものが壊れている")
        for _, head, detail in bad:
            print(f"   {head}")
            print(f"      {detail}")
        print()
    if info:
        print("ℹ️  更新しても取込には効かないもの")
        for _, head, detail in info:
            print(f"   {head}")
            print(f"      {detail}")
        print()

    if not dead and not soon and not bad:
        print("更新が必要なものはありません。")
    return 1 if (dead or bad) else 0


if __name__ == "__main__":
    sys.exit(main())
