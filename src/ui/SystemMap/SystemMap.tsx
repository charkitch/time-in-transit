import { useRef, useEffect } from 'react';
import { useGameState } from '../../game/GameState';
import { STAR_COLORS } from '../../game/constants';
import * as THREE from 'three';
import styles from './SystemMap.module.css';

const W = 540;
const H = 400;

interface SystemMapProps {
  onClose: () => void;
}

export function SystemMap({ onClose }: SystemMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentSystem = useGameState(s => s.currentSystem);
  const currentSystemId = useGameState(s => s.currentSystemId);
  const cluster = useGameState(s => s.cluster);
  const starData = cluster[currentSystemId];
  const time = useGameState(s => s.time);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSystem) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#010206';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;

    // Find max orbit for scaling (include secret bases)
    const secretMaxOrbit = currentSystem.secretBases.length > 0
      ? Math.max(...currentSystem.secretBases.map(b => b.orbitRadius))
      : 0;
    const maxOrbit = Math.max(...currentSystem.planets.map(p => p.orbitRadius), secretMaxOrbit);
    const scale = (Math.min(W, H) * 0.45) / maxOrbit;

    // Star
    const starColor = '#' + new THREE.Color(STAR_COLORS[currentSystem.starType] ?? 0xFFEE88).getHexString();
    const starR = Math.max(6, currentSystem.starRadius * scale);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, starR * 2);
    grad.addColorStop(0, starColor);
    grad.addColorStop(0.5, starColor + '88');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, starR * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = starColor;
    ctx.beginPath();
    ctx.arc(cx, cy, starR, 0, Math.PI * 2);
    ctx.fill();

    for (const planet of currentSystem.planets) {
      const orbitPx = planet.orbitRadius * scale;

      // Orbit ring
      ctx.strokeStyle = 'rgba(51,255,136,0.15)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, orbitPx, 0, Math.PI * 2);
      ctx.stroke();

      // Planet position (animated by time)
      const angle = planet.orbitPhase + time * planet.orbitSpeed;
      const px = cx + Math.cos(angle) * orbitPx;
      const py = cy + Math.sin(angle) * orbitPx;

      const pColor = '#' + new THREE.Color(planet.color).getHexString();
      const pR = Math.max(3, planet.radius * scale * 0.5);
      ctx.fillStyle = pColor;
      ctx.beginPath();
      ctx.arc(px, py, pR, 0, Math.PI * 2);
      ctx.fill();

      // Station indicator
      if (planet.hasStation) {
        ctx.strokeStyle = '#44CCFF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, pR + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rings
      if (planet.hasRings) {
        ctx.strokeStyle = 'rgba(170,187,204,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(px, py, pR * 2.2, pR * 0.4, 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Name
      ctx.fillStyle = '#33FF88';
      ctx.font = '9px Courier New';
      ctx.fillText(planet.name, px + pR + 3, py + 3);
    }

    // Asteroid belt
    if (currentSystem.asteroidBelt) {
      const { innerRadius, outerRadius } = currentSystem.asteroidBelt;
      const ir = innerRadius * scale;
      const or = outerRadius * scale;
      const beltGrad = ctx.createRadialGradient(cx, cy, ir, cx, cy, or);
      beltGrad.addColorStop(0, 'rgba(136,136,119,0.0)');
      beltGrad.addColorStop(0.3, 'rgba(136,136,119,0.15)');
      beltGrad.addColorStop(1, 'rgba(136,136,119,0.0)');
      ctx.fillStyle = beltGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, or, 0, Math.PI * 2);
      ctx.arc(cx, cy, ir, 0, Math.PI * 2, true);
      ctx.fill();
    }
    // Secret bases
    for (const base of currentSystem.secretBases) {
      const orbitPx = base.orbitRadius * scale;

      // Faint orbit ring
      ctx.strokeStyle = 'rgba(136,68,255,0.08)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, orbitPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Base position
      const angle = base.orbitPhase + time * base.orbitSpeed;
      const bx = cx + Math.cos(angle) * orbitPx;
      const by = cy + Math.sin(angle) * orbitPx;

      // Draw base marker
      const baseColors: Record<string, string> = {
        asteroid: '#AA7744',
        oort_cloud: '#4488CC',
        maximum_space: '#8844FF',
      };
      const color = baseColors[base.type] ?? '#8844FF';

      // Diamond shape
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(bx, by - 4);
      ctx.lineTo(bx + 3, by);
      ctx.lineTo(bx, by + 4);
      ctx.lineTo(bx - 3, by);
      ctx.closePath();
      ctx.fill();

      // Glow ring
      ctx.strokeStyle = color + '66';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.stroke();

      // Name
      ctx.fillStyle = color;
      ctx.font = '8px Courier New';
      ctx.fillText(base.name, bx + 8, by + 3);
    }
  }, [currentSystem, time]);

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.panel}>
        <div className={styles.title}>{starData?.name.toUpperCase()} SYSTEM</div>
        <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
        <div className={styles.legend}>
          <span><span className={styles.dot} style={{ background: '#33FF88' }} />Planet</span>
          <span><span className={styles.dot} style={{ background: '#44CCFF', outline: '1px solid #44CCFF' }} />Station</span>
          <span><span className={styles.dot} style={{ background: '#888877' }} />Asteroids</span>
          {currentSystem && currentSystem.secretBases.length > 0 && (
            <span><span className={styles.dot} style={{ background: '#8844FF' }} />Secret Base</span>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose}>CLOSE [1]</button>
      </div>
    </div>
  );
}
