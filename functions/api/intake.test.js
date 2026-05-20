// Node test harness for the intake + clients handlers. Stubs global fetch
// so no network is touched. Run from repo root:
//     node functions/api/intake.test.js

import test from "node:test";
import assert from "node:assert/strict";

import { handleIntake, handleClients } from "./_lib/handlers.js";
import { formatBrief, validatePayload, briefTimestamp } from "./_lib/brief.js";

const FROZEN_NOW = new Date("2026-05-19T20:15:00Z");

const FULL_PAYLOAD = {
  client_slug: "happy_co",
  project_name: "Test Project",
  client_name: "Happy Co",
  industry: "test",
  project_type: "client_automation",
  problem_description: "things break",
  problem_frequency: "daily",
  problem_cost: "lots",
  problem_current_solution: "nothing",
  solution_what_it_does: "fixes things",
  solution_trigger: "an event",
  solution_action: "does work",
  solution_output: "a result",
  people_users: "everyone",
  people_data: "names",
  people_sensitive_data: "none",
  people_regulated: "no",
  tech_existing_tools: "twilio",
  tech_deployment: "railway",
  tech_integrations: "n/a",
  tech_constraints: "none",
  success_metric: "it works",
  success_decision_maker: "owner",
  success_timeline: "2 weeks",
  success_engagement_type: "free first build",
  risks_identified: "none",
  risks_concerns: "none",
  risks_regulatory: "none",
};

const ENV = {
  GITHUB_TOKEN: "ghp_test",
  GITHUB_REPO: "hefnerjm/ainightshift-council",
  VPS_WEBHOOK_URL: "https://vps.example.com/intake",
  VPS_WEBHOOK_SECRET: "vps-test-secret",
};

function jsonRequest(body, method = "POST") {
  return new Request("https://example.com/api/intake", {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// Build a fetch stub that returns programmed responses keyed by URL prefix.
// Records calls into `recorded`.
function makeFetch(rules, recorded) {
  return async (url, init = {}) => {
    recorded.push({ url, init });
    for (const [prefix, fn] of rules) {
      if (String(url).startsWith(prefix)) return fn(url, init);
    }
    throw new Error(`fetch stub: no rule matched ${url}`);
  };
}

function ghPutOk(sha = "abc123") {
  return new Response(JSON.stringify({ content: { sha } }), { status: 201 });
}

function ghPutFail(status = 422, msg = "validation") {
  return new Response(JSON.stringify({ message: msg }), { status });
}

function vpsOk() {
  return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
}

function vpsFail(status = 500) {
  return new Response("boom", { status });
}

// ── brief.js unit tests ──────────────────────────────────────────────────────
test("formatBrief renders all sections in order", () => {
  const out = formatBrief(FULL_PAYLOAD, FROZEN_NOW);
  assert.match(out, /^PROJECT BRIEF\n=+\nDate: 2026-05-19\nOperator: AI NightShift SATX\n/);
  for (const section of [
    "PROJECT IDENTITY",
    "THE PROBLEM",
    "THE PROPOSED SOLUTION",
    "PEOPLE & DATA",
    "TECHNICAL CONTEXT",
    "SUCCESS & TIMELINE",
    "KNOWN RISKS",
  ]) {
    assert.ok(out.includes(section), `missing section: ${section}`);
  }
  assert.ok(out.endsWith("\n"));
});

test("formatBrief substitutes 'unknown' for missing optional fields", () => {
  const slim = { ...FULL_PAYLOAD, risks_concerns: "", risks_regulatory: undefined };
  const out = formatBrief(slim, FROZEN_NOW);
  assert.ok(out.includes("- Operator concerns: unknown"));
  assert.ok(out.includes("- Regulatory flags: unknown"));
});

test("validatePayload flags missing required fields", () => {
  const errs = validatePayload({ client_slug: "ok" });
  assert.ok(errs.some((e) => e.includes("project_name")));
  assert.ok(errs.some((e) => e.includes("client_name")));
});

test("validatePayload rejects bad slug", () => {
  const bad = { ...FULL_PAYLOAD, client_slug: "Bad Slug" };
  const errs = validatePayload(bad);
  assert.ok(errs.some((e) => e.includes("client_slug must match")));
});

test("validatePayload rejects unknown project_type", () => {
  const bad = { ...FULL_PAYLOAD, project_type: "nonsense" };
  const errs = validatePayload(bad);
  assert.ok(errs.some((e) => e.includes("project_type must be")));
});

test("briefTimestamp produces YYYYMMDD_HHMMSS UTC", () => {
  assert.equal(briefTimestamp(FROZEN_NOW), "20260519_201500");
});

// ── handleIntake integration tests (stubbed fetch) ───────────────────────────
test("intake: happy path writes to GitHub and pings VPS", async () => {
  const recorded = [];
  const fetchImpl = makeFetch([
    ["https://api.github.com/", () => ghPutOk("sha-happy")],
    ["https://vps.example.com/", () => vpsOk()],
  ], recorded);

  const res = await handleIntake({
    request: jsonRequest(FULL_PAYLOAD),
    env: ENV,
    now: FROZEN_NOW,
    fetchImpl,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.path, "intake/clients/happy_co/20260519_201500_brief.txt");
  assert.equal(body.github.ok, true);
  assert.equal(body.github.sha, "sha-happy");
  assert.equal(body.vps.ok, true);

  // GitHub call: PUT with base64'd brief
  const gh = recorded.find((r) => String(r.url).startsWith("https://api.github.com/"));
  assert.equal(gh.init.method, "PUT");
  const ghBody = JSON.parse(gh.init.body);
  assert.equal(ghBody.message, "intake: happy_co 20260519_201500");
  // Decode and verify content matches formatBrief output
  const decoded = Buffer.from(ghBody.content, "base64").toString("utf-8");
  assert.equal(decoded, formatBrief(FULL_PAYLOAD, FROZEN_NOW));

  // VPS call: POST with secret header and {client_slug, brief}
  const vps = recorded.find((r) => String(r.url).startsWith("https://vps.example.com/"));
  assert.equal(vps.init.method, "POST");
  assert.equal(vps.init.headers["X-Webhook-Secret"], "vps-test-secret");
  const vpsBody = JSON.parse(vps.init.body);
  assert.equal(vpsBody.client_slug, "happy_co");
  assert.equal(vpsBody.brief, decoded);
});

test("intake: VPS failure does not fail the request (github canonical)", async () => {
  const recorded = [];
  const fetchImpl = makeFetch([
    ["https://api.github.com/", () => ghPutOk()],
    ["https://vps.example.com/", () => vpsFail(503)],
  ], recorded);

  const res = await handleIntake({
    request: jsonRequest(FULL_PAYLOAD),
    env: ENV,
    now: FROZEN_NOW,
    fetchImpl,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "ok");
  assert.equal(body.github.ok, true);
  assert.equal(body.vps.ok, false);
  assert.equal(body.vps.status, 503);
});

test("intake: GitHub failure returns 502 and skips VPS write claim", async () => {
  const recorded = [];
  const fetchImpl = makeFetch([
    ["https://api.github.com/", () => ghPutFail(422, "path conflict")],
    ["https://vps.example.com/", () => vpsOk()],  // shouldn't get called
  ], recorded);

  const res = await handleIntake({
    request: jsonRequest(FULL_PAYLOAD),
    env: ENV,
    now: FROZEN_NOW,
    fetchImpl,
  });

  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.status, "failed");
  assert.equal(body.github.ok, false);
  // VPS must not have been called
  assert.equal(recorded.find((r) => r.url.startsWith("https://vps.")), undefined);
});

test("intake: 400 on missing required fields", async () => {
  const res = await handleIntake({
    request: jsonRequest({ client_slug: "ok" }),
    env: ENV,
    now: FROZEN_NOW,
    fetchImpl: async () => { throw new Error("should not fetch"); },
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "validation failed");
  assert.ok(Array.isArray(body.details));
});

test("intake: 400 on non-JSON body", async () => {
  const req = new Request("https://example.com/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not-json",
  });
  const res = await handleIntake({
    request: req, env: ENV, now: FROZEN_NOW,
    fetchImpl: async () => { throw new Error("should not fetch"); },
  });
  assert.equal(res.status, 400);
});

test("intake: 500 on missing env config", async () => {
  const res = await handleIntake({
    request: jsonRequest(FULL_PAYLOAD),
    env: { GITHUB_REPO: "x/y" },  // missing GITHUB_TOKEN, VPS_*
    now: FROZEN_NOW,
    fetchImpl: async () => { throw new Error("should not fetch"); },
  });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.match(body.error, /missing env/);
});

test("intake: 405 on non-POST", async () => {
  const req = new Request("https://example.com/api/intake", { method: "GET" });
  const res = await handleIntake({
    request: req, env: ENV, now: FROZEN_NOW,
    fetchImpl: async () => { throw new Error("should not fetch"); },
  });
  assert.equal(res.status, 405);
});

// ── handleClients tests ──────────────────────────────────────────────────────
test("clients: lists dirs under intake/clients", async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /\/repos\/hefnerjm\/ainightshift-council\/contents\/intake\/clients$/);
    return new Response(JSON.stringify([
      { name: "365_pool_and_spa", type: "dir" },
      { name: "happy_co",         type: "dir" },
      { name: "README.md",        type: "file" },
    ]), { status: 200 });
  };
  const req = new Request("https://example.com/api/clients", { method: "GET" });
  const res = await handleClients({ request: req, env: ENV, fetchImpl });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=60");
  const body = await res.json();
  assert.deepEqual(body.clients, ["365_pool_and_spa", "happy_co"]);
});

test("clients: returns empty list on 404 (no directory yet)", async () => {
  const fetchImpl = async () => new Response("not found", { status: 404 });
  const req = new Request("https://example.com/api/clients", { method: "GET" });
  const res = await handleClients({ request: req, env: ENV, fetchImpl });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.clients, []);
});

test("clients: 502 when GitHub errors", async () => {
  const fetchImpl = async () => new Response("rate limited", { status: 403 });
  const req = new Request("https://example.com/api/clients", { method: "GET" });
  const res = await handleClients({ request: req, env: ENV, fetchImpl });
  assert.equal(res.status, 502);
});

test("clients: 405 on non-GET", async () => {
  const req = new Request("https://example.com/api/clients", { method: "POST" });
  const res = await handleClients({ request: req, env: ENV });
  assert.equal(res.status, 405);
});
