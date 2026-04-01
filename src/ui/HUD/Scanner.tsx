import { useRef, useEffect } from 'react';
import { useGameState } from '../../game/GameState';
import type { SceneEntity } from '../../game/rendering/SceneRenderer';
import styles from './Scanner.module.css';

const SIZE = 128;
const SCAN_RADIUS = 5000;

interface ScannerProps {
  getEntities: () => Map<string, SceneEntity>;
}

export function Scanner({ getEntities }: ScannerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useGameState(s => s.player);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.fill();

      // Grid circles
      ctx.strokeStyle = 'rgba(51,255,136,0.2)';
      ctx.lineWidth = 0.5;
      for (const r of [SIZE * 0.25, SIZE * 0.5 - 2]) {
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Cross
      ctx.beginPath();
      ctx.moveTo(SIZE / 2, 2); ctx.lineTo(SIZE / 2, SIZE - 2);
      ctx.moveTo(2, SIZE / 2); ctx.lineTo(SIZE - 2, SIZE / 2);
      ctx.stroke();

      const entities = getEntities();
      const px = player.position.x;
      const pz = player.position.z;

      const now = Date.now();

      for (const [id, entity] of entities) {
        const ex = entity.worldPos.x;
        const ez = entity.worldPos.z;
        const ey = entity.worldPos.y;
        const dx = ex - px;
        const dz = ez - pz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > SCAN_RADIUS) continue;

        const sx = SIZE / 2 + (dx / SCAN_RADIUS) * (SIZE / 2 - 4);
        const sy = SIZE / 2 + (dz / SCAN_RADIUS) * (SIZE / 2 - 4);

        const isSecretBase = id.includes('-secret-');

        // Color by type
        if (isSecretBase) {
          // Pulsing signal — blinks between bright and dim
          const pulse = Math.sin(now * 0.006 + id.length * 2) * 0.5 + 0.5;
          const alpha = 0.4 + pulse * 0.6;
          if (id.includes('-secret-asteroid')) {
            ctx.fillStyle = `rgba(170,119,68,${alpha})`;
          } else if (id.includes('-secret-oort')) {
            ctx.fillStyle = `rgba(68,136,204,${alpha})`;
          } else {
            ctx.fillStyle = `rgba(136,68,255,${alpha})`;
          }
        } else if (entity.type === 'star') {
          ctx.fillStyle = '#FFEE88';
        } else if (entity.type === 'station') {
          ctx.fillStyle = '#44CCFF';
        } else if (entity.type === 'dyson_shell') {
          ctx.fillStyle = '#B9C2CF';
        } else {
          ctx.fillStyle = '#33FF88';
        }

        const dotSize = entity.type === 'star'
          ? 4
          : isSecretBase
            ? 2
            : entity.type === 'station'
              ? 3
              : entity.type === 'dyson_shell'
                ? 2.5
                : 2;
        ctx.beginPath();
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing ring for secret bases
        if (isSecretBase) {
          const ringPulse = Math.sin(now * 0.004) * 0.3 + 0.3;
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 0.5;
          ctx.globalAlpha = ringPulse;
          ctx.beginPath();
          ctx.arc(sx, sy, 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Y offset indicator
        if (Math.abs(ey) > 100) {
          ctx.strokeStyle = ctx.fillStyle;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, sy - (ey / SCAN_RADIUS) * 20);
          ctx.stroke();
        }
      }

      // Player dot (center)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const id = setInterval(draw, 100);
    return () => clearInterval(id);
  }, [player, getEntities]);

  return (
    <div>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className={styles.scanner} />
      <div className={styles.label}>SCANNER</div>
    </div>
  );
}
