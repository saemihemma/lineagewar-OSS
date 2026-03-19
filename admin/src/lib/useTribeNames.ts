import { WORLD_API_BASE_URL } from "./constants";

export async function fetchTribeName(tribeId: number): Promise<string | null> {
  if (!WORLD_API_BASE_URL) return null;
  try {
    const url = `${WORLD_API_BASE_URL.replace(/\/$/, "")}/v2/tribes/${tribeId}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as Record<string, unknown>;
    return typeof payload.name === "string" ? payload.name.trim() : null;
  } catch {
    return null;
  }
}
