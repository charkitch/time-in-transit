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
    const planetMaxOrbit = currentSystem.planets.length > 0
      ? Math.max(...currentSystem.planets.map(p => p.orbitRadius))
      : 0;
    const dysonMaxOrbit = currentSystem.dysonShells.length > 0
      ? Math.max(...currentSystem.dysonShells.map(s => s.orbitRadius))
      : 0;
    const maxOrbit = Math.max(planetMaxOrbit, dysonMaxOrbit, secretMaxOrbit, currentSystem.starRadius * 4);
    const scale = (Math.min(W, H) * 0.45) / maxOrbit;

    // Star
    const starColor = '#' + new THREE.Color(STAR_COLORS[currentSystem.starType] ?? 0xFFEE88).getHexString();
    const starR = Math.max(6, currentSystem.starRadius * scale);
    if (currentSystem.starType === 'BH') {
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
    } else {
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
    }

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

      // Rings — multiple bands with inclination-based tilt
      if (planet.hasRings) {
        const RING_BAND_MULS: Record<number, [number, number][]> = {
          1: [[1.40, 2.20]],
          2: [[1.40, 1.85], [2.00, 2.60]],
          3: [[1.40, 1.70], [1.90, 2.22], [2.42, 2.80]],
        };
        const bands = RING_BAND_MULS[Math.max(1, Math.min(3, planet.ringCount))] ?? RING_BAND_MULS[1];
        const incl = planet.ringInclination;
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

      // Name
      ctx.fillStyle = '#33FF88';
      ctx.font = '9px Courier New';
      ctx.fillText(planet.name, px + pR + 3, py + 3);
    }

    // Dyson shell segments — render as bright curved arcs.
    for (const shell of currentSystem.dysonShells) {
      const orbitPx = shell.orbitRadius * scale;
      const angle = shell.orbitPhase + time * shell.orbitSpeed;
      const arcAngle = Math.max(0.16, Math.min(0.55, shell.arcWidth / shell.curveRadius));
      const start = angle - arcAngle * 0.5;
      const end = angle + arcAngle * 0.5;

      const shellColor = '#' + new THREE.Color(shell.color).getHexString();

      ctx.strokeStyle = shellColor + '55';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(cx, cy, orbitPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = shellColor;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, orbitPx, start, end);
      ctx.stroke();
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
          {currentSystem && currentSystem.dysonShells.length > 0 && (
            <span><span className={styles.dot} style={{ background: '#B9C2CF' }} />Dyson Shell</span>
          )}
          {currentSystem && currentSystem.secretBases.length > 0 && (
            <span><span className={styles.dot} style={{ background: '#8844FF' }} />Secret Base</span>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose}>CLOSE [1]</button>
      </div>
    </div>
  );
}
