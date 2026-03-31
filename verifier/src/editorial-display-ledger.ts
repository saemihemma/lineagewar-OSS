import postgres from "postgres";
import type { EditorialDisplayEntry } from "./types.js";

function phaseIdToKey(phaseId: number | null): number {
  return phaseId ?? -1;
}

function phaseKeyToId(phaseIdKey: number): number | null {
  return phaseIdKey >= 0 ? phaseIdKey : null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export class EditorialDisplayLedger {
  private sql: postgres.Sql;
  private closed = false;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { connect_timeout: 10 });
  }

  async ensureTable(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS editorial_display_v1 (
        war_id INTEGER NOT NULL,
        phase_id_key INTEGER NOT NULL,
        system_id TEXT NOT NULL,
        effective_from_ms BIGINT NOT NULL,
        updated_at_ms BIGINT NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        public_rule_text TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (war_id, phase_id_key, system_id, effective_from_ms)
      )
    `;
  }

  async loadEntries(): Promise<EditorialDisplayEntry[]> {
    const rows = await this.sql`
      SELECT
        war_id,
        phase_id_key,
        system_id,
        effective_from_ms,
        updated_at_ms,
        display_name,
        public_rule_text
      FROM editorial_display_v1
      ORDER BY war_id ASC, effective_from_ms ASC, phase_id_key ASC, system_id ASC, updated_at_ms ASC
    `;

    return rows.map((row) => {
      const displayName = normalizeText(row.display_name);
      return {
        warId: Number(row.war_id),
        phaseId: phaseKeyToId(Number(row.phase_id_key)),
        systemId: String(row.system_id),
        effectiveFromMs: Number(row.effective_from_ms),
        updatedAtMs: Number(row.updated_at_ms),
        ...(displayName ? { displayName } : {}),
        publicRuleText: normalizeText(row.public_rule_text),
      } satisfies EditorialDisplayEntry;
    });
  }

  async loadEntriesForWar(warId: number): Promise<EditorialDisplayEntry[]> {
    const rows = await this.sql`
      SELECT
        war_id,
        phase_id_key,
        system_id,
        effective_from_ms,
        updated_at_ms,
        display_name,
        public_rule_text
      FROM editorial_display_v1
      WHERE war_id = ${warId}
      ORDER BY effective_from_ms ASC, updated_at_ms ASC, phase_id_key ASC, system_id ASC
    `;

    return rows.map((row) => {
      const displayName = normalizeText(row.display_name);
      return {
        warId: Number(row.war_id),
        phaseId: phaseKeyToId(Number(row.phase_id_key)),
        systemId: String(row.system_id),
        effectiveFromMs: Number(row.effective_from_ms),
        updatedAtMs: Number(row.updated_at_ms),
        ...(displayName ? { displayName } : {}),
        publicRuleText: normalizeText(row.public_rule_text),
      } satisfies EditorialDisplayEntry;
    });
  }

  async upsertEntries(entries: EditorialDisplayEntry[]): Promise<void> {
    if (entries.length === 0) return;

    const rows: Array<Record<string, unknown>> = entries.map((entry) => ({
      war_id: entry.warId,
      phase_id_key: phaseIdToKey(entry.phaseId),
      system_id: entry.systemId,
      effective_from_ms: entry.effectiveFromMs,
      updated_at_ms: entry.updatedAtMs,
      display_name: entry.displayName ?? "",
      public_rule_text: entry.publicRuleText,
    }));

    await this.sql`
      INSERT INTO editorial_display_v1 ${this.sql(
        rows,
        "war_id",
        "phase_id_key",
        "system_id",
        "effective_from_ms",
        "updated_at_ms",
        "display_name",
        "public_rule_text",
      )}
      ON CONFLICT (war_id, phase_id_key, system_id, effective_from_ms) DO UPDATE
      SET
        updated_at_ms = EXCLUDED.updated_at_ms,
        display_name = EXCLUDED.display_name,
        public_rule_text = EXCLUDED.public_rule_text
    `;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.sql.end();
  }
}
