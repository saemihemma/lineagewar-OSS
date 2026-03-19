import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import TerminalScreen from "../components/terminal/TerminalScreen";
import DecryptText from "../components/terminal/DecryptText";
import SoulRecordIntake from "../components/waiting/SoulRecordIntake";
import HeroViewport from "../components/waiting/HeroViewport";
import CaptainDossierPanel from "../components/waiting/CaptainDossierPanel";
import { useWarActivation } from "../hooks/useWarActivation";
import { SLUG_TO_PHASE, type WarPhase } from "../lib/war-phases";

const INTAKE_ENABLED = true;

/* ---- Dev-mode synthetic data ---------------------------------------- */
const DEV_ACTIVATED_AT = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago

const SUBTITLE: Record<WarPhase, string> = {
  pre_tribes: "INITIAL CONDITIONS ESTABLISHED",
  one_tribe_ready: "ASYMMETRIC ENTRY DETECTED",
  both_tribes_ready: "DUAL COMMAND STRUCTURES CONFIRMED",
};

/* ================================================================== */
/*  COUNT-UP / COUNTDOWN HOOKS                                         */
/* ================================================================== */

const pad = (n: number) => String(n).padStart(2, "0");

function formatTimer(totalMs: number): string {
  const abs = Math.max(0, Math.abs(totalMs));
  const d = Math.floor(abs / 86400000);
  const h = Math.floor((abs % 86400000) / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  return `${pad(d)}:${pad(h)}:${pad(m)}:${pad(s)}`;
}

function useCountUp(startIso: string | null): { display: string; active: boolean } {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startIso]);

  if (!startIso) return { display: "00:00:00:00", active: false };

  const start = new Date(startIso).getTime();
  if (isNaN(start)) return { display: "00:00:00:00", active: false };

  const elapsed = now - start;
  return { display: formatTimer(elapsed), active: true };
}

/* Target: Monday March 16 2026, 12:00 UTC */
const BOTH_TRIBES_DEADLINE_MS = Date.UTC(2026, 2, 16, 12, 0, 0);

function useCountdownToDeadline(): { display: string; active: boolean; expired: boolean } {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = BOTH_TRIBES_DEADLINE_MS - now;
  return {
    display: formatTimer(remaining),
    active: true,
    expired: remaining <= 0,
  };
}

/* ================================================================== */
/*  TIMER STYLES                                                       */
/* ================================================================== */

const timerLabelStyle: React.CSSProperties = {
  fontSize: "clamp(0.5rem, 1vw, 0.6rem)",
  letterSpacing: "0.14em",
  color: "var(--text-dim)",
  textShadow: "0 0 6px rgba(202, 245, 222, 0.12)",
  marginBottom: "0.4rem",
};

const timerValueStyle: React.CSSProperties = {
  fontSize: "clamp(0.7rem, 2vw, 1.4rem)",
  fontWeight: 500,
  letterSpacing: "0.12em",
  color: "var(--mint)",
  textShadow:
    "0 0 14px rgba(202, 245, 222, 0.3), 0 0 30px rgba(202, 245, 222, 0.12)",
};

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */

export default function ActiveWarPage() {
  const { phase: slugParam } = useParams<{ phase: string }>();
  const navigate = useNavigate();
  const activation = useWarActivation();
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const intakeRef = useRef<HTMLDivElement>(null);

  // Map URL slug to WarPhase
  const urlPhase: WarPhase | undefined = slugParam ? SLUG_TO_PHASE[slugParam] : undefined;

  // Phase from activation data (defaults to both_tribes_ready when API is unreachable)
  const renderedPhase: WarPhase = activation.data.phase;

  // Timestamps
  const activatedAt = activation.data.activatedAt ?? (import.meta.env.DEV ? DEV_ACTIVATED_AT : null);

  // Tribe data from activation (defaults include both tribes)
  const tribeA = activation.data.tribeA ?? { name: "PEACEFUL TRADE EMPIRE", id: "98000423", captainName: "CCP Overload" };
  const tribeB = activation.data.tribeB ?? { name: "WARTIME RELOADED", id: "98000430", captainName: "CCP Jotunn" };

  // Timers
  const isBothReady = renderedPhase === "both_tribes_ready";
  const countUp = useCountUp(isBothReady ? null : activatedAt);
  const countdown = useCountdownToDeadline();

  // Redirect invalid slug to both-tribes
  useEffect(() => {
    if (!urlPhase && slugParam) {
      navigate("/active/both-tribes", { replace: true });
    }
  }, [urlPhase, slugParam, navigate]);

  // When countdown expires → redirect to /war
  useEffect(() => {
    if (countdown.expired) {
      navigate("/war", { replace: true });
    }
  }, [countdown.expired, navigate]);

  // Responsive breakpoint — inline so layout doesn't depend on CSS loading
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    setIsMobile(mq.matches);
    const handler = () => setIsMobile(mq.matches);
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  // Scroll to intake after it renders
  useEffect(() => {
    if (intakeOpen && intakeRef.current) {
      requestAnimationFrame(() => {
        intakeRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [intakeOpen]);

  // Animation delays
  const timerDelay = 1.0;
  const panelDelay = 1.4;
  const buttonDelay = 2.0;

  return (
    <TerminalScreen>
      <div>
        <HeroViewport>
          <div style={{ position: "relative" }}>
            {/* 1. Title — glitch-in via DecryptText */}
            <div
              style={{
                fontSize: "clamp(1.1rem, 4vw, 3rem)",
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: "var(--mint)",
                textShadow:
                  "0 0 20px rgba(202, 245, 222, 0.35), 0 0 40px rgba(202, 245, 222, 0.15), 0 0 80px rgba(202, 245, 222, 0.08)",
                marginBottom: isMobile ? "0.5rem" : "1rem",
              }}
            >
              <DecryptText text="LINEAGE WAR ACTIVE" active durationMs={1200} />
            </div>

            {/* 2. Subtitle */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              style={{
                fontSize: "clamp(0.55rem, 1.2vw, 0.75rem)",
                letterSpacing: "0.16em",
                color: "var(--mint-dim)",
                textShadow: "0 0 8px rgba(202, 245, 222, 0.18)",
                marginBottom: isMobile ? "0.75rem" : "1.5rem",
              }}
            >
              {SUBTITLE[renderedPhase]}
            </motion.div>

            {/* 3. Timer — count-up or 24h countdown */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: timerDelay, duration: 0.5 }}
              style={{ marginBottom: isMobile ? "0.75rem" : "1.5rem" }}
            >
              <div style={timerLabelStyle}>
                {isBothReady ? "FIRST OBJECTIVE RELEASE IN" : "TIME SINCE ACTIVATION"}
              </div>
              <div style={timerValueStyle}>
                {isBothReady ? countdown.display : countUp.display}
              </div>
            </motion.div>

            {/* 4. Captain panels — always visible */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: panelDelay, duration: 0.6 }}
              className="captain-panels-row"
              style={{
                marginBottom: isMobile ? "0.75rem" : "1.5rem",
                pointerEvents: "auto",
              }}
            >
              <CaptainDossierPanel
                tribe={tribeA}
                side="a"
              />
              <CaptainDossierPanel
                tribe={tribeB}
                side="b"
              />
            </motion.div>

            {/* 5. Submit Soul Record button + support line */}
            {INTAKE_ENABLED && (
              <div style={{ pointerEvents: "auto" }}>
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: buttonDelay, duration: 0.4 }}
                  type="button"
                  onClick={() => {
                    if (!intakeOpen) {
                      setIntakeOpen(true);
                    } else {
                      intakeRef.current?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                  style={{
                    fontFamily: "IBM Plex Mono",
                    fontSize: "clamp(0.55rem, 1vw, 0.7rem)",
                    fontWeight: 500,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--mint-dim)",
                    background: "transparent",
                    border: "1px solid var(--border-panel)",
                    padding: "0.6rem 1.4rem",
                    cursor: "pointer",
                    transition: "border-color 0.2s ease, color 0.2s ease",
                    borderRadius: 0,
                    pointerEvents: "auto",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--mint)";
                    e.currentTarget.style.color = "var(--mint)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-panel)";
                    e.currentTarget.style.color = "var(--mint-dim)";
                  }}
                >
                  Submit Soul Record
                </motion.button>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: buttonDelay + 0.3, duration: 0.4 }}
                  style={{
                    marginTop: "0.7rem",
                    fontSize: "clamp(0.55rem, 1vw, 0.65rem)",
                    color: "var(--mint-dim)",
                    letterSpacing: "0.04em",
                    fontFamily: "IBM Plex Mono",
                    textShadow: "0 0 6px rgba(202, 245, 222, 0.15)",
                  }}
                >
                  Useful records may still be preserved during activation.
                </motion.div>
              </div>
            )}
          </div>
        </HeroViewport>

        {/* Intake section — below hero */}
        {INTAKE_ENABLED && intakeOpen && (
          <motion.div
            ref={intakeRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <SoulRecordIntake />
          </motion.div>
        )}
      </div>
    </TerminalScreen>
  );
}
