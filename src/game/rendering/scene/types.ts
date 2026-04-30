import * as THREE from 'three';

export interface CollisionSphere {
  center: THREE.Vector3;
  radius: number;
}

export interface CollisionRadialBounds {
  innerRadius: number;
  outerRadius: number;
  halfHeight: number;
}

export interface SceneEntity {
  id: string;
  name: string;
  group: THREE.Object3D;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  orbitInclination?: number;
  orbitNode?: number;
  shellCurveRadius?: number;
  shellArcWidth?: number;
  shellArcHeight?: number;
  parentId?: string;
  type: 'planet' | 'station' | 'star' | 'moon' | 'npc_ship' | 'fleet_ship' | 'dyson_shell' | 'topopolis' | 'landing_site' | 'asteroid';
  worldPos: THREE.Vector3;
  collisionRadius: number;
  interactionRadius?: number;
  collisionSampleRadius?: number;
  collisionSamplesLocal?: THREE.Vector3[];
  collisionSamplesWorld?: THREE.Vector3[];
  collisionSpheresLocal?: CollisionSphere[];
  collisionSpheresWorld?: CollisionSphere[];
  collisionSampleOnly?: boolean;
  collisionRadialBounds?: CollisionRadialBounds;
  tidalTargetId?: string;
  axialTilt?: number;
  stationSpinAxis?: THREE.Vector3;
  siteLabel?: string;
  siteClassification?: string;
  siteHostLabel?: string;
  siteHostId?: string;
  siteDiscovered?: boolean;
  /** Biome at this landing site's position (topopolis interior sites). */
  siteBiome?: string;
  /** Gate surface positions in local space — skip collision near these. */
  gateSurfaceLocal?: THREE.Vector3[];
  /** Gate surface positions in world space (updated each frame). */
  gateSurfaceWorld?: THREE.Vector3[];
  /** Arc-length position (0–1) along the host topopolis curve. */
  siteCurveT?: number;
  /** Set after first dock/land — revisits skip events and go straight to market. */
  visited?: boolean;
}

/** Body types that can be scanned for landing site intel. */
export const SCANNABLE_HOST_TYPES: ReadonlySet<SceneEntity['type']> = new Set([
  'planet', 'dyson_shell', 'topopolis',
]);

export function isScannableHost(type: SceneEntity['type']): type is 'planet' | 'dyson_shell' | 'topopolis' {
  return SCANNABLE_HOST_TYPES.has(type);
}

export interface XRayTransferStream {
  donorId: string;
  accretorId: string;
  curveBias: number;
  phase: number;
  flowSpeed: number;
  diskImpactRadius: number;
  curveBuffer: Float32Array;
  spine: THREE.Mesh;
  ribbon: THREE.Mesh;
  donorColor: THREE.Color;
  highlightColor: THREE.Color;
}
