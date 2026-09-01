import "dotenv/config";

import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "gnatsupreme-slow-query-report" });

await client.connect();
try {
  const result = await client.query(`
    SELECT queryid::text,
           calls,
           ROUND(total_exec_time::numeric, 2) AS total_ms,
           ROUND(mean_exec_time::numeric, 2) AS mean_ms,
           rows,
           LEFT(REGEXP_REPLACE(query, '\\s+', ' ', 'g'), 240) AS query
    FROM pg_stat_statements
    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND query NOT ILIKE '%pg_stat_statements%'
    ORDER BY total_exec_time DESC
    LIMIT 20
  `);
  console.table(result.rows);
} finally {
  await client.end();
}
