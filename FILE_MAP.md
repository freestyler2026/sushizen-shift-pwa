# File map

## Frontend
- src/app/admin/analytics/page.tsx = main analytics UI
- src/app/admin/comparison/page.tsx = no longer primary; may redirect
- src/app/week/page.tsx = critical page; do not break

## Backend
- ../sushizen_shift_app_clean/app/main.py = API routes
- ../sushizen_shift_app_clean/app/db.py = DB logic and comparison logic

## Current focus
- /admin/analytics correctness
- backend comparison API only as needed to support analytics