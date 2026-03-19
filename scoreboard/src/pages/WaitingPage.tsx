import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import TerminalScreen from "../components/terminal/TerminalScreen";
import SoulRecordIntake from "../components/waiting/SoulRecordIntake";
import HeroViewport from "../components/waiting/HeroViewport";
import { PHASE_SLUGS, type WarActivationState } from "../lib/war-phases";
import { API_BASE_URL } from "../lib/constants";

/* ------------------------------------------------------------------ */
/*  Target date: March 12 2026, 16:00 UTC                            */
/* ------------------------------------------------------------------ */
const WAR_START_MS = Date.UTC(2026, 2, 11, 22, 0, 0); // PRODUCTION
// const WAR_START_MS = Date.UTC(2020, 0, 1); // LOCAL PREVIEW — swap back before push

/* ---- Intake kill switch ------------------------------------------ */
const INTAKE_ENABLED = true;

/* ================================================================== */
/*  COUNTDOWN                                                          */
/* ================================================================== */

function useCountdown(targetMs: number) {
  const calc = () => Math.max(0, targetMs - Date.now());
  const [remaining, setRemaining] = useState(calc);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const next = calc();
      setRemaining(next);
      if (next <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const total = remaining;
  const days = Math.floor(total / 86400000);
  const hours = Math.floor((total % 86400000) / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);

  return { days, hours, minutes, seconds, isZero: total <= 0 };
}

/* ================================================================== */
/*  GLITCH-OUT REDIRECT                                                */
/* ================================================================== */

/** Fetch activation phase with a tight timeout, then redirect to /active/:slug */
async function redirectToActive() {
  let slug = "both-tribes"; // fallback

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`${API_BASE_URL}/api/activation`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data: WarActivationState = await res.json();
      slug = PHASE_SLUGS[data.phase] ?? "both-tribes";
    }
  } catch {
    // Timeout or network error — use fallback
  }

  window.location.href = `/active/${slug}`;
}

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */

const pad = (n: number) => String(n).padStart(2, "0");

export default function WaitingPage() {
  const { days, hours, minutes, seconds, isZero } = useCountdown(WAR_START_MS);
  const [glitching, setGlitching] = useState(false);
  const [glitchOpacity, setGlitchOpacity] = useState(1);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const intakeRef = useRef<HTMLDivElement>(null);

  // Glitch-out transition when countdown hits zero → redirect
  useEffect(() => {
    if (isZero && !glitching) {
      setGlitching(true);
      // After 600ms of glitch pulses, redirect
      setTimeout(() => redirectToActive(), 600);
    }
  }, [isZero, glitching]);

  // Glitch opacity pulses
  useEffect(() => {
    if (!glitching) return;
    const timers = [
      setTimeout(() => setGlitchOpacity(0.3), 0),
      setTimeout(() => setGlitchOpacity(1), 80),
      setTimeout(() => setGlitchOpacity(0.3), 200),
      setTimeout(() => setGlitchOpacity(1), 280),
      setTimeout(() => setGlitchOpacity(0.3), 400),
      setTimeout(() => setGlitchOpacity(1), 480),
    ];
    return () => timers.forEach(clearTimeout);
  }, [glitching]);

  // Scroll to intake after it renders
  useEffect(() => {
    if (intakeOpen && intakeRef.current) {
      requestAnimationFrame(() => {
        intakeRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [intakeOpen]);

  return (
    <TerminalScreen>
      <div>
        <HeroViewport>
          {glitching ? (
            /* Glitch: last countdown frame with opacity pulses */
            <div style={{ position: "relative", opacity: glitchOpacity, transition: "opacity 0.05s" }}>
              <div
                style={{
                  fontSize: "clamp(1.4rem, 4vw, 3rem)",
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  color: "var(--mint)",
                  textShadow:
                    "0 0 20px rgba(202, 245, 222, 0.35), 0 0 40px rgba(202, 245, 222, 0.15), 0 0 80px rgba(202, 245, 222, 0.08)",
                  marginBottom: "1rem",
                }}
              >
                LINEAGE WAR
              </div>
              <div
                style={{
                  fontSize: "clamp(0.55rem, 1.2vw, 0.75rem)",
                  letterSpacing: "0.16em",
                  color: "var(--mint-dim)",
                  textShadow: "0 0 8px rgba(202, 245, 222, 0.18)",
                  marginBottom: "1.2rem",
                }}
              >
                ESTIMATED COMMENCEMENT
              </div>
              <div
                style={{
                  fontSize: "clamp(1rem, 3vw, 2.2rem)",
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  color: "var(--mint)",
                  textShadow:
                    "0 0 14px rgba(202, 245, 222, 0.3), 0 0 30px rgba(202, 245, 222, 0.12)",
                  marginBottom: "1.2rem",
                }}
              >
                00
                <span style={{ opacity: 0.4, margin: "0 0.3em" }}>:</span>
                00
                <span style={{ opacity: 0.4, margin: "0 0.3em" }}>:</span>
                00
                <span style={{ opacity: 0.4, margin: "0 0.3em" }}>:</span>
                00
              </div>
            </div>
          ) : (
            /* Countdown content */
            <div style={{ position: "relative" }}>
              <div
                style={{
                  fontSize: "clamp(1.4rem, 4vw, 3rem)",
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  color: "var(--mint)",
                  textShadow:
                    "0 0 20px rgba(202, 245, 222, 0.35), 0 0 40px rgba(202, 245, 222, 0.15), 0 0 80px rgba(202, 245, 222, 0.08)",
                  marginBottom: "1rem",
                }}
              >
                LINEAGE WAR
              </div>

              <div
                style={{
                  fontSize: "clamp(0.55rem, 1.2vw, 0.75rem)",
                  letterSpacing: "0.16em",
                  color: "var(--mint-dim)",
                  textShadow: "0 0 8px rgba(202, 245, 222, 0.18)",
                  marginBottom: "1.2rem",
                }}
              >
                ESTIMATED COMMENCEMENT
              </div>

              <div
                style={{
                  fontSize: "clamp(1rem, 3vw, 2.2rem)",
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  color: "var(--mint)",
                  textShadow:
                    "0 0 14px rgba(202, 245, 222, 0.3), 0 0 30px rgba(202, 245, 222, 0.12)",
                  marginBottom: "1.2rem",
                }}
              >
                {pad(days)}
                <span style={{ opacity: 0.4, margin: "0 0.3em" }}>:</span>
                {pad(hours)}
                <span style={{ opacity: 0.4, margin: "0 0.3em" }}>:</span>
                {pad(minutes)}
                <span style={{ opacity: 0.4, margin: "0 0.3em" }}>:</span>
                {pad(seconds)}
              </div>

              {/* CTA — Submit Soul Record */}
              {INTAKE_ENABLED && (
                <div
                  style={{
                    marginTop: "2.5rem",
                    pointerEvents: "auto",
                  }}
                >
                  <button
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
                  </button>
                </div>
              )}
            </div>
          )}
        </HeroViewport>

        {/* Intake section — below hero, normal document flow */}
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
