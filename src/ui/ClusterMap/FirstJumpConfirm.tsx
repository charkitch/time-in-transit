import styles from './FirstJumpConfirm.module.css';

interface FirstJumpConfirmProps {
  targetName: string;
  galaxyYears: number;
  shipYears: number;
  onDepart: () => void;
  onCancel: () => void;
}

export function FirstJumpConfirm({
  targetName,
  galaxyYears,
  shipYears,
  onDepart,
  onCancel,
}: FirstJumpConfirmProps) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.title}>FIRST DEPARTURE</div>
        <div className={styles.narrative}>
          <p className={styles.line}>
            {targetName.toUpperCase()} is {galaxyYears.toLocaleString()} years away at nearlight.
            Aboard, you will live {shipYears.toLocaleString()} of them.
          </p>
          <p className={styles.line}>
            The galaxy will not wait. Markets will turn over, factions will redraw their maps,
            and everyone you spoke to this morning will grow old.
          </p>
          <p className={styles.line}>There is no way back to now.</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            NOT YET
          </button>
          <button className={styles.departBtn} onClick={onDepart}>
            DEPART
          </button>
        </div>
      </div>
    </div>
  );
}
