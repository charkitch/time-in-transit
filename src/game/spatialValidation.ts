export type Vec3 = { x: number; y: number; z: number };
export type Quat = { x: number; y: number; z: number; w: number };

export function isFiniteVec3(vec: Vec3 | null | undefined): vec is Vec3 {
  return !!vec && Number.isFinite(vec.x) && Number.isFinite(vec.y) && Number.isFinite(vec.z);
}

export function isFiniteQuat(quat: Quat | null | undefined): quat is Quat {
  return !!quat && Number.isFinite(quat.x) && Number.isFinite(quat.y) && Number.isFinite(quat.z) && Number.isFinite(quat.w);
}

export function isOriginVec3(vec: Vec3): boolean {
  return vec.x === 0 && vec.y === 0 && vec.z === 0;
}
