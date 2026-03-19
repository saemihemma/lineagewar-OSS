import postgres from "postgres";
const sql = postgres("postgresql://postgres:UgQYPDDFeQvXwDnWLRLJRVfBgjwSEGfl@turntable.proxy.rlwy.net:22593/railway", { connect_timeout: 10 });
const rows = await sql`SELECT tick_timestamp_ms, (resolved::jsonb)->'snapshot'->>'state' as state FROM committed_ticks_v2 WHERE war_id = 13 ORDER BY tick_timestamp_ms ASC`;
for (const r of rows) console.log(new Date(Number(r.tick_timestamp_ms)).toISOString(), r.state);
await sql.end();
