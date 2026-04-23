const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xnqjdgixcocekzehsote.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWpkZ2l4Y29jZWt6ZWhzb3RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NTI4OTIsImV4cCI6MjA5MjIyODg5Mn0.U0zMSMRZE91RYnToZgooIel0VHDyLlxKK-Cr-Oh9ves';

function getConfig() {
  return {
    clientId: process.env.ROBLOX_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.ROBLOX_OAUTH_CLIENT_SECRET || '',
    redirectUri: process.env.ROBLOX_OAUTH_REDIRECT_URI || '',
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { response, data };
}

function createHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
}

async function readSupabaseRows(table, query) {
  const queryString = query ? `?${query.toString()}` : '';
  const { response, data } = await fetchJson(`${SUPABASE_URL}/rest/v1/${table}${queryString}`, {
    headers: createHeaders({
      Accept: 'application/json',
    }),
  });

  if (!response.ok) {
    throw new Error(data?.message || data?.error_description || `Supabase read failed (${response.status}).`);
  }

  return Array.isArray(data) ? data : [];
}

async function updateSupabaseRows(table, query, body) {
  const queryString = query ? `?${query.toString()}` : '';
  const { response, data } = await fetchJson(`${SUPABASE_URL}/rest/v1/${table}${queryString}`, {
    method: 'PATCH',
    headers: createHeaders({
      Prefer: 'return=representation',
    }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(data?.message || data?.error_description || `Supabase update failed (${response.status}).`);
  }

  return Array.isArray(data) ? data : [];
}

async function getSessionByState(state) {
  const params = new URLSearchParams({
    select: 'id,state,discord_user_id,discord_username,guild_id,status,expires_at,roblox_user_id,roblox_username,duplicate_flag,duplicate_count',
    state: `eq.${state}`,
    limit: '1',
  });

  const rows = await readSupabaseRows('roblox_verification_sessions', params);
  return rows[0] || null;
}

async function markSession(state, payload) {
  const params = new URLSearchParams({
    state: `eq.${state}`,
  });

  const rows = await updateSupabaseRows('roblox_verification_sessions', params, {
    ...payload,
    updated_at: new Date().toISOString(),
  });

  return rows[0] || null;
}

async function fetchDuplicateLinks(robloxUserId, discordUserId) {
  if (!robloxUserId) return [];

  const params = new URLSearchParams({
    select: 'id,discord_user_id,roblox_user_id,status',
    roblox_user_id: `eq.${robloxUserId}`,
    limit: '10',
  });

  const rows = await readSupabaseRows('roblox_verification_sessions', params);
  return rows.filter((row) => String(row.discord_user_id || '') !== String(discordUserId || ''));
}

function isExpired(session) {
  const expiresAt = new Date(session?.expires_at || 0).getTime();
  return !Number.isFinite(expiresAt) || Date.now() > expiresAt;
}

function renderPage({ title, body, tone = 'gold' }) {
  const accent = tone === 'green' ? '#57f287' : tone === 'red' ? '#ed4245' : '#f1c878';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --bg: #070b14;
      --surface: #0d1220;
      --border: rgba(241, 200, 120, 0.16);
      --text: #e8edf8;
      --muted: #93a0bb;
      --accent: ${accent};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at top, rgba(241, 200, 120, 0.08), transparent 40%),
        linear-gradient(180deg, #050810, #0a1020 55%, #060910);
      color: var(--text);
      font-family: Inter, Arial, sans-serif;
      padding: 24px;
    }
    .card {
      width: min(680px, 100%);
      background: linear-gradient(180deg, rgba(13, 18, 32, 0.98), rgba(9, 13, 24, 0.98));
      border: 1px solid var(--border);
      border-top: 3px solid var(--accent);
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 22px 60px rgba(0,0,0,.45);
    }
    .kicker {
      font-size: 12px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 14px;
    }
    h1 {
      font-size: 34px;
      line-height: 1.05;
      margin: 0 0 14px;
    }
    p, li {
      color: var(--muted);
      line-height: 1.65;
      font-size: 15px;
    }
    ul {
      margin: 18px 0 0;
      padding-left: 18px;
    }
    strong { color: var(--text); }
    code {
      background: rgba(255,255,255,.04);
      padding: 2px 6px;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="kicker">SAVE Roblox Verification</div>
    <h1>${title}</h1>
    ${body}
  </main>
</body>
</html>`;
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

module.exports = {
  fetchDuplicateLinks,
  fetchJson,
  getConfig,
  getSessionByState,
  isExpired,
  markSession,
  renderPage,
  sendHtml,
};
