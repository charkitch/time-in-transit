import { useGameState } from '../../game/GameState';
import type { GoodName } from '../../game/constants';
import { NPC_ARCHETYPE_LABEL } from '../../game/archetypes';
import styles from './CommDialog.module.css';

interface CommDialogProps {
  onTrade: (action: 'buy' | 'sell', good: GoodName) => void;
  onDismiss: () => void;
}

export function CommDialog({ onTrade, onDismiss }: CommDialogProps) {
  const ctx = useGameState(s => s.pendingCommContext);
  const player = useGameState(s => s.player);

  if (!ctx) return null;

  const canTrade = ctx.inTradeRange;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <span className={styles.dimLabel}>◈ VESSEL: </span>
            <span className={styles.vesselName}>{ctx.npcName}</span>
            <span className={styles.dimLabel}>  ORIGIN: </span>
            <span className={styles.originName}>{ctx.originSystemName}</span>
            <span className={styles.dimLabel}>  CLASS: </span>
            <span className={styles.originName}>{NPC_ARCHETYPE_LABEL[ctx.npcArchetype]}</span>
          </div>
          {ctx.factionTag && (
            <div className={styles.faction}>FACTION: {ctx.factionTag}</div>
          )}
        </div>

        {/* Comm lines */}
        <div className={styles.commLines}>
          <p className={styles.commLine}>"{ctx.commLines[0]}"</p>
          <p className={styles.commLine}>"{ctx.commLines[1]}"</p>
        </div>

        {/* Manifest */}
        <div className={styles.manifestSection}>
          <div className={styles.manifestTitle}>MANIFEST</div>
          {!canTrade && (
            <div className={styles.rangeWarning}>SIGNAL ONLY — TOO FAR TO TRADE</div>
          )}
          <div className={styles.manifestHeader}>
            <span>Good</span>
            <span>Buy</span>
            <span>Sell</span>
            <span>Qty</span>
            {canTrade && <span></span>}
          </div>
          {ctx.cargo.map(entry => (
            <div key={entry.good} className={styles.manifestRow}>
              <span className={styles.goodName}>{entry.good}</span>
              <span className={styles.price}>{entry.buyPrice} CR</span>
              <span className={styles.price}>{entry.sellPrice} CR</span>
              <span className={styles.qty}>{entry.qty}</span>
              {canTrade && (
                <span className={styles.tradeButtons}>
                  <button
                    className={styles.tradeBtn}
                    disabled={entry.qty <= 0 || player.credits < entry.buyPrice}
                    onClick={() => onTrade('buy', entry.good)}
                  >
                    BUY
                  </button>
                  <button
                    className={styles.tradeBtn}
                    disabled={(player.cargo[entry.good] ?? 0) <= 0}
                    onClick={() => onTrade('sell', entry.good)}
                  >
                    SELL
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Dismiss */}
        <div className={styles.actions}>
          <button className={styles.dismissBtn} onClick={onDismiss}>
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
}
