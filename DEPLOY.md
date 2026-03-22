# Deploy (project-specific)

Paths assume `~/Desktop/`.

## Frontend (Vercel) — `sushizen-shift-pwa`

```bash
cd ~/Desktop/sushizen-shift-pwa
npm run build
vercel --prod
```

## Backend (Heroku) — `sushizen_shift_app_clean`

```bash
cd ~/Desktop/sushizen_shift_app_clean
git add .
git commit -m "deploy"
git push heroku HEAD:master --force
```

App: `sushizen-shift-app`

## Heroku logs

```bash
cd ~/Desktop/sushizen_shift_app_clean
heroku logs -a sushizen-shift-app -n 200
```

## Heroku Postgres (psql)

```bash
cd ~/Desktop/sushizen_shift_app_clean
heroku pg:psql -a sushizen-shift-app
```
