const TABLE = "report_cache";

export function supabaseConfigured(
  env = process.env,
) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function headers(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function loadReportCache(env = process.env, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) return [];
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${TABLE}?select=cache_key,report`;
  const resp = await fetchImpl(url, { headers: headers(env) });
  if (!resp.ok) {
    throw new Error(`Supabase load failed: ${resp.status}`);
  }
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

export async function upsertReportCache(cacheKey, report, env = process.env, fetchImpl = fetch) {
  if (!supabaseConfigured(env)) return;
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${TABLE}?on_conflict=cache_key`;
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...headers(env),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ cache_key: cacheKey, report }),
  });
  if (!resp.ok) {
    throw new Error(`Supabase upsert failed: ${resp.status}`);
  }
}
