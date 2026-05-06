# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## App Identity

This app is **"Sushi ZEN Workforce OS"** — an internal admin and analytics system for Sushi ZEN restaurant operations. The official `<title>` is "Sushi ZEN Workforce OS". It supports shift scheduling, attendance tracking, analytics, procurement, inventory, and staff management across Dubai and Manila operations.

**Do not confuse this with a generic "Sushi ZEN Shift" branding.** The Workforce OS UI with its dark slate-lavender design is the correct and current design. The `/week` page shows a lighter-themed shift viewer — these are two different UI contexts within the same app.

---

## Commands

```bash
# Development server
npm run dev          # starts on http://localhost:3000 (.next-dev/ cache dir in dev)

# Build (required before deploy)
npm run build

# Lint
npm run lint

# Deploy frontend to Vercel (GitHub連携 — git push のみ使用すること)
# ⚠️ vercel --prod (CLI) は使用禁止：20秒で終わる偽ビルドになり /week 等が404になる
git push origin main

# Deploy backend to Heroku
cd ../sushizen_shift_app_clean
git push heroku HEAD:master --force

# Heroku logs
heroku logs -a sushizen-shift-app -n 200

# Heroku Postgres shell
heroku pg:psql -a sushizen-shift-app
```

---

## Architecture Overview

### Monorepo structure
- **`sushizen-shift-pwa/`** — Next.js 15 App Router frontend (this repo)
- **`sushizen_shift_app_clean/`** — Python FastAPI backend on Heroku (`sushizen-shift-app`)

### Frontend: Next.js 15 App Router, all pages are `"use client"`
- `src/app/` — route-based pages
- `src/components/` — shared components
- `src/lib/` — utilities and clients

### API proxy architecture
All `/api/admin/*` calls from the browser are proxied through a single Next.js catch-all route:
`src/app/api/admin/[...slug]/route.ts`

This forwards to the Heroku backend at `https://sushizen-shift-app-038d846023bc.herokuapp.com`. In dev, it proxies to `http://127.0.0.1:8000`.

The backend URL is also set via `NEXT_PUBLIC_API_BASE_URL` env variable. `next.config.ts` rewrites `/api/:path*` → `${API_BASE}/api/:path*` for non-admin routes.

### Auth system (`src/lib/auth.ts`)
Auth state lives in `localStorage` under key `sushizen_shift_auth`. Important role logic:

- **`isAdmin(auth)`** — returns `true` only if `auth.role === "ADMIN"`. HQ is NOT admin.
- **`canAccessAdminNav(auth)`** — checks `auth.permissions[]` for channel-specific permission strings. Does NOT check role.
- **`canAccessRoleManagement(auth)`** — returns `true` only if `auth.role === "HQ"`.

NavBar shows admin items when: `isAdmin(auth) || role === "HQ" || canAccessAdminNav(auth)`.

When gating admin pages, always check both role AND permissions to avoid locking out HQ users:
```typescript
if (!canAccessAdminNav(auth) && role !== "HQ" && role !== "ADMIN") {
  router.replace("/week");
}
```

### Design system (`src/lib/ui-tokens.ts`)
All Tailwind class constants are defined here: `GLASS_CARD`, `PRIMARY_BUTTON`, `TAB_ACTIVE`, `KPI_CARD`, `T_PAGE_TITLE`, `BADGE_INFO`, etc. Import from this file rather than writing raw Tailwind strings in page files.

### Key pages
| Route | File | Purpose |
|---|---|---|
| `/week` | `src/app/week/page.tsx` | **Critical** — staff shift viewer. Never touch unintentionally. |
| `/admin` | `src/app/admin/page.tsx` | Admin dashboard with tabs (requests, ratings, order entry, etc.) |
| `/admin/analytics` | `src/app/admin/analytics/page.tsx` | Primary analytics page with compliance + summary sections |
| `/admin/draft` | `src/app/admin/draft/page.tsx` | **2524 lines** — shift draft generator with ForecastSettingsPanel, reliability analysis, and AI analysis features |

---

## Critical State: Git & Vercel

**Correct production commit: `a5c28d2`** ("Late Analysis: visual overhaul with bar charts, severity heatmap, rank badges")

- This is the 2524-line version of `admin/draft/page.tsx` and represents the full-featured state of the app.
- Vercel production was restored to this commit via "Promote to Production" on deployment `4q5uWAHuo`.
- If the git branch diverges from `a5c28d2`, sync it with: `git reset --hard a5c28d2 && git push origin main --force`

---

## `admin/draft/page.tsx` — Structure and Known Issues

This is the largest and most complex page (2524 lines). Its key structural sections:

1. **Imports + constants** (lines 1–~380) — includes `DUBAI_DRAFT_SHEET_URL`, `MANILA_DRAFT_SHEET_URL`
2. **`ForecastSettingsPanel`** (line ~386) — editable multiplier/weight panel for draft generation
3. **Main component state** (line ~1020+) — includes `sheetTabMain`, `sheetTabs`, `pendingVisibleRows` (sheet proposals state — pending removal)
4. **`proposeFromSheet()`** function (line ~1692) — sheet proposals feature (pending removal)
5. **JSX: "Pending Sheet Proposals" section** (line ~2028) — sheet proposals UI (pending removal)

**Sheet proposals removal is still pending.** The following identifiers are remnants to be removed when safe:
`sheetTabMain`, `sheetTabs`, `sheetTabsBusy`, `pendingVisibleRows`, `proposeFromSheet`, `DUBAI_DRAFT_SHEET_URL` (the variable, not its value), `selectedProposalIds`.

---

## Heroku デプロイ手順と注意事項

### `git push heroku HEAD:master --force` が "Everything up-to-date" になる場合

このメッセージは **エラーではなく正常**。Heroku の remote がすでに最新 commit を持っているため push 不要の状態。

**考えられる原因：**
- Claude（Cowork）がサンドボックス内で commit を作成したが、Heroku remote は別途同じ内容をすでに持っている
- 過去に同じ commit を別のターミナルセッションで push 済み

**対処法 — 変更が Heroku に反映されているか確認する：**
```bash
# Heroku の現在のリリース情報を確認
heroku releases -a sushizen-shift-app -n 5

# ログで起動・変更を確認
heroku logs -a sushizen-shift-app -n 50
```

**強制的に再デプロイしたい場合（空コミットで push を強制）：**
```bash
git commit --allow-empty -m "force redeploy"
git push heroku HEAD:master --force
```

### `git commit` が "Unable to create HEAD.lock" で失敗する場合

前回の git プロセスがクラッシュしたときにロックファイルが残ることがある。

```bash
rm /Users/jaynishimura/Desktop/sushizen_shift_app_clean/.git/HEAD.lock
# その後、通常通り git add / commit / push を実行
```

### Claude（Cowork）からのデプロイについて
- Cowork のサンドボックスは Heroku git への HTTPS 接続がブロックされているため、`git push heroku` はユーザーのローカルターミナルから実行する必要がある
- Vercel へのデプロイ（`vercel --prod`）も同様にローカルターミナルから実行すること
- また、サンドボックスからは `.git/HEAD.lock` の削除権限もないため、ロック解除もユーザー側で行う必要がある

---

## ⚠️ Lessons Learned — DO NOT REPEAT

### 1. Never use regex scripts to remove JSX blocks
Scripts like `remove_sheet_proposals.py` and `fix_sheet_remnants.py` used overly broad regex patterns (e.g., matching `{canOperate ? (`) that silently removed the wrong JSX blocks. This destroyed features like BranchReliabilityPanel and AI analysis without any syntax error.

**Rule:** When removing sections from large TSX files, always use **line-number-based deletion** (read the file, identify exact line ranges, delete precisely) — never pattern-matched regex that could match the wrong block.

### 2. Vercel Promote to Production vs. git reset
`git reset --hard <commit> && git push --force` only rebuilds from source on the next Vercel deploy. If the wrong code has already been deployed, the previously deployed artifacts remain in production until a new push triggers a build.

**To immediately restore a prior state:** use Vercel Dashboard → Deployments → find the correct deployment → "Promote to Production". This switches the live deployment without rebuilding.

### 3. Smart quotes break TypeScript
When using the `Edit` tool with string content containing `"`, the editor may insert curly/smart quotes (`"` / `"`) instead of straight ASCII quotes. These cause TypeScript parse errors. If you see unexpected parse errors after an edit, check for smart quote substitution.

### 4. `/admin/draft` auth guard must include role check
`canAccessAdminNav()` checks permissions only — it returns `false` for `role === "HQ"` users who lack explicit permissions. Always add `|| role === "HQ"` to avoid incorrectly redirecting HQ users to `/week`.

### 5. AutoReload must always work — never break it

**This is a persistent user requirement that has been raised repeatedly.**

After a deploy, the app must automatically reload in the browser **without requiring a manual hard reload**. The mechanism is:

- `src/components/AutoReload.tsx` — polls `/api/version` every 3 seconds
- `next.config.ts` bakes `NEXT_PUBLIC_BUILD_ID = VERCEL_URL` into the client bundle at build time
- `/api/version/route.ts` returns the current `VERCEL_URL` at runtime
- When the two values differ → `hardReload()` fires → page refreshes automatically

**Rules:**
- Never remove or disable `<AutoReload />` from `LayoutShell.tsx`
- Never set `frontendBaseline.current = null` after a failed fetch — null baseline disables all poll comparisons. Only set baseline when the fetched value is non-null.
- In `check()`, if baseline is null and a poll succeeds, SET the baseline (don't compare) — this handles the case where the startup fetch failed
- Both `frontendBaseline` and `backendBaseline` must follow the same null-guard pattern
- Do not introduce ESLint errors or build failures — they result in Vercel deploying a broken build that returns 404 on all routes

---

## Backend Notes

- Backend: FastAPI on Heroku (`sushizen-shift-app`)
- Heroku Postgres is the primary DB
- `app/main.py` — all API routes
- `app/db.py` — DB logic
- `app/draft_demand_planner.py` — draft generation logic with attendance reliability scoring
- AI analysis for draft uses an `/api/admin/draft/analyze` proxy (originally at `/api/ai/` route in the frontend — check current route structure if missing)
