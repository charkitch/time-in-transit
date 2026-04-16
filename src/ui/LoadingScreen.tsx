import styles from './LoadingScreen.module.css';

export function LoadingScreen() {
  return (
    <div className={styles.overlay}>
      <div className={styles.title}>INITIALIZING</div>
      <div className={styles.barTrack}>
        <div className={styles.barFill} />
      </div>
      <div className={styles.subtitle}>GENERATING STAR SYSTEM</div>
    </div>
  );
}
