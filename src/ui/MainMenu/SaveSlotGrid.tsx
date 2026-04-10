import { useCallback, useEffect, useRef, useState } from 'react';
import type { SlotMeta } from './saveSlots';
import { formatTimeAgo } from './saveSlots';
import styles from './SaveSlotGrid.module.css';

interface SaveSlotGridProps {
  mode: 'save' | 'load';
  slots: (SlotMeta | null)[];
  isSafari: boolean;
  onSlotClick: (index: number) => void;
  onBack: () => void;
}

export function SaveSlotGrid({ mode, slots, isSafari, onSlotClick, onBack }: SaveSlotGridProps) {
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const handleClick = useCallback((index: number) => {
    const slot = slots[index];

    // Load mode: empty slots are disabled
    if (mode === 'load' && !slot) return;

    // Save mode: occupied slots need overwrite confirmation
    if (mode === 'save' && slot) {
      if (confirmIndex === index) {
        // Second click — confirmed
        setConfirmIndex(null);
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        onSlotClick(index);
      } else {
        // First click — show confirm
        setConfirmIndex(index);
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        confirmTimer.current = setTimeout(() => setConfirmIndex(null), 2000);
      }
      return;
    }

    onSlotClick(index);
  }, [mode, slots, confirmIndex, onSlotClick]);

  return (
    <div className={styles.container}>
      <div className={styles.title}>
        {mode === 'save' ? 'SAVE GAME' : 'LOAD GAME'}
      </div>

      <div className={styles.slotList}>
        {slots.map((slot, i) => {
          const isEmpty = !slot;
          const disabled = mode === 'load' && isEmpty;
          const confirming = confirmIndex === i;

          return (
            <button
              key={i}
              className={`${styles.slot} ${disabled ? styles.slotDisabled : ''} ${confirming ? styles.slotConfirm : ''}`}
              onClick={() => handleClick(i)}
              disabled={disabled}
            >
              <span className={styles.slotIndex}>{i + 1}</span>
              {isEmpty ? (
                <span className={styles.slotEmpty}>-- EMPTY SLOT --</span>
              ) : confirming ? (
                <span className={styles.slotOverwrite}>OVERWRITE?</span>
              ) : (
                <span className={styles.slotInfo}>
                  <span className={styles.slotSystem}>{slot.systemName}</span>
                  <span className={styles.slotDetails}>
                    CR {slot.credits.toLocaleString()} · GY {slot.galaxyYear} · {slot.systemsVisited} systems · {formatTimeAgo(slot.savedAt)}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className={styles.disclaimer}>
        Saves are stored locally in your browser. Clearing browser data, hard cache reloads, or browser policies may erase them.
      </p>
      {isSafari && (
        <p className={styles.disclaimer}>
          Safari may delete saves after 7 days without visiting. Add this site to your home screen to prevent this.
        </p>
      )}

      <button className={styles.backBtn} onClick={onBack}>
        BACK
      </button>
    </div>
  );
}
