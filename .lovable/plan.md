# Plan: Standout Features + Netlify Deployment

This is a large batch. I'll ship it in one pass, in this order, so the app stays green throughout.

## Part 1 — Four standout features

### 1. Analytics chart on dashboard (recharts)
- Add a new "Score trends" section on `/dashboard` using recharts `LineChart`.
- Plot resume overall score + interview avg (×10) over the last ~10 attempts, dual-line, semantic tokens for colors.
- Data already comes from `getDashboardOverview` — extend it to return timestamped series (`{ date, resume, interview }[]`) instead of only sparkline arrays.

### 2. AI Learning Roadmap
- New route: `/_authenticated/learning-roadmap.tsx`.
- Reads user's latest `resume_analyses` rows, aggregates missing keywords across recent analyses, groups by theme via Lovable AI Gateway (`google/gemini-2.5-flash`), returns: `{ topic, why, resources:[{title,type,url}], priority }[]`.
- Server fn `getLearningRoadmap` in `src/lib/roadmap.functions.ts` with `requireSupabaseAuth`.
- UI: cards with priority pill, resource links (YouTube/docs/courses).
- Add sidebar nav entry.

### 3. Interview performance breakdown (per-category)
- Extend AI feedback in `interview-ai.server.ts` to also return category scores: `communication`, `technical_depth`, `clarity`, `structure` (0–10 each) per answer.
- Session summary aggregates per-category averages.
- On mock-interview summary view, add a small radar/bar chart (recharts) showing category averages, plus display per-answer breakdown.
- DB: no schema change — stored inside existing `interview_answers.feedback` JSON and `interview_sessions.summary` JSON.

### 4. Export application tracker as CSV
- Add "Export CSV" button on `/application-tracker`.
- Client-side CSV generation from current query data (company, role, status, applied_date, location, salary, link, notes). Proper escaping. Blob download.

## Part 2 — Wire-up + hygiene
- Add Learning Roadmap tile to dashboard "Next actions" or sidebar.
- Ensure new server fn is called from an `_authenticated` route only.
- Quick Playwright smoke: sign up → dashboard renders → chart shows → CSV button present → roadmap route loads.

## Part 3 — Netlify deployment config
Switch the Nitro preset from Cloudflare Workers to Netlify.

- `vite.config.ts`: pass `nitro: { preset: 'netlify' }` through the Lovable config (the Lovable base already wires nitro; we just override the preset).
- Add `netlify.toml`:
  ```toml
  [build]
    command = "bun run build"
    publish = "dist"
  ```
  (Nitro's Netlify preset emits functions automatically — no manual `functions` dir needed.)
- Add `.nvmrc` with `20` for Netlify's Node version.
- Note in reply: connect repo → set env vars → deploy. Server functions become Netlify Functions automatically.

### Env vars to set in Netlify UI (Site settings → Environment variables)
Server-only:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`  *(fetch from backend settings)*
- `SUPABASE_PROJECT_ID`
- `LOVABLE_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Client (VITE_):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## Notes / honesty
- I can't put `SUPABASE_SERVICE_ROLE_KEY` or provider secrets into `.env` for you — Lovable Cloud manages those and they aren't exposed to me. You'll paste them into Netlify's UI directly. `.env` (which is auto-managed) already has all VITE_ + SUPABASE_ public values.
- Nitro's Netlify preset is officially supported; server functions run as Netlify Functions on AWS Lambda, so cold starts differ from Cloudflare but everything else works the same.
- I will NOT rewrite the auth flow, resume analyzer, or mock interview core — they already work. I'm only extending them.

Approve and I'll execute the whole batch.
