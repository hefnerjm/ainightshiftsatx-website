// Thin GitHub Contents API client. Used by /api/intake to create the brief
// file in the council repo, and by /api/clients to list existing client slugs.

const GH_API = "https://api.github.com";

function authHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ainightshiftsatx-intake-worker",
  };
}

// PUT a new file. Returns { ok, status, path, sha?, error? }.
export async function putFile({ repo, token, path, content, message, fetchImpl }) {
  const _fetch = fetchImpl || globalThis.fetch;
  const url = `${GH_API}/repos/${repo}/contents/${encodeURI(path)}`;
  const body = JSON.stringify({
    message,
    content: utf8ToBase64(content),
  });
  let res;
  try {
    res = await _fetch(url, {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body,
    });
  } catch (e) {
    return { ok: false, status: 0, error: `fetch failed: ${e.message}` };
  }
  if (res.status === 201) {
    const j = await res.json();
    return { ok: true, status: 201, path, sha: j?.content?.sha };
  }
  const text = await res.text();
  return { ok: false, status: res.status, error: truncate(text, 300) };
}

// List entries in a directory. Returns { ok, status, entries?, error? }.
export async function listDir({ repo, token, path, fetchImpl }) {
  const _fetch = fetchImpl || globalThis.fetch;
  const url = `${GH_API}/repos/${repo}/contents/${encodeURI(path)}`;
  let res;
  try {
    res = await _fetch(url, { headers: authHeaders(token) });
  } catch (e) {
    return { ok: false, status: 0, error: `fetch failed: ${e.message}` };
  }
  if (res.status === 200) {
    const j = await res.json();
    if (!Array.isArray(j)) return { ok: false, status: 200, error: "not a directory" };
    return { ok: true, status: 200, entries: j };
  }
  if (res.status === 404) return { ok: true, status: 404, entries: [] };
  const text = await res.text();
  return { ok: false, status: res.status, error: truncate(text, 300) };
}

function utf8ToBase64(s) {
  // btoa() only handles latin-1 — encode UTF-8 first.
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + "..." : s;
}
