import * as THREE from 'three';
import { PALETTE } from '../constants';

/** Creates a group with filled mesh + wireframe overlay */
export function makeWireframeObject(
  geo: THREE.BufferGeometry,
  fillColor: number,
  wireColor: number = PALETTE.wireframe,
  wireOpacity = 0.6,
): THREE.Group {
  const group = new THREE.Group();

  const fillMat = new THREE.MeshLambertMaterial({ color: fillColor });
  const fillMesh = new THREE.Mesh(geo, fillMat);
  group.add(fillMesh);

  const edgesGeo = new THREE.EdgesGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({
    color: wireColor,
    transparent: true,
    opacity: wireOpacity,
  });
  const wireframe = new THREE.LineSegments(edgesGeo, wireMat);
  group.add(wireframe);

  return group;
}

/** Icosahedron planet */
export function makePlanet(radius: number, color: number, detail: number = 1): THREE.Group {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  return makeWireframeObject(geo, color, PALETTE.wireframe);
}

/** Gas giant with vertex color banding */
export function makeGasGiant(radius: number, baseColor: number, rng: () => number): THREE.Group {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const colors: number[] = [];
  const color = new THREE.Color(baseColor);
  const positions = geo.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const band = Math.sin(y * 0.05 + rng() * 2) * 0.5 + 0.5;
    const c = color.clone().lerp(new THREE.Color(0xFFFFFF), band * 0.3);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const group = new THREE.Group();
  const fillMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  group.add(new THREE.Mesh(geo, fillMat));

  const edgesGeo = new THREE.EdgesGeometry(geo);
  const wireMat = new THREE.LineBasicMaterial({ color: PALETTE.wireframe, transparent: true, opacity: 0.4 });
  group.add(new THREE.LineSegments(edgesGeo, wireMat));

  return group;
}

/** Coriolis-style space station: ring of box segments */
export function makeStation(size = 60): THREE.Group {
  const group = new THREE.Group();
  const segCount = 12;
  const ringRadius = size;
  const segW = size * 0.35;
  const segH = size * 0.12;
  const segD = size * 0.15;

  for (let i = 0; i < segCount; i++) {
    const angle = (i / segCount) * Math.PI * 2;
    const geo = new THREE.BoxGeometry(segW, segH, segD);
    const seg = makeWireframeObject(geo, 0x223344, PALETTE.stationWire, 0.8);
    seg.position.set(
      Math.cos(angle) * ringRadius,
      Math.sin(angle) * ringRadius,
      0,
    );
    seg.rotation.z = angle;
    group.add(seg);
  }

  // Central hub
  const hubGeo = new THREE.CylinderGeometry(size * 0.15, size * 0.15, size * 0.3, 8);
  const hub = makeWireframeObject(hubGeo, 0x112233, PALETTE.stationWire, 0.9);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);

  return group;
}

/** Glow sprite (additive blend) */
export function makeGlowSprite(color: number, size: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const c = new THREE.Color(color);
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);

  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0,   `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  return sprite;
}

/** Instanced asteroid field */
export function makeAsteroidBelt(
  innerRadius: number,
  outerRadius: number,
  count: number,
  rng: () => number,
): THREE.InstancedMesh {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x888877 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const r = innerRadius + rng() * (outerRadius - innerRadius);
    const y = (rng() - 0.5) * 200;
    const scale = 8 + rng() * 25;
    dummy.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
    dummy.rotation.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** NPC trade ship — small wireframe cone, nose pointing forward (-Z) */
export function makeNPCShipMesh(color: number = 0x44CCFF): THREE.Group {
  const geo = new THREE.ConeGeometry(8, 24, 4);
  geo.rotateX(Math.PI / 2);
  return makeWireframeObject(geo, color, color, 0.8);
}

/** Fleet battle ship — variable-scale wireframe. Capital ships use elongated box. */
export function makeFleetShipMesh(color: number, scale: number): THREE.Group {
  let geo: THREE.BufferGeometry;
  if (scale > 1.5) {
    // Capital ship: elongated box
    geo = new THREE.BoxGeometry(6 * scale, 4 * scale, 20 * scale);
  } else {
    // Fighter: cone like NPC ships
    geo = new THREE.ConeGeometry(8 * scale, 24 * scale, 4);
    geo.rotateX(Math.PI / 2);
  }
  return makeWireframeObject(geo, color, color, 0.8);
}

/** Secret asteroid base — small, angular, hidden among rocks */
export function makeAsteroidBase(size = 35): THREE.Group {
  const group = new THREE.Group();
  // Irregular main hull — dodecahedron for a rocky, carved-out look
  const hullGeo = new THREE.DodecahedronGeometry(size, 0);
  const hull = makeWireframeObject(hullGeo, 0x554433, 0xAA7744, 0.5);
  group.add(hull);

  // Docking arm — thin cylinder sticking out
  const armGeo = new THREE.CylinderGeometry(size * 0.06, size * 0.06, size * 1.2, 6);
  const arm = makeWireframeObject(armGeo, 0x665544, 0xBB8855, 0.6);
  arm.rotation.z = Math.PI / 4;
  arm.position.set(size * 0.4, size * 0.4, 0);
  group.add(arm);

  // Dim amber light
  const light = new THREE.PointLight(0xAA7744, 0.4, size * 8);
  group.add(light);

  return group;
}

/** Secret Oort cloud base — cold, distant, icy blue */
export function makeOortCloudBase(size = 45): THREE.Group {
  const group = new THREE.Group();

  // Main structure: octahedron — crystalline, cold
  const coreGeo = new THREE.OctahedronGeometry(size, 0);
  const core = makeWireframeObject(coreGeo, 0x112244, 0x4488CC, 0.7);
  group.add(core);

  // Ring of ice shards — small tetrahedra orbiting
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const shardGeo = new THREE.TetrahedronGeometry(size * 0.2, 0);
    const shard = makeWireframeObject(shardGeo, 0x224466, 0x66AADD, 0.4);
    shard.position.set(
      Math.cos(angle) * size * 1.5,
      (i % 2 === 0 ? 1 : -1) * size * 0.3,
      Math.sin(angle) * size * 1.5,
    );
    shard.rotation.set(angle, angle * 0.7, 0);
    group.add(shard);
  }

  // Cold blue glow
  const glow = makeGlowSprite(0x4488CC, size * 4);
  group.add(glow);
  const light = new THREE.PointLight(0x4488CC, 0.6, size * 12);
  group.add(light);

  return group;
}

/** Maximum space base — at the edge of the void, eerie purple-black */
export function makeMaximumSpaceBase(size = 55): THREE.Group {
  const group = new THREE.Group();

  // Central monolith — tall, thin box
  const monolithGeo = new THREE.BoxGeometry(size * 0.3, size * 2, size * 0.3);
  const monolith = makeWireframeObject(monolithGeo, 0x0A0A1A, 0x8844FF, 0.9);
  group.add(monolith);

  // Surrounding ring structure — broken/incomplete, ancient
  const segCount = 8;
  const ringRadius = size * 1.8;
  for (let i = 0; i < segCount; i++) {
    // Skip some segments for a broken look
    if (i === 2 || i === 5) continue;
    const angle = (i / segCount) * Math.PI * 2;
    const segGeo = new THREE.BoxGeometry(size * 0.25, size * 0.08, size * 0.12);
    const seg = makeWireframeObject(segGeo, 0x110022, 0xAA66FF, 0.6);
    seg.position.set(
      Math.cos(angle) * ringRadius,
      Math.sin(angle * 3) * size * 0.3,
      Math.sin(angle) * ringRadius,
    );
    seg.rotation.y = -angle;
    group.add(seg);
  }

  // Void glow — deep purple, pulsing feel
  const glow = makeGlowSprite(0x6622CC, size * 6);
  group.add(glow);
  const light = new THREE.PointLight(0x8844FF, 0.8, size * 15);
  group.add(light);

  return group;
}

/** Planetary ring */
export function makeRingMesh(innerR: number, outerR: number): THREE.Mesh {
  const geo = new THREE.RingGeometry(innerR, outerR, 64);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xAABBCC,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}
