# Sushi ZEN Workforce OS — Frontend

Internal management system for Sushi ZEN restaurants (Dubai 5 branches, Manila 4 branches + Central Kitchen).  
Covers shift scheduling, attendance, procurement, inventory, payroll, and P&L.

**Live app**: https://sushizen-shift-pwa.vercel.app  
**API backend**: https://sushizen-shift-app-038d846023bc.herokuapp.com

---

## What this system does

| Module | What it does |
|--------|--------------|
| Shift scheduling | HQ drafts weekly shifts; staff view via `/week` |
| Attendance (DTR) | Time-in/out with GPS or WebAuthn passkey |
| Procurement | Store → CK → supplier order flow with approval chain |
| Daily Inventory | Kitchen daily count with par-level alerts and order generation |
| Payroll | Monthly salary computation with NSD/OT/deduction breakdown |
| P&L | Management P&L dashboard linking labor cost to target |
| NTE / Conduct | Notice-to-Explain issuance with legal schema (PH Labor Code / UAE Art.39/44) |
| CCTV integration | Tapo camera feed ingest (Jetson Orin Nano — in planning) |

---

## Repository layout

```
sushizen-shift-pwa/          ← This repo (Next.js 15 App Router)
  src/app/                   ← Pages (all "use client")
  src/components/            ← Shared components
  src/lib/                   ← Utilities, auth, UI tokens

sushizen_shift_app_clean/    ← Backend (Python FastAPI on Heroku) — separate repo
  app/main.py                ← All API routes (~31,500 lines)
  app/db.py                  ← All DB functions (~45,700 lines)
```

> **Never read `main.py` or `db.py` in full.** Use grep and read only the ±50 lines you need.

---

## Environment setup (new machine)

### Prerequisites
- Node.js 20+
- Python 3.12+ (for backend only)
- Heroku CLI: `brew install heroku/brew/heroku`
- Git access to both repos

### Frontend

```bash
git clone git@github.com:freestyler2026/sushizen-shift-pwa.git
cd sushizen-shift-pwa
npm install
```

Create `.env.local` in the project root:

```
NEXT_PUBLIC_API_BASE_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com
```

Start dev server:

```bash
npm run dev
# Open http://localhost:3000
```

Login with: **Yukihiro Nishimura** (role: HQ)  
PIN is stored separately — ask the system owner or check 1Password.

### Backend (local)

```bash
heroku git:remote -a sushizen-shift-app   # add Heroku remote to existing clone
```

The backend DATABASE_URL and all service account keys are set as Heroku config vars.  
For local development, copy them from: `heroku config -a sushizen-shift-app`

```bash
pip install -r requirements.txt
DATABASE_URL=<from heroku config> uvicorn app.main:app --reload
```

---

## Deploy

### Frontend (Vercel — automatic on push)

```bash
cd sushizen-shift-pwa
git add -A && git commit -m "description"
git push origin HEAD:main
# Vercel auto-deploys within ~1 minute
```

### Backend (Heroku)

```bash
cd sushizen_shift_app_clean
git add -A && git commit -m "description"
git push heroku HEAD:master --force
# Heroku deploy takes ~2-3 minutes
```

### Check Heroku logs

```bash
heroku logs -a sushizen-shift-app -n 200 --tail
```

### Rollback frontend

Vercel Dashboard → Deployments → find the last working deploy → "Promote to Production"  
(Do NOT use `git reset` — Vercel is the source of truth for production.)

### Rollback backend

```bash
git log --oneline -10           # find the commit hash
git push heroku <hash>:master --force
```

---

## Emergency procedures

### Site is down / 500 errors

```bash
heroku logs -a sushizen-shift-app -n 200 --tail
heroku dyno:restart -a sushizen-shift-app    # restarts all dynos
```

### Database connection errors

The DB is Heroku Postgres Essential (~25 connection limit).  
If you see `too many connections`, restart the dyno — it drops all open connections.

```bash
heroku pg:psql -a sushizen-shift-app         # connect to DB directly
heroku pg:backups -a sushizen-shift-app       # list backups
heroku pg:backups:capture -a sushizen-shift-app  # take a manual backup
```

### Vercel build failed

Check Vercel Dashboard → Deployments → click the failed deploy → "Build Logs".  
Common causes: TypeScript error, missing env var, import cycle.

---

## Pages you must not touch accidentally

| Page | File | Risk |
|------|------|------|
| `/week` | `src/app/week/page.tsx` | Staff shift viewer — breaking this affects all staff daily |
| `/admin/draft` | `src/app/admin/draft/page.tsx` | 2,500-line schedule editor — extremely fragile |

> Any change to these files must be tested end-to-end before push.

---

## Coding conventions

- **All UI text in English.** No Japanese in the UI.
- **Import UI tokens from `src/lib/ui-tokens.ts`** — do not write raw Tailwind class strings in pages.
- **API calls go through `apiFetch()` in `src/lib/api.ts`** — never pass `${API_BASE}` in the path (it prepends automatically).
- **Auth stored in `localStorage["sushizen_shift_auth"]`** — see `src/lib/auth.ts`.
- **Python: never use `cur.fetchone()[0]`** — use `row.get("column_name")` (RealDictCursor returns dicts, not tuples).
- **Python: each DB call uses its own connection** (`get_conn()` / `conn.close()`) to avoid transaction abort propagation.

---

## Key contacts

| Role | Name |
|------|------|
| System owner / developer | Yukihiro Nishimura (freestyler2026@gmail.com) |

For full credentials and access handover, see the 1Password note: **Sushi ZEN — System Handover**
