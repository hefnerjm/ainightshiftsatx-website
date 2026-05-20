// Pure handler functions — take { request, env, now? } and return Response.
// Pages Function entrypoints (intake.js, clients.js) are thin wrappers.

import { validatePayload, formatBrief, briefTimestamp } from "./brief.js";
import { putFile, listDir } from "./github.js";

const VPS_TIMEOUT_MS = 10_000;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requireEnv(env, keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    return `server misconfigured: missing env ${missing.join(", ")}`;
  }
  return null;
}

export async function handleIntake({ request, env, now = new Date(), fetchImpl }) {
  // Use injected fetch in tests; default to global fetch in workerd.
  const _fetch = fetchImpl || globalThis.fetch;

  const cfgErr = requireEnv(env, ["GITHUB_TOKEN", "GITHUB_REPO", "VPS_WEBHOOK_URL", "VPS_WEBHOOK_SECRET"]);
  if (cfgErr) return json(500, { error: cfgErr });

  if (request.method !== "POST") return json(405, { error: "method not allowed" });

  let data;
  try {
    data = await request.json();
  } catch {
    return json(400, { error: "body must be JSON" });
  }

  const errors = validatePayload(data);
  if (errors.length) return json(400, { error: "validation failed", details: errors });

  const slug = data.client_slug;
  const brief = formatBrief(data, now);
  const ts = briefTimestamp(now);
  const path = `intake/clients/${slug}/${ts}_brief.txt`;

  // 1) GitHub write — canonical.
  const gh = await putFile({
    repo: env.GITHUB_REPO,
    token: env.GITHUB_TOKEN,
    path,
    content: brief,
    message: `intake: ${slug} ${ts}`,
    fetchImpl: _fetch,
  });

  if (!gh.ok) {
    return json(502, {
      status: "failed",
      error: "github write failed",
      github: { ok: false, status: gh.status, error: gh.error },
    });
  }

  // 2) VPS ping — best-effort. Don't fail the request if it fails.
  const vps = await pingVps({
    url: env.VPS_WEBHOOK_URL,
    secret: env.VPS_WEBHOOK_SECRET,
    payload: { client_slug: slug, brief },
    fetchImpl: _fetch,
  });

  return json(200, {
    status: "ok",
    path,
    github: { ok: true, sha: gh.sha },
    vps,
  });
}

async function pingVps({ url, secret, payload, fetchImpl }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VPS_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": secret,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, error: text.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleClients({ request, env, fetchImpl }) {
  const cfgErr = requireEnv(env, ["GITHUB_TOKEN", "GITHUB_REPO"]);
  if (cfgErr) return json(500, { error: cfgErr });
  if (request.method !== "GET") return json(405, { error: "method not allowed" });

  const result = await listDir({
    repo: env.GITHUB_REPO,
    token: env.GITHUB_TOKEN,
    path: "intake/clients",
    fetchImpl: fetchImpl || globalThis.fetch,
  });

  if (!result.ok) {
    return json(502, { error: "github list failed", details: result });
  }

  const clients = result.entries
    .filter((e) => e.type === "dir")
    .map((e) => e.name)
    .sort();

  return new Response(JSON.stringify({ clients }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // Brief edge cache so the dropdown isn't hammering GitHub.
      "Cache-Control": "public, max-age=60",
    },
  });
}
