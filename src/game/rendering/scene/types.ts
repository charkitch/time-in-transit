import * as THREE from 'three';

export interface SceneEntity {
  id: string;
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
  type: 'planet' | 'station' | 'star' | 'moon' | 'npc_ship' | 'fleet_ship' | 'dyson_shell' | 'landing_site';
  worldPos: THREE.Vector3;
  collisionRadius: number;
  collisionSampleRadius?: number;
  collisionSamplesLocal?: THREE.Vector3[];
  collisionSamplesWorld?: THREE.Vector3[];
  tidalTargetId?: string;
  stationSpinAxis?: THREE.Vector3;
  siteLabel?: string;
  siteClassification?: string;
  siteHostLabel?: string;
  siteHostId?: string;
  siteDiscovered?: boolean;
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
