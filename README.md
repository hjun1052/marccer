# marccer

A static, backend-free league-race dashboard: Elo-style team ratings, Poisson/Dixon-Coles match prediction, and Monte Carlo season simulation, all computed client-side from match data. No server, no database — everything runs in the browser from JSON.

## Running locally

```
npm install
npm run dev
```

## Self-hosting with your own league

By default the site ships with a demo league baked into `data/league.json`, `data/teams.json`, `data/matches.json`. To point a deployment at a different league entirely, without forking those files:

1. Host one JSON file shaped `{ "league": {...}, "teams": [...], "matches": [...] }` somewhere that allows cross-origin requests (CORS) — a `raw.githubusercontent.com` link to a file your own scraper/cron commits works well. See `src/utils/datasetOverride.ts` for the exact shape and validation rules (it's the same shape the admin UI's "LOAD EXTERNAL DATASET" uses).
2. Set `VITE_DATA_SOURCE_URL` to that URL (copy `.env.example` to `.env`, or set it in your host's environment variables) and build.
3. Every visitor to that deployment now sees your league — the baked-in demo data is only a fallback if the URL fails to load.

This is separate from the per-browser admin override (UPDATE DATA tab): that one is a manual, localStorage-only action for one person's browser; `VITE_DATA_SOURCE_URL` is the deployment's actual data source for everyone.

### Keeping the data fresh

This repo doesn't include a scraper — you bring your own that writes the `{league, teams, matches}` JSON and commits/uploads it wherever `VITE_DATA_SOURCE_URL` points. A simple setup: a scheduled GitHub Action in your data repo that scrapes your league's source, commits the updated JSON, and lets the raw GitHub URL serve the latest version automatically (no redeploy of the app needed — it fetches fresh JSON on every page load).

## Building for production

```
npm run build
```

Outputs a static `dist/` — deploy it anywhere that serves static files (Cloudflare Pages, Vercel, GitHub Pages, or your own nginx/Docker setup).
