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
  const bonusOnlyOffer = ctx.bonusDemand && !ctx.cargo.some(entry => entry.good === ctx.bonusDemand?.good)
    ? ctx.bonusDemand
    : null;

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
            <span>Paid</span>
            <span>Qty</span>
            {canTrade && <span></span>}
          </div>
          {ctx.cargo.map(entry => {
            const avgPaid = player.cargoCostBasis[entry.good];
            const sellPrice = ctx.bonusDemand?.good === entry.good ? ctx.bonusDemand.sellPrice : entry.sellPrice;
            const profit = avgPaid !== undefined ? sellPrice - avgPaid : null;
            const isBonusGood = ctx.bonusDemand?.good === entry.good;
            return (
            <div key={entry.good} className={`${styles.manifestRow} ${isBonusGood ? styles.bonusRow : ''}`}>
              <span className={styles.goodName}>
                {entry.good}
                {isBonusGood && (
                  <span className={styles.bonusTag}>{ctx.bonusDemand?.label}</span>
                )}
              </span>
              <span className={styles.price}>{entry.buyPrice} CR</span>
              <span className={styles.price} style={{ color: profit === null ? undefined : (profit >= 0 ? '#44FF88' : '#FF4422') }}>
                {sellPrice} CR
                {profit !== null && (
                  <span className={styles.edge}>
                    {profit >= 0 ? '+' : ''}{Math.round(profit)}
                  </span>
                )}
              </span>
              <span className={styles.paid}>{avgPaid !== undefined ? `${Math.round(avgPaid)} CR` : '—'}</span>
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
          )})}
          {bonusOnlyOffer && (
            <div className={`${styles.manifestRow} ${styles.bonusRow}`}>
              <span className={styles.goodName}>
                {bonusOnlyOffer.good}
                <span className={styles.bonusTag}>{bonusOnlyOffer.label}</span>
              </span>
              <span className={styles.price}>—</span>
              <span className={styles.price}>{bonusOnlyOffer.sellPrice} CR</span>
              <span className={styles.paid}>
                {player.cargoCostBasis[bonusOnlyOffer.good] !== undefined
                  ? `${Math.round(player.cargoCostBasis[bonusOnlyOffer.good] ?? 0)} CR`
                  : '—'}
              </span>
              <span className={styles.qty}>—</span>
              {canTrade && (
                <span className={styles.tradeButtons}>
                  <button
                    className={styles.tradeBtn}
                    disabled
                  >
                    BUY
                  </button>
                  <button
                    className={styles.tradeBtn}
                    disabled={(player.cargo[bonusOnlyOffer.good] ?? 0) <= 0}
                    onClick={() => onTrade('sell', bonusOnlyOffer.good)}
                  >
                    SELL
                  </button>
                </span>
              )}
            </div>
          )}
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
