import { useState, useRef, useCallback, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import DecryptText from "../terminal/DecryptText";
import { API_BASE_URL } from "../../lib/constants";

/* ------------------------------------------------------------------ */
/*  Submission                                                         */
/* ------------------------------------------------------------------ */

type SubmitErrorKind = "invalid" | "rate_limited" | "server";

class SubmitError extends Error {
  kind: SubmitErrorKind;
  constructor(kind: SubmitErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

async function submitSoulRecord(payload: FormData): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/submissions`, {
    method: "POST",
    body: payload,
  });
  if (!res.ok) {
    if (res.status === 400) throw new SubmitError("invalid");
    if (res.status === 429) throw new SubmitError("rate_limited");
    throw new SubmitError("server");
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SoulRecordIntakeProps {
  onTransmitted?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const FONT: React.CSSProperties = {
  fontFamily: "IBM Plex Mono",
};

const LABEL_STYLE: React.CSSProperties = {
  ...FONT,
  fontSize: "0.7rem",
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--mint-dim)",
  marginBottom: "0.35rem",
};

const HELPER_STYLE: React.CSSProperties = {
  ...FONT,
  fontSize: "0.7rem",
  color: "var(--mint-dim)",
  marginBottom: "0.5rem",
  lineHeight: 1.65,
};

const INPUT_STYLE: React.CSSProperties = {
  ...FONT,
  width: "100%",
  boxSizing: "border-box",
  minHeight: 44,
  padding: "0.6rem 0.75rem",
  background: "transparent",
  border: "1px solid var(--border-panel)",
  color: "var(--mint)",
  fontSize: "0.75rem",
  letterSpacing: "0.04em",
  outline: "none",
  borderRadius: 0,
  transition: "border-color 0.2s ease",
};

const FIELD_GAP = "1.5rem";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SoulRecordIntake({ onTransmitted }: SoulRecordIntakeProps) {
  const [characterName, setCharacterName] = useState("");
  const [soulRecord, setSoulRecord] = useState<File | null>(null);
  const [declaredUtility, setDeclaredUtility] = useState("");
  const [consent, setConsent] = useState(false);
  const [noSoulRecord, setNoSoulRecord] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );
  const [errorKind, setErrorKind] = useState<SubmitErrorKind>("server");
  const [fileError, setFileError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    characterName.trim() !== "" &&
    (soulRecord !== null || noSoulRecord) &&
    fileError === null &&
    consent &&
    submitState !== "submitting";

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setSubmitState("submitting");

      const data = new FormData();
      data.append("riderName", characterName.trim());
      data.append("noSoulRecord", noSoulRecord ? "true" : "false");
      if (!noSoulRecord && soulRecord) {
        data.append("soulRecord", soulRecord);
      }
      data.append("declaredUtility", declaredUtility.trim());
      data.append("consent", "true");

      try {
        await submitSoulRecord(data);
        setSubmitState("success");
        onTransmitted?.();
      } catch (err) {
        setErrorKind(err instanceof SubmitError ? err.kind : "server");
        setSubmitState("error");
      }
    },
    [canSubmit, characterName, soulRecord, noSoulRecord, declaredUtility, onTransmitted],
  );

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      const ext = file.name.toLowerCase().split(".").pop();
      if (ext !== "txt" && ext !== "md") {
        setFileError("invalid");
        setSoulRecord(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }
    setFileError(null);
    setSoulRecord(file);
  }, []);

  const handleRemoveFile = useCallback(() => {
    setSoulRecord(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  /* ---- Render ---------------------------------------------------- */

  return (
    <div
      style={{
        width: "100%",
        background: "var(--bg-terminal)",
        borderTop: "1px solid var(--border-panel)",
        scrollMarginTop: 80,
      }}
    >
      {/* Section title bar */}
      <div
        style={{
          padding: "0.55rem 1.25rem",
          borderBottom: "1px solid var(--border-panel)",
          background: "rgba(0,0,0,0.25)",
        }}
      >
        <span
          style={{
            ...FONT,
            fontSize: "0.7rem",
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--mint)",
          }}
        >
          Soul Record Intake
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "2rem 1.5rem",
        }}
      >
        <AnimatePresence mode="wait">
          {submitState === "success" ? (
            <motion.div
              key="success"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{ textAlign: "center", padding: "2rem 0" }}
            >
              <div
                style={{
                  ...FONT,
                  fontSize: "clamp(0.85rem, 2vw, 1.1rem)",
                  fontWeight: 500,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--mint)",
                  textShadow:
                    "0 0 14px rgba(202, 245, 222, 0.3), 0 0 30px rgba(202, 245, 222, 0.12)",
                  marginBottom: "1rem",
                }}
              >
                <DecryptText text="Transmission accepted." active durationMs={700} />
              </div>
              <div
                style={{
                  ...FONT,
                  fontSize: "0.7rem",
                  letterSpacing: "0.06em",
                  color: "var(--mint-dim)",
                  lineHeight: 1.65,
                  marginBottom: "0.6rem",
                }}
              >
                Record preserved for review.
              </div>
              <div
                style={{
                  ...FONT,
                  fontSize: "0.7rem",
                  letterSpacing: "0.06em",
                  color: "var(--mint-dim)",
                  lineHeight: 1.65,
                }}
              >
                Not all useful variation occurs under direct conflict.
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column" }}
            >
              {/* Intro copy */}
              <p
                style={{
                  ...FONT,
                  fontSize: "0.75rem",
                  lineHeight: 1.75,
                  color: "var(--mint-dim)",
                  marginTop: 0,
                  marginBottom: "2rem",
                  maxWidth: 480,
                }}
              >
                Before strain begins, useful records should be preserved. Submit your soul record
                for future comparison, review, and Lineage War refinement. Records from Riders who
                enter the condition, and Riders who do not, may both prove useful.
              </p>

              {/* Character Name */}
              <div style={{ marginBottom: FIELD_GAP }}>
                <div style={LABEL_STYLE}>Rider Name</div>
                <div style={HELPER_STYLE}>Current designation to be preserved for review.</div>
                <input
                  type="text"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  style={INPUT_STYLE}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--mint)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-panel)")}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Soul Record */}
              <div style={{ marginBottom: FIELD_GAP }}>
                <div style={LABEL_STYLE}>Soul Record</div>
                <div style={HELPER_STYLE}>Upload your Soul Record.</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,text/plain,text/markdown"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <AnimatePresence initial={false}>
                  {!noSoulRecord && (
                    <motion.div
                      key="file-upload"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      {soulRecord ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.6rem 0.75rem",
                            border: "1px solid var(--border-panel)",
                            minHeight: 44,
                          }}
                        >
                          <span
                            style={{
                              ...FONT,
                              fontSize: "0.7rem",
                              color: "var(--mint)",
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {soulRecord.name}
                          </span>
                          <button
                            type="button"
                            onClick={handleRemoveFile}
                            style={{
                              ...FONT,
                              background: "none",
                              border: "none",
                              color: "var(--text-dim)",
                              fontSize: "0.6rem",
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              cursor: "pointer",
                              padding: "0.25rem 0.5rem",
                              flexShrink: 0,
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            ...FONT,
                            width: "100%",
                            minHeight: 44,
                            padding: "0.75rem",
                            background: "transparent",
                            border: "1px dashed var(--border-panel)",
                            color: "var(--text-dim)",
                            fontSize: "0.65rem",
                            letterSpacing: "0.08em",
                            cursor: "pointer",
                            textAlign: "center",
                            transition: "border-color 0.2s ease, color 0.2s ease",
                            borderRadius: 0,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "var(--mint-dim)";
                            e.currentTarget.style.color = "var(--mint-dim)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "var(--border-panel)";
                            e.currentTarget.style.color = "var(--text-dim)";
                          }}
                        >
                          Select file
                        </button>
                      )}
                      {fileError && (
                        <div style={{ marginTop: "0.5rem" }}>
                          <div
                            style={{
                              ...FONT,
                              fontSize: "0.65rem",
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              color: "var(--contested)",
                              marginBottom: "0.2rem",
                            }}
                          >
                            Invalid record format.
                          </div>
                          <div
                            style={{
                              ...FONT,
                              fontSize: "0.7rem",
                              color: "var(--mint-dim)",
                              lineHeight: 1.65,
                            }}
                          >
                            Only .txt and .md files are accepted.
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* No soul record checkbox */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    cursor: "pointer",
                    minHeight: 44,
                    marginTop: noSoulRecord ? 0 : "0.75rem",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      border: `1px solid ${noSoulRecord ? "var(--mint)" : "var(--border-panel)"}`,
                      background: noSoulRecord ? "rgba(202, 245, 222, 0.08)" : "transparent",
                      transition: "border-color 0.2s ease, background 0.2s ease",
                      cursor: "pointer",
                    }}
                    role="checkbox"
                    aria-checked={noSoulRecord}
                  >
                    {noSoulRecord && (
                      <span
                        style={{
                          color: "var(--mint)",
                          fontSize: "0.65rem",
                          lineHeight: 1,
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={noSoulRecord}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setNoSoulRecord(checked);
                      if (checked) {
                        setSoulRecord(null);
                        setFileError(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }
                    }}
                    style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{ ...FONT, fontSize: "0.7rem", color: "var(--mint-dim)", lineHeight: 1.65 }}>
                    No soul record available.
                  </span>
                </label>
              </div>

              {/* Declared Utility */}
              <div style={{ marginBottom: FIELD_GAP }}>
                <div style={LABEL_STYLE}>
                  Declared Utility{" "}
                  <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span>
                </div>
                <div style={HELPER_STYLE}>
                  A brief declaration of purpose, allegiance, or expected utility.
                </div>
                <textarea
                  value={declaredUtility}
                  onChange={(e) => setDeclaredUtility(e.target.value)}
                  rows={3}
                  style={{
                    ...INPUT_STYLE,
                    minHeight: 80,
                    resize: "vertical",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--mint)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-panel)")}
                  spellCheck={false}
                />
              </div>

              {/* Consent */}
              <div style={{ marginBottom: "2rem" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    cursor: "pointer",
                    minHeight: 44,
                    paddingTop: "0.25rem",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      marginTop: 1,
                      border: `1px solid ${consent ? "var(--mint)" : "var(--border-panel)"}`,
                      background: consent ? "rgba(202, 245, 222, 0.08)" : "transparent",
                      transition: "border-color 0.2s ease, background 0.2s ease",
                      cursor: "pointer",
                    }}
                    role="checkbox"
                    aria-checked={consent}
                  >
                    {consent && (
                      <span
                        style={{
                          color: "var(--mint)",
                          fontSize: "0.65rem",
                          lineHeight: 1,
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{ ...FONT, fontSize: "0.7rem", color: "var(--mint-dim)", lineHeight: 1.65 }}>
                    I consent to the preservation and review of this record for Lineage War analysis
                    and future refinement.
                  </span>
                </label>
              </div>

              {/* Error state */}
              {submitState === "error" && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <div
                    style={{
                      ...FONT,
                      fontSize: "0.65rem",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--contested)",
                      marginBottom: "0.3rem",
                    }}
                  >
                    {errorKind === "invalid"
                      ? "Record incomplete or unrecognized."
                      : errorKind === "rate_limited"
                        ? "Intake channel is stabilizing."
                        : "Transmission failed."}
                  </div>
                  <div style={{ ...FONT, fontSize: "0.7rem", color: "var(--mint-dim)", lineHeight: 1.65 }}>
                    {errorKind === "invalid"
                      ? "Review fields and resubmit."
                      : errorKind === "rate_limited"
                        ? "Retry when conditions allow."
                        : "Retry when the intake channel stabilizes."}
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  ...FONT,
                  alignSelf: "flex-start",
                  minHeight: 44,
                  padding: "0.65rem 1.5rem",
                  background: "transparent",
                  border: `1px solid ${canSubmit ? "var(--mint-dim)" : "var(--border-panel)"}`,
                  color: canSubmit ? "var(--mint-dim)" : "var(--text-dim)",
                  fontSize: "0.7rem",
                  fontWeight: 500,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  cursor: canSubmit ? "pointer" : "default",
                  opacity: submitState === "submitting" ? 0.5 : 1,
                  transition: "border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease",
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => {
                  if (canSubmit) {
                    e.currentTarget.style.borderColor = "var(--mint)";
                    e.currentTarget.style.color = "var(--mint)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (canSubmit) {
                    e.currentTarget.style.borderColor = "var(--mint-dim)";
                    e.currentTarget.style.color = "var(--mint-dim)";
                  }
                }}
              >
                {submitState === "submitting" ? "Transmitting..." : "Transmit Record"}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
