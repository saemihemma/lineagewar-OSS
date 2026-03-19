import { useState } from "react";
import { Link } from "react-router-dom";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { useAdminPortalState } from "../lib/admin-context";
import { buildDraftPreview, buildTransactionForDraft, extractExecutionRecord } from "../lib/transactions";
import { formatTimestamp, shortenId } from "../lib/utils";

const VERIFIER_URL = import.meta.env.VITE_VERIFIER_URL || "";

function notifyVerifier(): void {
  if (!VERIFIER_URL) return;
  fetch(`${VERIFIER_URL}/notify`, { method: "POST" }).catch(() => {});
}

const cardStyle: React.CSSProperties = {
  padding: "1rem",
  border: "1px solid #27272a",
  borderRadius: 12,
  background: "#16161b",
};

export default function PreviewScreen() {
  const account = useCurrentAccount();
  const dappKit = useDAppKit() as {
    signAndExecuteTransaction?: (input: {
      transaction: ReturnType<typeof buildTransactionForDraft>;
      options?: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  const { draft, setDraft, lastExecution, setLastExecution } = useAdminPortalState();
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "submitted">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const preview = draft ? buildDraftPreview(draft) : null;
  const hasBlockingIssues = Boolean(preview?.blockingIssues.length);

  const submitTransaction = async () => {
    if (!draft) {
      return;
    }
    if (!account?.address) {
      setErrorMessage("Connect a wallet before submitting.");
      return;
    }
    if (!dappKit.signAndExecuteTransaction) {
      setErrorMessage("Wallet adapter does not expose signAndExecuteTransaction.");
      return;
    }

    try {
      setErrorMessage(null);
      setSubmitState("submitting");
      const transaction = buildTransactionForDraft(draft, account.address);
      const result = await dappKit.signAndExecuteTransaction({
        transaction,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      const execution = extractExecutionRecord(result);
      setLastExecution(execution);
      setSubmitState("submitted");

      if (draft.kind === "create-war") {
        notifyVerifier();
      }

      setDraft(null);
    } catch (error) {
      setSubmitState("idle");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <div>
        <h1 style={{ marginTop: 0 }}>Preview</h1>
        <p style={{ color: "#a1a1aa", maxWidth: 900 }}>
          Review the exact operation before signing. This screen summarizes the intended Move calls and submits the
          transaction with the connected wallet; it does not invent hidden state or silently mutate rules off chain.
        </p>
      </div>

      {!account && (
        <p style={{ ...cardStyle, color: "#fbbf24", margin: 0 }}>
          Connect a wallet that holds the relevant `WarAdminCap` before submitting.
        </p>
      )}

      {!preview && (
        <section style={cardStyle}>
          <p style={{ marginTop: 0 }}>No draft is queued yet.</p>
          <p style={{ color: "#71717a" }}>
            Start from <Link to="/setup">Setup</Link>, <Link to="/systems">System config</Link>,{" "}
            <Link to="/schedule">Schedule</Link>, or <Link to="/snapshots">Snapshots</Link>.
          </p>
        </section>
      )}

      {preview && (
        <>
          {draft?.kind === "commit-snapshot" && (
            <section style={{ ...cardStyle, borderColor: "#3f3f46", background: "#101015" }}>
              <p style={{ margin: 0, color: "#d4d4d8" }}>
                Snapshot commits are verifier-led. This preview is only a signing surface for verifier-produced inputs,
                not a UI for manual score authorship.
              </p>
            </section>
          )}

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>{preview.title}</h2>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {preview.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Move calls</h2>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {preview.contractCalls.map((line) => (
                <li key={line}>
                  <code>{line}</code>
                </li>
              ))}
            </ul>
          </section>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Warnings</h2>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {preview.warnings.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          {draft?.kind === "upsert-system-config" && (
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0 }}>Public display manifest entry</h2>
              <p style={{ color: "#a1a1aa" }}>
                This editorial copy is not part of the on-chain transaction. Publish it through the verifier
                display manifest so the score page and audit view consume the same public read model.
              </p>
              <pre
                style={{
                  margin: 0,
                  padding: "0.85rem",
                  borderRadius: 8,
                  background: "#101015",
                  border: "1px solid #27272a",
                  overflowX: "auto",
                  color: "#d4d4d8",
                  fontSize: "0.8rem",
                }}
              >
                {JSON.stringify(
                  {
                    systemId: String(draft.systemId),
                    displayRuleLabel: draft.displayCopy.displayRuleLabel,
                    displayRuleDescription: draft.displayCopy.displayRuleDescription,
                  },
                  null,
                  2,
                )}
              </pre>
            </section>
          )}

          {!!preview.blockingIssues.length && (
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0, color: "#f87171" }}>Blocking issues</h2>
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {preview.blockingIssues.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>Submit</h2>
            <p>
              Connected wallet: <code>{account ? shortenId(account.address, 10) : "not connected"}</code>
            </p>
            {hasBlockingIssues && (
              <p style={{ color: "#f87171" }}>
                Fix the blocking issues above before opening the wallet approval flow.
              </p>
            )}
            {errorMessage && <p style={{ color: "#f87171" }}>{errorMessage}</p>}
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={submitTransaction}
                disabled={!account || submitState === "submitting" || hasBlockingIssues}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: 8,
                  border: "none",
                  background: account && submitState !== "submitting" && !hasBlockingIssues ? "#22c55e" : "#3f3f46",
                  color: "#fff",
                  cursor: account && submitState !== "submitting" && !hasBlockingIssues ? "pointer" : "not-allowed",
                }}
              >
                {submitState === "submitting" ? "Submitting..." : "Sign and execute"}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: 8,
                  border: "1px solid #3f3f46",
                  background: "transparent",
                  color: "#fff",
                }}
              >
                Clear draft
              </button>
            </div>
          </section>
        </>
      )}

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Last execution</h2>
        {!lastExecution ? (
          <p style={{ color: "#a1a1aa" }}>Nothing submitted from this browser session yet.</p>
        ) : (
          <>
            <p>
              Digest: <code>{lastExecution.digest}</code>
            </p>
            <p>Submitted at: {formatTimestamp(lastExecution.timestampMs)}</p>
            {!!lastExecution.createdObjectIds.length && (() => {
              const typed = Object.entries(lastExecution.createdByType).filter(([t]) => t !== "unknown");
              const untyped = lastExecution.createdByType["unknown"] ?? [];
              return (
                <>
                  <p style={{ color: "#a1a1aa" }}>Created {lastExecution.createdObjectIds.length} object(s):</p>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {typed.map(([type, objectIds]) => (
                      <li key={type}>
                        <code>{type.split("::").pop()}</code>: {objectIds.map((id) => shortenId(id, 12)).join(", ")}
                      </li>
                    ))}
                    {untyped.map((id) => (
                      <li key={id}><code>{shortenId(id, 16)}</code></li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </>
        )}
      </section>
    </div>
  );
}
