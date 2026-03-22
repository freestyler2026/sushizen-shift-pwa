# Verification checklist

## Frontend
- run: npm run build
- confirm /admin/analytics renders without client-side exception
- confirm compliance cards render
- confirm Top10 sections remain visible
- confirm Individual Search renders and filters results
- confirm summary section renders below compliance section
- confirm /admin/comparison does not break the app

## Backend
- verify /api/admin/attendance/comparison with curl
- verify no regression to /week-related behavior

## Compliance Analytics behavior
- top period changes compliance section
- Late <= 15 min is not counted
- Problem absence excludes DAY_OFF and VACATION_LEAVE
- rankings remain visible

## Summary Analytics behavior
- summary period changes summary section
- Total Hours / Top Staff / City Comparison react to summary period

## Safety
- existing sections must remain
- working behavior must not be deleted to make new behavior easier