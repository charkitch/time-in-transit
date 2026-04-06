import { useEffect, useState, useRef } from 'react';
import { useGameState } from '../../game/GameState';
import { POLITICAL_DESCRIPTIONS, POLITICAL_TYPE_DISPLAY, ECONOMY_DESCRIPTIONS } from '../../game/constants';
import styles from './LandingDialog.module.css';

interface LandingDialogProps {
  onChoice: (choiceId: string) => void;
}

export function LandingDialog({ onChoice }: LandingDialogProps) {
  const pendingGameEvent = useGameState(s => s.pendingGameEvent);
  const galaxyYear = useGameState(s => s.galaxyYear);
  const player = useGameState(s => s.player);
  const cluster = useGameState(s => s.cluster);
  const currentSystemId = useGameState(s => s.currentSystemId);

  const [confirmed, setConfirmed] = useState(false);
  const [isPoliticsTooltipOpen, setIsPoliticsTooltipOpen] = useState(false);
  const [isEconTooltipOpen, setIsEconTooltipOpen] = useState(false);
  const politicsTooltipRef = useRef<HTMLSpanElement>(null);
  const econTooltipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setConfirmed(false);
  }, [
    pendingGameEvent?.event?.id,
    pendingGameEvent?.event?.narrativeLines.join('|'),
  ]);

  useEffect(() => {
    if (!isPoliticsTooltipOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (politicsTooltipRef.current && !politicsTooltipRef.current.contains(e.target as Node))
        setIsPoliticsTooltipOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsPoliticsTooltipOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [isPoliticsTooltipOpen]);

  useEffect(() => {
    if (!isEconTooltipOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (econTooltipRef.current && !econTooltipRef.current.contains(e.target as Node))
        setIsEconTooltipOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsEconTooltipOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [isEconTooltipOpen]);

  if (!pendingGameEvent) return null;

  const { civState, event, yearsSinceLastVisit, landingSiteLabel, landingHostLabel } = pendingGameEvent;
  const currentSystemTechLevel = cluster[currentSystemId]?.techLevel ?? 0;

  const handleChoice = (choiceId: string) => {
    if (confirmed) return;
    setConfirmed(true);
    onChoice(choiceId);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {/* Header: year and system name */}
        <div className={styles.header}>
          <div className={styles.yearBadge}>
            YEAR {galaxyYear.toLocaleString()}
          </div>
          <div className={styles.systemLabel}>
            <span
              ref={politicsTooltipRef}
              className={styles.tooltipAnchor}
              onClick={() => setIsPoliticsTooltipOpen(!isPoliticsTooltipOpen)}
            >
              {(POLITICAL_TYPE_DISPLAY[civState.politics] ?? civState.politics).toUpperCase()}
              {POLITICAL_DESCRIPTIONS[civState.politics] && (
                <div className={`${styles.tooltipPopup} ${isPoliticsTooltipOpen ? styles.tooltipOpen : ''}`}>
                  <button
                    className={styles.tooltipClose}
                    onClick={(e) => { e.stopPropagation(); setIsPoliticsTooltipOpen(false); }}
                  >×</button>
                  {POLITICAL_DESCRIPTIONS[civState.politics].desc}
                </div>
              )}
            </span>
          </div>
        </div>

        {/* Return info */}
        {yearsSinceLastVisit !== null && (
          <div className={styles.returnInfo}>
            {yearsSinceLastVisit.toLocaleString()} YEARS SINCE LAST VISIT
          </div>
        )}

        {/* Civ state summary */}
        <div className={styles.civRow}>
          <span className={styles.civTag}>
            ECONOMY:{' '}
            <span
              ref={econTooltipRef}
              className={`${styles.civValue} ${styles.tooltipAnchor}`}
              onClick={() => setIsEconTooltipOpen(!isEconTooltipOpen)}
            >
              {civState.economy}
              {ECONOMY_DESCRIPTIONS[civState.economy] && (
                <div className={`${styles.tooltipPopup} ${isEconTooltipOpen ? styles.tooltipOpen : ''}`}>
                  <button
                    className={styles.tooltipClose}
                    onClick={(e) => { e.stopPropagation(); setIsEconTooltipOpen(false); }}
                  >×</button>
                  {ECONOMY_DESCRIPTIONS[civState.economy].desc}
                </div>
              )}
            </span>
          </span>
          {civState.bannedGoods.length > 0 && (
            <span className={styles.civTag}>
              PROHIBITED:{' '}
              <span className={styles.banned}>
                {civState.bannedGoods.join(', ')}
              </span>
            </span>
          )}
        </div>
        {landingSiteLabel && (
          <div className={styles.civRow}>
            <span className={styles.civTag}>
              SITE: <span className={styles.civValue}>{landingSiteLabel}</span>
            </span>
            {landingHostLabel && (
              <span className={styles.civTag}>
                HOST: <span className={styles.civValue}>{landingHostLabel}</span>
              </span>
            )}
          </div>
        )}

        {/* Event or default arrival */}
        {event ? (
          <>
            <div className={styles.eventTitle}>{event.title}</div>
            <div className={styles.narrative}>
              {event.narrativeLines.map((line, i) => (
                <p key={i} className={styles.narrativeLine}>{line}</p>
              ))}
            </div>

            <div className={styles.choices}>
              {event.choices.map(choice => {
                const lockedCredits =
                  choice.requiresCredits != null &&
                  player.credits < choice.requiresCredits;
                const lockedTech =
                  choice.requiresMinTech != null &&
                  currentSystemTechLevel < choice.requiresMinTech;
                const disabledReason = lockedCredits
                  ? `Requires CR ${choice.requiresCredits}`
                  : lockedTech
                    ? `Requires tech level ${choice.requiresMinTech}`
                    : undefined;

                return (
                  <button
                    key={choice.id}
                    className={styles.choiceBtn}
                    disabled={confirmed || lockedCredits || lockedTech}
                    onClick={() => handleChoice(choice.id)}
                    title={disabledReason}
                  >
                    <span className={styles.choiceLabel}>{choice.label}</span>
                    <span className={styles.choiceDesc}>{choice.description}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className={styles.eventTitle}>DOCKING CLEARANCE GRANTED</div>
            <div className={styles.narrative}>
              <p className={styles.narrativeLine}>
                The port authority processes your ancient registration without comment.
              </p>
              <p className={styles.narrativeLine}>
                Another century has passed. The docking clamps feel familiar.
              </p>
              <p className={styles.narrativeLine}>
                You are the only constant in a galaxy that never stops changing.
              </p>
            </div>
            <div className={styles.choices}>
              <button
                className={styles.choiceBtn}
                disabled={confirmed}
                onClick={() => handleChoice('proceed')}
              >
                <span className={styles.choiceLabel}>Proceed to station</span>
                <span className={styles.choiceDesc}>No effect</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
