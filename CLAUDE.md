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
- Form submits to Cloudflare Worker
- Worker POSTs to two destinations:
  1. GitHub API → ainightshift-council repo, intake/clients/[client_slug]/[timestamp]_brief.txt
  2. VPS webhook → POST /intake on srv1652708.hstgr.cloud (shared secret header)
- Client list pulled dynamically from GitHub API (reads intake/clients/ folder)

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
