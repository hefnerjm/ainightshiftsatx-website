// Pages Function: POST /api/intake
// Accepts structured form fields, formats them into the Project Brief
// template, writes the file to the council repo via GitHub Contents API,
// then best-effort pings the VPS webhook.

import { handleIntake } from "./_lib/handlers.js";

export const onRequestPost = (ctx) => handleIntake({ request: ctx.request, env: ctx.env });
