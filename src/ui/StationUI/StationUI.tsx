import { useState, useRef, useEffect } from 'react';
import { useGameState } from '../../game/GameState';
import { engineTradeBuy, engineTradeSell } from '../../game/engine';
import { HYPERSPACE, MAX_CARGO, POLITICAL_DESCRIPTIONS, POLITICAL_TYPE_DISPLAY, ECONOMY_DESCRIPTIONS, type GoodName } from '../../game/constants';
import styles from './StationUI.module.css';

const SHIELD_REPAIR_RATE = 5; // CR per shield point

interface StationUIProps {
  onUndock: () => void;
}

type TabId = 'trade' | 'refuel' | 'cargo';

export function StationUI({ onUndock }: StationUIProps) {
  const [tab, setTab] = useState<TabId>('trade');
  const [isPoliticsTooltipOpen, setIsPoliticsTooltipOpen] = useState(false);
  const [isEconTooltipOpen, setIsEconTooltipOpen] = useState(false);
  const politicsTooltipRef = useRef<HTMLSpanElement>(null);
  const econTooltipRef = useRef<HTMLSpanElement>(null);

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

  const cluster = useGameState(s => s.cluster);
  const currentSystemId = useGameState(s => s.currentSystemId);
  const currentSystemPayload = useGameState(s => s.currentSystemPayload);
  const player = useGameState(s => s.player);
  const addCredits = useGameState(s => s.addCredits);
  const setFuel = useGameState(s => s.setFuel);
  const setShields = useGameState(s => s.setShields);
  const saveGame = useGameState(s => s.saveGame);

  const starData = cluster[currentSystemId];
  const civState = currentSystemPayload?.civState;
  const market = currentSystemPayload?.market;
  if (!starData || !civState || !market) return null;
  const cargoTotal = Object.values(player.cargo).reduce((sum, qty) => sum + (qty ?? 0), 0);
  const cargoSpace = MAX_CARGO - cargoTotal;
  const listedMarket = market.filter(entry => entry.listingMode === 'listed_buy_sell');
  const sellOnlyMarket = market.filter(
    entry => entry.listingMode === 'sell_only' && (player.cargo[entry.good] ?? 0) > 0,
  );

  const handleBuy = (good: GoodName, price: number, stock: number, banned: boolean) => {
    if (banned || stock <= 0 || cargoSpace === 0 || player.credits < price) return;
    engineTradeBuy(good, 1, price);
  };

  const handleSell = (good: GoodName, price: number, banned: boolean) => {
    const qty = player.cargo[good] ?? 0;
    if (qty === 0 || banned || price <= 0) return;
    engineTradeSell(good, 1, price);
  };

  const fuelNeeded = Math.max(0, HYPERSPACE.tankSize - player.fuel);
  const FUEL_PRICE_PER_UNIT = 50;
  const refuelCost = Math.round(fuelNeeded * FUEL_PRICE_PER_UNIT);

  const handleRefuel = () => {
    if (player.credits < refuelCost || fuelNeeded === 0) return;
    addCredits(-refuelCost);
    setFuel(HYPERSPACE.tankSize);
    saveGame();
  };

  const shieldMissing = Math.max(0, 100 - Math.floor(player.shields));
  const repairCost = shieldMissing * SHIELD_REPAIR_RATE;
  const handleRepair = () => {
    if (player.credits < repairCost || shieldMissing === 0) return;
    addCredits(-repairCost);
    setShields(100);
    saveGame();
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.stationName}>
            ⬡ {starData.name.toUpperCase()} STATION
          </div>
          <div className={styles.credits}>
            CR {player.credits.toLocaleString()}
          </div>
        </div>

        <div className={styles.infoRow}>
          <div className={styles.infoItem}>
            ECONOMY:{' '}
            <span
              ref={econTooltipRef}
              className={`${styles.infoValue} ${styles.tooltipAnchor}`}
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
          </div>
          <div className={styles.infoItem}>
            POLITICS:{' '}
            <span
              ref={politicsTooltipRef}
              className={`${styles.infoValue} ${styles.tooltipAnchor}`}
              onClick={() => setIsPoliticsTooltipOpen(!isPoliticsTooltipOpen)}
            >
              {POLITICAL_TYPE_DISPLAY[civState.politics] ?? civState.politics}
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
          <div className={styles.infoItem}>
            TECH LV: <span className={styles.infoValue}>{starData.techLevel}</span>
          </div>
          <div className={styles.infoItem}>
            POPULATION: <span className={styles.infoValue}>{starData.population.toLocaleString()}M</span>
          </div>
        </div>

        {civState.bannedGoods.length > 0 && (
          <div className={styles.infoRow} style={{ marginBottom: 8 }}>
            <div className={styles.infoItem}>
              PROHIBITED:{' '}
              <span style={{ color: 'var(--color-danger)' }}>
                {civState.bannedGoods.join(', ')}
              </span>
            </div>
          </div>
        )}

        <div className={styles.tabs}>
          {(['trade', 'refuel', 'cargo'] as TabId[]).map(t => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.active : ''}`}
              onClick={() => setTab(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {tab === 'trade' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>LISTED FOR PURCHASE</th>
                  <th>BUY</th>
                  <th>SELL</th>
                  <th>PAID</th>
                  <th>STOCK</th>
                  <th>HELD</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {listedMarket.map(({ good, buyPrice, sellPrice, stock, banned, legality }) => {
                  const held = player.cargo[good] ?? 0;
                  const avgPaid = player.cargoCostBasis[good];
                  const canBuy = !banned && stock > 0 && cargoSpace > 0 && player.credits >= buyPrice;
                  const canSell = held > 0 && !banned && sellPrice > 0;
                  const profit = avgPaid !== undefined ? sellPrice - avgPaid : null;
                  return (
                    <tr key={`listed-${good}`} style={banned ? { opacity: 0.45 } : undefined}>
                      <td>
                        {good}
                        {legality === 'licensed' && (
                          <span style={{ color: 'var(--color-warning)', fontSize: '9px', marginLeft: 6, letterSpacing: 1 }}>
                            LICENSED
                          </span>
                        )}
                        {banned && (
                          <span style={{ color: 'var(--color-danger)', fontSize: '9px', marginLeft: 6, letterSpacing: 1 }}>
                            PROHIBITED
                          </span>
                        )}
                      </td>
                      <td style={{ color: banned ? 'inherit' : 'var(--color-hud)' }}>
                        {!banned ? buyPrice : '—'}
                      </td>
                      <td>
                        <span style={{ color: profit === null ? 'var(--color-warning)' : profit >= 0 ? '#44FF88' : '#FF4422' }}>
                          {!banned ? sellPrice : '—'}
                        </span>
                        {profit !== null && !banned && (
                          <span style={{ fontSize: '9px', marginLeft: 4, opacity: 0.8, color: profit >= 0 ? '#44FF88' : '#FF4422' }}>
                            {profit >= 0 ? '+' : ''}{Math.round(profit)}
                          </span>
                        )}
                      </td>
                      <td style={{ opacity: held > 0 ? 1 : 0.35, color: 'var(--color-hud-dim)' }}>
                        {avgPaid !== undefined ? Math.round(avgPaid) : '—'}
                      </td>
                      <td style={{ opacity: 0.7 }}>{!banned ? stock : '—'}</td>
                      <td style={{ color: held > 0 ? 'var(--color-station)' : 'inherit' }}>{held}</td>
                      <td style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className={styles.buyBtn}
                          disabled={!canBuy}
                          onClick={() => handleBuy(good, buyPrice, stock, banned)}
                        >BUY</button>
                        <button
                          className={`${styles.buyBtn} ${styles.sellBtn}`}
                          disabled={!canSell}
                          onClick={() => handleSell(good, sellPrice, banned)}
                        >SELL</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SELL OPPORTUNITIES</th>
                  <th>BUY</th>
                  <th>SELL</th>
                  <th>PAID</th>
                  <th>STOCK</th>
                  <th>HELD</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sellOnlyMarket.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ opacity: 0.55 }}>
                      No off-manifest buyers for your current cargo.
                    </td>
                  </tr>
                ) : (
                  sellOnlyMarket.map(({ good, sellPrice, banned, legality }) => {
                    const held = player.cargo[good] ?? 0;
                    const avgPaid = player.cargoCostBasis[good];
                    const profit = avgPaid !== undefined ? sellPrice - avgPaid : null;
                    const canSell = held > 0 && !banned && sellPrice > 0;
                    return (
                      <tr key={`sellonly-${good}`} style={banned ? { opacity: 0.45 } : undefined}>
                        <td>
                          {good}
                          <span style={{ color: 'var(--color-station)', fontSize: '9px', marginLeft: 6, letterSpacing: 1 }}>
                            SELL-ONLY
                          </span>
                          {legality === 'licensed' && (
                            <span style={{ color: 'var(--color-warning)', fontSize: '9px', marginLeft: 6, letterSpacing: 1 }}>
                              LICENSED
                            </span>
                          )}
                        </td>
                        <td>—</td>
                        <td>
                          <span style={{ color: profit === null ? 'var(--color-warning)' : profit >= 0 ? '#44FF88' : '#FF4422' }}>
                            {sellPrice}
                          </span>
                          {profit !== null && (
                            <span style={{ fontSize: '9px', marginLeft: 4, opacity: 0.8, color: profit >= 0 ? '#44FF88' : '#FF4422' }}>
                              {profit >= 0 ? '+' : ''}{Math.round(profit)}
                            </span>
                          )}
                        </td>
                        <td style={{ opacity: held > 0 ? 1 : 0.35, color: 'var(--color-hud-dim)' }}>
                          {avgPaid !== undefined ? Math.round(avgPaid) : '—'}
                        </td>
                        <td>—</td>
                        <td style={{ color: held > 0 ? 'var(--color-station)' : 'inherit' }}>{held}</td>
                        <td style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className={`${styles.buyBtn} ${styles.sellBtn}`}
                            disabled={!canSell}
                            onClick={() => handleSell(good, sellPrice, banned)}
                          >SELL</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'refuel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div style={{ marginBottom: '8px', fontSize: 'var(--font-size-sm)', opacity: 0.7, letterSpacing: 1 }}>
                FUEL
              </div>
              <div style={{ marginBottom: '10px', fontSize: 'var(--font-size-sm)' }}>
                <div>FUEL: {player.fuel.toFixed(2)} / {HYPERSPACE.tankSize} LY</div>
                <div style={{ marginTop: '4px', opacity: 0.7 }}>
                  Full refuel cost: CR {refuelCost}
                  {fuelNeeded === 0 && ' (FULL)'}
                </div>
              </div>
              <button
                className={styles.refuelBtn}
                disabled={fuelNeeded === 0 || player.credits < refuelCost}
                onClick={handleRefuel}
              >
                REFUEL ({fuelNeeded.toFixed(1)} units — CR {refuelCost})
              </button>
            </div>

            <div>
              <div style={{ marginBottom: '8px', fontSize: 'var(--font-size-sm)', opacity: 0.7, letterSpacing: 1 }}>
                SHIELD REPAIR
              </div>
              <div style={{ marginBottom: '10px', fontSize: 'var(--font-size-sm)' }}>
                <div>
                  SHIELDS: {Math.floor(player.shields)} / 100
                  {player.shields >= 100 && <span style={{ opacity: 0.6 }}> (FULL)</span>}
                </div>
                <div style={{ marginTop: '4px', opacity: 0.7 }}>
                  Repair cost: CR {repairCost} ({SHIELD_REPAIR_RATE} CR/point)
                </div>
              </div>
              <button
                className={styles.refuelBtn}
                disabled={shieldMissing === 0 || player.credits < repairCost}
                onClick={handleRepair}
              >
                REPAIR SHIELDS ({shieldMissing} pts — CR {repairCost})
              </button>
            </div>
          </div>
        )}

        {tab === 'cargo' && (
          <div className={styles.cargo}>
            <div className={styles.cargoTitle}>
              HOLD: {cargoTotal} / {MAX_CARGO} UNITS
            </div>
            {Object.entries(player.cargo).length === 0 ? (
              <div style={{ opacity: 0.5 }}>Empty cargo hold</div>
            ) : (
              Object.entries(player.cargo).map(([good, qty]) => {
                const avgPaid = player.cargoCostBasis[good as GoodName];
                return (
                  <div key={good} className={styles.cargoItem}>
                    <span>{good}</span>
                    <span style={{ color: 'var(--color-station)' }}>{qty} units</span>
                    {avgPaid !== undefined && (
                      <span style={{ fontSize: '10px', color: 'var(--color-hud-dim)', marginLeft: 'auto' }}>
                        avg paid {Math.round(avgPaid)} CR
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        <button className={styles.undockBtn} onClick={onUndock}>
          UNDOCK
        </button>
      </div>
    </div>
  );
}
