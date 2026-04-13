/** Canvas 2D drawing helpers for the system map. */

const CANVAS_W = 540;

export function drawTooltip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.font = '9px Courier New';
  const metrics = ctx.measureText(text);
  const padX = 5;
  const tipW = metrics.width + padX * 2;
  const tipH = 14;
  const tx = Math.max(1, Math.min(x - tipW / 2, CANVAS_W - tipW - 1));
  let ty = y - 18;
  if (ty < 1) ty = y + 12;

  ctx.fillStyle = 'rgba(4, 8, 16, 0.88)';
  ctx.fillRect(tx, ty, tipW, tipH);
  ctx.strokeStyle = 'rgba(51, 255, 136, 0.4)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(tx, ty, tipW, tipH);
  ctx.fillStyle = '#CCDDBB';
  ctx.fillText(text, tx + padX, ty + 11);
}

export function drawHighlight(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number,
  isTargeted: boolean, color: string,
): void {
  ctx.strokeStyle = isTargeted ? '#FFCC00' : color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawMagnetar(ctx: CanvasRenderingContext2D, cx: number, cy: number, starR: number): void {
  const halo = ctx.createRadialGradient(cx, cy, starR * 0.5, cx, cy, starR * 4.2);
  halo.addColorStop(0, 'rgba(180, 242, 255, 0.35)');
  halo.addColorStop(0.42, 'rgba(103, 216, 255, 0.18)');
  halo.addColorStop(1, 'rgba(103, 216, 255, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, starR * 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.42);

  ctx.strokeStyle = 'rgba(110, 226, 255, 0.4)';
  ctx.lineWidth = Math.max(3, starR * 0.5);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-starR * 5.2, -starR * 8.2);
  ctx.lineTo(-starR * 0.9, -starR * 1.3);
  ctx.moveTo(starR * 0.9, starR * 1.3);
  ctx.lineTo(starR * 5.2, starR * 8.2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(230, 250, 255, 0.92)';
  ctx.lineWidth = Math.max(1.5, starR * 0.22);
  ctx.beginPath();
  ctx.moveTo(-starR * 4.4, -starR * 7.0);
  ctx.lineTo(-starR * 0.7, -starR);
  ctx.moveTo(starR * 0.7, starR);
  ctx.lineTo(starR * 4.4, starR * 7.0);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 224, 248, 0.82)';
  ctx.lineWidth = Math.max(2, starR * 0.4);
  ctx.beginPath();
  ctx.ellipse(0, 0, starR * 2.4, starR * 0.92, 0.24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#020304';
  ctx.beginPath();
  ctx.arc(cx, cy, starR * 0.92, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d8f6ff';
  ctx.beginPath();
  ctx.arc(cx, cy, starR * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBlackHole(ctx: CanvasRenderingContext2D, cx: number, cy: number, starR: number): void {
  const halo = ctx.createRadialGradient(cx, cy, starR * 0.9, cx, cy, starR * 2.8);
  halo.addColorStop(0, 'rgba(255,170,110,0)');
  halo.addColorStop(0.35, 'rgba(255,170,110,0.38)');
  halo.addColorStop(0.62, 'rgba(255,110,54,0.16)');
  halo.addColorStop(1, 'rgba(255,110,54,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, starR * 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,214,170,0.88)';
  ctx.lineWidth = Math.max(2, starR * 0.4);
  ctx.beginPath();
  ctx.ellipse(cx + starR * 0.22, cy - starR * 0.08, starR * 1.6, starR * 1.08, -0.3, Math.PI * 0.1, Math.PI * 1.14);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,120,54,0.42)';
  ctx.lineWidth = Math.max(2, starR * 0.55);
  ctx.beginPath();
  ctx.ellipse(cx, cy, starR * 1.9, starR * 1.15, -0.3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#030303';
  ctx.beginPath();
  ctx.arc(cx, cy, starR, 0, Math.PI * 2);
  ctx.fill();
}

export function drawPlanetRings(
  ctx: CanvasRenderingContext2D, px: number, py: number, pR: number,
  ringCount: number, ringInclination: number,
): void {
  const RING_BAND_MULS: Record<number, [number, number][]> = {
    1: [[1.40, 2.20]],
    2: [[1.40, 1.85], [2.00, 2.60]],
    3: [[1.40, 1.70], [1.90, 2.22], [2.42, 2.80]],
  };
  const bands = RING_BAND_MULS[Math.max(1, Math.min(3, ringCount))] ?? RING_BAND_MULS[1];
  const incl = ringInclination;
  const baseMinorScale = 0.18 + Math.abs(Math.sin(incl)) * 0.5;
  const tiltAngle = 0.3 + incl * 0.4;

  for (const [innerMul, outerMul] of bands) {
    const outerA = pR * outerMul;
    const innerA = pR * innerMul;
    const outerB = outerA * baseMinorScale;
    const innerB = innerA * baseMinorScale;

    ctx.strokeStyle = 'rgba(170,187,204,0.55)';
    ctx.lineWidth = (outerA - innerA) * 0.5;
    ctx.beginPath();
    ctx.ellipse(px, py, (outerA + innerA) / 2, (outerB + innerB) / 2, tiltAngle, 0, Math.PI * 2);
    ctx.stroke();
  }
}
