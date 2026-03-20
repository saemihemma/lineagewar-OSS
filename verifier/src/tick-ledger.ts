import postgres from "postgres";
import type { ResolvedTickResult } from "./types.js";

export interface CommittedTick {
  warId: number;
  systemId: number;
  tickTimestampMs: number;
  resolved: ResolvedTickResult;
  committedAt: Date;
}

export class TickLedger {
  private sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { connect_timeout: 10 });
  }

  async ensureTable(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS committed_ticks_v2 (
        war_id INTEGER NOT NULL,
        system_id INTEGER NOT NULL,
        tick_timestamp_ms BIGINT NOT NULL,
        resolved JSONB NOT NULL,
        committed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        PRIMARY KEY (war_id, system_id, tick_timestamp_ms)
      )
    `;
  }

  async loadCommittedTicks(warId: number): Promise<CommittedTick[]> {
    const rows = await this.sql`
      SELECT war_id, system_id, tick_timestamp_ms, resolved, committed_at
      FROM committed_ticks_v2
      WHERE war_id = ${warId}
      ORDER BY tick_timestamp_ms ASC, system_id ASC
    `;

    return rows.map((row) => ({
      warId: Number(row.war_id),
      systemId: Number(row.system_id),
      tickTimestampMs: Number(row.tick_timestamp_ms),
      resolved: row.resolved as ResolvedTickResult,
      committedAt: new Date(row.committed_at as string),
    }));
  }

  async loadCommittedTicksWindow(warId: number, limit: number): Promise<CommittedTick[]> {
    const rows = await this.sql`
      SELECT war_id, system_id, tick_timestamp_ms, resolved, committed_at
      FROM committed_ticks_v2
      WHERE war_id = ${warId}
      ORDER BY tick_timestamp_ms DESC, system_id ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      warId: Number(row.war_id),
      systemId: Number(row.system_id),
      tickTimestampMs: Number(row.tick_timestamp_ms),
      resolved: row.resolved as ResolvedTickResult,
      committedAt: new Date(row.committed_at as string),
    })).reverse();
  }

  async loadCumulativeScores(warId: number): Promise<Map<number, number>> {
    const rows = await this.sql`
      SELECT
        (award->>'tribeId')::integer as tribe_id,
        SUM((award->>'points')::integer) as total_points
      FROM committed_ticks_v2,
        jsonb_array_elements(resolved->'snapshot'->'pointsAwarded') as award
      WHERE war_id = ${warId}
      GROUP BY (award->>'tribeId')::integer
    `;
    const scores = new Map<number, number>();
    for (const row of rows) {
      scores.set(Number(row.tribe_id), Number(row.total_points));
    }
    return scores;
  }

  async commitTicks(ticks: CommittedTick[]): Promise<void> {
    if (ticks.length === 0) return;

    const rows: Array<Record<string, unknown>> = ticks.map((t) => ({
      war_id: t.warId,
      system_id: t.systemId,
      tick_timestamp_ms: t.tickTimestampMs,
      resolved: t.resolved,
    }));

    await this.sql`
      INSERT INTO committed_ticks_v2 ${this.sql(
        rows,
        "war_id",
        "system_id",
        "tick_timestamp_ms",
        "resolved",
      )}
      ON CONFLICT (war_id, system_id, tick_timestamp_ms) DO UPDATE
      SET
        resolved = EXCLUDED.resolved,
        committed_at = NOW()
    `;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
