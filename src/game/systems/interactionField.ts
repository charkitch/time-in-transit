import * as THREE from 'three';
import type {
  InteractionFieldData,
  InteractionProfile,
  InteractionTopology,
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

export function directionToSphereUV(direction: THREE.Vector3): { u: number; v: number } {
  const norm = direction.clone().normalize();
  const u = wrap01(Math.atan2(norm.z, norm.x) / (Math.PI * 2) + 0.5);
  const v = clamp01(Math.asin(THREE.MathUtils.clamp(norm.y, -1, 1)) / Math.PI + 0.5);
  return { u, v };
}

export function sampleInteractionFieldUV(
  field: InteractionFieldData,
  u: number,
  v: number,
): number {
  return sampleNearest(field, u, v);
}

export function sampleInteractionFieldSphere(
  field: InteractionFieldData,
  direction: THREE.Vector3,
): number {
  const { u, v } = directionToSphereUV(direction);
  return sampleNearest(field, u, v);
}

export type InteractionClass =
  | 'rocky_landable'
  | 'rocky_water'
  | 'gas_stable'
  | 'gas_volatile'
  | 'gas_storm'
  | 'shell_accessible'
  | 'shell_weathered'
  | 'shell_hazard';

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

export function classifyInteractionValue(
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
  }
}

export function sampleAndClassifyByUV(
  field: InteractionFieldData,
  u: number,
  v: number,
): { value: number; classification: InteractionClass } {
  const value = sampleInteractionFieldUV(field, u, v);
  return {
    value,
    classification: classifyInteractionValue(field.profile, value),
  };
}

export function sampleAndClassifyByDirection(
  field: InteractionFieldData,
  topology: InteractionTopology,
  direction: THREE.Vector3,
): { value: number; classification: InteractionClass } {
  const value = topology === 'sphere'
    ? sampleInteractionFieldSphere(field, direction)
    : sampleInteractionFieldUV(field, 0.5, 0.5);
  return {
    value,
    classification: classifyInteractionValue(field.profile, value),
  };
}
