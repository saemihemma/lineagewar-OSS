import { createHash } from "node:crypto";
import { stableStringify } from "./canonicalize.js";

export function hashCanonicalSnapshot(value: unknown): string {
  const canonical = stableStringify(value);
  const digest = createHash("sha256").update(canonical).digest("hex");
  return `0x${digest}`;
}
