import { useGameState } from '../game/GameState';
import styles from './DeathScreen.module.css';

export function DeathScreen({ autosaveUnavailable, onLoadAutosave, onLoadSave, onNewGame }: {
  autosaveUnavailable: boolean;
  onLoadAutosave: () => void;
  onLoadSave: () => void;
  onNewGame: () => void;
}) {
  const deathMessage = useGameState(s => s.ui.deathMessage);

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.heading}>SHIP DESTROYED</div>
        <div className={styles.body}>
          {deathMessage?.length ? (
            deathMessage.map((line, i) => (
              <span key={i}>
                {line}
                <br />
              </span>
            ))
          ) : (
            <>
              Hull integrity failed. Emergency beacon triggered.<br />
              No wreckage recovered.<br />
            </>
          )}
        </div>
        <div className={styles.actions}>
          <button
            onClick={onLoadAutosave}
            disabled={autosaveUnavailable}
            className={autosaveUnavailable ? styles.btnPrimaryDisabled : styles.btnPrimary}
          >
            {autosaveUnavailable ? 'NO AUTOSAVE' : 'LOAD AUTOSAVE'}
          </button>
          <button onClick={onLoadSave} className={styles.btnSecondary}>
            LOAD SAVE
          </button>
          <button onClick={onNewGame} className={styles.btnTertiary}>
            NEW GAME
          </button>
        </div>
      </div>
    </div>
  );
}
