import { useGameState } from '../../game/GameState';
import { HYPERSPACE } from '../../game/constants';

export function StatusBars() {
  const player = useGameState(s => s.player);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
      <Bar label="SHIELDS" value={player.shields} max={100} color="var(--color-hud)" />
      <Bar label="FUEL" value={player.fuel} max={HYPERSPACE.tankSize} color="var(--color-station)" />
      <Bar label="HEAT" value={player.heat} max={100} color={player.heat > 70 ? 'var(--color-danger)' : 'var(--color-warning)'} />
      <div style={{ fontSize: '11px', color: 'var(--color-hud)', marginTop: '4px' }}>
        SPD: {Math.round(player.speed).toString().padStart(4)} wu/s
      </div>
    </div>
  );
}

export function MobileStatusBars() {
  const player = useGameState(s => s.player);
  const heatColor = player.heat > 70 ? 'var(--color-danger)' : 'var(--color-warning)';

  return (
    <div style={{
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
    }}>
      <ThinBar label="SH" value={player.shields} max={100} color="var(--color-hud)" />
      <ThinBar label="FU" value={player.fuel} max={HYPERSPACE.tankSize} color="var(--color-station)" />
      <ThinBar label="HT" value={player.heat} max={100} color={heatColor} />
      <span style={{ fontSize: '9px', color: 'var(--color-hud)', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
        {Math.round(player.speed)} wu/s
      </span>
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div style={{ fontSize: '10px', marginBottom: '2px', opacity: 0.7, letterSpacing: '1px' }}>{label}</div>
      <div style={{
        width: '180px',
        height: '8px',
        border: '1px solid rgba(51,255,136,0.3)',
        background: 'rgba(0,0,0,0.5)',
        position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          transition: 'width 0.1s',
        }} />
      </div>
    </div>
  );
}

function ThinBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      <span style={{ fontSize: '8px', opacity: 0.6, letterSpacing: '1px', width: '14px' }}>{label}</span>
      <div style={{
        width: '64px',
        height: '4px',
        border: '1px solid rgba(51,255,136,0.25)',
        background: 'rgba(0,0,0,0.5)',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          transition: 'width 0.1s',
        }} />
      </div>
    </div>
  );
}
