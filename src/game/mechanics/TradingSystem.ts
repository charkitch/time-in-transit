import { PRNG } from '../generation/prng';
import { GOODS, CLUSTER_SEED, type GoodName, type EconomyType } from '../constants';
import type { CivilizationState } from './CivilizationSystem';
import type { SystemChoices } from '../GameState';

const BASE_PRICES: Record<GoodName, number> = {
  'Food':          40,
  'Textiles':      65,
  'Radioactives':  162,
  'Liquor':        220,
  'Luxuries':      440,
  'Narcotics':     490,
  'Computers':     853,
};

const ECONOMY_MODIFIERS: Record<EconomyType, Partial<Record<GoodName, number>>> = {
  'Agricultural':     { Food: -20, Textiles: -15, Narcotics: +60 },
  'Industrial':       { Computers: -100, Textiles: -20, Food: +30 },
  'High Tech':        { Computers: -200, Radioactives: -40, Luxuries: -50 },
  'Rich Industrial':  { Computers: -150, Textiles: -30, Liquor: -30 },
  'Poor Agricultural':{ Food: -30, Luxuries: +100 },
  'Refinery':         { Radioactives: -60, Liquor: -40, Food: +20 },
};

const REPUTATION_SELL_BONUS = 0.02; // +2% sell price per rep point

export interface MarketEntry {
  good: GoodName;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  banned: boolean;
}

export class TradingSystem {
  /**
   * Generate market prices with civilization and player-choice modifiers.
   *
   * When civState is provided the market uses the era-seeded PRNG and applies
   * political banned-goods, price modifiers, and anarchy variance.
   * When systemChoices is provided, accumulated player decisions (reputation,
   * per-system price multipliers) are also applied.
   */
  getMarket(
    systemId: number,
    economy: EconomyType,
    civState?: CivilizationState,
    systemChoices?: SystemChoices,
  ): MarketEntry[] {
    // Era-seeded PRNG as per design spec
    const era = civState?.era ?? 0;
    const rng = PRNG.fromIndex(CLUSTER_SEED, systemId * 53 + 7 + era * 1000);

    const mods = ECONOMY_MODIFIERS[economy] ?? {};
    const civBanned: GoodName[] = civState?.bannedGoods ?? [];
    const choiceBanned: GoodName[] = systemChoices?.bannedGoods ?? [];
    const bannedGoods = new Set<GoodName>([...civBanned, ...choiceBanned]);

    const politicsMod = civState?.priceModifier ?? 1.0;
    const luxuryMod = civState?.luxuryMod ?? 1.0;
    const techBonus = new Set<GoodName>(civState?.techBonus ?? []);
    const anarchyVariance = civState?.anarchyVariance ?? false;
    const choiceMod = systemChoices?.priceModifier ?? 1.0;
    const repBonus = systemChoices
      ? 1.0 + systemChoices.tradingReputation * REPUTATION_SELL_BONUS
      : 1.0;

    return GOODS.map(good => {
      const base = BASE_PRICES[good];
      const mod = mods[good] ?? 0;

      let variance: number;
      if (anarchyVariance) {
        variance = rng.float(-0.50, 0.50);
      } else {
        variance = rng.float(-0.15, 0.15);
      }

      let price = Math.round((base + mod) * (1 + variance));

      // Politics multiplier
      price = Math.round(price * politicsMod);
      // Luxury extra
      if (good === 'Luxuries') price = Math.round(price * luxuryMod);
      // Tech bonus (Technocracy discounts)
      if (techBonus.has(good)) price = Math.round(price * 0.90);
      // Player-choice multiplier
      price = Math.round(price * choiceMod);

      const buyPrice = Math.max(1, price);
      const sellPrice = Math.max(1, Math.round(price * 0.85 * repBonus));
      const stock = rng.int(0, 30);
      const banned = bannedGoods.has(good);

      return { good, buyPrice, sellPrice, stock, banned };
    });
  }

  cargoTotal(cargo: Partial<Record<GoodName, number>>): number {
    return Object.values(cargo).reduce((sum, v) => sum + (v ?? 0), 0);
  }
}
