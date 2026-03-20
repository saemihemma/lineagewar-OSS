import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import {
  ASSEMBLY_FAMILY_OPTIONS,
  ASSEMBLY_TYPE_OPTIONS,
  CURRENT_ADMIN_CAP_ID,
  CURRENT_WAR_ID,
  WORLD_API_BASE_URL,
} from "../lib/constants";
import { useAdminPortalState } from "../lib/admin-context";
import { formatTimestamp, parseDateTimeLocalToMs, toDateTimeLocalValue, useAutoRegistryId, useOwnedAdminCaps, usePublishedPhaseTimeline, useCurrentWarTickRate, shortenId } from "../lib/utils";
import type { AssemblyFamily, BatchPhaseConfigDraft, StorageRequirementMode } from "../lib/types";

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  border: "1px solid #27272a",
  borderRadius: 12,
  background: "#16161b",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.75rem",
  borderRadius: 8,
  border: "1px solid #3f3f46",
  background: "#0f0f12",
  color: "#fff",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "0.35rem",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "0.4rem 0.65rem",
  borderRadius: 6,
  border: "1px solid #3f3f46",
  background: "transparent",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: "0.8rem",
};

// ── Assembly rule model ──

interface ItemRequirementEntry {
  itemTypeId: string;
  minimumQuantity: number;
}

interface AssemblyRuleEntry {
  assemblyFamily: AssemblyFamily;
  assemblyTypeId: string;
  storageRequirementMode: StorageRequirementMode;
  requiredItems: ItemRequirementEntry[];
  presenceWeight: number;
}

function defaultAssemblyRule(): AssemblyRuleEntry {
  return {
    assemblyFamily: 0,
    assemblyTypeId: "",
    storageRequirementMode: 0,
    requiredItems: [],
    presenceWeight: 1,
  };
}

// ── System rule model ──

interface PhaseSystemRule {
  systemId: number;
  pointsPerTick: number;
  takeMargin: number;
  holdMargin: number;
  neutralMinTotalPresence: number;
  contestedWhenTied: boolean;
  assemblyRules: AssemblyRuleEntry[];
  publicRuleText: string;
  sunset: boolean;
}

interface PhaseEntry {
  phaseNumber: number;
  label: string;
  status: "active" | "scheduled" | "superseded";
  activationMs: number | null;
  systems: PhaseSystemRule[];
}

function defaultSystemRule(systemId: number): PhaseSystemRule {
  return {
    systemId,
    pointsPerTick: 1,
    takeMargin: 1,
    holdMargin: 1,
    neutralMinTotalPresence: 1,
    contestedWhenTied: true,
    assemblyRules: [defaultAssemblyRule()],
    publicRuleText: "",
    sunset: false,
  };
}

const TIME_PRESETS: Array<{ label: string; offsetMs: number | null }> = [
  { label: "Now", offsetMs: 0 },
  { label: "+15m", offsetMs: 15 * 60_000 },
  { label: "+1h", offsetMs: 60 * 60_000 },
  { label: "+12h", offsetMs: 12 * 60 * 60_000 },
  { label: "+24h", offsetMs: 24 * 60 * 60_000 },
  { label: "Custom", offsetMs: null },
];

// ── World API system name hook ──

function useSystemNames(systemIds: number[]) {
  const stableKey = systemIds.sort((a, b) => a - b).join(",");
  return useQuery({
    queryKey: ["systemNames", stableKey],
    enabled: systemIds.length > 0 && WORLD_API_BASE_URL.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Map<number, string>> => {
      const names = new Map<number, string>();
      const unique = [...new Set(systemIds)];
      const results = await Promise.allSettled(
        unique.map(async (id) => {
          const url = `${WORLD_API_BASE_URL.replace(/\/$/, "")}/v2/solarsystems/${id}`;
          const response = await fetch(url);
          if (!response.ok) return;
          const payload = (await response.json()) as Record<string, unknown>;
          const name = typeof payload.name === "string" ? payload.name.trim() : null;
          if (name) names.set(id, name);
        }),
      );
      void results;
      return names;
    },
  });
}

// ── Assembly rule editor ──

function AssemblyRuleEditor({
  rule,
  index,
  total,
  onChange,
  onRemove,
}: {
  rule: AssemblyRuleEntry;
  index: number;
  total: number;
  onChange: (updated: AssemblyRuleEntry) => void;
  onRemove: () => void;
}) {
  const addItemRequirement = () => {
    onChange({
      ...rule,
      requiredItems: [...rule.requiredItems, { itemTypeId: "", minimumQuantity: 1 }],
    });
  };

  const updateItem = (i: number, updated: ItemRequirementEntry) => {
    const items = [...rule.requiredItems];
    items[i] = updated;
    onChange({ ...rule, requiredItems: items });
  };

  const removeItem = (i: number) => {
    onChange({ ...rule, requiredItems: rule.requiredItems.filter((_, idx) => idx !== i) });
  };

  return (
    <div style={{ border: "1px solid #27272a", borderRadius: 6, padding: "0.65rem", background: "#101015" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.8rem", color: "#a1a1aa", fontWeight: 600 }}>Assembly rule {index + 1}</span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.75rem", color: "#22c55e" }}>weight: {rule.presenceWeight}</span>
          {total > 1 && (
            <button type="button" onClick={onRemove} style={{ ...smallBtnStyle, color: "#f87171", borderColor: "#7f1d1d", fontSize: "0.7rem", padding: "0.2rem 0.4rem" }}>
              Remove
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.65rem", gridTemplateColumns: "1fr 1fr 1fr" }}>
        <label style={labelStyle}>
          <span style={{ fontSize: "0.75rem", color: "#71717a" }}>Assembly type</span>
          <select
            style={{ ...inputStyle, fontSize: "0.85rem" }}
            value={rule.assemblyTypeId || "__any__"}
            onChange={(e) => {
              const selected = e.target.value;
              if (selected === "__any__") {
                onChange({ ...rule, assemblyTypeId: "" });
                return;
              }
              if (selected === "__custom__") {
                onChange({ ...rule, assemblyTypeId: "custom:" });
                return;
              }
              const typeId = Number(selected);
              const knownType = ASSEMBLY_TYPE_OPTIONS.find((opt) => opt.value === typeId);
              if (knownType) {
                onChange({ ...rule, assemblyTypeId: String(typeId), assemblyFamily: knownType.family });
              } else {
                onChange({ ...rule, assemblyTypeId: selected });
              }
            }}
          >
            {ASSEMBLY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value ?? "__any__"} value={opt.value ?? "__any__"}>
                {opt.label}
              </option>
            ))}
            <option value="__custom__">Other (custom ID)</option>
          </select>
        </label>
        {rule.assemblyTypeId.startsWith("custom:") && (
          <label style={labelStyle}>
            <span style={{ fontSize: "0.75rem", color: "#71717a" }}>Custom type ID</span>
            <input
              style={{ ...inputStyle, fontSize: "0.85rem" }}
              value={rule.assemblyTypeId.replace("custom:", "")}
              onChange={(e) => {
                const raw = e.target.value.trim();
                onChange({ ...rule, assemblyTypeId: raw ? `custom:${raw}` : "custom:" });
              }}
              placeholder="Enter numeric type ID"
            />
          </label>
        )}
        {!rule.assemblyTypeId.startsWith("custom:") && (
          <label style={labelStyle}>
            <span style={{ fontSize: "0.75rem", color: "#71717a" }}>Assembly family</span>
            <select
              style={{ ...inputStyle, fontSize: "0.85rem" }}
              value={rule.assemblyFamily}
              onChange={(e) => onChange({ ...rule, assemblyFamily: Number(e.target.value) as AssemblyFamily })}
            >
              {ASSEMBLY_FAMILY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
        )}
        <label style={labelStyle}>
          <span style={{ fontSize: "0.75rem", color: "#71717a" }}>Presence weight</span>
          <input
            style={{ ...inputStyle, fontSize: "0.85rem" }}
            type="number"
            min={1}
            value={rule.presenceWeight}
            onChange={(e) => onChange({ ...rule, presenceWeight: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      {/* Item requirements */}
      {rule.requiredItems.length > 0 && (
        <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.35rem" }}>
          <span style={{ fontSize: "0.75rem", color: "#71717a" }}>Required items (storage units only)</span>
          {rule.requiredItems.map((item, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px auto", gap: "0.35rem", alignItems: "end" }}>
              <label style={labelStyle}>
                <span style={{ fontSize: "0.7rem", color: "#52525b" }}>Item type ID</span>
                <input
                  style={{ ...inputStyle, fontSize: "0.8rem" }}
                  value={item.itemTypeId}
                  onChange={(e) => updateItem(i, { ...item, itemTypeId: e.target.value })}
                  placeholder="e.g. 1000000038887"
                />
              </label>
              <label style={labelStyle}>
                <span style={{ fontSize: "0.7rem", color: "#52525b" }}>Min qty</span>
                <input
                  style={{ ...inputStyle, fontSize: "0.8rem" }}
                  type="number"
                  min={1}
                  value={item.minimumQuantity}
                  onChange={(e) => updateItem(i, { ...item, minimumQuantity: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
              <button type="button" onClick={() => removeItem(i)} style={{ ...smallBtnStyle, fontSize: "0.7rem", padding: "0.3rem 0.4rem", color: "#f87171" }}>x</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "0.5rem" }}>
        <button type="button" onClick={addItemRequirement} style={{ ...smallBtnStyle, fontSize: "0.7rem" }}>
          + Add item requirement
        </button>
      </div>
    </div>
  );
}

// ── System rule editor ──

function SystemRuleEditor({
  rule,
  systemName,
  onChange,
}: {
  rule: PhaseSystemRule;
  systemName: string | null;
  onChange: (updated: PhaseSystemRule) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const displayName = systemName ?? String(rule.systemId);

  const updateAssemblyRule = (index: number, updated: AssemblyRuleEntry) => {
    const rules = [...rule.assemblyRules];
    rules[index] = updated;
    onChange({ ...rule, assemblyRules: rules });
  };

  const removeAssemblyRule = (index: number) => {
    onChange({ ...rule, assemblyRules: rule.assemblyRules.filter((_, i) => i !== index) });
  };

  const addAssemblyRule = () => {
    onChange({ ...rule, assemblyRules: [...rule.assemblyRules, defaultAssemblyRule()] });
  };

  return (
    <div
      style={{
        border: rule.sunset ? "1px solid #7f1d1d" : "1px solid #27272a",
        borderRadius: 8,
        background: rule.sunset ? "#1c0f0f" : "#0f0f12",
        opacity: rule.sunset ? 0.6 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.65rem 0.75rem",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ fontWeight: 600 }}>
          {displayName}
          <span style={{ color: "#71717a", fontWeight: 400, marginLeft: "0.5rem", fontSize: "0.8rem" }}>
            [{rule.systemId}]
          </span>
          {rule.sunset ? " (SUNSET)" : ""}
        </span>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ color: "#22c55e", fontSize: "0.8rem" }}>{rule.pointsPerTick} pts/tick</span>
          <span style={{ color: "#71717a", fontSize: "0.8rem" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && !rule.sunset && (
        <div style={{ padding: "0 0.75rem 0.75rem", display: "grid", gap: "0.75rem" }}>
          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <label style={labelStyle}>
              <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Points per tick</span>
              <input
                style={inputStyle}
                type="number"
                value={rule.pointsPerTick}
                onChange={(e) => onChange({ ...rule, pointsPerTick: Number(e.target.value) || 0 })}
              />
            </label>
            <label style={labelStyle}>
              <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Take margin</span>
              <input
                style={inputStyle}
                type="number"
                value={rule.takeMargin}
                onChange={(e) => onChange({ ...rule, takeMargin: Number(e.target.value) || 0 })}
              />
            </label>
            <label style={labelStyle}>
              <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Hold margin</span>
              <input
                style={inputStyle}
                type="number"
                value={rule.holdMargin}
                onChange={(e) => onChange({ ...rule, holdMargin: Number(e.target.value) || 0 })}
              />
            </label>
          </div>

          {/* Assembly rules */}
          <div>
            <span style={{ fontSize: "0.85rem", color: "#a1a1aa", fontWeight: 600 }}>Assembly rules</span>
            <p style={{ color: "#52525b", fontSize: "0.75rem", margin: "0.25rem 0 0.5rem" }}>
              Each rule targets an assembly type. Qualifying assemblies add their weight to the tribe's presence score.
            </p>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {rule.assemblyRules.map((ar, i) => (
                <AssemblyRuleEditor
                  key={i}
                  rule={ar}
                  index={i}
                  total={rule.assemblyRules.length}
                  onChange={(updated) => updateAssemblyRule(i, updated)}
                  onRemove={() => removeAssemblyRule(i)}
                />
              ))}
            </div>
            <button type="button" onClick={addAssemblyRule} style={{ ...smallBtnStyle, marginTop: "0.5rem" }}>
              + Add assembly rule
            </button>
          </div>

          {/* Public rule text */}
          <label style={labelStyle}>
            <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Public rule text</span>
            <input
              style={inputStyle}
              value={rule.publicRuleText}
              onChange={(e) => onChange({ ...rule, publicRuleText: e.target.value.slice(0, 280) })}
              placeholder="Rule description for players"
            />
          </label>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => onChange({ ...rule, sunset: true })}
              style={{ ...smallBtnStyle, color: "#f87171", borderColor: "#7f1d1d" }}
            >
              Sunset this system
            </button>
          </div>
        </div>
      )}

      {rule.sunset && expanded && (
        <div style={{ padding: "0 0.75rem 0.75rem" }}>
          <button
            type="button"
            onClick={() => onChange({ ...rule, sunset: false })}
            style={smallBtnStyle}
          >
            Restore system
          </button>
        </div>
      )}
    </div>
  );
}

// ── Phase manager ──

export default function PhaseManager() {
  const navigate = useNavigate();
  const { setDraft, setPreviousPhaseSummary, selectedAdminCapId, setSelectedAdminCapId } = useAdminPortalState();
  const ownedAdminCaps = useOwnedAdminCaps();
  const selectedAdminCap = ownedAdminCaps.data?.find((cap) => cap.objectId === selectedAdminCapId) ?? null;
  const activeWarId = selectedAdminCap?.warId ?? null;
  const chainTimeline = usePublishedPhaseTimeline(activeWarId);
  const account = useCurrentAccount();

  const client = useCurrentClient();
  const resolvedRegistry = useAutoRegistryId(activeWarId);

  const registryQuery = useQuery({
    queryKey: ["warRegistry-phase", resolvedRegistry.registryId],
    enabled: resolvedRegistry.registryId !== "0x0",
    queryFn: async () => {
      const rpcClient = client as unknown as {
        getObject: (input: unknown) => Promise<{ data?: { content?: unknown } }>;
      };
      return rpcClient.getObject({ id: resolvedRegistry.registryId, options: { showContent: true } });
    },
  });

  const registryFields = (() => {
    const content = registryQuery.data?.data?.content;
    if (!content || typeof content !== "object" || !("fields" in content)) return null;
    return (content as { fields?: Record<string, unknown> }).fields ?? null;
  })();
  const warPaused = registryFields ? registryFields.enabled === false : false;
  const rawEndedAtMs = registryFields?.ended_at_ms != null ? Number(registryFields.ended_at_ms) : null;
  const endedAtMs = rawEndedAtMs != null && Number.isFinite(rawEndedAtMs) && rawEndedAtMs > 0 ? rawEndedAtMs : null;
  const warEnded = endedAtMs != null && endedAtMs <= Date.now();
  const warEnding = endedAtMs != null && endedAtMs > Date.now();

  const adminCapId = useMemo(() => {
    if (selectedAdminCapId) return selectedAdminCapId;
    const caps = ownedAdminCaps.data ?? [];
    if (caps[0]?.objectId) return caps[0].objectId;
    if (CURRENT_ADMIN_CAP_ID) return CURRENT_ADMIN_CAP_ID;
    return "";
  }, [ownedAdminCaps.data, selectedAdminCapId]);

  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);
  const [draftPhase, setDraftPhase] = useState<PhaseEntry | null>(null);
  const [timePreset, setTimePreset] = useState<number | null>(0);
  const [customDateTime, setCustomDateTime] = useState(toDateTimeLocalValue(Date.now() + 60 * 60_000));
  const [newSystemId, setNewSystemId] = useState("");
  const currentTickRate = useCurrentWarTickRate(activeWarId);
  const onChainTickRate = currentTickRate.data ?? 60;
  const [defaultTickMinutes, setDefaultTickMinutes] = useState(60);
  const [tickRateConfirmed, setTickRateConfirmed] = useState(false);
  const tickRateChanged = defaultTickMinutes !== onChainTickRate;

  useEffect(() => {
    if (!selectedAdminCapId && ownedAdminCaps.data?.length) {
      const sorted = [...ownedAdminCaps.data].sort((a, b) => Number(b.warId ?? 0) - Number(a.warId ?? 0));
      setSelectedAdminCapId(sorted[0].objectId);
    }
  }, [ownedAdminCaps.data, selectedAdminCapId, setSelectedAdminCapId]);

  useEffect(() => {
    if (currentTickRate.data != null) {
      setDefaultTickMinutes(currentTickRate.data);
    }
  }, [currentTickRate.data]);

  const genesisPhase: PhaseEntry = {
    phaseNumber: 0,
    label: "WAR DECLARED",
    status: chainTimeline.data?.length ? "superseded" : "active",
    activationMs: null,
    systems: [],
  };

  const chainPhases: PhaseEntry[] = useMemo(() => {
    if (!chainTimeline.data?.length) return [];
    const now = Date.now();
    const entries = chainTimeline.data.map((onChainPhase) => ({
      phaseNumber: onChainPhase.version,
      label: `PHASE ${onChainPhase.version}`,
      status: (onChainPhase.effectiveFromMs <= now ? "active" : "scheduled") as PhaseEntry["status"],
      activationMs: onChainPhase.effectiveFromMs,
      systems: onChainPhase.systems.map((cfg) => {
        const rules: AssemblyRuleEntry[] = [];
        for (const wf of cfg.allowedAssemblyFamilies) {
          rules.push({
            assemblyFamily: wf.family as AssemblyFamily,
            assemblyTypeId: "",
            storageRequirementMode: 0,
            requiredItems: [],
            presenceWeight: wf.weight,
          });
        }
        for (const wt of cfg.allowedAssemblyTypeIds) {
          const knownType = ASSEMBLY_TYPE_OPTIONS.find((opt) => opt.value === wt.typeId);
          rules.push({
            assemblyFamily: (knownType?.family ?? 3) as AssemblyFamily,
            assemblyTypeId: String(wt.typeId),
            storageRequirementMode: 0,
            requiredItems: [],
            presenceWeight: wt.weight,
          });
        }
        if (rules.length === 0) rules.push(defaultAssemblyRule());
        return {
          systemId: cfg.systemId,
          pointsPerTick: cfg.pointsPerTick,
          takeMargin: cfg.takeMargin,
          holdMargin: cfg.holdMargin,
          neutralMinTotalPresence: cfg.neutralMinTotalPresence,
          contestedWhenTied: cfg.contestedWhenTied,
          assemblyRules: rules,
          publicRuleText: "",
          sunset: !cfg.enabled,
        };
      }),
    }));
    // Only the latest active phase keeps "active"; earlier ones become "superseded"
    let latestActiveIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].status === "active") { latestActiveIdx = i; break; }
    }
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].status === "active" && i < latestActiveIdx) {
        entries[i].status = "superseded";
      }
    }
    return entries;
  }, [chainTimeline.data]);

  const knownChainSystemIds = useMemo(
    () => new Set(chainPhases.flatMap((phase) => phase.systems.map((system) => system.systemId))),
    [chainPhases],
  );

  const phases = [genesisPhase, ...chainPhases];
  const latestPhase = phases[phases.length - 1];

  const allSystemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const phase of phases) {
      for (const s of phase.systems) ids.add(s.systemId);
    }
    if (draftPhase) {
      for (const s of draftPhase.systems) ids.add(s.systemId);
    }
    return [...ids];
  }, [phases, draftPhase]);

  const systemNamesQuery = useSystemNames(allSystemIds);
  const systemNameMap = systemNamesQuery.data ?? new Map<number, string>();

  const startNewPhase = () => {
    const nextNumber = latestPhase.phaseNumber + 1;
    const copiedSystems = latestPhase.systems
      .filter((s) => !s.sunset)
      .map((s) => ({
        ...s,
        assemblyRules: s.assemblyRules.map((ar) => ({
          ...ar,
          requiredItems: ar.requiredItems.map((item) => ({ ...item })),
        })),
      }));

    setDraftPhase({
      phaseNumber: nextNumber,
      label: `PHASE ${nextNumber}`,
      status: "scheduled",
      activationMs: null,
      systems: copiedSystems,
    });
    setTimePreset(0);
  };

  const snapToNextTickBoundary = (ms: number): number => {
    const tickMs = defaultTickMinutes * 60_000;
    return Math.ceil(ms / tickMs) * tickMs;
  };

  const computeActivationMs = (): number => {
    if (timePreset === null) {
      const custom = parseDateTimeLocalToMs(customDateTime) ?? Date.now();
      return snapToNextTickBoundary(custom);
    }
    const preset = TIME_PRESETS.find((p) => p.offsetMs === timePreset);
    if (!preset || preset.offsetMs === null) {
      const custom = parseDateTimeLocalToMs(customDateTime) ?? Date.now();
      return snapToNextTickBoundary(custom);
    }
    return snapToNextTickBoundary(Date.now() + preset.offsetMs);
  };

  const updateDraftSystem = (index: number, updated: PhaseSystemRule) => {
    if (!draftPhase) return;
    const systems = [...draftPhase.systems];
    systems[index] = updated;
    setDraftPhase({ ...draftPhase, systems });
  };

  const addNewSystem = () => {
    if (!draftPhase) return;
    const id = Number(newSystemId);
    if (!id || !Number.isFinite(id)) return;
    if (draftPhase.systems.some((s) => s.systemId === id)) return;
    setDraftPhase({
      ...draftPhase,
      systems: [...draftPhase.systems, defaultSystemRule(id)],
    });
    setNewSystemId("");
  };

  const activeSystems = useMemo(() => {
    if (!draftPhase) return [];
    return draftPhase.systems.filter((s) => !s.sunset);
  }, [draftPhase]);

  const submitPhase = () => {
    if (!draftPhase || activeSystems.length === 0) return;

    const activationMs = computeActivationMs();
    const version = draftPhase.phaseNumber;

    const batchSystems = activeSystems.map((sys) => {
      const familyRules = sys.assemblyRules
        .filter((r) => !r.assemblyTypeId)
        .map((r) => ({ family: r.assemblyFamily, weight: r.presenceWeight }));
      const typeIdRules = sys.assemblyRules
        .filter((r) => {
          const raw = r.assemblyTypeId.startsWith("custom:")
            ? r.assemblyTypeId.replace("custom:", "").trim()
            : r.assemblyTypeId.trim();
          return raw && Number.isFinite(Number(raw));
        })
        .map((r) => {
          const raw = r.assemblyTypeId.startsWith("custom:")
            ? r.assemblyTypeId.replace("custom:", "").trim()
            : r.assemblyTypeId.trim();
          return { typeId: Number(raw), weight: r.presenceWeight };
        });
      const requiredItems = sys.assemblyRules
        .flatMap((r) => r.requiredItems)
        .filter((item) => item.itemTypeId.trim())
        .map((item) => Number(item.itemTypeId))
        .filter((n) => Number.isFinite(n));

      const firstRule = sys.assemblyRules[0];
      return {
        systemId: sys.systemId,
        displayName: systemNameMap.get(sys.systemId) ?? String(sys.systemId),
        registerSystem: !knownChainSystemIds.has(sys.systemId),
        pointsPerTick: sys.pointsPerTick,
        takeMargin: sys.takeMargin,
        holdMargin: sys.holdMargin,
        neutralMinTotalPresence: sys.neutralMinTotalPresence,
        contestedWhenTied: sys.contestedWhenTied,
        storageRequirementMode: firstRule?.storageRequirementMode ?? 0 as StorageRequirementMode,
        minimumTotalItemCount: 0,
        ruleSet: {
          allowedAssemblyFamilies: familyRules,
          allowedAssemblyTypeIds: typeIdRules,
          allowedStorageTypeIds: [] as number[],
          requiredItemTypeIds: [...new Set(requiredItems)],
        },
        publicRuleText: sys.publicRuleText.trim(),
      };
    });

    const draft: BatchPhaseConfigDraft = {
      kind: "batch-phase-config",
      warId: selectedAdminCap?.warId ?? Number(CURRENT_WAR_ID || 0),
      phaseNumber: draftPhase.phaseNumber,
      version,
      effectiveFromMs: activationMs,
      effectiveUntilMs: null,
      adminCapId: adminCapId.trim(),
      adminCapWarId: ownedAdminCaps.data?.find((c) => c.objectId === adminCapId)?.warId ?? null,
      systems: batchSystems,
      defaultTickMinutes,
    };

    setPreviousPhaseSummary(
      latestPhase.systems.map((s) => ({
        systemId: s.systemId,
        pointsPerTick: s.pointsPerTick,
        takeMargin: s.takeMargin,
        holdMargin: s.holdMargin,
        ruleCount: s.assemblyRules.length,
        sunset: s.sunset,
        weightSummary: s.assemblyRules.map((r) => r.presenceWeight).sort().join(","),
      })),
    );
    setDraft(draft);
    setDraftPhase(null);
    navigate("/preview");
  };

  const formatActivation = (ms: number | null): string => {
    if (ms === null) return "Not set";
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC";
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem", maxWidth: 900 }}>
      <div>
        <h1 style={{ marginTop: 0 }}>Phase management</h1>
        <p style={{ color: "#a1a1aa" }}>
          Each phase is a frozen set of system rules. Add a new phase to change rules, add systems, or
          adjust points. Rules from the previous phase are carried forward automatically.
        </p>
      </div>

      {/* War status banner */}
      {warEnded && (
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: 8,
          background: "#1c0f0f",
          border: "1px solid #7f1d1d",
          color: "#fca5a5",
          fontWeight: 600,
          fontSize: "0.9rem",
        }}>
          WAR ENDED — This war ended at {formatTimestamp(endedAtMs!)}. No further scoring or config changes.
        </div>
      )}
      {warEnding && (
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: 8,
          background: "#1c1508",
          border: "1px solid #854d0e",
          color: "#fbbf24",
          fontWeight: 600,
          fontSize: "0.9rem",
        }}>
          WAR ENDING — Scheduled to end at {formatTimestamp(endedAtMs!)}. Scoring and config changes continue until then.
        </div>
      )}
      {warPaused && !warEnded && !warEnding && (
        <div style={{
          padding: "0.75rem 1rem",
          borderRadius: 8,
          background: "#1c1508",
          border: "1px solid #854d0e",
          color: "#fbbf24",
          fontWeight: 600,
          fontSize: "0.9rem",
        }}>
          WAR PAUSED — The registry enabled flag is false. The verifier and scoreboard will not process new ticks.
        </div>
      )}

      {/* Phase timeline */}
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Phase timeline</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {chainTimeline.isFetching && (
              <span style={{ fontSize: "0.75rem", color: "#60a5fa" }}>Loading from chain...</span>
            )}
            <button
              type="button"
              onClick={() => chainTimeline.refetch()}
              disabled={chainTimeline.isFetching}
              style={{ ...smallBtnStyle, fontSize: "0.7rem" }}
            >
              Refresh from chain
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {phases.map((phase, idx) => {
            const isChainBacked = idx > 0;
            const isExpanded = expandedPhase === phase.phaseNumber;
            const activeCount = phase.systems.filter((s) => !s.sunset).length;
            return (
              <div key={phase.phaseNumber}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.5rem 0.65rem",
                    borderRadius: isExpanded ? "6px 6px 0 0" : 6,
                    background: phase.status === "active" ? "#0f2918" : "#16161b",
                    border: phase.status === "active" ? "1px solid #166534" : "1px solid #27272a",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedPhase(isExpanded ? null : phase.phaseNumber)}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{phase.label}</span>
                    <span style={{ color: "#71717a", marginLeft: "0.75rem", fontSize: "0.8rem" }}>
                      {activeCount} system{activeCount === 1 ? "" : "s"}
                    </span>
                    {isChainBacked && (
                      <span style={{ color: "#22c55e", marginLeft: "0.5rem", fontSize: "0.7rem" }}>ON-CHAIN</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>
                      {idx === 0 ? "Genesis" : phase.activationMs ? formatActivation(phase.activationMs) : "At deployment"}
                    </span>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: 4,
                        background:
                          phase.status === "active" ? "#166534" : phase.status === "scheduled" ? "#1e3a5f" : "#27272a",
                        color: phase.status === "superseded" ? "#71717a" : "#fff",
                      }}
                    >
                      {phase.status.toUpperCase()}
                    </span>
                    <span style={{ color: "#71717a", fontSize: "0.8rem" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    padding: "0.65rem 0.75rem",
                    borderRadius: "0 0 6px 6px",
                    background: "#101015",
                    border: "1px solid #27272a",
                    borderTop: "none",
                  }}>
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      {phase.systems.map((sys) => (
                        <div
                          key={sys.systemId}
                          style={{
                            padding: "0.5rem 0.65rem",
                            borderRadius: 6,
                            background: sys.sunset ? "#1c0f0f" : "#16161b",
                            border: sys.sunset ? "1px solid #7f1d1d" : "1px solid #27272a",
                            opacity: sys.sunset ? 0.6 : 1,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                            <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                              {systemNameMap.get(sys.systemId) ?? sys.systemId}
                              <span style={{ color: "#52525b", fontWeight: 400, marginLeft: "0.35rem" }}>[{sys.systemId}]</span>
                              {sys.sunset ? " (disabled)" : ""}
                            </span>
                            <span style={{ color: "#22c55e", fontSize: "0.8rem" }}>{sys.pointsPerTick} pts/tick</span>
                          </div>
                          {!sys.sunset && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.35rem", fontSize: "0.75rem" }}>
                              <div><span style={{ color: "#71717a" }}>Take margin: </span><span style={{ color: "#d4d4d8" }}>{sys.takeMargin}</span></div>
                              <div><span style={{ color: "#71717a" }}>Hold margin: </span><span style={{ color: "#d4d4d8" }}>{sys.holdMargin}</span></div>
                              <div><span style={{ color: "#71717a" }}>Neutral min: </span><span style={{ color: "#d4d4d8" }}>{sys.neutralMinTotalPresence}</span></div>
                              <div><span style={{ color: "#71717a" }}>Contested when tied: </span><span style={{ color: "#d4d4d8" }}>{sys.contestedWhenTied ? "Yes" : "No"}</span></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {!isChainBacked && (
                      <p style={{ color: "#52525b", fontSize: "0.7rem", margin: "0.5rem 0 0" }}>
                        Genesis phase (local config, not published on-chain)
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!draftPhase && !warEnded && (
          <button
            type="button"
            onClick={startNewPhase}
            style={{
              marginTop: "1rem",
              padding: "0.65rem 1rem",
              borderRadius: 8,
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            + Add next phase
          </button>
        )}
      </section>

      {/* Draft phase editor */}
      {draftPhase && (
        <>
          <section style={{ ...cardStyle, borderColor: "#3b82f6" }}>
            <h2 style={{ marginTop: 0, fontSize: "1rem", color: "#60a5fa" }}>
              {draftPhase.label} — Draft
            </h2>

            {/* Activation time */}
            <div style={{ marginBottom: "1rem" }}>
              <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>Activation time</span>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setTimePreset(preset.offsetMs)}
                    style={{
                      ...smallBtnStyle,
                      background: timePreset === preset.offsetMs ? "#1e3a5f" : "transparent",
                      color: timePreset === preset.offsetMs ? "#60a5fa" : "#a1a1aa",
                      borderColor: timePreset === preset.offsetMs ? "#3b82f6" : "#3f3f46",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {timePreset === null && (
                <label style={{ ...labelStyle, marginTop: "0.5rem", maxWidth: 300 }}>
                  <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>Custom date and time (UTC)</span>
                  <input
                    style={inputStyle}
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => setCustomDateTime(e.target.value)}
                  />
                </label>
              )}
              <p style={{ color: "#3b82f6", fontSize: "0.8rem", margin: "0.5rem 0 0", fontWeight: 500 }}>
                Activates: {formatActivation(computeActivationMs())} (snapped to {defaultTickMinutes}m tick boundary)
              </p>
            </div>

            {/* Scoring cadence (war-wide) */}
            <div style={{
              padding: "0.75rem",
              borderRadius: 8,
              border: tickRateChanged ? "1px solid #854d0e" : "1px solid #27272a",
              background: tickRateChanged ? "#1c1508" : "#101015",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: tickRateChanged ? "#fbbf24" : "#a1a1aa", fontWeight: 600 }}>
                  Scoring cadence (war-wide)
                </span>
                <span style={{ fontSize: "0.75rem", color: "#71717a" }}>
                  Current: {onChainTickRate} min
                </span>
              </div>
              <select
                style={{ ...inputStyle, maxWidth: 220, marginTop: "0.5rem", borderColor: tickRateChanged ? "#854d0e" : undefined }}
                value={defaultTickMinutes}
                onChange={(e) => {
                  setDefaultTickMinutes(Number(e.target.value));
                  setTickRateConfirmed(false);
                }}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
              {tickRateChanged && (
                <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.4rem" }}>
                  <p style={{ color: "#fbbf24", fontSize: "0.8rem", margin: 0 }}>
                    Changing tick rate from {onChainTickRate} to {defaultTickMinutes} minutes. This affects scoring cadence globally.
                  </p>
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={tickRateConfirmed}
                      onChange={(e) => setTickRateConfirmed(e.target.checked)}
                    />
                    <span style={{ fontSize: "0.8rem", color: "#fbbf24" }}>
                      I confirm I want to change the scoring cadence
                    </span>
                  </label>
                </div>
              )}
              {!tickRateChanged && (
                <span style={{ fontSize: "0.75rem", color: "#71717a", display: "block", marginTop: "0.35rem" }}>
                  Points are sampled and awarded every {defaultTickMinutes} minutes.
                </span>
              )}
            </div>

            {/* System rules */}
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {draftPhase.systems.map((rule, i) => (
                <SystemRuleEditor
                  key={rule.systemId}
                  rule={rule}
                  systemName={systemNameMap.get(rule.systemId) ?? null}
                  onChange={(updated) => updateDraftSystem(i, updated)}
                />
              ))}
            </div>

            {/* Add new system */}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginTop: "1rem" }}>
              <label style={labelStyle}>
                <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>New system ID</span>
                <input
                  style={{ ...inputStyle, maxWidth: 180 }}
                  value={newSystemId}
                  onChange={(e) => setNewSystemId(e.target.value)}
                  placeholder="e.g. 30020691"
                />
              </label>
              <button type="button" onClick={addNewSystem} style={smallBtnStyle}>
                + Add system
              </button>
            </div>
          </section>

          {/* Wallet + submit */}
          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>Signing as</span>
                <div style={{ marginTop: "0.25rem" }}>
                  {account ? (
                    <code style={{ color: "#e4e4e7" }}>{shortenId(account.address, 12)}</code>
                  ) : (
                    <span style={{ color: "#f87171" }}>No wallet connected</span>
                  )}
                </div>
              </div>
              {adminCapId && (
                <span style={{ fontSize: "0.7rem", color: "#52525b" }}>
                  Cap: {shortenId(adminCapId, 8)}
                </span>
              )}
            </div>

            <p style={{ color: "#a1a1aa", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              All {activeSystems.length} system{activeSystems.length === 1 ? "" : "s"} will be submitted in a single transaction.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={submitPhase}
                disabled={activeSystems.length === 0 || !adminCapId || !account || (tickRateChanged && !tickRateConfirmed)}
                style={{
                  padding: "0.75rem 1.25rem",
                  borderRadius: 8,
                  border: "none",
                  background: activeSystems.length > 0 && adminCapId && account && (!tickRateChanged || tickRateConfirmed) ? "#22c55e" : "#3f3f46",
                  color: "#fff",
                  cursor: activeSystems.length > 0 && adminCapId && account && (!tickRateChanged || tickRateConfirmed) ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                Preview phase transaction
              </button>
              {tickRateChanged && !tickRateConfirmed && (
                <span style={{ fontSize: "0.8rem", color: "#fbbf24", alignSelf: "center" }}>
                  Confirm tick rate change to submit
                </span>
              )}
              <button
                type="button"
                onClick={() => setDraftPhase(null)}
                style={smallBtnStyle}
              >
                Cancel
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
