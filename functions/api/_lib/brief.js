// Brief template renderer. Mirrors the format produced by the Intake Agent
// (see council repo's intake/CLAUDE.md). Keep field labels and section
// order identical so the Orchestrator can parse either source.

const SLUG_RE = /^[a-z0-9_]{1,64}$/;

const SECTIONS = [
  ["PROJECT IDENTITY", [
    ["Name",            "project_name"],
    ["Client",          "client_name"],
    ["Industry",        "industry"],
    ["Type",            "project_type"],
  ]],
  ["THE PROBLEM", [
    ["Description",       "problem_description"],
    ["Frequency",         "problem_frequency"],
    ["Current cost",      "problem_cost"],
    ["Current solution",  "problem_current_solution"],
  ]],
  ["THE PROPOSED SOLUTION", [
    ["What it does",     "solution_what_it_does"],
    ["Trigger",          "solution_trigger"],
    ["Action",           "solution_action"],
    ["Expected output",  "solution_output"],
  ]],
  ["PEOPLE & DATA", [
    ["Users",              "people_users"],
    ["Data touched",       "people_data"],
    ["Sensitive data",     "people_sensitive_data"],
    ["Regulated industry", "people_regulated"],
  ]],
  ["TECHNICAL CONTEXT", [
    ["Existing tools",     "tech_existing_tools"],
    ["Deployment target",  "tech_deployment"],
    ["Integrations",       "tech_integrations"],
    ["Constraints",        "tech_constraints"],
  ]],
  ["SUCCESS & TIMELINE", [
    ["Success metric",   "success_metric"],
    ["Decision maker",   "success_decision_maker"],
    ["Go-live target",   "success_timeline"],
    ["Engagement type",  "success_engagement_type"],
  ]],
  ["KNOWN RISKS", [
    ["Identified risks",   "risks_identified"],
    ["Operator concerns",  "risks_concerns"],
    ["Regulatory flags",   "risks_regulatory"],
  ]],
];

// Field considered "present" if it's a non-empty string after trim.
function present(v) {
  return typeof v === "string" && v.trim().length > 0;
}

// Required to render a coherent brief. Anything else falls back to "unknown".
const REQUIRED_FIELDS = [
  "client_slug",
  "project_name",
  "client_name",
  "industry",
  "project_type",
  "problem_description",
  "solution_what_it_does",
];

export function validatePayload(data) {
  if (!data || typeof data !== "object") {
    return ["body must be a JSON object"];
  }
  const errors = [];
  for (const f of REQUIRED_FIELDS) {
    if (!present(data[f])) errors.push(`missing required field: ${f}`);
  }
  if (present(data.client_slug) && !SLUG_RE.test(data.client_slug)) {
    errors.push("client_slug must match ^[a-z0-9_]{1,64}$");
  }
  if (present(data.project_type)) {
    const allowed = ["new_agent", "client_automation", "internal_tool", "strategic_decision"];
    if (!allowed.includes(data.project_type)) {
      errors.push(`project_type must be one of: ${allowed.join(", ")}`);
    }
  }
  return errors;
}

export function formatBrief(data, today = new Date()) {
  const date = today.toISOString().slice(0, 10);
  const lines = [
    "PROJECT BRIEF",
    "=============",
    `Date: ${date}`,
    "Operator: AI NightShift SATX",
    "",
  ];
  for (const [heading, fields] of SECTIONS) {
    lines.push(heading);
    for (const [label, key] of fields) {
      const val = present(data[key]) ? data[key].trim() : "unknown";
      lines.push(`- ${label}: ${val}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function briefTimestamp(now = new Date()) {
  // YYYYMMDD_HHMMSS in UTC — matches the Phase 1/Phase 2 convention.
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}_${h}${mi}${s}`;
}

export { SLUG_RE };
