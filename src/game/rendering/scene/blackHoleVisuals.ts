import * as THREE from 'three';
import { makeGlowSprite } from '../meshFactory';

interface BlackHoleVisualStyle {
  diskColor: string;
  midColor: string;
  hotColor: string;
  crescentColor: string;
  outerGlowColor: number;
  brightArcColor: number;
  outerGlowOpacity: number;
}

export interface XRayAccretorOptions {
  radius: number;
  accretorKind: 'black_hole' | 'neutron_star';
  donorColor: number;
  diskTintStrength?: number;
}

export interface MicroquasarJetOptions {
  radius: number;
  color?: number;
}

interface DiskPalette {
  hot: THREE.Color;
  inner: THREE.Color;
  mid: THREE.Color;
  outer: THREE.Color;
  crescent: THREE.Color;
}

function toRgba(color: THREE.Color, alpha: number): string {
  const r = Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255);
  const g = Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255);
  const b = Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255);
  return `rgba(${r},${g},${b},${alpha})`;
}

function createBlackHoleDiskTexture(style: BlackHoleVisualStyle): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outer = canvas.width * 0.46;
  const inner = canvas.width * 0.2;
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0.0, style.hotColor);
  grad.addColorStop(0.2, style.diskColor);
  grad.addColorStop(0.4, style.midColor);
  grad.addColorStop(0.66, style.crescentColor.replace('0.95', '0.24'));
  grad.addColorStop(1.0, style.crescentColor.replace('0.95', '0'));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
  ctx.fill();

  const crescent = ctx.createRadialGradient(cx + canvas.width * 0.11, cy - canvas.height * 0.06, canvas.width * 0.03, cx, cy, outer);
  crescent.addColorStop(0.0, style.crescentColor);
  crescent.addColorStop(0.24, style.diskColor.replace('0.92', '0.74'));
  crescent.addColorStop(0.56, style.midColor.replace('0.72', '0.14'));
  crescent.addColorStop(1.0, style.midColor.replace('0.72', '0'));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = crescent;
  ctx.beginPath();
  ctx.ellipse(cx + canvas.width * 0.06, cy - canvas.height * 0.04, canvas.width * 0.36, canvas.height * 0.22, -0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createDonorTintedDiskTexture(palette: DiskPalette): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const outer = canvas.width * 0.46;
  const inner = canvas.width * 0.2;
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0.0, toRgba(palette.hot, 0.98));
  grad.addColorStop(0.2, toRgba(palette.inner, 0.92));
  grad.addColorStop(0.42, toRgba(palette.mid, 0.78));
  grad.addColorStop(0.72, toRgba(palette.outer, 0.46));
  grad.addColorStop(1.0, toRgba(palette.outer, 0.0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
  ctx.fill();

  const crescent = ctx.createRadialGradient(
    cx + canvas.width * 0.11,
    cy - canvas.height * 0.06,
    canvas.width * 0.03,
    cx,
    cy,
    outer,
  );
  crescent.addColorStop(0.0, toRgba(palette.crescent, 0.95));
  crescent.addColorStop(0.22, toRgba(palette.inner, 0.74));
  crescent.addColorStop(0.58, toRgba(palette.mid, 0.18));
  crescent.addColorStop(1.0, toRgba(palette.mid, 0.0));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = crescent;
  ctx.beginPath();
  ctx.ellipse(
    cx + canvas.width * 0.06,
    cy - canvas.height * 0.04,
    canvas.width * 0.36,
    canvas.height * 0.22,
    -0.28,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createJetMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createMicroquasarJetGroup(options: MicroquasarJetOptions): THREE.Group {
  const { radius, color = 0x67D8FF } = options;
  const group = new THREE.Group();
  const jetColor = new THREE.Color(color);
  const brightJetColor = jetColor.clone().lerp(new THREE.Color(0xFFFFFF), 0.34).getHex();
  const lobeColor = jetColor.clone().lerp(new THREE.Color(0xD5F6FF), 0.5).getHex();

  const outerLength = radius * 34;
  const plumeLength = radius * 24;
  const coreLength = radius * 38;
  const baseOffset = radius * 1.05;

  const sheathMaterial = createJetMaterial(color, 0.18);
  const plumeMaterial = createJetMaterial(brightJetColor, 0.34);
  const coreMaterial = createJetMaterial(0xFFFFFF, 0.7);
  const shockMaterial = createJetMaterial(lobeColor, 0.46);

  const buildJet = (length: number, nearRadius: number, farRadius: number, material: THREE.Material, sign: number) => {
    const jet = new THREE.Mesh(
      new THREE.CylinderGeometry(farRadius, nearRadius, length, 18, 1, true),
      material,
    );
    jet.position.y = sign * (baseOffset + length / 2);
    if (sign < 0) jet.rotation.z = Math.PI;
    group.add(jet);
  };

  for (const sign of [1, -1]) {
    buildJet(outerLength, radius * 0.82, radius * 0.2, sheathMaterial, sign);
    buildJet(plumeLength, radius * 0.42, radius * 0.09, plumeMaterial, sign);
    buildJet(coreLength, radius * 0.16, radius * 0.03, coreMaterial, sign);

    const shockRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.18, radius * 0.07, 8, 48),
      shockMaterial,
    );
    shockRing.rotation.x = Math.PI / 2;
    shockRing.position.y = sign * (baseOffset + outerLength * 0.8);
    group.add(shockRing);

    const terminalLobe = makeGlowSprite(lobeColor, radius * 8.4);
    const terminalLobeMat = terminalLobe.material as THREE.SpriteMaterial;
    terminalLobeMat.opacity = 0.22;
    terminalLobe.position.y = sign * (baseOffset + outerLength + radius * 2.5);
    group.add(terminalLobe);
  }

  const throatGlow = makeGlowSprite(brightJetColor, radius * 5.8);
  const throatGlowMat = throatGlow.material as THREE.SpriteMaterial;
  throatGlowMat.opacity = 0.24;
  group.add(throatGlow);

  // Slight precession tilt keeps the jets visible against the disk plane.
  group.rotation.x = -0.2;
  group.rotation.z = 0.32;
  return group;
}

export function createBlackHoleGroup(radius: number, xRayMode = false): THREE.Group {
  const group = new THREE.Group();
  const style: BlackHoleVisualStyle = xRayMode
    ? {
      diskColor: 'rgba(255,214,248,0.92)',
      midColor: 'rgba(154,208,255,0.72)',
      hotColor: 'rgba(245,248,255,0.98)',
      crescentColor: 'rgba(255,255,255,0.95)',
      outerGlowColor: 0x8FD4FF,
      brightArcColor: 0xFEE0FF,
      outerGlowOpacity: 0.3,
    }
    : {
      diskColor: 'rgba(255,210,150,0.92)',
      midColor: 'rgba(255,144,72,0.72)',
      hotColor: 'rgba(255,250,235,0.98)',
      crescentColor: 'rgba(255,255,245,0.95)',
      outerGlowColor: 0xFF7A2E,
      brightArcColor: 0xFFF1CF,
      outerGlowOpacity: 0.24,
    };

  const disk = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.6, radius * 2.9, 96),
    new THREE.MeshBasicMaterial({
      map: createBlackHoleDiskTexture(style),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  disk.rotation.x = Math.PI / 2;
  disk.rotation.z = 0.45;
  disk.scale.set(1.2, 0.68, 1);
  group.add(disk);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.62, radius * 0.09, 10, 72),
    new THREE.MeshBasicMaterial({
      color: style.brightArcColor,
      transparent: true,
      opacity: xRayMode ? 0.5 : 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  innerRing.rotation.x = Math.PI / 2;
  innerRing.rotation.z = 0.54;
  innerRing.scale.set(1.08, 0.72, 1);
  group.add(innerRing);

  const outerGlow = makeGlowSprite(style.outerGlowColor, radius * (xRayMode ? 5.6 : 5.2));
  const outerGlowMat = outerGlow.material as THREE.SpriteMaterial;
  outerGlowMat.opacity = style.outerGlowOpacity;
  group.add(outerGlow);

  const brightArc = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.78, radius * 0.16, 10, 96, Math.PI * 1.12),
    new THREE.MeshBasicMaterial({
      color: style.brightArcColor,
      transparent: true,
      opacity: xRayMode ? 0.86 : 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  brightArc.rotation.x = Math.PI / 2;
  brightArc.rotation.z = 0.62;
  brightArc.position.x = radius * 0.16;
  brightArc.scale.set(1.06, 0.64, 1);
  group.add(brightArc);

  const shadowCore = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x020202 }),
  );
  group.add(shadowCore);

  const innerShadow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.08, 20, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
  );
  group.add(innerShadow);

  group.userData.blackHole = true;
  group.userData.disk = disk;
  group.userData.innerRing = innerRing;
  group.userData.brightArc = brightArc;
  return group;
}

export function createXRayAccretorGroup(options: XRayAccretorOptions): THREE.Group {
  const { radius, accretorKind, donorColor, diskTintStrength = 0.6 } = options;
  const tint = THREE.MathUtils.clamp(diskTintStrength, 0, 1);
  const diskInnerMul = 1.78;
  const diskOuterMul = 2.62;
  const donor = new THREE.Color(donorColor);
  const palette: DiskPalette = {
    hot: new THREE.Color(0xF3FAFF),
    inner: new THREE.Color(0xB9D9FF).lerp(donor, 0.12 + tint * 0.24),
    mid: new THREE.Color(0x8CC1FF).lerp(donor, 0.26 + tint * 0.4),
    outer: new THREE.Color(0x679DFF).lerp(donor, 0.42 + tint * 0.42),
    crescent: new THREE.Color(0xFFFFFF).lerp(donor, 0.14 + tint * 0.28),
  };
  const brightArcColor = palette.inner.clone().lerp(new THREE.Color(0xFFFFFF), 0.25).getHex();
  const outerGlowColor = palette.mid.clone().lerp(palette.outer, 0.35).getHex();

  const group = new THREE.Group();
  const disk = new THREE.Mesh(
    new THREE.RingGeometry(radius * diskInnerMul, radius * diskOuterMul, 96),
    new THREE.MeshBasicMaterial({
      map: createDonorTintedDiskTexture(palette),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  disk.rotation.x = Math.PI / 2;
  disk.rotation.z = 0.45;
  disk.scale.set(1.2, 0.68, 1);
  group.add(disk);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(radius * (diskInnerMul + 0.02), radius * 0.09, 10, 72),
    new THREE.MeshBasicMaterial({
      color: brightArcColor,
      transparent: true,
      opacity: 0.52,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  innerRing.rotation.x = Math.PI / 2;
  innerRing.rotation.z = 0.54;
  innerRing.scale.set(1.08, 0.72, 1);
  group.add(innerRing);

  const outerGlow = makeGlowSprite(outerGlowColor, radius * 5.0);
  const outerGlowMat = outerGlow.material as THREE.SpriteMaterial;
  outerGlowMat.opacity = accretorKind === 'neutron_star' ? 0.34 : 0.3;
  group.add(outerGlow);

  const brightArc = new THREE.Mesh(
    new THREE.TorusGeometry(radius * (diskInnerMul + 0.2), radius * 0.16, 10, 96),
    new THREE.MeshBasicMaterial({
      color: brightArcColor,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  brightArc.rotation.x = Math.PI / 2;
  brightArc.rotation.z = 0.62;
  brightArc.position.x = radius * 0.16;
  brightArc.scale.set(1.06, 0.64, 1);
  group.add(brightArc);

  const captureBand = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 1.98, radius * 0.09, 10, 112),
    new THREE.MeshBasicMaterial({
      color: palette.outer.clone().lerp(new THREE.Color(0xFFFFFF), 0.24).getHex(),
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  captureBand.rotation.x = Math.PI / 2;
  captureBand.rotation.z = 0.62;
  group.add(captureBand);

  if (accretorKind === 'black_hole') {
    const shadowCore = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x020202 }),
    );
    group.add(shadowCore);

    const innerShadow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.08, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      }),
    );
    group.add(innerShadow);
  } else {
    const nsCore = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.36, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xDFF1FF }),
    );
    group.add(nsCore);

    const nsInnerShell = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.56, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0xB7D8FF,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(nsInnerShell);

    const nsHalo = makeGlowSprite(0xCDE7FF, radius * 2.6);
    const nsHaloMat = nsHalo.material as THREE.SpriteMaterial;
    nsHaloMat.opacity = 0.28;
    group.add(nsHalo);
  }

  group.userData.blackHole = accretorKind === 'black_hole';
  group.userData.accretorKind = accretorKind;
  group.userData.disk = disk;
  group.userData.innerRing = innerRing;
  group.userData.brightArc = brightArc;
  group.userData.captureRadius = radius * 1.98;
  return group;
}
