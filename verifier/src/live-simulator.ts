import { buildAuditSummary, writeVerifierArtifacts } from "./artifact-output.js";
import { buildScoreboardPayload } from "./frontend-output.js";
import os from "node:os";
import path from "node:path";
import { resolveTick } from "./resolver.js";
import { SeededScenarioVerifierDataSource } from "./seeded-source.js";
import { loadVerifierScenario } from "./seeded-world.js";
import { loadSystemDisplayConfigs } from "./system-display-config.js";
import { buildTickPlan } from "./tick-planner.js";
import {
  LiveSimulationTemplate,
  ScenarioTick,
  VerifierScenario,
} from "./types.js";

function argValue(argv: string[], name: string): string | null {
  const prefix = `${name}=`;
  const match = argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function parseNumber(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric value, received '${value}'`);
  }
  return parsed;
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  throw new Error(`Expected boolean value, received '${value}'`);
}

function pickWeightedTemplate(templates: LiveSimulationTemplate[]): LiveSimulationTemplate {
  const totalWeight = templates.reduce((sum, template) => sum + template.weightBps, 0);
  if (totalWeight <= 0) {
    throw new Error("Simulation templates must have positive total weight");
  }

  let roll = Math.floor(Math.random() * totalWeight);
  for (const template of templates) {
    if (roll < template.weightBps) {
      return template;
    }
    roll -= template.weightBps;
  }

  return templates[templates.length - 1];
}

function templateToTick(template: LiveSimulationTemplate, tickOffset: number): ScenarioTick {
  return {
    tickOffset,
    previousControllers: template.previousControllers,
    assemblies: template.assemblies,
  };
}

function alignToTickBoundary(timestampMs: number, tickMs: number): number {
  return Math.floor(timestampMs / tickMs) * tickMs;
}

function buildScenarioFromHistory(
  baseScenario: VerifierScenario,
  history: LiveSimulationTemplate[],
): VerifierScenario {
  return {
    ...baseScenario,
    ticks: history.map((template, index) => templateToTick(template, index)),
  };
}

async function writeLivePayload(
  scenario: VerifierScenario,
  tickStartMs: number,
  outputPath: string,
  chartWindowSize?: number,
  phaseStatusWithheld = true,
  phaseEndMs: number | null = null,
  phaseLabel: string | null = null,
  warEndMs: number | null = null,
  simulationClock?: {
    emitIntervalSeconds: number;
    scoringTickMinutes: number;
    scoringTickMs: number;
    scoringTickCount: number;
    lastEligibleTickMs: number;
    publishedAtMs: number;
  },
): Promise<void> {
  const dataSource = new SeededScenarioVerifierDataSource(tickStartMs, scenario);
  const systemDisplayConfigs = loadSystemDisplayConfigs(
    process.env.LINEAGE_SYSTEM_DISPLAY_CONFIG_PATH ?? null,
    process.env.LINEAGE_SYSTEM_NAMES_PATH ?? null,
  );
  const tickPlan = await buildTickPlan(dataSource, tickStartMs, scenario.ticks.length);
  const resolved = [];

  for (const tick of tickPlan) {
    resolved.push(await resolveTick(dataSource, tick));
  }

  const envelope = {
    config: {
      source: "seeded-live",
      scenario: scenario.name,
      tickStartMs,
      tickCount: scenario.ticks.length,
      phaseStatusWithheld,
      phaseEndMs: phaseEndMs ?? undefined,
      phaseLabel: phaseLabel ?? undefined,
      warEndMs: warEndMs ?? undefined,
      simulationClock,
    },
    tickPlan,
    commitments: resolved.map((entry) => entry.commitment),
    snapshots: resolved.map((entry) => entry.snapshot),
    scoreboard: buildScoreboardPayload(
      scenario,
      resolved.map((entry) => entry.snapshot),
      resolved.map((entry) => entry.commitment),
      {},
      chartWindowSize,
    ),
    systemDisplayConfigs,
  };

  await writeVerifierArtifacts(
    outputPath,
    envelope,
    "seeded-live",
    dataSource.getAuditInputSummary?.() ?? buildAuditSummary(null, "seeded-live", {
      candidateCollection: { mode: "seeded_scenario" },
      activeSystems: { mode: "scenario_phase" },
      ownerResolution: { mode: "scenario_overlay" },
      locationResolution: { mode: "scenario_overlay" },
    }).inputs,
    resolved,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const once = argv.includes("--once");
  const scenarioName = argValue(argv, "--scenario") || process.env.LINEAGE_SCENARIO || "live-war";
  const outputPath =
    argValue(argv, "--output") ||
    process.env.LINEAGE_OUTPUT_PATH ||
    path.join(os.tmpdir(), "lineage-war-verifier", "live.json");
  const baseScenario = loadVerifierScenario(scenarioName);
  const simulation = baseScenario.simulation;

  if (!simulation) {
    throw new Error(`Scenario '${scenarioName}' does not define a simulation section`);
  }

  const emitIntervalSeconds = parseNumber(
    argValue(argv, "--interval-seconds"),
    simulation.emitIntervalSeconds,
  );
  const initialHistoryTicks = parseNumber(
    argValue(argv, "--initial-ticks"),
    simulation.initialHistoryTicks,
  );
  const maxHistoryTicks = parseNumber(
    argValue(argv, "--max-history"),
    simulation.maxHistoryTicks,
  );
  const scoringTickMinutes = parseNumber(
    argValue(argv, "--scoring-tick-minutes"),
    baseScenario.phase.tickMinutesOverride ?? baseScenario.warConfig.defaultTickMinutes,
  );
  const phaseStatusWithheld = parseBoolean(
    argValue(argv, "--phase-status-withheld") ?? process.env.LINEAGE_PHASE_STATUS_WITHHELD ?? null,
    true,
  );
  const phaseEndMs = (() => {
    const raw = argValue(argv, "--phase-end-ms") ?? process.env.LINEAGE_PHASE_END_MS ?? null;
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })();
  const phaseLabel =
    argValue(argv, "--phase-label") ?? process.env.LINEAGE_PHASE_LABEL ?? null;
  const warEndMs = (() => {
    const raw = argValue(argv, "--war-end-ms") ?? process.env.LINEAGE_WAR_END_MS ?? null;
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })();
  const scoringTickMs = scoringTickMinutes * 60_000;
  const alignedNow = alignToTickBoundary(Date.now(), scoringTickMs);
  let tickStartMs = alignedNow - Math.max(0, initialHistoryTicks - 1) * scoringTickMs;
  const history: LiveSimulationTemplate[] = [];

  for (let index = 0; index < initialHistoryTicks; index += 1) {
    history.push(pickWeightedTemplate(simulation.templates));
  }

  const appendScoringTicksUpToNow = (nowMs: number): void => {
    const lastEligibleTickMs = alignToTickBoundary(nowMs, scoringTickMs);
    if (lastEligibleTickMs < tickStartMs) {
      return;
    }
    const expectedTickCount = Math.floor((lastEligibleTickMs - tickStartMs) / scoringTickMs) + 1;
    while (history.length < expectedTickCount) {
      history.push(pickWeightedTemplate(simulation.templates));
    }
  };

  const trimHistoryToMax = (): void => {
    if (maxHistoryTicks <= 0 || history.length <= maxHistoryTicks) {
      return;
    }
    const removeCount = history.length - maxHistoryTicks;
    history.splice(0, removeCount);
    tickStartMs += removeCount * scoringTickMs;
  };

  const publish = async (): Promise<void> => {
    const simulatedScenario = buildScenarioFromHistory(baseScenario, history);
    const publishedAtMs = Date.now();
    await writeLivePayload(simulatedScenario, tickStartMs, outputPath, maxHistoryTicks, phaseStatusWithheld, phaseEndMs, phaseLabel, warEndMs, {
      emitIntervalSeconds,
      scoringTickMinutes,
      scoringTickMs,
      scoringTickCount: history.length,
      lastEligibleTickMs: alignToTickBoundary(publishedAtMs, scoringTickMs),
      publishedAtMs,
    });
  };

  await publish();

  if (once) {
    return;
  }

  const timer = setInterval(() => {
    void (async () => {
      appendScoringTicksUpToNow(Date.now());
      trimHistoryToMax();
      await publish();
    })().catch((error: unknown) => {
      console.error("Live simulator update failed.");
      console.error(error);
    });
  }, emitIntervalSeconds * 1000);

  process.on("SIGINT", () => {
    clearInterval(timer);
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    clearInterval(timer);
    process.exit(0);
  });

  console.log(`Lineage War live simulator started for scenario '${scenarioName}'.`);
  console.log(`Writing live feed to ${outputPath}`);
  console.log(`Emit interval: ${emitIntervalSeconds}s`);
  console.log(`Scoring cadence: ${scoringTickMinutes}m (wall-clock gated)`);
}

main().catch((error: unknown) => {
  console.error("Live simulator failed.");
  console.error(error);
  process.exit(1);
});
