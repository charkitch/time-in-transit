import { useState } from 'react';
import styles from './MainMenu.module.css';

interface MainMenuProps {
  onNewGame: () => void;
  onResume: () => void;
}

export function MainMenu({ onNewGame, onResume }: MainMenuProps) {
  const [view, setView] = useState<'main' | 'controls'>('main');

  if (view === 'controls') {
    return (
      <div className={styles.overlay}>
        <div className={styles.panel}>
          <div className={styles.header}>
            <div className={styles.title}>CONTROLS</div>
          </div>
          <div className={styles.controlsList}>
            <div className={styles.controlRow}>
              <span className={styles.key}>W / S</span>
              <span className={styles.action}>PITCH UP / DOWN</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>A / D</span>
              <span className={styles.action}>ROLL LEFT / RIGHT</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>Q / E</span>
              <span className={styles.action}>YAW LEFT / RIGHT</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>SPACE</span>
              <span className={styles.action}>THRUST</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>SHIFT</span>
              <span className={styles.action}>BOOST</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>TAB</span>
              <span className={styles.action}>CYCLE TARGET</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>F</span>
              <span className={styles.action}>DOCK / LAND</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>G</span>
              <span className={styles.action}>CLUSTER MAP</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>1</span>
              <span className={styles.action}>SYSTEM MAP</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>J</span>
              <span className={styles.action}>HYPERSPACE JUMP</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>H</span>
              <span className={styles.action}>HAIL / COMMUNICATE</span>
            </div>
            <div className={styles.controlRow}>
              <span className={styles.key}>ESC</span>
              <span className={styles.action}>MENU / BACK</span>
            </div>
          </div>
          <button className={styles.menuBtn} onClick={() => setView('main')}>
            BACK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>THE YEARS BETWEEN THE STARS</div>
        </div>
        <div className={styles.menuOptions}>
          <button className={styles.menuBtn} onClick={onResume}>
            RESUME
          </button>
          <button className={styles.menuBtn} onClick={() => setView('controls')}>
            CONTROLS
          </button>
          <button className={styles.menuBtn} onClick={onNewGame}>
            NEW GAME
          </button>
        </div>
      </div>
    </div>
  );
}
