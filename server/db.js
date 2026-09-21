import pg from "pg";

let pool;

// Railway auto-injects DATABASE_URL into a service once a Postgres addon is
// linked - this is the standard var name, never a custom one.
export function dbConfigured(env = process.env) {
  return Boolean(env.DATABASE_URL);
}

export function getPool(env = process.env) {
  if (!dbConfigured(env)) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  }
  return pool;
}
