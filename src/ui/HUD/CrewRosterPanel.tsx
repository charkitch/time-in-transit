import { useGameState } from '../../game/GameState';
import { CREW_DISPLAY } from '../../game/data/crew';
import styles from './HUD.module.css';

interface CrewRosterPanelProps {
  onClose: () => void;
}

export function CrewRosterPanel({ onClose }: CrewRosterPanelProps) {
  const crew = useGameState(s => s.crew);

  if (crew.length === 0) return null;

  return (
    <div className={styles.crewPanel}>
      <div className={styles.crewHeader}>
        <span>CREW</span>
        <button className={styles.closeButton} onClick={onClose}>×</button>
      </div>
      {crew.map(id => {
        const data = CREW_DISPLAY[id];
        if (!data) return null;
        return (
          <div key={id} className={styles.crewMember}>
            <div>
              <span className={styles.crewName}>{data.name.toUpperCase()}</span>
              <span className={styles.crewRole}> · {data.role}</span>
            </div>
            <div className={styles.crewBonus}>{data.bonus}</div>
          </div>
        );
      })}
    </div>
  );
}
