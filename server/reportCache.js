import { dbConfigured, getPool } from "./db.js";

export { dbConfigured };

export async function loadReportCache(env = process.env, pool = getPool(env)) {
  if (!pool) return [];
  const { rows } = await pool.query("select cache_key, report from report_cache");
  return rows;
}

export async function upsertReportCache(cacheKey, report, env = process.env, pool = getPool(env)) {
  if (!pool) return;
  await pool.query(
    `insert into report_cache (cache_key, report, updated_at)
     values ($1, $2, now())
     on conflict (cache_key) do update set report = excluded.report, updated_at = now()`,
    [cacheKey, report],
  );
}
