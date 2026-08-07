# Emergency Handover — Sushi ZEN Workforce OS

This document is for the engineer taking over the system.  
Complete the checklist below on Day 1 before doing anything else.

---

## Day 1 checklist

### 1. Get access

- [ ] **1Password**: Obtain the note "Sushi ZEN — System Handover" from Yukihiro or the designated trustee
- [ ] **GitHub**: Accept invitation to `freestyler2026/sushizen-shift-pwa`
- [ ] **Heroku**: Get added to the `sushizen-shift-app` Heroku team  
      URL: https://dashboard.heroku.com/apps/sushizen-shift-app
- [ ] **Vercel**: Get added to the Vercel project  
      URL: https://vercel.com/dashboard (look for `sushizen-shift-pwa`)
- [ ] **Google Cloud**: Get added to the GCP projects (see 1Password note for list)
- [ ] **Confirm you can log in to the app**: https://sushizen-shift-pwa.vercel.app  
      Use a test account, NOT Yukihiro's account

### 2. Clone the repos

```bash
# Frontend
git clone git@github.com:freestyler2026/sushizen-shift-pwa.git
cd sushizen-shift-pwa
npm install
echo "NEXT_PUBLIC_API_BASE_URL=https://sushizen-shift-app-038d846023bc.herokuapp.com" > .env.local
npm run dev   # should open on http://localhost:3000

# Backend
git clone git@github.com:freestyler2026/sushizen-shift-pwa.git sushizen_shift_app_clean
cd sushizen_shift_app_clean
heroku git:remote -a sushizen-shift-app
heroku config -a sushizen-shift-app   # verify you can see config vars
```

### 3. Verify the system is healthy

```bash
heroku logs -a sushizen-shift-app -n 50    # no ERROR/FATAL lines?
heroku pg:info -a sushizen-shift-app       # DB connection count < 20?
```

Open the live app and confirm:
- [ ] Login works
- [ ] `/week` shows a shift schedule
- [ ] `/admin/daily-inventory` loads
- [ ] `/admin/finance` P&L dashboard loads

### 4. Read the key documents

In order:
1. `README.md` — setup and deploy commands
2. `docs/BUSINESS_CONTEXT.md` — why each module exists
3. `CLAUDE.md` — coding rules (especially the ⚠️ Lessons section)
4. `docs/ai/CURRENT_TASKS.md` — most recent work and known issues

---

## How to make a change safely

### Small frontend fix

```bash
# Edit the file
npm run lint                         # must pass with 0 errors
npx tsc --noEmit                     # must pass with 0 errors
git add <file> && git commit -m "fix: description"
git push origin HEAD:main            # Vercel auto-deploys
# Watch Vercel dashboard for build success
```

### Small backend fix

```bash
# Edit the file (do NOT read main.py/db.py in full — grep for the function)
grep -n "function_name" app/main.py   # find the line
# Read ±50 lines, make the edit
git add <file> && git commit -m "fix: description"
git push heroku HEAD:master --force
heroku logs -a sushizen-shift-app -n 50 --tail   # confirm no errors
```

### If you break something

**Frontend**: Vercel Dashboard → Deployments → last working deploy → "Promote to Production"  
**Backend**: `git push heroku <last-good-hash>:master --force`  
**Database**: `heroku pg:backups:restore <backup_id> DATABASE_URL -a sushizen-shift-app`

---

## Things that have gone wrong before (do not repeat)

1. **Reading `main.py` or `db.py` in full** → causes context overflow / timeouts. Always grep.
2. **Force-pushing to Vercel** → Vercel deploys on git push; use the Dashboard to rollback, not `git reset`.
3. **Calling `cur.fetchone()[0]` in Python** → KeyError(0) with RealDictCursor. Use `.get("column")`.
4. **Passing `${API_BASE}` in apiFetch path** → URL doubles. `apiFetch("/api/...")` only.
5. **Deleting `<AutoReload />` from LayoutShell.tsx** → breaks hot-reload in production.
6. **Running a deactivate-items query without `AND is_commissary = FALSE`** → wipes CK commissary items.
7. **Editing the `/week` page without end-to-end testing** → breaks daily staff shift view.

---

## Architecture in one page

```
Browser → Next.js (Vercel)
             │
             ├─ /api/admin/* → FastAPI (Heroku) → PostgreSQL (Heroku)
             ├─ /api/store/* → FastAPI (Heroku) → PostgreSQL (Heroku)
             │
             └─ Static assets (Vercel CDN)

FastAPI services:
  main.py         — all route handlers
  db.py           — all database queries
  db_daily_inventory.py / daily_inventory_api.py  — inventory module
  db_nte_v2*.py / nte_v2_api.py                  — conduct/NTE module
  pl_finance_bridge.py                            — P&L computation
  access_control.py                               — role/permission system

External integrations:
  Google Drive/Sheets  — 12+ service accounts (see 1Password)
  Foodics (Dubai POS)  — via GCP service account
  Bayzat (Dubai HR)    — via Drive sync
  Discord              — webhooks for shift approval / alerts
  Tapo cameras         — future CCTV ingest
  Anthropic Claude API — AI analytics / NTE suggestions
```

---

## Key phone numbers / contacts to know

| What | Who |
|------|-----|
| System owner | Yukihiro Nishimura — freestyler2026@gmail.com |
| Dubai branch manager | Ask Yukihiro |
| Manila HR | Ask Yukihiro |
| Heroku billing | Under Yukihiro's account |
| Google Cloud billing | Under Yukihiro's account |

---

## Glossary

| Term | Meaning |
|------|---------|
| CK | Central Kitchen (Manila) — supplies commissary items to stores |
| NSD | Night Shift Differential — PH law 10% pay premium for 22:00–06:00 |
| NTE | Notice to Explain — formal discipline letter under PH/UAE labor law |
| CODI | Committee on Discipline — for serious violations (gross misconduct) |
| P&L | Profit & Loss — management dashboard showing labor ratio vs target |
| DTR | Daily Time Record — attendance log |
| Par level | Minimum reorder threshold for a stock item |
| Min level | Critical low stock threshold (below this = urgent alert) |
| EOSB | End-of-Service Benefit (UAE) — gratuity paid on resignation/termination |
| HQ | Head Quarters role in the app — full access |
