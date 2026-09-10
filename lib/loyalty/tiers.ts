/**
 * Tier resolution, shared by the POS (to show the badge and preview the
 * discount) and the server (which decides the discount that is actually
 * applied). Pure, so both sides can import it.
 */

export type TierRow = {
  id: string;
  name: string;
  minPoints: number;
  discountPercent: string | number;
};

export type ResolvedTier = {
  id: string;
  name: string;
  minPoints: number;
  discountPercent: number;
};

const percentOf = (tier: TierRow) =>
  typeof tier.discountPercent === "number" ? tier.discountPercent : parseFloat(tier.discountPercent) || 0;

/**
 * A customer sits in the highest tier whose threshold their balance reaches.
 * Ties on threshold go to the better discount, so a mis-entered duplicate
 * never quietly downgrades a customer.
 */
export function resolveTier(tiers: TierRow[], points: number): ResolvedTier | null {
  let best: ResolvedTier | null = null;
  for (const tier of tiers) {
    if (points < tier.minPoints) continue;
    const candidate = { id: tier.id, name: tier.name, minPoints: tier.minPoints, discountPercent: percentOf(tier) };
    if (
      !best ||
      candidate.minPoints > best.minPoints ||
      (candidate.minPoints === best.minPoints && candidate.discountPercent > best.discountPercent)
    ) {
      best = candidate;
    }
  }
  return best;
}
