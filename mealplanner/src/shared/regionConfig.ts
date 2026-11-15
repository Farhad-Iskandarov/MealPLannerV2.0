import {
  RegionCode,
  CurrencyCode,
  Language,
  SupermarketSlug,
  PolishSupermarketSlug,
  AzerbaijaniSupermarketSlug,
} from './types';

export interface RegionDefinition {
  code: RegionCode;
  flag: string;
  countryNameEn: string;
  countryNamePl: string;
  countryNameAz: string;
  defaultCurrency: CurrencyCode;
  defaultSupermarket: SupermarketSlug;
  defaultWeeklyBudget: number;
  minWeeklyBudget: number;
  supermarketSlugs: SupermarketSlug[];
  activeCatalogueSlugs: SupermarketSlug[];
  cuisineHighlightsEn: string[];
  cuisineHighlightsPl: string[];
  cuisineHighlightsAz: string[];
}

export interface CurrencyDefinition {
  code: CurrencyCode;
  symbol: string;
  regionCode: RegionCode;
  nameEn: string;
  namePl: string;
  nameAz: string;
  decimals: number;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyDefinition> = {
  PLN: {
    code: 'PLN',
    symbol: 'zł',
    regionCode: 'PL',
    nameEn: 'Polish złoty (PLN — zł)',
    namePl: 'Polski złoty (PLN — zł)',
    nameAz: 'Polşa zlotısı (PLN — zł)',
    decimals: 2,
  },
  AZN: {
    code: 'AZN',
    symbol: '₼',
    regionCode: 'AZ',
    nameEn: 'Azerbaijani manat (AZN — ₼)',
    namePl: 'Manat azerbejdżański (AZN — ₼)',
    nameAz: 'Azərbaycan manatı (AZN — ₼)',
    decimals: 2,
  },
};

export const POLISH_SUPERMARKET_SLUGS: PolishSupermarketSlug[] = [
  'biedronka',
  'lidl',
  'auchan',
  'kaufland',
  'carrefour',
  'zabka',
];

export const AZERBAIJANI_SUPERMARKET_SLUGS: AzerbaijaniSupermarketSlug[] = [
  'bravo',
  'araz',
  'bazarstore',
  'rahat',
  'oba',
  'birmarket',
];

export const REGIONS: Record<RegionCode, RegionDefinition> = {
  PL: {
    code: 'PL',
    flag: '🇵🇱',
    countryNameEn: 'Poland',
    countryNamePl: 'Polska',
    countryNameAz: 'Polşa',
    defaultCurrency: 'PLN',
    defaultSupermarket: 'biedronka',
    defaultWeeklyBudget: 250.0,
    minWeeklyBudget: 20.0,
    supermarketSlugs: POLISH_SUPERMARKET_SLUGS,
    activeCatalogueSlugs: ['biedronka', 'lidl', 'auchan', 'kaufland'],
    cuisineHighlightsEn: ['Polish & European staples', 'Pierogi, soups, roasted meats, oatmeal'],
    cuisineHighlightsPl: ['Kuchnia polska i europejska', 'Zupy, drób, kasze, ryż, owsianki'],
    cuisineHighlightsAz: ['Polşa və Avropa mətbəxi', 'Şorbalar, toyuq, düyü və yulaf yeməkləri'],
  },
  AZ: {
    code: 'AZ',
    flag: '🇦🇿',
    countryNameEn: 'Azerbaijan',
    countryNamePl: 'Azerbejdżan',
    countryNameAz: 'Azərbaycan',
    defaultCurrency: 'AZN',
    defaultSupermarket: 'bravo',
    defaultWeeklyBudget: 120.0,
    minWeeklyBudget: 15.0,
    supermarketSlugs: AZERBAIJANI_SUPERMARKET_SLUGS,
    activeCatalogueSlugs: ['bravo', 'araz', 'bazarstore', 'rahat'],
    cuisineHighlightsEn: ['Azerbaijani & International cuisine', 'Şah Plov, Dovğa, Qutab, Düşbərə, Pomidor-Yumurta'],
    cuisineHighlightsPl: ['Kuchnia azerska i międzynarodowa', 'Szach Pilaw, Dowga, Qutab, Duszbara, Pomidor-Yumurta'],
    cuisineHighlightsAz: ['Azərbaycan milli və dünya mətbəxi', 'Şah Plov, Dovğa, Qutab, Düşbərə, Pomidor-Yumurta'],
  },
};

/**
 * Official reference ECB/CBA exchange rate used ONLY when converting historical user budget targets,
 * NEVER as a substitute for retrieving actual local supermarket product prices!
 */
export const EXCHANGE_RATES_REFERENCE = {
  PLN_TO_AZN: 0.4255, // 1 PLN ≈ 0.4255 AZN
  AZN_TO_PLN: 2.35,   // 1 AZN ≈ 2.35 PLN
  source: 'Reference CBA/ECB Mid-Market Rate (Nov 2026)',
};

export function convertHistoricalMonetaryAmount(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): { convertedAmount: number; rateUsed: number; isConverted: boolean } {
  if (fromCurrency === toCurrency) {
    return { convertedAmount: Number(amount.toFixed(2)), rateUsed: 1, isConverted: false };
  }
  const rate =
    fromCurrency === 'PLN' && toCurrency === 'AZN'
      ? EXCHANGE_RATES_REFERENCE.PLN_TO_AZN
      : EXCHANGE_RATES_REFERENCE.AZN_TO_PLN;
  return {
    convertedAmount: Number((amount * rate).toFixed(2)),
    rateUsed: rate,
    isConverted: true,
  };
}

export function getRegionDefinition(regionCode?: string | null): RegionDefinition {
  if (regionCode === 'AZ') return REGIONS.AZ;
  return REGIONS.PL;
}

export function getCurrencyDefinition(currencyCode?: string | null): CurrencyDefinition {
  if (currencyCode === 'AZN') return CURRENCIES.AZN;
  return CURRENCIES.PLN;
}

export function getDefaultCurrencyForRegion(regionCode: RegionCode): CurrencyCode {
  return REGIONS[regionCode].defaultCurrency;
}

export function getDefaultSupermarketForRegion(regionCode: RegionCode): SupermarketSlug {
  return REGIONS[regionCode].defaultSupermarket;
}

export function getSupermarketSlugsForRegion(regionCode: RegionCode): SupermarketSlug[] {
  return REGIONS[regionCode].supermarketSlugs;
}

export function getActiveCatalogueSlugsForRegion(regionCode: RegionCode): SupermarketSlug[] {
  return REGIONS[regionCode].activeCatalogueSlugs;
}

export function getCatalogueSupermarketsForRegion(regionCode: RegionCode): SupermarketSlug[] {
  return REGIONS[regionCode].activeCatalogueSlugs;
}

export function isSupermarketInRegion(
  supermarketId: string,
  regionCode: RegionCode
): supermarketId is SupermarketSlug {
  return (REGIONS[regionCode].supermarketSlugs as string[]).includes(supermarketId);
}

export function resolveValidSupermarketForRegion(
  supermarketId: string | undefined | null,
  regionCode: RegionCode
): SupermarketSlug {
  if (supermarketId && isSupermarketInRegion(supermarketId, regionCode)) {
    return supermarketId;
  }
  return getDefaultSupermarketForRegion(regionCode);
}

/**
 * Formats a monetary value according to the selected currency (PLN -> "22,99 zł", AZN -> "10.99 ₼").
 */
export function formatMoney(
  amount: number,
  currencyCode: CurrencyCode = 'PLN',
  _lang?: Language
): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  if (currencyCode === 'AZN') {
    return `${safe.toFixed(2)} ₼`;
  }
  return `${safe.toFixed(2).replace('.', ',')} zł`;
}

export function formatUnitPriceLabel(
  unitPrice: number,
  packageUnit: 'g' | 'ml' | 'pcs',
  currencyCode: CurrencyCode = 'PLN',
  lang: Language = 'en'
): string {
  const formattedPrice = formatMoney(unitPrice, currencyCode, lang);
  if (packageUnit === 'g') {
    const unitStr = lang === 'az' ? 'kq' : 'kg';
    return `${formattedPrice} / ${unitStr}`;
  }
  if (packageUnit === 'ml') {
    return `${formattedPrice} / L`;
  }
  const pcStr = lang === 'az' ? 'ədəd' : lang === 'pl' ? 'szt.' : 'pc';
  return `${formattedPrice} / ${pcStr}`;
}

export function pickLocalizedText(
  lang: Language,
  texts: { en?: string | null; pl?: string | null; az?: string | null }
): string {
  if (lang === 'az' && texts.az) return texts.az;
  if (lang === 'en' && texts.en) return texts.en;
  if (lang === 'pl' && texts.pl) return texts.pl;
  return texts.en || texts.pl || texts.az || '';
}

export function pickLocalizedList(
  lang: Language,
  lists: { en?: string[]; pl?: string[]; az?: string[] }
): string[] {
  if (lang === 'az' && lists.az && lists.az.length > 0) return lists.az;
  if (lang === 'en' && lists.en && lists.en.length > 0) return lists.en;
  if (lang === 'pl' && lists.pl && lists.pl.length > 0) return lists.pl;
  return lists.en || lists.pl || lists.az || [];
}
