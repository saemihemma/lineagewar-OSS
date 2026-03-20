/** SVG coordinate helpers for the system map */

export interface MapViewport {
  width: number;
  height: number;
  padding: number;
}

/**
 * Convert normalized 0..1 coordinates to SVG pixel coordinates.
 * Applies padding so nodes don't clip at the edges.
 */
export function toSvgCoords(
  x: number,
  y: number,
  viewport: MapViewport,
): { cx: number; cy: number } {
  const usable = {
    w: viewport.width - viewport.padding * 2,
    h: viewport.height - viewport.padding * 2,
  };
  return {
    cx: viewport.padding + x * usable.w,
    cy: viewport.padding + y * usable.h,
  };
}

/**
 * Build an edge key from two system IDs (order-independent).
 */
export function edgeKey(a: string, b: string): string {
  return [a, b].sort().join("--");
}

/**
 * Derive unique edges from a list of systems with connectedTo arrays.
 */
export function buildEdges(
  systems: { id: string; connectedTo: string[] }[],
): { from: string; to: string; key: string }[] {
  const seen = new Set<string>();
  const edges: { from: string; to: string; key: string }[] = [];

  for (const sys of systems) {
    for (const toId of sys.connectedTo) {
      const key = edgeKey(sys.id, toId);
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from: sys.id, to: toId, key });
      }
    }
  }
  return edges;
}
