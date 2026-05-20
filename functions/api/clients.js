// Pages Function: GET /api/clients
// Lists existing client slugs by reading intake/clients/ on the council repo
// via the GitHub Contents API. Used by the intake form's client dropdown.

import { handleClients } from "./_lib/handlers.js";

export const onRequestGet = (ctx) => handleClients({ request: ctx.request, env: ctx.env });
