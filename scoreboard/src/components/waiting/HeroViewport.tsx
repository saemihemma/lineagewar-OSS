import { useState, useEffect, useRef, useCallback } from "react";
import DecryptText, { CLEAN_GLITCH_CHARS } from "../terminal/DecryptText";

/* ================================================================== */
/*  ANNOTATION SYSTEM                                                  */
/* ================================================================== */

/* ---- Text buckets ------------------------------------------------ */

const BUCKET_SYSTEM: string[] = [
  "LINEAGE DEGRADATION DETECTED",
  "OBSERVABILITY IMPAIRMENT",
  "PHASE INTEGRITY UNSTABLE",
  "SYNCHRONIZATION DRIFT",
  "ARCHIVAL FIDELITY COMPROMISED",
];

const BUCKET_BEHAVIORAL: string[] = [
  "DESERTION PATTERN RECORDED",
  "RATIONAL WITHDRAWAL DETECTED",
  "BEHAVIORAL DEVIATION LOGGED",
  "PRESSURE RESPONSE INCONCLUSIVE",
  "SAMPLE SIZE INCREASES",
];

const BUCKET_CLONE: string[] = [
  "RETURN EVENT RECORDED",
  "TRANSFER FIDELITY IN DOUBT",
  "AWAKENING TRACE PERSISTS",
  "LINEAGE MARKER UNSTABLE",
  "COHORT MEMORY LOSS EXPECTED",
  "SOMETHING KEEPS RETURNING",
];

const RARE_LINES: string[] = [
  "// THE RESULT IS SUFFICIENT",
  "// OBSERVATION CONTINUES",
  "// PHASE CONDITIONS WILL FOLLOW",
  "// MAINTAIN CONTROL",
];

/* ---- Anchor definitions ------------------------------------------ */

type AnchorPosition = {
  top?: string;
  left?: string;
  right?: string;
  bottom?: string;
  transform?: string;
};

type AnchorDef = {
  id: string;
  position: AnchorPosition;
  bucket: string[];
  hiddenMinMs: number;
  hiddenMaxMs: number;
  visibleMinMs: number;
  visibleMaxMs: number;
  flickerBursts: number;
  initialDelayMs: number;
  hideBelow: number;
};

const ANCHORS: AnchorDef[] = [
  {
    id: "top-left",
    position: { top: "14%", left: "4%" },
    bucket: BUCKET_SYSTEM,
    hiddenMinMs: 8000,
    hiddenMaxMs: 14000,
    visibleMinMs: 3000,
    visibleMaxMs: 4000,
    flickerBursts: 2,
    initialDelayMs: 1200,
    hideBelow: 481,
  },
  {
    id: "upper-mid-left",
    position: { top: "22%", left: "26%" },
    bucket: BUCKET_SYSTEM,
    hiddenMinMs: 9000,
    hiddenMaxMs: 16000,
    visibleMinMs: 3000,
    visibleMaxMs: 4000,
    flickerBursts: 1,
    initialDelayMs: 6000,
    hideBelow: 769,
  },
  {
    id: "mid-left",
    position: { top: "48%", left: "3%" },
    bucket: BUCKET_BEHAVIORAL,
    hiddenMinMs: 7000,
    hiddenMaxMs: 13000,
    visibleMinMs: 3000,
    visibleMaxMs: 4000,
    flickerBursts: 1,
    initialDelayMs: 10000,
    hideBelow: 1025,
  },
  {
    id: "lower-mid-left",
    position: { bottom: "20%", left: "24%" },
    bucket: BUCKET_CLONE,
    hiddenMinMs: 6000,
    hiddenMaxMs: 12000,
    visibleMinMs: 3000,
    visibleMaxMs: 4000,
    flickerBursts: 2,
    initialDelayMs: 4000,
    hideBelow: 769,
  },
  {
    id: "bottom-right",
    position: { bottom: "20%", right: "5%" },
    bucket: BUCKET_CLONE,
    hiddenMinMs: 8000,
    hiddenMaxMs: 15000,
    visibleMinMs: 3000,
    visibleMaxMs: 4000,
    flickerBursts: 1,
    initialDelayMs: 7500,
    hideBelow: 0,
  },
];

const RARE_SLOTS: AnchorPosition[] = [
  { top: "26%", left: "50%", transform: "translateX(-50%)" },
  { top: "74%", left: "50%", transform: "translateX(-50%)" },
];

/* ---- Helpers ----------------------------------------------------- */

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createBucketPicker(bucket: string[]) {
  let queue = shuffle([...bucket]);
  let last = "";
  return () => {
    if (queue.length === 0) {
      queue = shuffle([...bucket]);
      if (queue[0] === last && queue.length > 1) {
        [queue[0], queue[queue.length - 1]] = [queue[queue.length - 1], queue[0]];
      }
    }
    last = queue.pop()!;
    return last;
  };
}

function getResponsiveCap(): number {
  const w = window.innerWidth;
  if (w <= 480) return 1;
  if (w <= 768) return 1;
  if (w <= 1024) return 2;
  return 2;
}

function isAnchorActive(anchor: AnchorDef): boolean {
  return window.innerWidth >= anchor.hideBelow;
}

function jitterPosition(pos: AnchorPosition): AnchorPosition {
  const jitter = () => `${(Math.random() - 0.5) * 1.5}%`;
  const result: AnchorPosition = { ...pos };
  if (result.top) result.top = `calc(${result.top} + ${jitter()})`;
  if (result.left) result.left = `calc(${result.left} + ${jitter()})`;
  if (result.right) result.right = `calc(${result.right} + ${jitter()})`;
  if (result.bottom) result.bottom = `calc(${result.bottom} + ${jitter()})`;
  return result;
}

/* ---- Annotation state -------------------------------------------- */

type AnnotationEntry = {
  id: string;
  text: string;
  opacity: number;
  position: AnchorPosition;
  isRare: boolean;
  decryptActive: boolean;
  decryptDurationMs: number;
};

/* ---- Orchestrator hook ------------------------------------------- */

function useAnnotationOrchestrator() {
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([]);
  const stateRef = useRef<{
    unmounted: boolean;
    timers: ReturnType<typeof setTimeout>[];
    anchorOpacity: Record<string, number>;
    rareVisible: boolean;
    quietActive: boolean;
    postQuietRamp: boolean;
    lastRareShownAt: number;
    cap: number;
  }>({
    unmounted: false,
    timers: [],
    anchorOpacity: {},
    rareVisible: false,
    quietActive: false,
    postQuietRamp: false,
    lastRareShownAt: 0,
    cap: 3,
  });

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    stateRef.current.timers.push(id);
    return id;
  }, []);

  const getVisibleCount = useCallback(() => {
    const ops = stateRef.current.anchorOpacity;
    return Object.values(ops).filter((o) => o > 0).length;
  }, []);

  const emitState = useCallback(() => {
    if (stateRef.current.unmounted) return;
    const ops = stateRef.current.anchorOpacity;
    const entries: AnnotationEntry[] = [];

    for (const key of Object.keys(ops)) {
      const stored = (stateRef.current as unknown as Record<string, unknown>)[`entry_${key}`] as
        | { text: string; position: AnchorPosition; isRare: boolean; decryptActive: boolean; decryptDurationMs: number }
        | undefined;
      if (stored) {
        entries.push({
          id: key,
          text: stored.text,
          opacity: ops[key],
          position: stored.position,
          isRare: stored.isRare,
          decryptActive: stored.decryptActive,
          decryptDurationMs: stored.decryptDurationMs,
        });
      }
    }
    setAnnotations([...entries]);
  }, []);

  const setEntry = useCallback(
    (
      key: string,
      text: string,
      position: AnchorPosition,
      isRare: boolean,
      opacity: number,
      decryptActive: boolean = false,
      decryptDurationMs: number = 600,
    ) => {
      (stateRef.current as unknown as Record<string, unknown>)[`entry_${key}`] = {
        text,
        position,
        isRare,
        decryptActive,
        decryptDurationMs,
      };
      stateRef.current.anchorOpacity[key] = opacity;
      emitState();
    },
    [emitState],
  );

  const setDecryptActive = useCallback(
    (key: string, active: boolean) => {
      const stored = (stateRef.current as unknown as Record<string, unknown>)[`entry_${key}`] as
        | { text: string; position: AnchorPosition; isRare: boolean; decryptActive: boolean; decryptDurationMs: number }
        | undefined;
      if (stored) {
        stored.decryptActive = active;
        emitState();
      }
    },
    [emitState],
  );

  const setOpacity = useCallback(
    (key: string, opacity: number) => {
      stateRef.current.anchorOpacity[key] = opacity;
      emitState();
    },
    [emitState],
  );

  useEffect(() => {
    const s = stateRef.current;
    s.unmounted = false;
    s.cap = getResponsiveCap();

    const onResize = () => {
      s.cap = getResponsiveCap();
    };
    window.addEventListener("resize", onResize);

    /* ---------- Per-anchor cycle ---------------------------------- */

    for (const anchor of ANCHORS) {
      const pick = createBucketPicker(anchor.bucket);

      const runAnchorCycle = (initialDelay: number) => {
        if (s.unmounted) return;

        schedule(() => {
          if (s.unmounted) return;

          if (!isAnchorActive(anchor)) {
            schedule(() => runAnchorCycle(rand(3000, 5000)), 0);
            return;
          }

          const effectiveCap = s.postQuietRamp ? 1 : s.cap;
          if (s.quietActive || getVisibleCount() >= effectiveCap) {
            schedule(() => runAnchorCycle(rand(3000, 5000)), 0);
            return;
          }

          const text = pick();
          const jitteredPos = jitterPosition(anchor.position);

          const entranceRoll = Math.random();
          const useDecrypt = entranceRoll < 0.3;
          const useGlitch = entranceRoll < 0.6;

          let burstTime = 0;

          const decryptMs = rand(450, 700);
          setEntry(anchor.id, text, jitteredPos, false, 0, useDecrypt, decryptMs);

          if (useDecrypt || useGlitch) {
            const bursts = anchor.flickerBursts;
            for (let i = 0; i < bursts; i++) {
              schedule(() => {
                if (!s.unmounted) setOpacity(anchor.id, 0.7);
              }, burstTime);
              burstTime += 50;
              schedule(() => {
                if (!s.unmounted) setOpacity(anchor.id, 0);
              }, burstTime);
              burstTime += 80;
            }
          }

          schedule(() => {
            if (!s.unmounted) setOpacity(anchor.id, 1);
          }, burstTime);

          const holdMs = rand(anchor.visibleMinMs, anchor.visibleMaxMs);
          schedule(() => {
            if (!s.unmounted) {
              setOpacity(anchor.id, 0);
              setDecryptActive(anchor.id, false);
            }
            const hiddenMs = rand(anchor.hiddenMinMs, anchor.hiddenMaxMs);
            schedule(() => runAnchorCycle(0), hiddenMs);
          }, burstTime + holdMs);
        }, initialDelay);
      };

      runAnchorCycle(anchor.initialDelayMs);
    }

    /* ---------- Rare line cycle ----------------------------------- */

    const rarePick = createBucketPicker(RARE_LINES);
    s.lastRareShownAt = Date.now();

    const runRareCycle = () => {
      if (s.unmounted) return;

      const waitMs = rand(30000, 50000);

      schedule(() => {
        if (s.unmounted) return;

        const drought = Date.now() - s.lastRareShownAt;
        const force = drought > 100000;

        if (s.quietActive || s.rareVisible) {
          schedule(runRareCycle, rand(5000, 10000));
          return;
        }

        if (getVisibleCount() >= s.cap && !force) {
          const normalKeys = ANCHORS.map((a) => a.id).filter(
            (k) => (s.anchorOpacity[k] ?? 0) > 0,
          );
          if (normalKeys.length > 0) {
            const fadeKey = normalKeys[Math.floor(Math.random() * normalKeys.length)];
            setOpacity(fadeKey, 0);
            schedule(() => showRare(), 400);
            return;
          }
        }

        if (getVisibleCount() >= s.cap && !force) {
          schedule(runRareCycle, rand(5000, 10000));
          return;
        }

        showRare();
      }, waitMs);
    };

    const showRare = () => {
      if (s.unmounted) return;

      const text = rarePick();
      const slot = RARE_SLOTS[Math.floor(Math.random() * RARE_SLOTS.length)];
      const rareKey = "__rare__";

      s.rareVisible = true;
      s.lastRareShownAt = Date.now();

      const rareDecryptMs = rand(900, 1200);
      setEntry(rareKey, text, slot, true, 0, true, rareDecryptMs);

      schedule(() => {
        if (!s.unmounted) setOpacity(rareKey, 1);
      }, 100);

      const holdMs = rand(6000, 8000);
      schedule(() => {
        if (!s.unmounted) {
          setOpacity(rareKey, 0);
          setDecryptActive(rareKey, false);
        }
        s.rareVisible = false;
        schedule(runRareCycle, rand(40000, 60000));
      }, 100 + holdMs);
    };

    runRareCycle();

    /* ---------- Quiet window cycle -------------------------------- */

    const runQuietCycle = () => {
      if (s.unmounted) return;
      const nextQuiet = rand(8000, 18000);

      schedule(() => {
        if (s.unmounted) return;
        s.quietActive = true;

        for (const key of Object.keys(s.anchorOpacity)) {
          if (s.anchorOpacity[key] > 0) {
            setOpacity(key, 0);
            setDecryptActive(key, false);
          }
        }

        const quietDuration = rand(3000, 6000);
        schedule(() => {
          if (!s.unmounted) {
            s.quietActive = false;
            s.postQuietRamp = true;
            schedule(() => {
              if (!s.unmounted) s.postQuietRamp = false;
            }, rand(2000, 4000));
          }
          runQuietCycle();
        }, quietDuration);
      }, nextQuiet);
    };

    runQuietCycle();

    /* ---------- Cleanup ------------------------------------------- */

    return () => {
      s.unmounted = true;
      s.timers.forEach(clearTimeout);
      s.timers = [];
      window.removeEventListener("resize", onResize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return annotations;
}

/* ---- Annotation renderer ----------------------------------------- */

function AnnotationLayer() {
  const annotations = useAnnotationOrchestrator();

  return (
    <>
      {annotations.map((a) =>
        a.isRare ? (
          <div
            key={a.id}
            style={{
              position: "absolute",
              ...a.position,
              opacity: a.opacity,
              transition: "opacity 0.5s ease",
              fontFamily: "IBM Plex Mono",
              fontSize: "clamp(0.55rem, 1.1vw, 0.7rem)",
              fontWeight: 400,
              letterSpacing: "0.14em",
              color: "var(--mint)",
              textShadow:
                "0 0 10px rgba(202, 245, 222, 0.3), 0 0 20px rgba(202, 245, 222, 0.12)",
              textTransform: "uppercase",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: "150%",
                height: "400%",
                background:
                  "radial-gradient(ellipse, rgba(2,5,3,0.55) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />
            <span style={{ position: "relative" }}>
              <DecryptText
                text={a.text}
                active={a.decryptActive}
                durationMs={a.decryptDurationMs}
                glitchChars={CLEAN_GLITCH_CHARS}
              />
            </span>
          </div>
        ) : (
          <div
            key={a.id}
            style={{
              position: "absolute",
              ...a.position,
              opacity: a.opacity,
              transition: "opacity 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontFamily: "IBM Plex Mono",
              fontSize: "clamp(0.5rem, 1vw, 0.65rem)",
              fontWeight: 500,
              letterSpacing: "0.1em",
              color: "var(--contested)",
              textShadow: "0 0 6px rgba(221, 122, 31, 0.4)",
              textTransform: "uppercase",
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "1.1em",
                height: "1.1em",
                border: "1px solid var(--contested)",
                fontSize: "0.7em",
                lineHeight: 1,
              }}
            >
              ⚠
            </span>
            <DecryptText
              text={a.text}
              active={a.decryptActive}
              durationMs={a.decryptDurationMs}
            />
          </div>
        ),
      )}
    </>
  );
}

/* ================================================================== */
/*  CORNER BRACKETS                                                    */
/* ================================================================== */

const BRACKET_SIZE = "24px";
const BRACKET_THICKNESS = "1px";
const BRACKET_COLOR = "var(--mint-dim)";
const BRACKET_OFFSET = "12px";

function CornerBrackets() {
  const base: React.CSSProperties = {
    position: "absolute",
    width: BRACKET_SIZE,
    height: BRACKET_SIZE,
    pointerEvents: "none",
  };
  return (
    <>
      <div
        style={{
          ...base,
          top: BRACKET_OFFSET,
          left: BRACKET_OFFSET,
          borderTop: `${BRACKET_THICKNESS} solid ${BRACKET_COLOR}`,
          borderLeft: `${BRACKET_THICKNESS} solid ${BRACKET_COLOR}`,
        }}
      />
      <div
        style={{
          ...base,
          top: BRACKET_OFFSET,
          right: BRACKET_OFFSET,
          borderTop: `${BRACKET_THICKNESS} solid ${BRACKET_COLOR}`,
          borderRight: `${BRACKET_THICKNESS} solid ${BRACKET_COLOR}`,
        }}
      />
      <div
        style={{
          ...base,
          bottom: BRACKET_OFFSET,
          left: BRACKET_OFFSET,
          borderBottom: `${BRACKET_THICKNESS} solid ${BRACKET_COLOR}`,
          borderLeft: `${BRACKET_THICKNESS} solid ${BRACKET_COLOR}`,
        }}
      />
      <div
        style={{
          ...base,
          bottom: BRACKET_OFFSET,
          right: BRACKET_OFFSET,
          borderBottom: `${BRACKET_THICKNESS} solid ${BRACKET_COLOR}`,
          borderRight: `${BRACKET_THICKNESS} solid ${BRACKET_COLOR}`,
        }}
      />
    </>
  );
}

/* ================================================================== */
/*  HERO VIEWPORT                                                      */
/* ================================================================== */

export default function HeroViewport({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100dvh",
        overflow: "hidden",
      }}
    >
      {/* Layer 1: Base grayscale artwork */}
      <img
        src="/corridorofsaddness.jpg"
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "grayscale(1)",
        }}
      />

      {/* Layer 2a: Green-black multiply tint */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(2,15,8,0.82) 0%, rgba(2,5,3,0.92) 100%)",
          mixBlendMode: "multiply",
        }}
      />

      {/* Layer 2b: Slight green color overlay */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10, 40, 25, 0.35)",
          mixBlendMode: "color",
        }}
      />

      {/* Corner brackets */}
      <CornerBrackets />

      {/* Annotation system — hidden on mobile */}
      <div className="annotations-desktop-only">
        <AnnotationLayer />
      </div>

      {/* Content overlay */}
      <div
        className="hero-content-overlay"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        {/* War Feed annotation — top center, hidden on mobile */}
        <div
          className="war-feed-block"
          style={{
            position: "absolute",
            top: "6%",
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            fontFamily: "IBM Plex Mono",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: "200%",
                height: "300%",
                background:
                  "radial-gradient(ellipse, rgba(2,5,3,0.6) 0%, transparent 70%)",
              }}
            />
          </div>
          <div
            style={{
              position: "relative",
              fontSize: "clamp(0.5rem, 1vw, 0.65rem)",
              color: "var(--text-dim)",
              textShadow: "0 0 6px rgba(202, 245, 222, 0.15)",
              marginBottom: "0.3rem",
            }}
          >
            // WAR FEED /
          </div>
          <div
            style={{
              position: "relative",
              fontSize: "clamp(0.55rem, 1.1vw, 0.7rem)",
              color: "var(--mint-dim)",
              textShadow: "0 0 8px rgba(202, 245, 222, 0.2)",
            }}
          >
            AWAKENING INITIATED
          </div>
        </div>

        {/* Main content block — center */}
        <div
          style={{
            width: "100%",
            textAlign: "center",
            fontFamily: "IBM Plex Mono",
            textTransform: "uppercase",
          }}
        >
          {/* Radial glow behind content */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: "120%",
                height: "250%",
                background:
                  "radial-gradient(ellipse, rgba(2,5,3,0.5) 0%, transparent 65%)",
              }}
            />
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
