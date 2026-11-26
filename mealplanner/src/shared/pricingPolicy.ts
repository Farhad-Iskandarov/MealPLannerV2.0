import { RegionCode, SupermarketSlug } from './types';

/**
 * Shared, reversible pricing policy flag for Poland (Biedronka).
 * When true:
 * - Glovo regular AND promo prices continue to be collected, parsed, and stored in SQLite.
 * - All Polish shopping lines, product details, basket comparisons, and budget estimates
 *   use the regular shelf/list price.
 * - Promo badges, strike-through prices, promo-only offer banners, and savings claims are hidden for PL.
 * Flip to false to re-enable Poland promotional pricing & UI without schema or collector changes.
 */
export const POLAND_BIEDRONKA_REGULAR_PRICE_ONLY = true;

export function isRegularPriceOnlyPolicyActive(
  regionCode: RegionCode = 'PL',
  supermarketId?: SupermarketSlug | null
): boolean {
  if (!POLAND_BIEDRONKA_REGULAR_PRICE_ONLY) return false;
  if (regionCode !== 'PL') return false;
  return !supermarketId || supermarketId === 'biedronka';
}

export function shouldShowPromoIndicators(
  regionCode: RegionCode = 'PL',
  supermarketId?: SupermarketSlug | null
): boolean {
  return !isRegularPriceOnlyPolicyActive(regionCode, supermarketId);
}

/**
 * Resolves the effective display/calculation price under the active regional pricing policy.
 * Always preserves the underlying promoPrice separately in storage/models.
 */
export function resolvePolicyEffectivePrice(
  regularPrice: number,
  promoPrice: number | null | undefined,
  regionCode: RegionCode = 'PL',
  supermarketId?: SupermarketSlug | null
): number {
  if (isRegularPriceOnlyPolicyActive(regionCode, supermarketId)) {
    return regularPrice;
  }
  if (promoPrice !== null && promoPrice !== undefined && Number.isFinite(promoPrice) && promoPrice > 0) {
    return promoPrice;
  }
  return regularPrice;
}
