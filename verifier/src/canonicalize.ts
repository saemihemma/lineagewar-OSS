function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, normalizeValue(nested)]);
    return Object.fromEntries(entries);
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}
