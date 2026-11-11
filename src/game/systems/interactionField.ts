import type {
  InteractionFieldData,
  InteractionProfile,
} from '../engine';

function wrap01(v: number): number {
  return ((v % 1) + 1) % 1;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function sampleNearest(field: InteractionFieldData, u: number, v: number): number {
  const w = Math.max(1, field.width | 0);
  const h = Math.max(1, field.height | 0);
  const uu = wrap01(u);
  const vv = clamp01(v);
  const x = Math.min(w - 1, Math.floor(uu * w));
  const y = Math.min(h - 1, Math.floor(vv * h));
  const idx = y * w + x;
  const value = field.values[idx] ?? 128;
  return Math.max(0, Math.min(255, value)) / 255;
}

type InteractionClass =
  | 'rocky_landable'
  | 'rocky_water'
  | 'gas_stable'
  | 'gas_volatile'
  | 'gas_storm'
  | 'shell_accessible'
  | 'shell_weathered'
  | 'shell_hazard'
  | 'topopolis_entrance'
  | 'topopolis_interior';

function classifyRocky(value: number): InteractionClass {
  return value >= 0.48 ? 'rocky_landable' : 'rocky_water';
}

function classifyGas(value: number): InteractionClass {
  if (value >= 0.74) return 'gas_storm';
  if (value >= 0.44) return 'gas_volatile';
  return 'gas_stable';
}

function classifyDyson(value: number): InteractionClass {
  if (value >= 0.70) return 'shell_hazard';
  if (value >= 0.42) return 'shell_weathered';
  return 'shell_accessible';
}

function classifyTopopolis(value: number): InteractionClass {
  if (value >= 0.55) return 'topopolis_interior';
  return 'topopolis_interior';
}

function classifyInteractionValue(
  profile: InteractionProfile,
  value: number,
): InteractionClass {
  switch (profile) {
    case 'rocky':
      return classifyRocky(value);
    case 'gas_giant':
      return classifyGas(value);
    case 'dyson_shell':
      return classifyDyson(value);
    case 'topopolis':
      return classifyTopopolis(value);
  }
}

export function sampleAndClassifyByUV(
  field: InteractionFieldData,
  u: number,
  v: number,
): { value: number; classification: InteractionClass } {
  const value = sampleNearest(field, u, v);
  return {
    value,
    classification: classifyInteractionValue(field.profile, value),
  };
}
