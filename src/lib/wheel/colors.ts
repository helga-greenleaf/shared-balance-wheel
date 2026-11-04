// Stable pastel sector colors, derived from the sphere's immutable id.
// Renaming, reordering, adding or removing other spheres never recolors a sphere.

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface SectorColor {
  /** Very light pastel fill shown at rest. */
  base: string;
  /** More saturated version of the same hue for the active sector. */
  active: string;
}

export function sectorColors(id: string): SectorColor {
  // Full-circle hue from the id hash: neighbouring sectors practically never match.
  const h = hashId(id) % 360;
  return {
    base: `hsl(${h} 70% 93%)`,
    active: `hsl(${h} 60% 82%)`,
  };
}
