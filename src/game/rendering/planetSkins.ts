import type { PRNG } from '../generation/prng';

export interface PlanetSkin {
  id: string;
  category: 'rocky' | 'gas' | 'moon';
  albedo: string;       // path under public/
  normal?: string;
  roughness?: string;
  ring?: string;        // ring albedo PNG with alpha
  license: string;
  source: string;
}

/**
 * Catalog of available planet skins.
 * Texture files live in public/assets/planets/<category>/.
 * Add entries here once texture files are downloaded (see ASSET_LICENSES.md).
 */
export const PLANET_SKINS: PlanetSkin[] = [
  // ── Rocky planets ─────────────────────────────────────────────────────────
  // {
  //   id: 'rocky_01',
  //   category: 'rocky',
  //   albedo: '/assets/planets/rocky/rocky_01_albedo.jpg',
  //   normal: '/assets/planets/rocky/rocky_01_normal.jpg',
  //   license: 'CC0',
  //   source: 'https://www.solarsystemscope.com/textures/',
  // },
  // {
  //   id: 'rocky_02',
  //   category: 'rocky',
  //   albedo: '/assets/planets/rocky/rocky_02_albedo.jpg',
  //   license: 'CC0',
  //   source: 'https://www.solarsystemscope.com/textures/',
  // },

  // ── Gas giants ────────────────────────────────────────────────────────────
  // {
  //   id: 'gas_01',
  //   category: 'gas',
  //   albedo: '/assets/planets/gas/gas_01_albedo.jpg',
  //   license: 'CC0',
  //   source: 'https://www.solarsystemscope.com/textures/',
  // },

  // ── Moons ─────────────────────────────────────────────────────────────────
  // {
  //   id: 'moon_01',
  //   category: 'moon',
  //   albedo: '/assets/planets/moon/moon_01_albedo.jpg',
  //   normal: '/assets/planets/moon/moon_01_normal.jpg',
  //   license: 'CC0',
  //   source: 'https://www.solarsystemscope.com/textures/',
  // },
];

/**
 * Deterministically pick a skin for the given category.
 * Returns null when no skins are available (falls back to solid color).
 */
export function selectSkin(category: 'rocky' | 'gas' | 'moon', rng: PRNG): PlanetSkin | null {
  const options = PLANET_SKINS.filter(s => s.category === category);
  if (options.length === 0) return null;
  return rng.pick(options);
}
