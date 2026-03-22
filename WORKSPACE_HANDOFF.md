# Sushi ZEN workspace handoff

## Repos
- `sushizen-shift-pwa` = frontend (primary active repo)
- `sushizen_shift_app_clean` = backend

## System intent
This app is an internal Sushi ZEN admin and analytics system.

It is intended to support:
- shift scheduling
- actual attendance import from Bayzat
- absence and attendance analysis
- branch performance analysis
- staff performance analysis
- sales and labor analysis
- monthly operational workflows
- management decision support

The long-term target is to connect:

Plan -> Actual -> Result

Meaning:
- Plan = scheduled shifts
- Actual = real attendance
- Result = sales, productivity, anomalies, and management insight

## Primary page intent
- `/admin/analytics` = primary analytics page
- `/admin/comparison` = no longer primary
- `/week` = critical and must not be broken

## Current frontend design intent for /admin/analytics

### 1. Compliance Analytics
This is the top section.

Purpose:
- compare scheduled shifts vs Bayzat actual attendance
- evaluate lateness, absence, overtime, missing punches
- support staff and branch evaluation

It should support:
- Late Staff
- Late Count
- Total Late Minutes
- Problem Absence Staff
- Total OT
- Missing IN / OUT

It must also keep:
- Perfect Attendance
- Top 10 Late
- Top 10 Problem Absence
- Top 10 Compliance
- Worst 10 Compliance
- Branch Late Ranking
- Branch Problem Absence Ranking
- Branch Compliance Ranking
- Bayzat Missing Punch Ranking
- Individual Search

### 2. Summary Analytics
This is the lower section.

Purpose:
- show broader operational summary and trends

It should support:
- Total Hours
- Days
- Branches
- Top Staff
- Top Absence
- City Comparison
- City Difference
- Branch Totals
- Branch Daily Hours
- Branch Weekday Averages
- Staff Work Summary
- Absence Summary

## Period design
The analytics page has two separate period layers.

### Compliance period
Used for:
- Bayzat vs scheduled comparison
- compliance cards
- rankings
- individual search

### Summary period
Used for:
- total hours
- top staff
- city comparison
- branch totals
- daily and weekday tables
- staff summary
- absence summary

Do not accidentally merge these two concepts.

## Business rules
- Late <= 15 minutes is not counted
- Problem absence excludes:
  - `DAY_OFF`
  - `VACATION_LEAVE`
- Problem absence may include:
  - `ABSENT`
  - `MEDICAL_LEAVE`
  - `SICK_LEAVE`
  - `HOSPITAL`
  - `INJURY`
- Individual Search should show:
  - late count
  - total late minutes
  - problem absence days
  - total overtime
  - missing in
  - missing out
- Shift change request count is not needed for now

## External integrations and system boundaries

### Google Drive
- Stores Bayzat attendance files
- Manual sync is implemented and sufficient for now
- Current drive source id = `1`
- Current drive folder id = `1t562gVuaNupDUTuGjaRz-3u4mF-LXr4Y`

### Bayzat
- Source of actual attendance data

### Database
- Source of truth for scheduled shifts, actual attendance, absences, mappings, and analytics data

### Google Sheets
- May exist operationally, but is not the primary focus of the current `/admin/analytics` task unless explicitly referenced

### Discord
- Used operationally in the business, but is not part of the current analytics implementation task unless explicitly referenced

### Deploy targets
- Frontend = Vercel
- Backend = Heroku

## Current backend/runtime facts
- `/api/admin/attendance/comparison` feeds the compliance analytics section
- actual attendance now contains:
  - Dubai: `2025-11-01` to `2026-03-13`
  - Manila: `2025-11-01` to `2026-03-13`
- narrow Bayzat batch was rolled back
- full range Bayzat import succeeded
- manual Google Drive sync exists and is enough for now

## Source of truth rules
- Current saved files are the code source of truth
- Database is the runtime data source of truth
- Google Drive is source-file storage, not the runtime analytics source of truth
- If earlier chat assumptions conflict with current saved files, trust current saved files
- Do not trust old pasted fragments over current saved files

## Constraints
- Do not remove existing analytics features
- Do not simplify by deleting working sections
- Do not merge by destroying existing behavior
- Do not touch `/week` unless explicitly requested
- Prefer minimal diffs
- Do not rewrite whole files unless absolutely necessary
- Preserve existing exports, routes, and page structure unless explicitly changing them
- Frontend and backend behavior must stay aligned

## Project roadmap and current status

### Overall direction
After Foodics v6, the correct direction is to move from "visualization" to "operationalization".

The system is not complete just because screens exist.
Completion means:
- shifts can be created
- attendance can be imported
- anomalies can be found
- relationship between sales and labor can be analyzed
- monthly closing and payroll support can be done
- managers can use the system every day in real operations

### Master roadmap

#### 1. PWA production deployment
Tasks:
- deploy frontend to Vercel
- set `NEXT_PUBLIC_API_BASE_URL` to the Heroku production backend
- verify `/admin`, `/admin/attendance`, `/admin/attendance/history` in production

#### 2. Backend production deployment
Tasks:
- deploy backend changes to Heroku
- verify API connectivity in production
- fix any auth mismatch

#### 3. Attendance navigation cleanup
Tasks:
- normalize `/admin/attendance` structure
- align `AdminAttendanceLinks.tsx` hrefs with actual routes
- verify navigation for `history / import / mapping / monthly` pages

#### 4. History feature completion
Tasks:
- fully connect to `attendance_import_jobs`
- show import history
- show duplicate status
- show import status
- CSV export
- improve `imported by / notes / target_date`

#### 5. Foodics v6
Tasks:
- Excel import
- branch mapping
- sales normalization
- join with attendance
- visualize sales x attendance by day and by branch

#### 6. AI COO v6
This is the strategic core.
Tasks:
- sales / staff
- sales / labor hour
- high sales but understaffed
- low sales but overstaffed
- lateness / no-show impact on sales
- anomaly branch detection
- productivity ranking

#### 7. Monthly operations screens
Tasks:
- `monthly-summary`
- `monthly-closing`
- `payroll export`
- `corrections`
- `comparison`

Goal:
- make monthly operation usable in real workflows

#### 8. Shift system and Attendance integration
Goal:
connect:
- scheduled shifts
- actual attendance
- sales result

#### 9. Automated alerts
Tasks:
- repeated no-show
- duplicate import
- sudden sales drop
- labor inefficiency by branch
- missed monthly closing

#### 10. Executive dashboard completion
Final target includes:
- COO Dashboard
- Attendance anomalies
- Sales x labor
- Branch ranking
- Staff risk
- Monthly trend
- Export / payroll support

### Priority order

#### Highest priority
1. PWA deployment
2. Backend production deployment
3. Attendance navigation cleanup
4. History completion
5. Foodics v6
6. AI COO v6

#### Next priority
7. Monthly operations screens
8. Shift x Attendance x Sales integration
9. Automated alerts
10. Executive dashboard completion

## Current actual status

### Already done or mostly done
- `/admin/analytics` has been restructured to separate:
  - Compliance Analytics
  - Summary Analytics
- `/admin/comparison` is no longer the main page
- Google Drive manual sync for Bayzat is implemented and usable
- Drive source is configured
- actual attendance was reimported for full range:
  - Dubai: `2025-11-01` to `2026-03-13`
  - Manila: `2025-11-01` to `2026-03-13`
- narrow Bayzat import was rolled back
- full range import succeeded
- current business rules are already decided:
  - Late <= 15 minutes is ignored
  - Problem absence excludes `DAY_OFF` and `VACATION_LEAVE`
  - Individual Search is required
  - Shift change request count is out of scope for now

### In progress now
- `/admin/analytics` is being stabilized
- frontend JSX structure in analytics page has been fragile
- some intended analytics behavior is designed but not fully confirmed in production
- preserving existing functionality while extending analytics is still an active concern

### Not complete yet
- PWA production stabilization is not fully complete
- backend production reflection is not fully complete
- attendance navigation cleanup is not complete
- history feature is not complete
- Foodics v6 is not complete
- AI COO v6 is not complete
- monthly operations screens are not complete
- Plan -> Actual -> Result integration is not complete
- automated alerts are not complete
- executive dashboard is not complete

## Current blocking focus
The immediate focus is not the full roadmap.

The immediate focus is:
- stabilize `/admin/analytics`
- preserve all existing working sections
- do not lose old features while extending new analytics
- keep compliance analytics and summary analytics both working
- avoid misleading broad rewrites
- avoid breaking `/week`
- use current saved files as the source of truth

This means:
- first make `/admin/analytics` structurally safe and buildable
- then confirm current analytics behavior
- only after that continue with roadmap items

## Immediate success criteria
For the current phase, success means:
- `npm run build` passes
- `/admin/analytics` renders without client-side exception
- Compliance Analytics renders correctly
- Summary Analytics renders correctly
- existing Top10 / ranking features remain visible
- Individual Search remains visible
- `/week` remains unaffected
- no existing working section is removed just to simplify implementation

## Editing strategy for current phase
Cursor should assume:
- preserve working features first
- prefer minimal diffs
- do not rewrite the entire system unless explicitly requested
- do not jump ahead to Foodics v6 or AI COO v6 until the current analytics page is stable
- roadmap awareness is important, but current execution should focus on the smallest safe next step

## Operational assumptions
The user already understands:
- frontend deployment flow
- backend deployment flow
- Heroku psql usage
- current environment and runtime layout

Do not re-explain those unless explicitly asked.
Focus on:
- current saved files
- current behavior
- smallest safe code changes
- preserving existing working functionality

## Operational preference
The user prefers exact copy-paste terminal steps over conceptual explanations.

When suggesting operational steps:
- prefer commands from `TERMINAL_RUNBOOK.md`
- prefer scripts from `scripts/ops/`
- do not re-explain deployment or environment basics unless explicitly asked
- provide exact copy-paste commands whenever possible

## Verification preference
After edits, prefer:
1. exact build / curl / DB verification
2. concise explanation of result
3. no broad re-explanation unless explicitly requested

## Related repo
Backend repo:
`../sushizen_shift_app_clean`