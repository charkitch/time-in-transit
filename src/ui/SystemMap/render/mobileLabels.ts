import { W, H, type MobileLabel } from '../types';

export function drawMobileLabels(ctx: CanvasRenderingContext2D, labels: MobileLabel[]): void {
  const placed: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const sorted = [...labels].sort((a, b) => b.priority - a.priority);
  ctx.font = '10px Courier New';
  ctx.textBaseline = 'top';

  for (const label of sorted) {
    const text = label.text.trim();
    if (!text) continue;
    const metrics = ctx.measureText(text);
    const width = metrics.width;
    const left = Math.max(4, Math.min(W - width - 4, label.x + 8));
    const top = Math.max(4, Math.min(H - 14, label.y - 5));
    const bounds = {
      left: left - 2,
      top: top - 1,
      right: left + width + 2,
      bottom: top + 11,
    };
    const overlaps = placed.some(box =>
      !(bounds.right < box.left || bounds.left > box.right || bounds.bottom < box.top || bounds.top > box.bottom),
    );
    if (overlaps) continue;

    ctx.fillStyle = 'rgba(1, 4, 8, 0.76)';
    ctx.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.fillStyle = label.color;
    ctx.fillText(text, left, top);
    placed.push(bounds);
  }
}
