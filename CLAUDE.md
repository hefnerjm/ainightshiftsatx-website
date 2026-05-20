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
- Page: /intake (protected via Cloudflare Access, OTP to hefnerjm@gmail.com)
- Form submits structured JSON to POST /api/intake (Pages Function)
- POST /api/intake:
  1. Renders brief template from form fields (functions/api/_lib/brief.js)
  2. Writes to ainightshift-council via GitHub Contents API at intake/clients/[slug]/[YYYYMMDD_HHMMSS]_brief.txt (canonical)
  3. Best-effort pings VPS webhook with {client_slug, brief} and X-Webhook-Secret header
  4. Returns 200 if GitHub succeeded; VPS failure is reported in response body but not fatal
- GET /api/clients → returns existing client slugs from the council repo (edge-cached 60s) for the form dropdown
- Tests: node --test functions/api/intake.test.js (Node 18+, no npm install needed)

## Environment Variables (Cloudflare Workers)
- GITHUB_TOKEN — PAT with repo write scope
- GITHUB_REPO — hefnerjm/ainightshift-council
- VPS_WEBHOOK_SECRET — shared secret for VPS endpoint
- VPS_WEBHOOK_URL — full URL to VPS webhook endpoint

## Key Files
- index.html — main landing page
- intake.html — client intake form (protected)
- sms-consent.html — SMS consent page
- wrangler.toml — Cloudflare Workers config
