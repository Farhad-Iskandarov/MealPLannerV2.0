import {
  Supermarket,
  SupermarketProduct,
  SupermarketSlug,
  ProductPriceRecord,
  RegionCode,
  CurrencyCode,
} from '../../shared/types';
import {
  SUPERMARKETS,
  getCatalogueProductsForRegion,
  getPromotionalOffersForRegion,
  PromotionalBannerOffer,
} from './catalogueData';
import { getDefaultCurrencyForRegion, getDefaultSupermarketForRegion } from '../../shared/regionConfig';

export interface ISupermarketAdapter {
  readonly slug: SupermarketSlug;
  readonly regionCode: RegionCode;
  getMetadata(): Supermarket;
  getProducts(): SupermarketProduct[];
  getProductByCanonical(canonicalIngredient: string): SupermarketProduct | undefined;
  probePublicCatalogueStatus(): Promise<{
    liveFeedAvailable: boolean;
    status: 'DEMO_FALLBACK_ACTIVE' | 'PUBLIC_CATALOGUE_CONNECTED' | 'COMING_SOON_UNAVAILABLE';
    reason: string;
    checkedAt: string;
  }>;
}

export class RegionalSupermarketAdapter implements ISupermarketAdapter {
  constructor(
    public readonly slug: SupermarketSlug,
    public readonly regionCode: RegionCode
  ) {}

  getMetadata(): Supermarket {
    const found = SUPERMARKETS.find((s) => s.id === this.slug);
    if (!found) {
      throw new Error(`Supermarket metadata not found for ${this.slug}`);
    }
    return found;
  }

  getProducts(): SupermarketProduct[] {
    const regionalProducts = getCatalogueProductsForRegion(this.regionCode);
    return regionalProducts.filter((p) => Boolean(p.prices[this.slug]));
  }

  getProductByCanonical(canonicalIngredient: string): SupermarketProduct | undefined {
    const normalized = canonicalIngredient.trim().toLowerCase();
    const regionalProducts = getCatalogueProductsForRegion(this.regionCode);
    return regionalProducts.find(
      (p) =>
        p.canonicalIngredient.toLowerCase() === normalized ||
        p.nameEn.toLowerCase().includes(normalized) ||
        p.namePl.toLowerCase().includes(normalized) ||
        (p.nameAz && p.nameAz.toLowerCase().includes(normalized))
    );
  }

  async probePublicCatalogueStatus(): Promise<{
    liveFeedAvailable: boolean;
    status: 'DEMO_FALLBACK_ACTIVE' | 'PUBLIC_CATALOGUE_CONNECTED' | 'COMING_SOON_UNAVAILABLE';
    reason: string;
    checkedAt: string;
  }> {
    const meta = this.getMetadata();
    if (meta.adapterStatus === 'COMING_SOON_UNAVAILABLE') {
      return {
        liveFeedAvailable: false,
        status: 'COMING_SOON_UNAVAILABLE',
        reason: `Partner API / catalogue feed for ${meta.name} (${meta.country}) is not yet connected.`,
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      liveFeedAvailable: false,
      status: 'DEMO_FALLBACK_ACTIVE',
      reason: `Official public unauthenticated JSON price API is not provided by ${meta.name} (${meta.country}). Using clearly labelled regional demonstration / promotional leaflet reference catalogue in ${meta.currency}.`,
      checkedAt: new Date().toISOString(),
    };
  }
}

export interface NormalizedProductComparison {
  productId: string;
  regionCode: RegionCode;
  currencyCode: CurrencyCode;
  ean: string;
  canonicalIngredient: string;
  namePl: string;
  nameEn: string;
  nameAz: string;
  brand: string;
  category: string;
  packageLabelPl: string;
  packageLabelEn: string;
  packageLabelAz: string;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'pcs';
  icon: string;
  // Polish store prices (present when regionCode === 'PL')
  biedronka: ProductPriceRecord | null;
  lidl: ProductPriceRecord | null;
  auchan: ProductPriceRecord | null;
  kaufland: ProductPriceRecord | null;
  // Azerbaijani store prices (present when regionCode === 'AZ')
  bravo?: ProductPriceRecord | null;
  araz?: ProductPriceRecord | null;
  bazarstore?: ProductPriceRecord | null;
  rahat?: ProductPriceRecord | null;
  storePrices: Partial<Record<SupermarketSlug, ProductPriceRecord | null>>;
  cheapestStore: SupermarketSlug;
  cheapestUnitPricePln: number;
  maxUnitSavingsPln: number;
}

/**
 * Normalizes unit price to PLN or AZN per 1 kg (for grams), 1 L (for ml), or 1 piece (for pcs).
 */
export function calculateNormalizedUnitPrice(
  priceAmount: number,
  packageSize: number,
  packageUnit: 'g' | 'ml' | 'pcs',
  currencyCode: CurrencyCode = 'PLN'
): { unitPricePln: number; unitLabel: string } {
  if (packageSize <= 0) {
    throw new Error('Package size must be positive');
  }
  const fmt = (val: number) =>
    currencyCode === 'AZN' ? `${val.toFixed(2)} ₼` : `${val.toFixed(2).replace('.', ',')} zł`;

  if (packageUnit === 'g') {
    const perKg = Number(((priceAmount / packageSize) * 1000).toFixed(2));
    return {
      unitPricePln: perKg,
      unitLabel: `${fmt(perKg)} / ${currencyCode === 'AZN' ? 'kq' : 'kg'}`,
    };
  }
  if (packageUnit === 'ml') {
    const perLiter = Number(((priceAmount / packageSize) * 1000).toFixed(2));
    return { unitPricePln: perLiter, unitLabel: `${fmt(perLiter)} / L` };
  }
  const perPiece = Number((priceAmount / packageSize).toFixed(2));
  return {
    unitPricePln: perPiece,
    unitLabel: `${fmt(perPiece)} / ${currencyCode === 'AZN' ? 'ədəd' : 'szt.'}`,
  };
}

export class SupermarketRegistry {
  private adapters: Map<SupermarketSlug, ISupermarketAdapter> = new Map();

  constructor() {
    for (const store of SUPERMARKETS) {
      this.adapters.set(store.id, new RegionalSupermarketAdapter(store.id, store.regionCode));
    }
  }

  getAdapter(slug: SupermarketSlug, regionCode: RegionCode = 'PL'): ISupermarketAdapter {
    const adapter = this.adapters.get(slug);
    if (adapter && adapter.regionCode === regionCode) {
      return adapter;
    }
    const defaultSlug = getDefaultSupermarketForRegion(regionCode);
    return this.adapters.get(defaultSlug)!;
  }

  getAllSupermarkets(regionCode?: RegionCode): Supermarket[] {
    if (!regionCode) return SUPERMARKETS;
    return SUPERMARKETS.filter((s) => s.regionCode === regionCode);
  }

  getAllStores(regionCode?: RegionCode): Supermarket[] {
    return this.getAllSupermarkets(regionCode);
  }

  getPromotionalOffers(regionCode: RegionCode = 'PL'): PromotionalBannerOffer[] {
    return getPromotionalOffersForRegion(regionCode);
  }

  compareProductsAcrossStores(
    searchQuery?: string,
    regionCode: RegionCode = 'PL'
  ): NormalizedProductComparison[] {
    const q = searchQuery?.trim().toLowerCase() ?? '';
    const regionalProducts = getCatalogueProductsForRegion(regionCode);
    const currencyCode = getDefaultCurrencyForRegion(regionCode);

    const filtered = regionalProducts.filter((p) => {
      if (!q) return true;
      return (
        p.namePl.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        (p.nameAz && p.nameAz.toLowerCase().includes(q)) ||
        p.brand.toLowerCase().includes(q) ||
        p.ean.includes(q) ||
        p.canonicalIngredient.toLowerCase().includes(q)
      );
    });

    return filtered.map((product) => {
      const b = product.prices.biedronka ?? null;
      const l = product.prices.lidl ?? null;
      const a = product.prices.auchan ?? null;
      const k = product.prices.kaufland ?? null;

      const bravo = product.prices.bravo ?? null;
      const araz = product.prices.araz ?? null;
      const bazarstore = product.prices.bazarstore ?? null;
      const rahat = product.prices.rahat ?? null;

      const storePrices: Partial<Record<SupermarketSlug, ProductPriceRecord | null>> =
        regionCode === 'AZ'
          ? { bravo, araz, bazarstore, rahat }
          : { biedronka: b, lidl: l, auchan: a, kaufland: k };

      const candidates = Object.values(storePrices).filter(
        (x): x is ProductPriceRecord => x !== null && x !== undefined
      );
      candidates.sort((x, y) => x.unitPricePln - y.unitPricePln);

      const cheapest = candidates[0];
      const mostExpensive = candidates[candidates.length - 1];

      return {
        productId: product.id,
        regionCode,
        currencyCode,
        ean: product.ean,
        canonicalIngredient: product.canonicalIngredient,
        namePl: product.namePl,
        nameEn: product.nameEn,
        nameAz: product.nameAz || product.nameEn,
        brand: product.brand,
        category: product.category,
        packageLabelPl: product.packageLabelPl,
        packageLabelEn: product.packageLabelEn,
        packageLabelAz: product.packageLabelAz || product.packageLabelEn,
        packageSize: product.packageSize,
        packageUnit: product.packageUnit,
        icon: product.icon,
        biedronka: b,
        lidl: l,
        auchan: a,
        kaufland: k,
        bravo,
        araz,
        bazarstore,
        rahat,
        storePrices,
        cheapestStore: cheapest
          ? cheapest.supermarketId
          : getDefaultSupermarketForRegion(regionCode),
        cheapestUnitPricePln: cheapest ? cheapest.unitPricePln : 0,
        maxUnitSavingsPln:
          cheapest && mostExpensive
            ? Number((mostExpensive.unitPricePln - cheapest.unitPricePln).toFixed(2))
            : 0,
      };
    });
  }
}

export const supermarketRegistry = new SupermarketRegistry();
