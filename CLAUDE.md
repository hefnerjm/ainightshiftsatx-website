# AI NightShift SATX — Website Repo

## Stack
- Cloudflare Pages (static hosting)
- Cloudflare Workers (serverless functions, wrangler.toml configured)
- Plain HTML/CSS/JS — no framework
- GitHub repo: hefnerjm/ainightshiftsatx-website

## Deployment
- Push to main → auto-deploys via Cloudflare Pages
- Workers deploy via: wrangler deploy

## Conventions
- One Worker per function (intake-handler, sms-consent, etc.)
- No npm build step — static files only
- Secrets stored in Cloudflare Workers environment variables, never in code

## Intake Form Context
- Page: /intake → served by intake.html (protected via Cloudflare Access, OTP to hefnerjm@gmail.com)
- Form: vanilla HTML/CSS/JS, 7 fieldsets matching the Project Brief template, draft autosaved to localStorage under "intake_draft_v1"
- Client picker: dropdown of existing slugs (loaded from /api/clients) or "+ New client" with auto-derived slug
- Submits structured JSON to POST /api/intake (Pages Function)
- POST /api/intake:
  1. Renders brief template from form fields (functions/api/_lib/brief.js)
  2. Writes to ainightshift-council via GitHub Contents API at intake/clients/[slug]/[YYYYMMDD_HHMMSS]_brief.txt (canonical)
  3. Best-effort pings VPS webhook with {client_slug, brief} and X-Webhook-Secret header
  4. Returns 200 if GitHub succeeded; VPS failure is reported in response body but not fatal
- GET /api/clients → returns existing client slugs from the council repo (edge-cached 60s) for the form dropdown
- Tests: node --test functions/api/intake.test.js (Node 18+, no npm install needed)

## Council Viewer
- Page: /council → served by council.html (MUST be protected by Cloudflare Access)
- Hash-routed SPA: #/ (clients), #/c/<slug> (sessions), #/c/<slug>/s/<YYYYMMDD_HHMMSS> (session detail)
- Reads council session data directly from GitHub Contents API client-side using a token returned by /api/auth/token
- Session detail: recommendation expanded with GO/NO-GO badge (parsed from "RECOMMENDATION: GO|NO-GO" in COUNCIL_RECOMMENDATION.txt); specialists and QA cycles as collapsible <details> with lazy-loaded content
- GET /api/auth/token → returns {token, repo} from Pages env to the browser. The endpoint relies on Cloudflare Access being configured to protect /council and /api/auth/*. Without Access in front, the token is exposed.
- Defense-in-depth: set GITHUB_TOKEN_READONLY in Pages env vars (read-only PAT). The Function prefers it over GITHUB_TOKEN.

## Environment Variables (Cloudflare Workers)
- GITHUB_TOKEN — PAT with repo write scope (used by /api/intake)
- GITHUB_TOKEN_READONLY — optional read-only PAT preferred by /api/auth/token; falls back to GITHUB_TOKEN
- GITHUB_REPO — hefnerjm/ainightshift-council
- VPS_WEBHOOK_SECRET — shared secret for VPS endpoint
- VPS_WEBHOOK_URL — full URL to VPS webhook endpoint

## Key Files
- index.html — main landing page
- intake.html — client intake form (protected)
- council.html — council session viewer (protected)
- sms-consent.html — SMS consent page
- wrangler.toml — Cloudflare Workers config
