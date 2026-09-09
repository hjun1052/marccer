# marccer

A static, backend-free league-race dashboard: Elo-style team ratings, Poisson/Dixon-Coles match prediction, and Monte Carlo season simulation, all computed client-side from match data. No server, no database — everything runs in the browser from JSON.

## Running locally

```
npm install
npm run dev
```

## Starting a brand-new league from scratch

If you're not pointing at an existing league's data (see below) and want to set one up:

1. Write `data/teams.json` — one entry per team (`id`, `name`, `shortName`, `displayName`, optionally `venue.{lat,lng}` for the travel-fatigue feature).
2. Write `data/league.json` — `id`, `name`, `seasonId`, `targetTeamId` (whose title race the dashboard is built around), `totalRounds`, `rules.{winPoints,drawPoints,lossPoints,tiebreakers}`.
3. Run `npm run init-schedule` (add `-- --double` for a home-and-away double round-robin) to generate the full-season `data/matches.json` from your teams list — every pairing, every round, all `status: "scheduled"`. It refuses to overwrite an existing non-empty `data/matches.json` unless you pass `-- --force`.
4. As real results come in, either edit them by hand (UPDATE DATA tab, or directly in `data/matches.json`) or adapt `scripts/scrape.ts` to your own results source.

## Self-hosting with your own (existing) league's data

By default the site ships with a demo league baked into `data/league.json`, `data/teams.json`, `data/matches.json`. To point a deployment at a different league entirely, without forking those files:

1. Host one JSON file shaped `{ "league": {...}, "teams": [...], "matches": [...] }` somewhere that allows cross-origin requests (CORS) — a `raw.githubusercontent.com` link to a file your own scraper/cron commits works well. See `src/utils/datasetOverride.ts` for the exact shape and validation rules (it's the same shape the admin UI's "LOAD EXTERNAL DATASET" uses).
2. Set `VITE_DATA_SOURCE_URL` to that URL (copy `.env.example` to `.env`, or set it in your host's environment variables) and build.
3. Every visitor to that deployment now sees your league — the baked-in demo data is only a fallback if the URL fails to load.

This is separate from the per-browser admin override (UPDATE DATA tab): that one is a manual, localStorage-only action for one person's browser; `VITE_DATA_SOURCE_URL` is the deployment's actual data source for everyone.

### Keeping the data fresh

`scripts/scrape.ts` (`npm run scrape`) is a reference scraper for this project's own source site — it updates existing rows in `data/matches.json` (matched by round + team pair) from the source's published results, and never invents new rows, so the full-season schedule must already exist there. `.github/workflows/scrape.yml` runs it on a cron and auto-commits when something changed, so results land without anyone touching the repo by hand. Adapt `SOURCE_URL` and the parsing in `scripts/scrape.ts` for a different source site's format.

If you're using `VITE_DATA_SOURCE_URL` instead of forking `data/*.json` directly, point your own scraper's output at wherever that URL serves from (e.g. a `raw.githubusercontent.com` link into your own data repo) — the app fetches fresh JSON on every page load, no redeploy needed when only the data changes.

## Building for production

```
npm run build
```

Outputs a static `dist/` — deploy it anywhere that serves static files (Cloudflare Pages, Vercel, GitHub Pages, or your own nginx/Docker setup).

## License

MIT — see [LICENSE](LICENSE).
