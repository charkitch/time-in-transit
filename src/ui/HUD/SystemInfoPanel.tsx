import type { StarSystemData } from '../../game/engine';
import type { SystemPayload } from '../../game/engine';
import type { Faction } from '../../game/data/factions';
import { STAR_TYPE_DISPLAY, STAR_DESCRIPTIONS, ECONOMY_DESCRIPTIONS, POLITICAL_DESCRIPTIONS, POLITICAL_TYPE_DISPLAY } from '../../game/constants';
import { useClickAwayTooltip } from '../hooks/useClickAwayTooltip';
import styles from './HUD.module.css';

interface SystemInfoPanelProps {
  currentStar: StarSystemData | undefined;
  currentSystemPayload: SystemPayload | null;
  galaxyYear: number;
  targetStar: StarSystemData | null;
  currentFaction: Faction | undefined;
  currentFactionKnown: boolean;
  credits: number;
  isMobileHUD: boolean;
  crewCount: number;
  onClusterMap: () => void;
  onSystemMap: () => void;
  onControls: () => void;
  onCrewRoster: () => void;
}

export function SystemInfoPanel({
  currentStar,
  currentSystemPayload,
  galaxyYear,
  targetStar,
  currentFaction,
  currentFactionKnown,
  credits,
  isMobileHUD,
  crewCount,
  onClusterMap,
  onSystemMap,
  onControls,
  onCrewRoster,
}: SystemInfoPanelProps) {
  const starTooltip = useClickAwayTooltip();
  const econTooltip = useClickAwayTooltip();
  const politicsTooltip = useClickAwayTooltip();
  const econKey = currentSystemPayload?.civState.economy ?? currentStar?.economy;
  const politicsKey = currentSystemPayload?.civState.politics;
  const econDesc = econKey ? ECONOMY_DESCRIPTIONS[econKey] : undefined;

  return (
    <div className={styles.topLeft}>
      <div className={styles.credits}>CR {credits.toLocaleString()}</div>
      <div className={styles.yearLabel}>YEAR {galaxyYear.toLocaleString()}</div>
      <div className={styles.systemInfo}>
        <span className={styles.systemInfoText}>
          {currentStar?.name} · </span><span
          ref={starTooltip.ref}
          className={`${styles.starType} ${starTooltip.isOpen ? styles.active : ''}`}
          onClick={() => starTooltip.setIsOpen(!starTooltip.isOpen)}
        >
          {(currentStar && STAR_TYPE_DISPLAY[currentStar.starType]) ?? `${currentStar?.starType}-TYPE`}
          {currentStar && STAR_DESCRIPTIONS[currentStar.starType] && (
            <div className={`${styles.tooltip} ${starTooltip.isOpen ? styles.tooltipOpen : ''}`}>
              <button
                className={styles.closeButton}
                onClick={(e) => {
                  e.stopPropagation();
                  starTooltip.setIsOpen(false);
                }}
              >
                ×
              </button>
              {STAR_DESCRIPTIONS[currentStar.starType].desc}
              <a
                href={STAR_DESCRIPTIONS[currentStar.starType].wiki}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.wikiLink}
                onClick={(e) => e.stopPropagation()}
              >
                LEARN MORE ON WIKIPEDIA
              </a>
            </div>
          )}
        </span>{currentSystemPayload && (
          <span
            className={styles.factionTag}
            style={{
              color: currentFactionKnown && currentFaction
                ? `#${currentFaction.color.toString(16).padStart(6, '0')}`
                : 'var(--color-hud-dim)',
            }}
          >
            {' · '}{currentFactionKnown && currentFaction ? currentFaction.name.toUpperCase() : 'UNKNOWN'}
          </span>
        )}
      </div>
      {(politicsKey || econKey) && (
        <div className={styles.systemInfo}>
          {politicsKey && (
            <span
              ref={politicsTooltip.ref}
              className={`${styles.starType} ${politicsTooltip.isOpen ? styles.active : ''}`}
              onClick={() => politicsTooltip.setIsOpen(!politicsTooltip.isOpen)}
            >
              {POLITICAL_TYPE_DISPLAY[politicsKey] ?? politicsKey}
              {POLITICAL_DESCRIPTIONS[politicsKey] && (
                <div className={`${styles.tooltip} ${politicsTooltip.isOpen ? styles.tooltipOpen : ''}`}>
                  <button
                    className={styles.closeButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      politicsTooltip.setIsOpen(false);
                    }}
                  >
                    ×
                  </button>
                  {POLITICAL_DESCRIPTIONS[politicsKey].desc}
                </div>
              )}
            </span>
          )}
          {politicsKey && econKey && <span className={styles.systemInfoText}> · </span>}
          {econKey && (
            <span
              ref={econTooltip.ref}
              className={`${styles.starType} ${econTooltip.isOpen ? styles.active : ''}`}
              onClick={() => econTooltip.setIsOpen(!econTooltip.isOpen)}
            >
              {econKey}
              {econDesc && (
                <div className={`${styles.tooltip} ${econTooltip.isOpen ? styles.tooltipOpen : ''}`}>
                  <button
                    className={styles.closeButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      econTooltip.setIsOpen(false);
                    }}
                  >
                    ×
                  </button>
                  {econDesc.desc}
                </div>
              )}
            </span>
          )}
        </div>
      )}
      {targetStar && (
        <div className={styles.jumpTarget}>JUMP TARGET: {targetStar.name}</div>
      )}
      {!isMobileHUD && (
        <div className={styles.controls}>
          <button type="button" className={styles.controlsBtn} onClick={onClusterMap}>
            J CLUSTER MAP
          </button>
          <button type="button" className={styles.controlsBtn} onClick={onSystemMap}>
            M SYSTEM MAP
          </button>
          {crewCount > 0 && (
            <button type="button" className={styles.controlsBtn} onClick={onCrewRoster}>
              C CREW
            </button>
          )}
          <br />
          <button type="button" className={styles.controlsBtn} onClick={onControls}>
            CONTROLS
          </button>
        </div>
      )}
    </div>
  );
}
