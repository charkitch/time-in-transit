import { useRef, useEffect } from 'react';
import { useGameState } from '../../game/GameState';
import type { SceneEntity } from '../../game/rendering/SceneRenderer';
import * as THREE from 'three';

interface Props {
  getEntities: () => Map<string, SceneEntity>;
  getCamera: () => THREE.PerspectiveCamera | null;
}

const COLOR = 'rgba(68, 204, 255, 0.85)';
const EDGE_MARGIN = 30;
const BRACKET_SIZE = 14;
const BRACKET_GAP = 12;

function drawBrackets(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const s = BRACKET_SIZE;
  const g = BRACKET_GAP;
  ctx.strokeStyle = COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // Top-left
  ctx.moveTo(x - g - s, y - g); ctx.lineTo(x - g, y - g); ctx.lineTo(x - g, y - g - s);
  // Top-right
  ctx.moveTo(x + g + s, y - g); ctx.lineTo(x + g, y - g); ctx.lineTo(x + g, y - g - s);
  // Bottom-left
  ctx.moveTo(x - g - s, y + g); ctx.lineTo(x - g, y + g); ctx.lineTo(x - g, y + g + s);
  // Bottom-right
  ctx.moveTo(x + g + s, y + g); ctx.lineTo(x + g, y + g); ctx.lineTo(x + g, y + g + s);
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  const s = 11;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = COLOR;
  ctx.beginPath();
  ctx.moveTo(s + 3, 0);
  ctx.lineTo(-s, -s * 0.6);
  ctx.lineTo(-s * 0.35, 0);
  ctx.lineTo(-s, s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function TargetIndicator({ getEntities, getCamera }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetId = useGameState(s => s.player.targetId);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.clearRect(0, 0, w, h);

      if (targetId) {
        const target = getEntities().get(targetId);
        const camera = getCamera();

        if (target && camera) {
          const ndc = target.worldPos.clone().project(camera);
          const isBehind = ndc.z >= 1;

          // Screen-space direction from center to projected point (y flipped)
          let dx = ndc.x;
          let dy = -ndc.y;
          if (isBehind) { dx = -dx; dy = -dy; }

          const onScreen = !isBehind && ndc.x > -0.95 && ndc.x < 0.95 && ndc.y > -0.95 && ndc.y < 0.95;

          if (onScreen) {
            const sx = (ndc.x + 1) / 2 * w;
            const sy = (1 - ndc.y) / 2 * h;
            drawBrackets(ctx, sx, sy);
          } else {
            const angle = Math.atan2(dy, dx);
            const hw = w / 2 - EDGE_MARGIN;
            const hh = h / 2 - EDGE_MARGIN;
            const absDx = Math.abs(dx) || 1e-6;
            const absDy = Math.abs(dy) || 1e-6;

            let ex: number, ey: number;
            if (absDx / hw > absDy / hh) {
              const sign = dx >= 0 ? 1 : -1;
              ex = w / 2 + sign * hw;
              ey = h / 2 + (dy / absDx) * hw;
            } else {
              const sign = dy >= 0 ? 1 : -1;
              ey = h / 2 + sign * hh;
              ex = w / 2 + (dx / absDy) * hh;
            }

            drawArrow(ctx, ex, ey, angle);
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [targetId, getEntities, getCamera]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
