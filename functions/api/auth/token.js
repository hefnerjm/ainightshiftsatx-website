// Pages Function: GET /api/auth/token
// Returns the GitHub token to the council viewer page so it can call the
// GitHub API directly. This endpoint MUST be covered by the same
// Cloudflare Access policy that protects /council — without Access in
// front, the token is exposed to the public internet.
//
// The token returned here is the same GITHUB_TOKEN the intake Function
// uses (repo write scope). If you want defense-in-depth, mint a
// read-only PAT, set it as GITHUB_TOKEN_READONLY in Pages env vars, and
// switch the env lookup below.

export const onRequestGet = (ctx) => {
  const token = ctx.env.GITHUB_TOKEN_READONLY || ctx.env.GITHUB_TOKEN;
  if (!token) {
    return json(500, { error: "GITHUB_TOKEN not configured in Pages env vars" });
  }
  return json(200, {
    token,
    repo: ctx.env.GITHUB_REPO || "hefnerjm/ainightshift-council",
  });
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Never let a proxy or browser cache this response.
      "Cache-Control": "private, no-store",
    },
  });
}
