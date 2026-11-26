import {
  Supermarket,
  SupermarketProduct,
  SupermarketSlug,
  ProductPriceRecord,
  ShoppingCategory,
  RegionCode,
  CurrencyCode,
  MonitoredProductRecord,
} from '../../shared/types';
import type { VerifiedBiedronkaSnapshotItem } from '../monitoring/biedronkaGlovoMonitor';
import {
  isRegularPriceOnlyPolicyActive,
  resolvePolicyEffectivePrice,
  shouldShowPromoIndicators,
} from '../../shared/pricingPolicy';

export const SUPERMARKETS: Supermarket[] = [
  // === POLAND (PL) SUPERMARKETS — Biedronka-only Poland rollout ===
  {
    id: 'biedronka',
    name: 'Biedronka',
    regionCode: 'PL',
    country: 'Poland',
    currency: 'PLN',
    primaryColor: '#E30613',
    secondaryColor: '#FFED00',
    loyaltyProgramName: 'Karta Moja Biedronka',
    websiteUrl: 'https://glovoapp.com/en/pl/warszawa/stores/biedronka-waw',
    adapterStatus: 'PUBLIC_CATALOGUE_CONNECTED',
    isCatalogueAvailable: true,
    lastSyncedAt: '2026-11-11T08:00:00Z',
    priceDisclaimerPl:
      'Biedronka (Warszawa • Glovo) — jedyny aktywny sklep w Polsce. Odświeżanie pełnych, zweryfikowanych migawek cenowych co 5 dni w PLN.',
    priceDisclaimerEn:
      'Biedronka (Warsaw • Glovo) — the only active store in Poland. Complete validated PLN price snapshots refresh on a 5-day cadence.',
    priceDisclaimerAz:
      'Biedronka (Varşava • Glovo) — Polşada yeganə aktiv supermarket. Təsdiqlənmiş PLN qiymət kataloqu 5 günlük intervalla yenilənir.',
  },

  // === AZERBAIJAN (AZ) SUPERMARKETS ===
  {
    id: 'bravo',
    name: 'Bravo',
    regionCode: 'AZ',
    country: 'Azerbaijan',
    currency: 'AZN',
    primaryColor: '#58A618',
    secondaryColor: '#1E392A',
    loyaltyProgramName: 'Umico / Bravo Club',
    websiteUrl: 'https://www.bravosupermarket.az',
    adapterStatus: 'DEMO_FALLBACK_ACTIVE',
    isCatalogueAvailable: true,
    lastSyncedAt: '2026-11-11T08:00:00Z',
    priceDisclaimerPl:
      'Brak publicznego API Bravo Azerbaijan. Prezentowane ceny w AZN (₼) pochodzą z lokalnego katalogu referencyjnego i gazetek promocyjnych Bravo.',
    priceDisclaimerEn:
      'No public live Bravo Azerbaijan API is exposed. Displayed AZN (₼) prices are clearly labelled regional demonstration & leaflet reference data.',
    priceDisclaimerAz:
      'Bravo Supermarket üçün açıq real-vaxt API mövcud deyil. Göstərilən AZN (₼) qiymətləri rəsmi endirim bukletlərinə əsaslanan nümunə kataloq məlumatlarıdır.',
  },
  {
    id: 'araz',
    name: 'Araz',
    regionCode: 'AZ',
    country: 'Azerbaijan',
    currency: 'AZN',
    primaryColor: '#6CBE45',
    secondaryColor: '#F37021',
    loyaltyProgramName: 'Araz Supermarket Kartı',
    websiteUrl: 'https://www.arazmarket.az',
    adapterStatus: 'DEMO_FALLBACK_ACTIVE',
    isCatalogueAvailable: true,
    lastSyncedAt: '2026-11-11T08:00:00Z',
    priceDisclaimerPl:
      'Ceny referencyjne w AZN (₼) z katalogu demonstracyjnego oraz gazetek Araz Supermarket (Azerbejdżan).',
    priceDisclaimerEn:
      'AZN (₼) reference prices from the Araz Supermarket Azerbaijan demonstration & promotional leaflet catalogue.',
    priceDisclaimerAz:
      'Araz Supermarket şəbəkəsinin nümunə kataloqu və Araz Kart endirim bukletlərinə əsaslanan AZN (₼) istinad qiymətləri.',
  },
  {
    id: 'bazarstore',
    name: 'Bazarstore',
    regionCode: 'AZ',
    country: 'Azerbaijan',
    currency: 'AZN',
    primaryColor: '#E31E24',
    secondaryColor: '#00A651',
    loyaltyProgramName: 'Super Kart (Bazarstore)',
    websiteUrl: 'https://bazarstore.az/b%C3%BCt%C3%BCn-m%C9%99hsullar',
    adapterStatus: 'PUBLIC_CATALOGUE_CONNECTED',
    isCatalogueAvailable: true,
    lastSyncedAt: '2026-11-16T00:00:00Z',
    priceDisclaimerPl:
      'Automatyczny 24-godzinny monitoring cen Bazarstore (bazarstore.az/bütün-məhsullar) w AZN (₼) z historią zmian cen i wykrywaniem nieaktualnych pozycji.',
    priceDisclaimerEn:
      'Automated 24-hour Bazarstore price monitoring (bazarstore.az/bütün-məhsullar) in AZN (₼) with historical price tracking and outdated price detection.',
    priceDisclaimerAz:
      'Bazarstore (bazarstore.az/bütün-məhsullar) üzrə 24 saatlıq avtomatik qiymət monitorinqi, qiymət tarixçəsi və köhnəlmiş qiymətlərin aşkarlanması sistemi aktivdir.',
  },
  {
    id: 'rahat',
    name: 'Rahat',
    regionCode: 'AZ',
    country: 'Azerbaijan',
    currency: 'AZN',
    primaryColor: '#D71920',
    secondaryColor: '#FDB913',
    loyaltyProgramName: 'Rahat Kart',
    websiteUrl: 'https://rahatmarket.az',
    adapterStatus: 'DEMO_FALLBACK_ACTIVE',
    isCatalogueAvailable: true,
    lastSyncedAt: '2026-11-11T08:00:00Z',
    priceDisclaimerPl:
      'Ceny referencyjne w AZN (₼) z katalogu demonstracyjnego Rahat Market (Azerbejdżan).',
    priceDisclaimerEn:
      'AZN (₼) reference prices from the Rahat Market Azerbaijan demonstration catalogue.',
    priceDisclaimerAz:
      'Rahat Market nümunə kataloqundan götürülmüş AZN (₼) istinad qiymətləri.',
  },
  {
    id: 'oba',
    name: 'OBA',
    regionCode: 'AZ',
    country: 'Azerbaijan',
    currency: 'AZN',
    primaryColor: '#008D36',
    secondaryColor: '#FFDD00',
    loyaltyProgramName: 'OBA Market Tətbiqi',
    websiteUrl: 'https://obamarket.az',
    adapterStatus: 'COMING_SOON_UNAVAILABLE',
    isCatalogueAvailable: false,
    lastSyncedAt: '2026-11-11T08:00:00Z',
    priceDisclaimerPl:
      'Integracja katalogu sieci dyskontowej OBA Market w przygotowaniu (Wkrótce / Niedostępne).',
    priceDisclaimerEn:
      'OBA Market discount chain live catalogue integration is coming soon / currently unavailable.',
    priceDisclaimerAz:
      'OBA Market şəbəkəsi üzrə birbaşa qiymət kataloqu inteqrasiyası tezliklə əlavə olunacaq (Hazırda əlçatmazdır).',
  },
  {
    id: 'birmarket',
    name: 'Birmarket',
    regionCode: 'AZ',
    country: 'Azerbaijan',
    currency: 'AZN',
    primaryColor: '#FF2E63',
    secondaryColor: '#252A34',
    loyaltyProgramName: 'Birbank / Umico Bonus',
    websiteUrl: 'https://umico.az',
    adapterStatus: 'COMING_SOON_UNAVAILABLE',
    isCatalogueAvailable: false,
    lastSyncedAt: '2026-11-11T08:00:00Z',
    priceDisclaimerPl:
      'Integracja API Birmarket wymaga autoryzowanego klucza partnerskiego (Wkrótce / Niedostępne).',
    priceDisclaimerEn:
      'Birmarket live API integration requires commercial partner credentials (Coming Soon / Unavailable).',
    priceDisclaimerAz:
      'Birmarket onlayn mağaza API inteqrasiyası tərəfdaş giriş açarı tələb edir (Tezliklə / Əlçatmazdır).',
  },
];

export interface PromotionalBannerOffer {
  id: string;
  regionCode: RegionCode;
  currencyCode: CurrencyCode;
  supermarketId: SupermarketSlug;
  supermarketName: string;
  discountBadge: string;
  titlePl: string;
  titleEn: string;
  titleAz: string;
  productCanonical: string;
  promoPricePln: number; // Monetary amount in offer's currencyCode (PLN or AZN)
  regularPricePln: number;
  unitLabel: string;
  loyaltyNotePl: string;
  loyaltyNoteEn: string;
  loyaltyNoteAz: string;
  validUntil: string;
  cardBgColor: string;
  badgeColor: string;
  imageUrl: string;
}

export const CURRENT_OFFERS_PL: PromotionalBannerOffer[] = [
  {
    id: 'offer-biedronka-meat',
    regionCode: 'PL',
    currencyCode: 'PLN',
    supermarketId: 'biedronka',
    supermarketName: 'Biedronka',
    discountBadge: '-26%',
    titlePl: 'Filet z piersi kurczaka Kraina Mięs 1 kg',
    titleEn: 'Kraina Mięs Chicken Breast 1 kg',
    titleAz: 'Kraina Mięs Toyuq döş əti (1 kq)',
    productCanonical: 'chicken_breast',
    promoPricePln: 22.99,
    regularPricePln: 24.90,
    unitLabel: '1 kg',
    loyaltyNotePl: 'Biedronka Warszawa (Glovo / Moja Biedronka)',
    loyaltyNoteEn: 'Biedronka Warsaw (Glovo / Moja Biedronka)',
    loyaltyNoteAz: 'Biedronka Varşava (Glovo / Moja Biedronka)',
    validUntil: '2026-11-16',
    cardBgColor: '#FFE047',
    badgeColor: '#E30613',
    imageUrl: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'offer-biedronka-bananas',
    regionCode: 'PL',
    currencyCode: 'PLN',
    supermarketId: 'biedronka',
    supermarketName: 'Biedronka',
    discountBadge: '-29%',
    titlePl: 'Banany luzem 1 kg',
    titleEn: 'Bananas 1 kg',
    titleAz: 'Banan 1 kq',
    productCanonical: 'banana',
    promoPricePln: 4.99,
    regularPricePln: 6.99,
    unitLabel: '1 kg',
    loyaltyNotePl: 'Biedronka Warszawa (Glovo)',
    loyaltyNoteEn: 'Biedronka Warsaw (Glovo)',
    loyaltyNoteAz: 'Biedronka Varşava (Glovo)',
    validUntil: '2026-11-16',
    cardBgColor: '#E30613',
    badgeColor: '#1B241E',
    imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'offer-biedronka-milk',
    regionCode: 'PL',
    currencyCode: 'PLN',
    supermarketId: 'biedronka',
    supermarketName: 'Biedronka',
    discountBadge: '-13%',
    titlePl: 'Mleko świeże 2,0% 1 L',
    titleEn: 'Fresh Milk 2.0% 1 L',
    titleAz: 'Təzə Süd 2.0% 1 L',
    productCanonical: 'milk',
    promoPricePln: 3.49,
    regularPricePln: 3.99,
    unitLabel: '1 L',
    loyaltyNotePl: 'Biedronka Warszawa (Glovo)',
    loyaltyNoteEn: 'Biedronka Warsaw (Glovo)',
    loyaltyNoteAz: 'Biedronka Varşava (Glovo)',
    validUntil: '2026-11-17',
    cardBgColor: '#196431',
    badgeColor: '#E30613',
    imageUrl: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80',
  },
];

export const CURRENT_OFFERS_AZ: PromotionalBannerOffer[] = [
  {
    id: 'offer-bravo-chicken',
    regionCode: 'AZ',
    currencyCode: 'AZN',
    supermarketId: 'bravo',
    supermarketName: 'Bravo',
    discountBadge: '-22%',
    titlePl: 'Pierś z kurczaka Səba 1 kg',
    titleEn: 'Səba Fresh Chicken Breast 1 kg',
    titleAz: 'Səba Təzə Toyuq Döş Əti 1 kq',
    productCanonical: 'chicken_breast',
    promoPricePln: 10.99,
    regularPricePln: 12.90,
    unitLabel: '1 kq',
    loyaltyNotePl: 'Z aplikacją Umico / Bravo Club',
    loyaltyNoteEn: 'With Umico / Bravo Club card',
    loyaltyNoteAz: 'Umico / Bravo Club bonus kartı ilə',
    validUntil: '2026-11-16',
    cardBgColor: '#58A618',
    badgeColor: '#E30613',
    imageUrl: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'offer-araz-bananas',
    regionCode: 'AZ',
    currencyCode: 'AZN',
    supermarketId: 'araz',
    supermarketName: 'Araz',
    discountBadge: '-25%',
    titlePl: 'Banany Ekwador 1 kg',
    titleEn: 'Ecuador Bananas 1 kg',
    titleAz: 'Ekvador Bananı 1 kq',
    productCanonical: 'banana',
    promoPricePln: 2.69,
    regularPricePln: 3.49,
    unitLabel: '1 kq',
    loyaltyNotePl: 'Z kartą Araz Supermarket',
    loyaltyNoteEn: 'With Araz Supermarket card',
    loyaltyNoteAz: 'Araz Supermarket müştəri kartı ilə',
    validUntil: '2026-11-16',
    cardBgColor: '#F37021',
    badgeColor: '#1E392A',
    imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'offer-bazarstore-milk',
    regionCode: 'AZ',
    currencyCode: 'AZN',
    supermarketId: 'bazarstore',
    supermarketName: 'Bazarstore',
    discountBadge: '-20%',
    titlePl: 'Mleko Milla 2,5% 1 L',
    titleEn: 'Milla Fresh Milk 2.5% 1 L',
    titleAz: 'Milla Təbii Süd 2.5% 1 L',
    productCanonical: 'milk',
    promoPricePln: 2.15,
    regularPricePln: 2.69,
    unitLabel: '1 L',
    loyaltyNotePl: 'Z kartą Super Kart Bazarstore',
    loyaltyNoteEn: 'With Bazarstore Super Kart',
    loyaltyNoteAz: 'Bazarstore Super Kart ilə',
    validUntil: '2026-11-17',
    cardBgColor: '#E31E24',
    badgeColor: '#00A651',
    imageUrl: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=400&q=80',
  },
];

export const CURRENT_OFFERS: PromotionalBannerOffer[] = CURRENT_OFFERS_PL;

export function getPromotionalOffersForRegion(regionCode: RegionCode = 'PL'): PromotionalBannerOffer[] {
  if (regionCode === 'AZ') {
    return CURRENT_OFFERS_AZ;
  }
  return shouldShowPromoIndicators('PL', 'biedronka') ? CURRENT_OFFERS_PL : [];
}

function makePrice(
  productId: string,
  supermarketId: SupermarketSlug,
  regionCode: RegionCode,
  currencyCode: CurrencyCode,
  regularPrice: number,
  promoPrice: number | null,
  packageSize: number,
  packageUnit: 'g' | 'ml' | 'pcs',
  options?: {
    loyaltyRequired?: boolean;
    loyaltyConditionPl?: string;
    loyaltyConditionEn?: string;
    loyaltyConditionAz?: string;
    promoValidUntil?: string;
    storeChannel?: 'PHYSICAL_STORE' | 'ONLINE_AND_STORE' | 'ONLINE_ONLY';
    verificationStatus?: 'VERIFIED_LEAFLET_PROMO' | 'DEMONSTRATION_CATALOGUE' | 'ESTIMATED_MARKET_AVG' | 'UNAVAILABLE';
  }
): ProductPriceRecord {
  const showPromos = shouldShowPromoIndicators(regionCode, supermarketId);
  const effectivePrice = resolvePolicyEffectivePrice(
    regularPrice,
    promoPrice,
    regionCode,
    supermarketId
  );
  let unitPrice = effectivePrice;
  let unitPriceLabel = '';

  const fmt = (val: number) =>
    currencyCode === 'AZN' ? `${val.toFixed(2)} ₼` : `${val.toFixed(2).replace('.', ',')} zł`;

  if (packageUnit === 'g') {
    unitPrice = Number(((effectivePrice / packageSize) * 1000).toFixed(2));
    unitPriceLabel = `${fmt(unitPrice)} / ${regionCode === 'AZ' ? 'kq' : 'kg'}`;
  } else if (packageUnit === 'ml') {
    unitPrice = Number(((effectivePrice / packageSize) * 1000).toFixed(2));
    unitPriceLabel = `${fmt(unitPrice)} / L`;
  } else {
    unitPrice = Number((effectivePrice / packageSize).toFixed(2));
    unitPriceLabel = `${fmt(unitPrice)} / ${regionCode === 'AZ' ? 'ədəd' : 'szt.'}`;
  }

  const discountPercent =
    showPromos && promoPrice !== null && regularPrice > 0
      ? Math.round(((regularPrice - promoPrice) / regularPrice) * 100)
      : null;

  const storeNames: Partial<Record<SupermarketSlug, string>> = {
    biedronka: 'Gazetka / Katalog Demo Biedronka (Polska)',
    lidl: 'Gazetka / Katalog Demo Lidl Polska',
    auchan: 'Katalog Demo Auchan Polska',
    kaufland: 'Katalog Demo Kaufland Polska',
    bravo: 'Bravo Supermarket Azərbaycan (Nümunə Kataloq / Buklet)',
    araz: 'Araz Supermarket Azərbaycan (Nümunə Kataloq / Buklet)',
    bazarstore: 'Bazarstore Azərbaycan (Nümunə Kataloq)',
    rahat: 'Rahat Market Azərbaycan (Nümunə Kataloq)',
  };

  const storeUrls: Partial<Record<SupermarketSlug, string>> = {
    biedronka: 'https://www.biedronka.pl',
    lidl: 'https://www.lidl.pl',
    auchan: 'https://zakupy.auchan.pl',
    kaufland: 'https://www.kaufland.pl',
    bravo: 'https://www.bravosupermarket.az',
    araz: 'https://www.arazmarket.az',
    bazarstore: 'https://bazarstore.az',
    rahat: 'https://rahatmarket.az',
  };

  return {
    id: `price-${productId}-${supermarketId}`,
    productId,
    supermarketId,
    regionCode,
    country: regionCode === 'AZ' ? 'Azerbaijan' : 'Poland',
    currencyCode,
    regularPricePln: regularPrice,
    promoPricePln: promoPrice,
    effectivePricePln: effectivePrice,
    unitPricePln: unitPrice,
    unitPriceLabel,
    loyaltyRequired: showPromos ? options?.loyaltyRequired ?? false : false,
    loyaltyConditionPl: options?.loyaltyConditionPl ?? null,
    loyaltyConditionEn: options?.loyaltyConditionEn ?? null,
    loyaltyConditionAz: options?.loyaltyConditionAz ?? options?.loyaltyConditionEn ?? null,
    promoValidUntil: options?.promoValidUntil ?? null,
    discountPercent,
    storeChannel: options?.storeChannel ?? 'PHYSICAL_STORE',
    storeLocation:
      regionCode === 'AZ'
        ? 'Bakı / Azərbaycan (Regional Nümunə Kataloq)'
        : 'Polska (Ogólnopolska oferta demonstracyjna)',
    sourceName: storeNames[supermarketId] || `Catalogue ${supermarketId}`,
    sourceUrl: storeUrls[supermarketId] || 'https://mealplanner.app',
    verificationStatus:
      options?.verificationStatus ??
      (promoPrice !== null ? 'VERIFIED_LEAFLET_PROMO' : 'DEMONSTRATION_CATALOGUE'),
    lastUpdatedAt: '2026-11-11T08:00:00Z',
  };
}

interface RawPolishProductSeed {
  id: string;
  ean: string;
  canonicalIngredient: string;
  namePl: string;
  nameEn: string;
  nameAz: string;
  brand: string;
  category: ShoppingCategory;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'pcs';
  packageLabelPl: string;
  packageLabelEn: string;
  packageLabelAz: string;
  icon: string;
  imageUrl: string;
  biedronka: { reg: number; promo: number | null; loyaltyPl?: string; loyaltyEn?: string; validUntil?: string };
  lidl: { reg: number; promo: number | null; loyaltyPl?: string; loyaltyEn?: string; validUntil?: string };
  auchan: { reg: number; promo: number | null };
  kaufland: { reg: number; promo: number | null };
  azBrand: string;
  azEan: string;
  bravo: { reg: number; promo: number | null; loyaltyEn?: string; loyaltyAz?: string };
  araz: { reg: number; promo: number | null; loyaltyEn?: string; loyaltyAz?: string };
  bazarstore: { reg: number; promo: number | null };
  rahat: { reg: number; promo: number | null };
}

const RAW_REGIONAL_PRODUCTS: RawPolishProductSeed[] = [
  // 1. Bananas 1 kg — PL: 4,99 zł | AZ: 2.79 ₼ (Bazarstore: Banan kq 2.79 ₼ / 2.99 ₼)
  {
    id: 'prod-banana',
    ean: '5900112233011',
    azEan: '30015539',
    canonicalIngredient: 'banana',
    namePl: 'Banany',
    nameEn: 'Bananas',
    nameAz: 'Banan kq',
    brand: 'Ryneczek Lidla / Warzywniak Biedronki',
    azBrand: 'Meyvə-Tərəvəz / Ekvador',
    category: 'Fruit & Vegetables',
    packageSize: 1000,
    packageUnit: 'g',
    packageLabelPl: '1 kg',
    packageLabelEn: '1 kg',
    packageLabelAz: '1 kq',
    icon: '🍌',
    imageUrl: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 6.99, promo: 4.99, loyaltyPl: 'Z kartą Moja Biedronka', loyaltyEn: 'With Moja Biedronka card', validUntil: '2026-11-16' },
    lidl: { reg: 6.99, promo: 4.19, loyaltyPl: 'Kupon Lidl Plus (-40%)', loyaltyEn: 'Lidl Plus coupon (-40%)', validUntil: '2026-11-15' },
    auchan: { reg: 5.99, promo: 4.89 },
    kaufland: { reg: 6.49, promo: 4.99 },
    bravo: { reg: 3.39, promo: 2.79, loyaltyEn: 'With Umico / Bravo Club', loyaltyAz: 'Umico / Bravo Club ilə' },
    araz: { reg: 3.19, promo: 2.69, loyaltyEn: 'With Araz Kart', loyaltyAz: 'Araz Kart ilə' },
    bazarstore: { reg: 2.99, promo: 2.79 },
    rahat: { reg: 3.19, promo: 2.85 },
  },
  // 2. Tomatoes 500 g — PL: 3,49 zł | AZ: 1.49 ₼ (Bazarstore: Pomidor kq 2.99 ₼/kq -> 1.49 ₼ / 500q)
  {
    id: 'prod-tomato',
    ean: '5900112233028',
    azEan: '30063224',
    canonicalIngredient: 'tomato',
    namePl: 'Pomidory gałązka',
    nameEn: 'Tomatoes',
    nameAz: 'Pomidor (Zirə / Şəmkir)',
    brand: 'Polskie Szklarnie',
    azBrand: 'Meyvə-Tərəvəz / Zirə',
    category: 'Fruit & Vegetables',
    packageSize: 500,
    packageUnit: 'g',
    packageLabelPl: '500 g',
    packageLabelEn: '500 g',
    packageLabelAz: '500 q',
    icon: '🍅',
    imageUrl: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.49, promo: 3.49, validUntil: '2026-11-16' },
    lidl: { reg: 4.29, promo: 3.69 },
    auchan: { reg: 4.19, promo: 3.59 },
    kaufland: { reg: 4.49, promo: 3.49 },
    bravo: { reg: 1.89, promo: 1.55 },
    araz: { reg: 1.79, promo: 1.49 },
    bazarstore: { reg: 1.60, promo: 1.49 },
    rahat: { reg: 1.79, promo: 1.55 },
  },
  // 3. Chicken breast 1 kg — PL: 22,99 zł | AZ: 10.99 ₼ (Bazarstore: Səba Toyuq döş əti kq 10.90 ₼ / 11.90 ₼)
  {
    id: 'prod-chicken-breast',
    ean: '5900112233035',
    azEan: '4760112233035',
    canonicalIngredient: 'chicken_breast',
    namePl: 'Filet z piersi kurczaka Mega Paka',
    nameEn: 'Chicken breast',
    nameAz: 'Səba Toyuq döş əti (filesi) kq',
    brand: 'Kraina Mięs / Rzeźnik',
    azBrand: 'Səba / Mərcan',
    category: 'Meat & Fish',
    packageSize: 1000,
    packageUnit: 'g',
    packageLabelPl: '1 kg',
    packageLabelEn: '1 kg',
    packageLabelAz: '1 kq',
    icon: '🍗',
    imageUrl: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 24.90, promo: 22.99, loyaltyPl: 'Z kartą Moja Biedronka', loyaltyEn: 'With Moja Biedronka card', validUntil: '2026-11-16' },
    lidl: { reg: 24.90, promo: 21.99, loyaltyPl: 'Z aplikacją Lidl Plus', loyaltyEn: 'With Lidl Plus app', validUntil: '2026-11-16' },
    auchan: { reg: 23.99, promo: null },
    kaufland: { reg: 24.49, promo: 22.49 },
    bravo: { reg: 12.90, promo: 10.99, loyaltyEn: 'With Umico / Bravo Club', loyaltyAz: 'Umico / Bravo Club ilə' },
    araz: { reg: 12.50, promo: 10.79, loyaltyEn: 'With Araz Kart', loyaltyAz: 'Araz Kart ilə' },
    bazarstore: { reg: 11.90, promo: 10.90 },
    rahat: { reg: 12.40, promo: 11.10 },
  },
  // 4. Rice 1 kg — PL: 5,99 zł | AZ: 3.99 ₼ (Bazarstore: Besta Basmati Düyü 1 kq 3.99 ₼ / 4.55 ₼)
  {
    id: 'prod-rice',
    ean: '5900112233042',
    azEan: '30201206',
    canonicalIngredient: 'rice',
    namePl: 'Ryż biały długoziarnisty',
    nameEn: 'Rice',
    nameAz: 'Besta Basmati Düyü 1 kq',
    brand: 'Plony Natury / Golden Sun',
    azBrand: 'Besta / Tamashaee',
    category: 'Dry Products',
    packageSize: 1000,
    packageUnit: 'g',
    packageLabelPl: '1 kg',
    packageLabelEn: '1 kg',
    packageLabelAz: '1 kq',
    icon: '🍚',
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 5.99, promo: null },
    lidl: { reg: 5.79, promo: null },
    auchan: { reg: 6.29, promo: null },
    kaufland: { reg: 6.49, promo: 5.89 },
    bravo: { reg: 4.49, promo: null },
    araz: { reg: 4.39, promo: null },
    bazarstore: { reg: 4.55, promo: 3.99 },
    rahat: { reg: 4.59, promo: null },
  },
  // 5. Oat flakes 500 g — PL: 4,49 zł | AZ: 1.59 ₼ (Bazarstore: Ankara Yulaf 500 q 1.59 ₼ / 1.79 ₼)
  {
    id: 'prod-oats',
    ean: '5900112233059',
    azEan: '30200373',
    canonicalIngredient: 'oat_flakes',
    namePl: 'Płatki owsiane górskie',
    nameEn: 'Oat flakes',
    nameAz: 'Ankara Yulaf lopası 500 q',
    brand: 'Plony Natury / Crownfield',
    azBrand: 'Ankara / Makfa',
    category: 'Dry Products',
    packageSize: 500,
    packageUnit: 'g',
    packageLabelPl: '500 g',
    packageLabelEn: '500 g',
    packageLabelAz: '500 q',
    icon: '🌾',
    imageUrl: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.49, promo: null },
    lidl: { reg: 4.29, promo: null },
    auchan: { reg: 4.59, promo: null },
    kaufland: { reg: 4.69, promo: 4.39 },
    bravo: { reg: 1.95, promo: 1.69 },
    araz: { reg: 1.89, promo: 1.65 },
    bazarstore: { reg: 1.79, promo: 1.59 },
    rahat: { reg: 1.95, promo: null },
  },
  // 6. Milk 1 L — PL: 3,49 zł | AZ: 2.15 ₼ (Bazarstore: Milla Təbii Süd 2.5% 1 L 2.15 ₼ / 2.59 ₼)
  {
    id: 'prod-milk',
    ean: '5900112233066',
    azEan: '30036244',
    canonicalIngredient: 'milk',
    namePl: 'Mleko świeże 2,0%',
    nameEn: 'Fresh Milk 2.0%',
    nameAz: 'Milla Təbii Süd 2.5% 1 L',
    brand: 'Mleczna Dolina / Pilos',
    azBrand: 'Milla / Azərsüd',
    category: 'Dairy',
    packageSize: 1000,
    packageUnit: 'ml',
    packageLabelPl: '1 L',
    packageLabelEn: '1 L',
    packageLabelAz: '1 L',
    icon: '🥛',
    imageUrl: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 3.99, promo: 3.49 },
    lidl: { reg: 3.89, promo: 3.39 },
    auchan: { reg: 3.99, promo: 2.99 },
    kaufland: { reg: 3.89, promo: 3.49 },
    bravo: { reg: 2.49, promo: 2.19 },
    araz: { reg: 2.45, promo: 2.15 },
    bazarstore: { reg: 2.59, promo: 2.15 },
    rahat: { reg: 2.49, promo: 2.20 },
  },
  // 7. Eggs 10 pcs — PL: 9,49 zł | AZ: 2.20 ₼ (Bazarstore: Çil-Çil / Giləzi Yumurta 10 lu 2.20 ₼ / 2.50 ₼)
  {
    id: 'prod-eggs',
    ean: '5900112233073',
    azEan: '30187004',
    canonicalIngredient: 'eggs',
    namePl: 'Jaja z wolnego wybiegu klasa M',
    nameEn: 'Free-range Eggs (10 pcs)',
    nameAz: 'Çil-Çil / Giləzi Kənd yumurtası (10 ədəd)',
    brand: 'Moja Kurka / Złota Nioska',
    azBrand: 'Çil-Çil / Giləzi',
    category: 'Dairy',
    packageSize: 10,
    packageUnit: 'pcs',
    packageLabelPl: '10 szt.',
    packageLabelEn: '10 pcs',
    packageLabelAz: '10 ədəd',
    icon: '🥚',
    imageUrl: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 10.99, promo: 9.49 },
    lidl: { reg: 10.79, promo: 9.29 },
    auchan: { reg: 10.49, promo: null },
    kaufland: { reg: 10.89, promo: 9.49 },
    bravo: { reg: 2.60, promo: 2.30 },
    araz: { reg: 2.50, promo: 2.20 },
    bazarstore: { reg: 2.50, promo: 2.20 },
    rahat: { reg: 2.60, promo: 2.35 },
  },
  // 8. Greek Yogurt / Qatiq 400 g — PL: 3,99 zł | AZ: 1.79 ₼ (Bazarstore: Atena Qatıq 1.79 ₼ / 1.99 ₼)
  {
    id: 'prod-skyryogurt',
    ean: '5900112233080',
    azEan: '30184470',
    canonicalIngredient: 'greek_yogurt',
    namePl: 'Jogurt naturalny gęsty / Skyr',
    nameEn: 'Natural Greek Yogurt / Skyr',
    nameAz: 'Atena / Milla Təbii Qatıq',
    brand: 'FruVita / Pilos',
    azBrand: 'Atena / Milla',
    category: 'Dairy',
    packageSize: 400,
    packageUnit: 'g',
    packageLabelPl: '400 g',
    packageLabelEn: '400 g',
    packageLabelAz: '400 q',
    icon: '🥣',
    imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.49, promo: 3.99 },
    lidl: { reg: 4.39, promo: 3.89 },
    auchan: { reg: 4.29, promo: null },
    kaufland: { reg: 4.49, promo: 3.99 },
    bravo: { reg: 2.09, promo: 1.85 },
    araz: { reg: 1.99, promo: 1.79 },
    bazarstore: { reg: 1.99, promo: 1.79 },
    rahat: { reg: 2.09, promo: 1.89 },
  },
  // 9. Cottage Cheese / Kəsmik 250 g — PL: 4,29 zł | AZ: 1.99 ₼ (Bazarstore: Milla / SAB Kəsmik 1.99 ₼ / 2.35 ₼)
  {
    id: 'prod-cottage-cheese',
    ean: '5900112233097',
    azEan: '30204365',
    canonicalIngredient: 'cottage_cheese',
    namePl: 'Twaróg półtłusty krajanka',
    nameEn: 'Semi-skimmed Cottage Cheese (Twaróg)',
    nameAz: 'Milla / SAB Təbii Kəsmik',
    brand: 'Delikate / Pilos',
    azBrand: 'Milla / SAB',
    category: 'Dairy',
    packageSize: 250,
    packageUnit: 'g',
    packageLabelPl: '250 g',
    packageLabelEn: '250 g',
    packageLabelAz: '250 q',
    icon: '🧀',
    imageUrl: 'https://images.unsplash.com/photo-1559561853-08451507cbe7?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.79, promo: 4.29 },
    lidl: { reg: 4.69, promo: 4.19 },
    auchan: { reg: 4.59, promo: null },
    kaufland: { reg: 4.69, promo: 4.29 },
    bravo: { reg: 2.40, promo: 2.09 },
    araz: { reg: 2.35, promo: 1.99 },
    bazarstore: { reg: 2.35, promo: 1.99 },
    rahat: { reg: 2.40, promo: 2.15 },
  },
  // 10. Carrots 1 kg — PL: 2,99 zł | AZ: 1.29 ₼ (Bazarstore: Kök kq 1.29 ₼ promo / 1.49 ₼ regular -13%)
  {
    id: 'prod-carrot',
    ean: '5900112233103',
    azEan: '30036089',
    canonicalIngredient: 'carrot',
    namePl: 'Marchew polska myta',
    nameEn: 'Fresh Carrots (1 kg)',
    nameAz: 'Kök kq',
    brand: 'Warzywniak',
    azBrand: 'Kök / Meyvə-Tərəvəz',
    category: 'Fruit & Vegetables',
    packageSize: 1000,
    packageUnit: 'g',
    packageLabelPl: '1 kg',
    packageLabelEn: '1 kg',
    packageLabelAz: '1 kq',
    icon: '🥕',
    imageUrl: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 3.99, promo: 2.99 },
    lidl: { reg: 3.79, promo: 2.89 },
    auchan: { reg: 3.49, promo: null },
    kaufland: { reg: 3.69, promo: 2.99 },
    bravo: { reg: 1.55, promo: 1.35 },
    araz: { reg: 1.49, promo: 1.29 },
    bazarstore: { reg: 1.49, promo: 1.29 },
    rahat: { reg: 1.55, promo: 1.39 },
  },
  // 11. Potatoes 2 kg — PL: 5,49 zł | AZ: 1.98 ₼ (Bazarstore: Kartof kq 0.99 ₼/kq -> 1.98 ₼ / 2 kq)
  {
    id: 'prod-potato',
    ean: '5900112233110',
    azEan: '30067908',
    canonicalIngredient: 'potato',
    namePl: 'Ziemniaki jadalne',
    nameEn: 'Potatoes',
    nameAz: 'Kartof kq',
    brand: 'Polskie Pola',
    azBrand: 'Meyvə-Tərəvəz / Gədəbəy',
    category: 'Fruit & Vegetables',
    packageSize: 2000,
    packageUnit: 'g',
    packageLabelPl: '2 kg',
    packageLabelEn: '2 kg',
    packageLabelAz: '2 kq',
    icon: '🥔',
    imageUrl: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 6.99, promo: 5.49 },
    lidl: { reg: 6.79, promo: 5.29 },
    auchan: { reg: 6.49, promo: null },
    kaufland: { reg: 6.69, promo: 5.49 },
    bravo: { reg: 2.38, promo: 2.10 },
    araz: { reg: 2.18, promo: 1.98 },
    bazarstore: { reg: 2.18, promo: 1.98 },
    rahat: { reg: 2.38, promo: 2.10 },
  },
  // 12. Onions 1 kg — PL: 3,29 zł | AZ: 1.09 ₼ (Bazarstore: Soğan kq 1.09 ₼ / 1.29 ₼)
  {
    id: 'prod-onion',
    ean: '5900112233127',
    azEan: '30036138',
    canonicalIngredient: 'onion',
    namePl: 'Cebula żółta w siatce',
    nameEn: 'Yellow Onions',
    nameAz: 'Soğan kq',
    brand: 'Warzywniak',
    azBrand: 'Meyvə-Tərəvəz',
    category: 'Fruit & Vegetables',
    packageSize: 1000,
    packageUnit: 'g',
    packageLabelPl: '1 kg',
    packageLabelEn: '1 kg',
    packageLabelAz: '1 kq',
    icon: '🧅',
    imageUrl: 'https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 3.99, promo: 3.29 },
    lidl: { reg: 3.89, promo: 3.19 },
    auchan: { reg: 3.59, promo: null },
    kaufland: { reg: 3.79, promo: 3.29 },
    bravo: { reg: 1.35, promo: 1.15 },
    araz: { reg: 1.29, promo: 1.09 },
    bazarstore: { reg: 1.29, promo: 1.09 },
    rahat: { reg: 1.35, promo: 1.15 },
  },
  // 13. Garlic 100 g — PL: 2,99 zł | AZ: 0.50 ₼ (Bazarstore: Təzə sarımsaq kq 4.99 ₼/kq -> 0.50 ₼ / 100q)
  {
    id: 'prod-garlic',
    ean: '5900112233134',
    azEan: '30090675',
    canonicalIngredient: 'garlic',
    namePl: 'Czosnek polski (2 główki)',
    nameEn: 'Garlic (2 bulbs / ~100 g)',
    nameAz: 'Təzə sarımsaq (100 q)',
    brand: 'Warzywniak',
    azBrand: 'Meyvə-Tərəvəz',
    category: 'Fruit & Vegetables',
    packageSize: 100,
    packageUnit: 'g',
    packageLabelPl: '100 g',
    packageLabelEn: '100 g',
    packageLabelAz: '100 q',
    icon: '🧄',
    imageUrl: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 3.49, promo: 2.99 },
    lidl: { reg: 3.39, promo: 2.89 },
    auchan: { reg: 3.29, promo: null },
    kaufland: { reg: 3.49, promo: 2.99 },
    bravo: { reg: 0.65, promo: 0.55 },
    araz: { reg: 0.60, promo: 0.50 },
    bazarstore: { reg: 0.60, promo: 0.50 },
    rahat: { reg: 0.65, promo: 0.55 },
  },
  // 14. Broccoli 500 g — PL: 4,49 zł | AZ: 3.75 ₼ (Bazarstore: Brokoli 500 q 3.75 ₼ / 4.20 ₼)
  {
    id: 'prod-broccoli',
    ean: '5900112233141',
    azEan: '30036033',
    canonicalIngredient: 'broccoli',
    namePl: 'Brokuł świeży',
    nameEn: 'Fresh Broccoli',
    nameAz: 'Brokoli (500 q)',
    brand: 'Warzywniak',
    azBrand: 'Meyvə-Tərəvəz / Bonduelle',
    category: 'Fruit & Vegetables',
    packageSize: 500,
    packageUnit: 'g',
    packageLabelPl: '500 g',
    packageLabelEn: '500 g',
    packageLabelAz: '500 q',
    icon: '🥦',
    imageUrl: 'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 5.99, promo: 4.49 },
    lidl: { reg: 5.79, promo: 4.39 },
    auchan: { reg: 5.49, promo: null },
    kaufland: { reg: 5.69, promo: 4.49 },
    bravo: { reg: 4.25, promo: 3.79 },
    araz: { reg: 4.15, promo: 3.69 },
    bazarstore: { reg: 4.20, promo: 3.75 },
    rahat: { reg: 4.25, promo: 3.85 },
  },
  // 15. Spinach & Greens 200 g — PL: 4,29 zł | AZ: 1.19 ₼ (Bazarstore: Təzə ispanaq və göyərti 1.19 ₼ / 1.49 ₼)
  {
    id: 'prod-spinach',
    ean: '5900112233158',
    azEan: '30189175',
    canonicalIngredient: 'spinach',
    namePl: 'Szpinak baby myty',
    nameEn: 'Baby Spinach & Fresh Greens',
    nameAz: 'Təzə ispanaq və göyərti dəsti',
    brand: 'Vital Fresh',
    azBrand: 'Meyvə-Tərəvəz',
    category: 'Fruit & Vegetables',
    packageSize: 200,
    packageUnit: 'g',
    packageLabelPl: '200 g',
    packageLabelEn: '200 g',
    packageLabelAz: '200 q',
    icon: '🥬',
    imageUrl: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.99, promo: 4.29 },
    lidl: { reg: 4.89, promo: 4.19 },
    auchan: { reg: 4.69, promo: null },
    kaufland: { reg: 4.89, promo: 4.29 },
    bravo: { reg: 1.55, promo: 1.25 },
    araz: { reg: 1.49, promo: 1.19 },
    bazarstore: { reg: 1.49, promo: 1.19 },
    rahat: { reg: 1.55, promo: 1.25 },
  },
  // 16. Apples 1 kg — PL: 3,49 zł | AZ: 2.29 ₼ (Bazarstore: Alma Fuji kq 2.29 ₼ / 2.49 ₼)
  {
    id: 'prod-apple',
    ean: '5900112233165',
    azEan: '30056711',
    canonicalIngredient: 'apple',
    namePl: 'Jabłka polskie Gala / Szampion',
    nameEn: 'Fresh Apples (Gala / Fuji)',
    nameAz: 'Alma Fuji / Quba kq',
    brand: 'Polskie Sady',
    azBrand: 'Meyvə-Tərəvəz / Quba',
    category: 'Fruit & Vegetables',
    packageSize: 1000,
    packageUnit: 'g',
    packageLabelPl: '1 kg',
    packageLabelEn: '1 kg',
    packageLabelAz: '1 kq',
    icon: '🍎',
    imageUrl: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.49, promo: 3.49 },
    lidl: { reg: 4.39, promo: 3.39 },
    auchan: { reg: 3.99, promo: null },
    kaufland: { reg: 4.29, promo: 3.49 },
    bravo: { reg: 2.49, promo: 2.19 },
    araz: { reg: 2.45, promo: 2.19 },
    bazarstore: { reg: 2.49, promo: 2.29 },
    rahat: { reg: 2.49, promo: 2.25 },
  },
  // 17. Meat Cut (Pork Loin in PL / Lean Beef & Veal in AZ) — PL: 17,99 zł | AZ: 17.48 ₼ (Bazarstore: Bol Ət Dana əti kq)
  {
    id: 'prod-pork-loin',
    ean: '5900112233172',
    azEan: '30036726',
    canonicalIngredient: 'pork_loin',
    namePl: 'Schab wieprzowy bez kości',
    nameEn: 'Boneless Loin / Lean Roast Meat',
    nameAz: 'Bol Ət Dana əti kq',
    brand: 'Kraina Mięs / Rzeźnik',
    azBrand: 'Bol Ət / Təzə Ət',
    category: 'Meat & Fish',
    packageSize: 1000,
    packageUnit: 'g',
    packageLabelPl: '1 kg',
    packageLabelEn: '1 kg',
    packageLabelAz: '1 kq',
    icon: '🥩',
    imageUrl: 'https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 23.99, promo: 17.99, loyaltyPl: 'Z kartą Moja Biedronka', loyaltyEn: 'With Moja Biedronka card', validUntil: '2026-11-16' },
    lidl: { reg: 23.49, promo: 18.49 },
    auchan: { reg: 22.99, promo: null },
    kaufland: { reg: 23.49, promo: 17.99 },
    bravo: { reg: 18.50, promo: 16.90 },
    araz: { reg: 18.20, promo: 16.90 },
    bazarstore: { reg: 17.99, promo: 17.48 },
    rahat: { reg: 18.50, promo: 17.20 },
  },
  // 18. Salmon 300 g — PL: 21,99 zł | AZ: 12.90 ₼
  {
    id: 'prod-salmon',
    ean: '5900112233189',
    azEan: '30051513',
    canonicalIngredient: 'salmon',
    namePl: 'Filet z łososia atlantyckiego',
    nameEn: 'Atlantic Salmon Fillet',
    nameAz: 'Qızılbalıq / Forel filesi (300 q)',
    brand: 'Marinero / Nautica',
    azBrand: 'Caspian Fish / Russkoe More',
    category: 'Meat & Fish',
    packageSize: 300,
    packageUnit: 'g',
    packageLabelPl: '300 g',
    packageLabelEn: '300 g',
    packageLabelAz: '300 q',
    icon: '🐟',
    imageUrl: 'https://images.unsplash.com/photo-1599084993091-1cb5c0721cc6?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 24.99, promo: 21.99 },
    lidl: { reg: 24.49, promo: 20.99 },
    auchan: { reg: 23.99, promo: null },
    kaufland: { reg: 24.49, promo: 21.49 },
    bravo: { reg: 14.50, promo: 12.90 },
    araz: { reg: 14.20, promo: 12.50 },
    bazarstore: { reg: 14.90, promo: 12.90 },
    rahat: { reg: 14.50, promo: 12.90 },
  },
  // 19. Tofu 180 g — PL: 3,99 zł | AZ: 2.59 ₼
  {
    id: 'prod-tofu',
    ean: '5900112233196',
    azEan: '4760112233196',
    canonicalIngredient: 'tofu',
    namePl: 'Tofu naturalne BIO',
    nameEn: 'Organic Natural Tofu',
    nameAz: 'Təbii Tofu / Pəhriz pendiri',
    brand: 'GoVege / Vemondo',
    azBrand: 'EcoFood / Atena',
    category: 'Dairy',
    packageSize: 180,
    packageUnit: 'g',
    packageLabelPl: '180 g',
    packageLabelEn: '180 g',
    packageLabelAz: '180 q',
    icon: '🧊',
    imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.99, promo: 3.99 },
    lidl: { reg: 4.79, promo: 3.79 },
    auchan: { reg: 4.89, promo: null },
    kaufland: { reg: 4.79, promo: 3.99 },
    bravo: { reg: 2.99, promo: 2.69 },
    araz: { reg: 2.89, promo: 2.59 },
    bazarstore: { reg: 2.99, promo: 2.59 },
    rahat: { reg: 2.99, promo: 2.69 },
  },
  // 20. Pasta / Noodles 500 g — PL: 4,29 zł | AZ: 1.65 ₼ (Bazarstore: Ankara Makaron 500 q 1.65 ₼ / 1.90 ₼)
  {
    id: 'prod-pasta',
    ean: '5900112233202',
    azEan: '30002973',
    canonicalIngredient: 'pasta',
    namePl: 'Makaron pełnoziarnisty Penne / Spaghetti',
    nameEn: 'Wholegrain Pasta / Dumpling Dough',
    nameAz: 'Ankara Makaron 500 q',
    brand: 'Pastani / Combino',
    azBrand: 'Ankara / Karmen',
    category: 'Dry Products',
    packageSize: 500,
    packageUnit: 'g',
    packageLabelPl: '500 g',
    packageLabelEn: '500 g',
    packageLabelAz: '500 q',
    icon: '🍝',
    imageUrl: 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.99, promo: 4.29 },
    lidl: { reg: 4.89, promo: 4.19 },
    auchan: { reg: 4.79, promo: null },
    kaufland: { reg: 4.89, promo: 4.29 },
    bravo: { reg: 1.95, promo: 1.75 },
    araz: { reg: 1.90, promo: 1.69 },
    bazarstore: { reg: 1.90, promo: 1.65 },
    rahat: { reg: 1.95, promo: 1.75 },
  },
  // 21. Red Lentils 400 g — PL: 4,99 zł | AZ: 1.90 ₼ (Bazarstore: Ankara / Azərsun Qırmızı Mərci 400 q 1.90 ₼ / 2.15 ₼)
  {
    id: 'prod-lentils',
    ean: '5900112233219',
    azEan: '30200371',
    canonicalIngredient: 'red_lentils',
    namePl: 'Soczewica czerwona',
    nameEn: 'Red Lentils',
    nameAz: 'Ankara / Azərsun Qırmızı Mərci',
    brand: 'Plony Natury / Golden Sun',
    azBrand: 'Ankara / Azərsun',
    category: 'Dry Products',
    packageSize: 400,
    packageUnit: 'g',
    packageLabelPl: '400 g',
    packageLabelEn: '400 g',
    packageLabelAz: '400 q',
    icon: '🫘',
    imageUrl: 'https://images.unsplash.com/photo-1515543904379-3d757afe72e4?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 5.99, promo: 4.99 },
    lidl: { reg: 5.79, promo: 4.89 },
    auchan: { reg: 5.69, promo: null },
    kaufland: { reg: 5.89, promo: 4.99 },
    bravo: { reg: 2.25, promo: 1.99 },
    araz: { reg: 2.19, promo: 1.95 },
    bazarstore: { reg: 2.15, promo: 1.90 },
    rahat: { reg: 2.25, promo: 1.99 },
  },
  // 22. Wholegrain Bread & Lavash 500 g — PL: 4,49 zł | AZ: 1.15 ₼ (Bazarstore: Çörəkçi Kəpəkli Çörək / Lavaş)
  {
    id: 'prod-bread',
    ean: '5900112233226',
    azEan: '30207092',
    canonicalIngredient: 'wholegrain_bread',
    namePl: 'Chleb żytni razowy krojony',
    nameEn: 'Sliced Wholegrain Bread & Flatbread',
    nameAz: 'Çörəkçi Kəpəkli Çörək və Lavaş',
    brand: 'Piekarnia Biedronki / Chrupiące z Pieca',
    azBrand: 'Çörəkçi / Xonça',
    category: 'Bakery',
    packageSize: 500,
    packageUnit: 'g',
    packageLabelPl: '500 g',
    packageLabelEn: '500 g',
    packageLabelAz: '500 q',
    icon: '🍞',
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.99, promo: 4.49 },
    lidl: { reg: 4.89, promo: 4.39 },
    auchan: { reg: 4.79, promo: null },
    kaufland: { reg: 4.89, promo: 4.49 },
    bravo: { reg: 1.35, promo: 1.15 },
    araz: { reg: 1.30, promo: 1.15 },
    bazarstore: { reg: 1.35, promo: 1.15 },
    rahat: { reg: 1.35, promo: 1.20 },
  },
  // 23. Olive Oil / Cooking Oil 500 ml — PL: 16,99 zł | AZ: 6.99 ₼ (Bazarstore: Zeytun Bağları Zeytun Yağı 500 ml)
  {
    id: 'prod-olive-oil',
    ean: '5900112233233',
    azEan: '30187516',
    canonicalIngredient: 'olive_oil',
    namePl: 'Oliwa z oliwek Extra Virgin / Olej rzepakowy',
    nameEn: 'Olive Oil / Cooking Oil',
    nameAz: 'Zeytun Bağları Zeytun Yağı 500 ml',
    brand: 'Gallo / Primadonna',
    azBrand: 'Zeytun Bağları',
    category: 'Other',
    packageSize: 500,
    packageUnit: 'ml',
    packageLabelPl: '500 ml',
    packageLabelEn: '500 ml',
    packageLabelAz: '500 ml',
    icon: '🫒',
    imageUrl: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 19.99, promo: 16.99 },
    lidl: { reg: 19.49, promo: 16.49 },
    auchan: { reg: 18.99, promo: null },
    kaufland: { reg: 19.49, promo: 16.99 },
    bravo: { reg: 8.99, promo: 7.49 },
    araz: { reg: 8.80, promo: 7.29 },
    bazarstore: { reg: 8.99, promo: 6.99 },
    rahat: { reg: 8.99, promo: 7.49 },
  },
  // 24. Sweet Paprika & Saffron / Turmeric 20 g — PL: 1,69 zł | AZ: 0.39 ₼ (Bazarstore: Nemetova Sarıkök 20 q 0.39 ₼)
  {
    id: 'prod-paprika',
    ean: '5900112233240',
    azEan: '30021870',
    canonicalIngredient: 'paprika',
    namePl: 'Papryka słodka mielona',
    nameEn: 'Sweet Ground Paprika & Spices',
    nameAz: 'Nemetova Sarıkök və Şirin Bibər 20 q',
    brand: 'Prymat / Mikado',
    azBrand: 'Nemetova / İpəkyolu',
    category: 'Other',
    packageSize: 20,
    packageUnit: 'g',
    packageLabelPl: '20 g',
    packageLabelEn: '20 g',
    packageLabelAz: '20 q',
    icon: '🌶️',
    imageUrl: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 1.99, promo: 1.69 },
    lidl: { reg: 1.89, promo: 1.59 },
    auchan: { reg: 1.79, promo: null },
    kaufland: { reg: 1.89, promo: 1.69 },
    bravo: { reg: 0.60, promo: 0.45 },
    araz: { reg: 0.55, promo: 0.39 },
    bazarstore: { reg: 0.55, promo: 0.39 },
    rahat: { reg: 0.60, promo: 0.45 },
  },
  // 25. Canned Tomatoes 400 g — PL: 2,99 zł | AZ: 1.89 ₼ (Bazarstore: Bizim Tarla Soyulmuş Pomidor 400 q)
  {
    id: 'prod-canned-tomatoes',
    ean: '5900112233257',
    azEan: '30198382',
    canonicalIngredient: 'canned_tomatoes',
    namePl: 'Pomidory krojone w puszce',
    nameEn: 'Chopped Canned Tomatoes',
    nameAz: 'Bizim Tarla Soyulmuş Pomidor Konservi',
    brand: 'Culineo / Baresa',
    azBrand: 'Bizim Tarla / Bağdan',
    category: 'Dry Products',
    packageSize: 400,
    packageUnit: 'g',
    packageLabelPl: '400 g',
    packageLabelEn: '400 g',
    packageLabelAz: '400 q',
    icon: '🥫',
    imageUrl: 'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 3.49, promo: 2.99 },
    lidl: { reg: 3.39, promo: 2.89 },
    auchan: { reg: 3.29, promo: null },
    kaufland: { reg: 3.49, promo: 2.99 },
    bravo: { reg: 2.25, promo: 1.95 },
    araz: { reg: 2.19, promo: 1.89 },
    bazarstore: { reg: 2.19, promo: 1.89 },
    rahat: { reg: 2.25, promo: 1.95 },
  },
  // 26. Frozen Vegetables 450 g — PL: 4,49 zł | AZ: 3.80 ₼ (Bazarstore: Vici / Superfresh Dondurulmuş Tərəvəz)
  {
    id: 'prod-frozen-veggies',
    ean: '5900112233264',
    azEan: '30205355',
    canonicalIngredient: 'frozen_vegetables',
    namePl: 'Warzywa na patelnię / Mieszanka warzywna',
    nameEn: 'Frozen Mixed Vegetables',
    nameAz: 'Vici / Superfresh Dondurulmuş Tərəvəz Qarışığı',
    brand: 'Mroźna Kraina / Freshona',
    azBrand: 'Vici / Superfresh',
    category: 'Frozen Products',
    packageSize: 450,
    packageUnit: 'g',
    packageLabelPl: '450 g',
    packageLabelEn: '450 g',
    packageLabelAz: '450 q',
    icon: '❄️',
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 5.49, promo: 4.49 },
    lidl: { reg: 5.29, promo: 4.39 },
    auchan: { reg: 5.19, promo: null },
    kaufland: { reg: 5.39, promo: 4.49 },
    bravo: { reg: 4.39, promo: 3.89 },
    araz: { reg: 4.29, promo: 3.79 },
    bazarstore: { reg: 4.40, promo: 3.80 },
    rahat: { reg: 4.39, promo: 3.89 },
  },
  // 27. Oat Milk 1 L — PL: 4,99 zł | AZ: 4.49 ₼ (Bazarstore: Alpro Yulaf Südü 1 L)
  {
    id: 'prod-plant-milk',
    ean: '5900112233271',
    azEan: '30205380',
    canonicalIngredient: 'oat_milk',
    namePl: 'Napój owsiany bez laktozy',
    nameEn: 'Oat Plant Drink (Lactose-free)',
    nameAz: 'Alpro Yulaf Südü (Bitki İçkisi) 1 L',
    brand: 'GoVege / Vemondo',
    azBrand: 'Alpro',
    category: 'Drinks',
    packageSize: 1000,
    packageUnit: 'ml',
    packageLabelPl: '1 L',
    packageLabelEn: '1 L',
    packageLabelAz: '1 L',
    icon: '🥛',
    imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 5.99, promo: 4.99 },
    lidl: { reg: 5.79, promo: 4.79 },
    auchan: { reg: 5.69, promo: null },
    kaufland: { reg: 5.89, promo: 4.99 },
    bravo: { reg: 5.29, promo: 4.49 },
    araz: { reg: 5.19, promo: 4.39 },
    bazarstore: { reg: 5.49, promo: 4.49 },
    rahat: { reg: 5.29, promo: 4.49 },
  },
  // === Verified Glovo Warsaw Biedronka Economy & Premium Staples (from active snapshot snap-bd-waw-1795454272470-iw2v) ===
  {
    id: 'prod-buckwheat',
    ean: '5900497001001',
    azEan: '4760099001001',
    canonicalIngredient: 'buckwheat',
    namePl: 'Plony Natury Kasza gryczana prażona 400 g',
    nameEn: 'Roasted Buckwheat Groats (Kasza gryczana)',
    nameAz: 'Qovrulmuş qarabaşaq yarması',
    brand: 'Plony Natury',
    azBrand: 'Bizim Tarla',
    category: 'Dry Products',
    packageSize: 400,
    packageUnit: 'g',
    packageLabelPl: '400 g',
    packageLabelEn: '400 g',
    packageLabelAz: '400 q',
    icon: '🌾',
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 3.99, promo: null },
    lidl: { reg: 3.99, promo: null },
    auchan: { reg: 3.99, promo: null },
    kaufland: { reg: 3.99, promo: null },
    bravo: { reg: 2.29, promo: null },
    araz: { reg: 2.19, promo: null },
    bazarstore: { reg: 2.39, promo: null },
    rahat: { reg: 2.29, promo: null },
  },
  {
    id: 'prod-chickpeas',
    ean: '5900497001002',
    azEan: '4760099001002',
    canonicalIngredient: 'chickpeas',
    namePl: 'Nasza Spiżarnia Ciecierzyca 540 g',
    nameEn: 'Cooked Chickpeas (540 g jar)',
    nameAz: 'Bişmiş noxud (540 q)',
    brand: 'Nasza Spiżarnia',
    azBrand: 'Bizim Tarla',
    category: 'Dry Products',
    packageSize: 540,
    packageUnit: 'g',
    packageLabelPl: '540 g',
    packageLabelEn: '540 g',
    packageLabelAz: '540 q',
    icon: '🫘',
    imageUrl: 'https://images.unsplash.com/photo-1515543904379-3d757afe72e4?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 6.49, promo: null },
    lidl: { reg: 6.49, promo: null },
    auchan: { reg: 6.49, promo: null },
    kaufland: { reg: 6.49, promo: null },
    bravo: { reg: 3.29, promo: null },
    araz: { reg: 3.19, promo: null },
    bazarstore: { reg: 3.39, promo: null },
    rahat: { reg: 3.29, promo: null },
  },
  {
    id: 'prod-sunflower-seeds',
    ean: '5900497001003',
    azEan: '4760099001003',
    canonicalIngredient: 'sunflower_seeds',
    namePl: "BakaD'Or Słonecznik łuskany 500 g",
    nameEn: 'Shelled Sunflower Seeds (500 g)',
    nameAz: 'Təmizlənmiş günəbaxan tumu (500 q)',
    brand: "BakaD'Or",
    azBrand: 'Araz',
    category: 'Dry Products',
    packageSize: 500,
    packageUnit: 'g',
    packageLabelPl: '500 g',
    packageLabelEn: '500 g',
    packageLabelAz: '500 q',
    icon: '🌻',
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 6.98, promo: null },
    lidl: { reg: 6.98, promo: null },
    auchan: { reg: 6.98, promo: null },
    kaufland: { reg: 6.98, promo: null },
    bravo: { reg: 3.49, promo: null },
    araz: { reg: 3.39, promo: null },
    bazarstore: { reg: 3.59, promo: null },
    rahat: { reg: 3.49, promo: null },
  },
  {
    id: 'prod-beets',
    ean: '5900497001004',
    azEan: '4760099001004',
    canonicalIngredient: 'beets',
    namePl: 'Buraki czerwone gotowane 500 g',
    nameEn: 'Cooked Red Beetroot (500 g)',
    nameAz: 'Bişmiş qırmızı çuğundur (500 q)',
    brand: 'Biedronka',
    azBrand: 'Yerli',
    category: 'Fruit & Vegetables',
    packageSize: 500,
    packageUnit: 'g',
    packageLabelPl: '500 g',
    packageLabelEn: '500 g',
    packageLabelAz: '500 q',
    icon: '🟣',
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.79, promo: null },
    lidl: { reg: 4.79, promo: null },
    auchan: { reg: 4.79, promo: null },
    kaufland: { reg: 4.79, promo: null },
    bravo: { reg: 2.19, promo: null },
    araz: { reg: 2.09, promo: null },
    bazarstore: { reg: 2.29, promo: null },
    rahat: { reg: 2.19, promo: null },
  },
  {
    id: 'prod-hummus',
    ean: '5900497001005',
    azEan: '4760099001005',
    canonicalIngredient: 'hummus',
    namePl: 'Go Vege Hummus orientalny 160 g',
    nameEn: 'Oriental Chickpea Hummus (160 g)',
    nameAz: 'Şərq üsulu humus (160 q)',
    brand: 'Go Vege',
    azBrand: 'Bravo',
    category: 'Dairy',
    packageSize: 160,
    packageUnit: 'g',
    packageLabelPl: '160 g',
    packageLabelEn: '160 g',
    packageLabelAz: '160 q',
    icon: '🥣',
    imageUrl: 'https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 4.29, promo: null },
    lidl: { reg: 4.29, promo: null },
    auchan: { reg: 4.29, promo: null },
    kaufland: { reg: 4.29, promo: null },
    bravo: { reg: 2.49, promo: null },
    araz: { reg: 2.39, promo: null },
    bazarstore: { reg: 2.59, promo: null },
    rahat: { reg: 2.49, promo: null },
  },
  {
    id: 'prod-wild-mushrooms',
    ean: '5900497001006',
    azEan: '4760099001006',
    canonicalIngredient: 'wild_mushrooms',
    namePl: 'Mroźna Kraina Podgrzybki krojone 250 g',
    nameEn: 'Sliced Polish Forest Bay Boletes (Podgrzybki, 250 g)',
    nameAz: 'Doğranmış meşə göbələyi (Podqribki, 250 q)',
    brand: 'Mroźna Kraina',
    azBrand: 'Bravo',
    category: 'Frozen Products',
    packageSize: 250,
    packageUnit: 'g',
    packageLabelPl: '250 g',
    packageLabelEn: '250 g',
    packageLabelAz: '250 q',
    icon: '🍄',
    imageUrl: 'https://images.unsplash.com/photo-1504545102780-2dd7ebe4c2bb?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 10.99, promo: null },
    lidl: { reg: 10.99, promo: null },
    auchan: { reg: 10.99, promo: null },
    kaufland: { reg: 10.99, promo: null },
    bravo: { reg: 5.49, promo: null },
    araz: { reg: 5.29, promo: null },
    bazarstore: { reg: 5.59, promo: null },
    rahat: { reg: 5.49, promo: null },
  },
  {
    id: 'prod-almonds',
    ean: '5900497001007',
    azEan: '4760099001007',
    canonicalIngredient: 'almonds',
    namePl: 'Bakello Migdały łuskane 300 g',
    nameEn: 'Shelled Almonds (300 g)',
    nameAz: 'Qabıqsız badam (300 q)',
    brand: 'Bakello',
    azBrand: 'Quba',
    category: 'Dry Products',
    packageSize: 300,
    packageUnit: 'g',
    packageLabelPl: '300 g',
    packageLabelEn: '300 g',
    packageLabelAz: '300 q',
    icon: '🌰',
    imageUrl: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 16.99, promo: null },
    lidl: { reg: 16.99, promo: null },
    auchan: { reg: 16.99, promo: null },
    kaufland: { reg: 16.99, promo: null },
    bravo: { reg: 8.49, promo: null },
    araz: { reg: 8.29, promo: null },
    bazarstore: { reg: 8.69, promo: null },
    rahat: { reg: 8.49, promo: null },
  },
  {
    id: 'prod-cashews',
    ean: '5900497001008',
    azEan: '4760099001008',
    canonicalIngredient: 'cashews',
    namePl: 'Orzechy nerkowca ok. 300 g',
    nameEn: 'Cashew Nuts (300 g)',
    nameAz: 'Keşyu fındığı (300 q)',
    brand: 'Biedronka',
    azBrand: 'Bravo',
    category: 'Dry Products',
    packageSize: 300,
    packageUnit: 'g',
    packageLabelPl: '300 g',
    packageLabelEn: '300 g',
    packageLabelAz: '300 q',
    icon: '🥜',
    imageUrl: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 16.47, promo: null },
    lidl: { reg: 16.47, promo: null },
    auchan: { reg: 16.47, promo: null },
    kaufland: { reg: 16.47, promo: null },
    bravo: { reg: 8.29, promo: null },
    araz: { reg: 8.19, promo: null },
    bazarstore: { reg: 8.49, promo: null },
    rahat: { reg: 8.29, promo: null },
  },
  {
    id: 'prod-hazelnuts',
    ean: '5900497001009',
    azEan: '4760099001009',
    canonicalIngredient: 'hazelnuts',
    namePl: 'Bakallino Orzechy laskowe 300 g',
    nameEn: 'Hazelnuts (300 g)',
    nameAz: 'Fındıq ləpəsi (300 q)',
    brand: 'Bakallino',
    azBrand: 'Zaqatala',
    category: 'Dry Products',
    packageSize: 300,
    packageUnit: 'g',
    packageLabelPl: '300 g',
    packageLabelEn: '300 g',
    packageLabelAz: '300 q',
    icon: '🌰',
    imageUrl: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 19.89, promo: null },
    lidl: { reg: 19.89, promo: null },
    auchan: { reg: 19.89, promo: null },
    kaufland: { reg: 19.89, promo: null },
    bravo: { reg: 9.49, promo: null },
    araz: { reg: 9.29, promo: null },
    bazarstore: { reg: 9.69, promo: null },
    rahat: { reg: 9.49, promo: null },
  },
  {
    id: 'prod-pistachios',
    ean: '5900497001010',
    azEan: '4760099001010',
    canonicalIngredient: 'pistachios',
    namePl: "BakaD'Or Pistacje prażone solone 250 g",
    nameEn: 'Roasted Pistachios (250 g)',
    nameAz: 'Qovrulmuş püstə (250 q)',
    brand: "BakaD'Or",
    azBrand: 'Bravo',
    category: 'Dry Products',
    packageSize: 250,
    packageUnit: 'g',
    packageLabelPl: '250 g',
    packageLabelEn: '250 g',
    packageLabelAz: '250 q',
    icon: '🟢',
    imageUrl: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 17.49, promo: null },
    lidl: { reg: 17.49, promo: null },
    auchan: { reg: 17.49, promo: null },
    kaufland: { reg: 17.49, promo: null },
    bravo: { reg: 8.99, promo: null },
    araz: { reg: 8.79, promo: null },
    bazarstore: { reg: 9.19, promo: null },
    rahat: { reg: 8.99, promo: null },
  },
  {
    id: 'prod-avocado',
    ean: '5900497001011',
    azEan: '4760099001011',
    canonicalIngredient: 'avocado',
    namePl: 'Awokado Hass 500 g',
    nameEn: 'Hass Avocado (500 g)',
    nameAz: 'Hass avokado (500 q)',
    brand: 'Biedronka',
    azBrand: 'Bravo',
    category: 'Fruit & Vegetables',
    packageSize: 500,
    packageUnit: 'g',
    packageLabelPl: '500 g',
    packageLabelEn: '500 g',
    packageLabelAz: '500 q',
    icon: '🥑',
    imageUrl: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 12.99, promo: null },
    lidl: { reg: 12.99, promo: null },
    auchan: { reg: 12.99, promo: null },
    kaufland: { reg: 12.99, promo: null },
    bravo: { reg: 6.49, promo: null },
    araz: { reg: 6.29, promo: null },
    bazarstore: { reg: 6.69, promo: null },
    rahat: { reg: 6.49, promo: null },
  },
  {
    id: 'prod-blueberries',
    ean: '5900497001012',
    azEan: '4760099001012',
    canonicalIngredient: 'blueberries',
    namePl: 'Nasza Spiżarnia Borówka 300 g',
    nameEn: 'Blueberries (Borówka, 300 g)',
    nameAz: 'Qaragilə (300 q)',
    brand: 'Nasza Spiżarnia',
    azBrand: 'Bravo',
    category: 'Fruit & Vegetables',
    packageSize: 300,
    packageUnit: 'g',
    packageLabelPl: '300 g',
    packageLabelEn: '300 g',
    packageLabelAz: '300 q',
    icon: '🫐',
    imageUrl: 'https://images.unsplash.com/photo-1498557850523-fd3d118b962e?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 8.99, promo: null },
    lidl: { reg: 8.99, promo: null },
    auchan: { reg: 8.99, promo: null },
    kaufland: { reg: 8.99, promo: null },
    bravo: { reg: 4.99, promo: null },
    araz: { reg: 4.89, promo: null },
    bazarstore: { reg: 5.19, promo: null },
    rahat: { reg: 4.99, promo: null },
  },
  {
    id: 'prod-sun-dried-tomatoes',
    ean: '5900497001013',
    azEan: '4760099001013',
    canonicalIngredient: 'sun_dried_tomatoes',
    namePl: 'Nasza Spiżarnia Pomidory suszone z pestkami dyni i ziołami 270 g',
    nameEn: 'Sun-Dried Tomatoes with Pumpkin Seeds & Herbs (270 g)',
    nameAz: 'Balqabaq tumlu və otlu qurudulmuş pomidor (270 q)',
    brand: 'Nasza Spiżarnia',
    azBrand: 'Bravo',
    category: 'Dry Products',
    packageSize: 270,
    packageUnit: 'g',
    packageLabelPl: '270 g',
    packageLabelEn: '270 g',
    packageLabelAz: '270 q',
    icon: '🍅',
    imageUrl: 'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 7.49, promo: null },
    lidl: { reg: 7.49, promo: null },
    auchan: { reg: 7.49, promo: null },
    kaufland: { reg: 7.49, promo: null },
    bravo: { reg: 3.99, promo: null },
    araz: { reg: 3.89, promo: null },
    bazarstore: { reg: 4.19, promo: null },
    rahat: { reg: 3.99, promo: null },
  },
  {
    id: 'prod-tofu-pesto',
    ean: '5900497001014',
    azEan: '4760099001014',
    canonicalIngredient: 'tofu_pesto',
    namePl: 'Go Vege Pesto z tofu 190 g',
    nameEn: 'Plant-Based Tofu Pesto (190 g)',
    nameAz: 'Bitki mənşəli tofu pesto (190 q)',
    brand: 'Go Vege',
    azBrand: 'Bravo',
    category: 'Dry Products',
    packageSize: 190,
    packageUnit: 'g',
    packageLabelPl: '190 g',
    packageLabelEn: '190 g',
    packageLabelAz: '190 q',
    icon: '🌿',
    imageUrl: 'https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=300&q=80',
    biedronka: { reg: 6.99, promo: null },
    lidl: { reg: 6.99, promo: null },
    auchan: { reg: 6.99, promo: null },
    kaufland: { reg: 6.99, promo: null },
    bravo: { reg: 3.79, promo: null },
    araz: { reg: 3.69, promo: null },
    bazarstore: { reg: 3.89, promo: null },
    rahat: { reg: 3.79, promo: null },
  },
];

/**
 * Snapshot-only Polish catalogue entries for authentic specialty ingredients
 * (pearl barley groats for traditional Polish Krupnik; Arborio risotto rice for Italian Risotto).
 * Intentionally carry NO baseline/demo prices (`prices: {}`) so they remain truthfully unpriced
 * until a complete, validated Glovo Warsaw Biedronka snapshot supplies a verified match.
 */
const SNAPSHOT_ONLY_PL_PRODUCTS: Array<{
  id: string;
  canonicalIngredient: string;
  namePl: string;
  nameEn: string;
  nameAz: string;
  category: ShoppingCategory;
  packageUnit: 'g' | 'ml' | 'pcs';
  icon: string;
  imageUrl: string;
}> = [
  {
    id: 'prod-pearl-barley',
    canonicalIngredient: 'pearl_barley',
    namePl: 'Kasza jęczmienna perłowa',
    nameEn: 'Pearl barley groats',
    nameAz: 'Arpa yarması (perlovka)',
    category: 'Dry Products',
    packageUnit: 'g',
    icon: '🌾',
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'prod-risotto-rice',
    canonicalIngredient: 'risotto_rice',
    namePl: 'Ryż do risotto (Arborio)',
    nameEn: 'Arborio risotto rice',
    nameAz: 'Rizotto düyüsü (Arborio)',
    category: 'Dry Products',
    packageUnit: 'g',
    icon: '🍚',
    imageUrl: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80',
  },
];

export const PL_CATALOGUE_PRODUCTS: SupermarketProduct[] = [
  ...RAW_REGIONAL_PRODUCTS.map((raw) => ({
    id: raw.id,
    ean: raw.ean,
    canonicalIngredient: raw.canonicalIngredient,
    regionCode: 'PL' as RegionCode,
    currencyCode: 'PLN' as CurrencyCode,
    namePl: raw.namePl,
    nameEn: raw.nameEn,
    nameAz: raw.nameAz,
    brand: raw.brand,
    category: raw.category,
    packageSize: raw.packageSize,
    packageUnit: raw.packageUnit,
    packageLabelPl: raw.packageLabelPl,
    packageLabelEn: raw.packageLabelEn,
    packageLabelAz: raw.packageLabelAz,
    icon: raw.icon,
    imageUrl: raw.imageUrl,
    prices: {
      biedronka: makePrice(raw.id, 'biedronka', 'PL', 'PLN', raw.biedronka.reg, raw.biedronka.promo, raw.packageSize, raw.packageUnit, {
        loyaltyRequired: Boolean(raw.biedronka.loyaltyPl),
        loyaltyConditionPl: raw.biedronka.loyaltyPl,
        loyaltyConditionEn: raw.biedronka.loyaltyEn,
        promoValidUntil: raw.biedronka.validUntil ?? '2026-11-16',
      }),
    },
  })),
  ...SNAPSHOT_ONLY_PL_PRODUCTS.map((item) => ({
    id: item.id,
    ean: '',
    canonicalIngredient: item.canonicalIngredient,
    regionCode: 'PL' as RegionCode,
    currencyCode: 'PLN' as CurrencyCode,
    namePl: item.namePl,
    nameEn: item.nameEn,
    nameAz: item.nameAz,
    brand: '',
    category: item.category,
    packageSize: 0,
    packageUnit: item.packageUnit,
    packageLabelPl: '',
    packageLabelEn: '',
    packageLabelAz: '',
    icon: item.icon,
    imageUrl: item.imageUrl,
    prices: {},
  })),
];

export const AZ_CATALOGUE_PRODUCTS: SupermarketProduct[] = RAW_REGIONAL_PRODUCTS.map((raw) => {
  const azId = `az-${raw.id}`;
  return {
    id: azId,
    ean: raw.azEan,
    canonicalIngredient: raw.canonicalIngredient,
    regionCode: 'AZ',
    currencyCode: 'AZN',
    namePl: raw.namePl,
    nameEn: raw.nameEn,
    nameAz: raw.nameAz,
    brand: raw.azBrand,
    category: raw.category,
    packageSize: raw.packageSize,
    packageUnit: raw.packageUnit,
    packageLabelPl: raw.packageLabelPl,
    packageLabelEn: raw.packageLabelEn,
    packageLabelAz: raw.packageLabelAz,
    icon: raw.icon,
    imageUrl: raw.imageUrl,
    prices: {
      bravo: makePrice(azId, 'bravo', 'AZ', 'AZN', raw.bravo.reg, raw.bravo.promo, raw.packageSize, raw.packageUnit, {
        loyaltyRequired: Boolean(raw.bravo.loyaltyEn),
        loyaltyConditionPl: raw.bravo.loyaltyEn,
        loyaltyConditionEn: raw.bravo.loyaltyEn,
        loyaltyConditionAz: raw.bravo.loyaltyAz,
        promoValidUntil: '2026-11-16',
      }),
      araz: makePrice(azId, 'araz', 'AZ', 'AZN', raw.araz.reg, raw.araz.promo, raw.packageSize, raw.packageUnit, {
        loyaltyRequired: Boolean(raw.araz.loyaltyEn),
        loyaltyConditionPl: raw.araz.loyaltyEn,
        loyaltyConditionEn: raw.araz.loyaltyEn,
        loyaltyConditionAz: raw.araz.loyaltyAz,
        promoValidUntil: '2026-11-16',
      }),
      bazarstore: makePrice(azId, 'bazarstore', 'AZ', 'AZN', raw.bazarstore.reg, raw.bazarstore.promo, raw.packageSize, raw.packageUnit, {
        storeChannel: 'ONLINE_AND_STORE',
      }),
      rahat: makePrice(azId, 'rahat', 'AZ', 'AZN', raw.rahat.reg, raw.rahat.promo, raw.packageSize, raw.packageUnit),
    },
  };
});

export const CATALOGUE_PRODUCTS: SupermarketProduct[] = PL_CATALOGUE_PRODUCTS;

export const ALL_CATALOGUE_PRODUCTS: SupermarketProduct[] = [
  ...PL_CATALOGUE_PRODUCTS,
  ...AZ_CATALOGUE_PRODUCTS,
];

export function getCatalogueProductsForRegion(regionCode: RegionCode = 'PL'): SupermarketProduct[] {
  return regionCode === 'AZ' ? AZ_CATALOGUE_PRODUCTS : PL_CATALOGUE_PRODUCTS;
}

export function getSupermarketsForRegionList(regionCode: RegionCode = 'PL'): Supermarket[] {
  return SUPERMARKETS.filter((s) => s.regionCode === regionCode);
}

/**
 * Synchronizes monitored product price records from SQLite into the active in-memory catalogue
 * so shopping lists, budget calculations, and store comparisons always use the latest monitored prices
 * and flag outdated or unavailable products accurately.
 */
export function applyMonitoredPricesToCatalogue(
  monitoredRecords: MonitoredProductRecord[],
  lastSyncedAt?: string | null
): void {
  if (lastSyncedAt) {
    const bazarStoreMeta = SUPERMARKETS.find((s) => s.id === 'bazarstore');
    if (bazarStoreMeta) {
      bazarStoreMeta.lastSyncedAt = lastSyncedAt;
    }
  }

  if (!monitoredRecords || monitoredRecords.length === 0) return;

  // Group monitored records by supermarketId + canonicalIngredient
  const byStoreAndCanonical = new Map<string, MonitoredProductRecord[]>();
  for (const rec of monitoredRecords) {
    if (!rec.canonicalIngredient) continue;
    const key = `${rec.supermarketId}:${rec.canonicalIngredient.toLowerCase()}`;
    const arr = byStoreAndCanonical.get(key) || [];
    arr.push(rec);
    byStoreAndCanonical.set(key, arr);
  }

  for (const prod of ALL_CATALOGUE_PRODUCTS) {
    const stores: SupermarketSlug[] =
      prod.regionCode === 'AZ'
        ? ['bazarstore', 'bravo', 'araz', 'rahat']
        : ['biedronka', 'lidl', 'auchan', 'kaufland'];

    for (const store of stores) {
      if (prod.regionCode === 'PL' && store !== 'biedronka') continue;
      const candidates = byStoreAndCanonical.get(
        `${store}:${prod.canonicalIngredient.toLowerCase()}`
      );
      if (!candidates || candidates.length === 0) continue;

      // Sort candidates so the most recently updated and best-value exact-size available variant wins
      const sorted = [...candidates].sort((a, b) => {
        const timeA = new Date(a.lastCheckedAt || 0).getTime() || 0;
        const timeB = new Date(b.lastCheckedAt || 0).getTime() || 0;
        if (Math.abs(timeA - timeB) > 1000) {
          return timeB - timeA;
        }
        return a.unitPrice - b.unitPrice;
      });

      // Prefer exact packageSize + packageUnit match that is available; otherwise best available or exact match
      const exactAvailable = sorted.find(
        (c) =>
          c.isAvailable &&
          c.packageUnit === prod.packageUnit &&
          Math.abs(c.packageSize - prod.packageSize) < 1
      );
      const exactAny = sorted.find(
        (c) =>
          c.packageUnit === prod.packageUnit &&
          Math.abs(c.packageSize - prod.packageSize) < 1
      );
      const anyAvailable = sorted.find((c) => c.isAvailable);
      const chosen = exactAvailable || anyAvailable || exactAny || sorted[0];

      // If the chosen variant has a different package size than the base catalogue entry,
      // scale the package price proportionally to prod.packageSize OR update the price record accurately
      const sizeRatio =
        chosen.packageUnit === prod.packageUnit && chosen.packageSize > 0
          ? prod.packageSize / chosen.packageSize
          : 1;

      const regPrice = Number((chosen.regularPrice * sizeRatio).toFixed(2));
      const promoPrice =
        chosen.discountedPrice !== null
          ? Number((chosen.discountedPrice * sizeRatio).toFixed(2))
          : null;
      const effPrice = promoPrice !== null ? promoPrice : regPrice;

      const existingPrice = prod.prices[store];
      const discountPercent =
        promoPrice !== null && regPrice > 0
          ? Math.round(((regPrice - promoPrice) / regPrice) * 100)
          : null;

      prod.prices[store] = {
        id: existingPrice?.id || `price-${prod.id}-${store}`,
        productId: prod.id,
        supermarketId: store,
        regionCode: prod.regionCode,
        country: prod.regionCode === 'AZ' ? 'Azerbaijan' : 'Poland',
        currencyCode: prod.currencyCode,
        regularPricePln: regPrice,
        promoPricePln: promoPrice,
        effectivePricePln: effPrice,
        unitPricePln: chosen.unitPrice,
        unitPriceLabel: chosen.unitPriceLabel,
        loyaltyRequired: existingPrice?.loyaltyRequired ?? false,
        loyaltyConditionPl: existingPrice?.loyaltyConditionPl ?? null,
        loyaltyConditionEn: existingPrice?.loyaltyConditionEn ?? null,
        loyaltyConditionAz: existingPrice?.loyaltyConditionAz ?? null,
        promoValidUntil: existingPrice?.promoValidUntil ?? null,
        discountPercent,
        storeChannel: 'ONLINE_AND_STORE',
        storeLocation:
          store === 'bazarstore'
            ? 'bazarstore.az/bütün-məhsullar (24h Price Monitor)'
            : existingPrice?.storeLocation || 'Regional Catalogue',
        sourceName:
          store === 'bazarstore'
            ? 'Bazarstore 24h Automated Price Monitor'
            : existingPrice?.sourceName || `Catalogue ${store}`,
        sourceUrl: chosen.productUrl || existingPrice?.sourceUrl || 'https://bazarstore.az/b%C3%BCt%C3%BCn-m%C9%99hsullar',
        verificationStatus: chosen.isOutdated
          ? 'OUTDATED_PRICE'
          : !chosen.isAvailable
          ? 'UNAVAILABLE'
          : chosen.verificationStatus,
        lastUpdatedAt: chosen.lastCheckedAt,
        isAvailable: chosen.isAvailable,
        isOutdated: chosen.isOutdated,
        priceAgeHours: chosen.priceAgeHours,
      };
    }
  }
}

let activeVerifiedBiedronkaSnapshotId: string | null = null;
let activeVerifiedBiedronkaSnapshotAt: string | null = null;
let activeVerifiedBiedronkaItems: VerifiedBiedronkaSnapshotItem[] = [];
let activeVerifiedBiedronkaBySku = new Map<string, VerifiedBiedronkaSnapshotItem>();

export function getActiveVerifiedBiedronkaSnapshot(): {
  snapshotId: string | null;
  activatedAt: string | null;
  items: VerifiedBiedronkaSnapshotItem[];
} {
  return {
    snapshotId: activeVerifiedBiedronkaSnapshotId,
    activatedAt: activeVerifiedBiedronkaSnapshotAt,
    items: activeVerifiedBiedronkaItems,
  };
}

export function getActiveVerifiedBiedronkaItemBySku(
  sku: string | null | undefined
): VerifiedBiedronkaSnapshotItem | null {
  if (!sku) return null;
  return activeVerifiedBiedronkaBySku.get(String(sku)) ?? null;
}

export function clearVerifiedBiedronkaSnapshot(): void {
  activeVerifiedBiedronkaSnapshotId = null;
  activeVerifiedBiedronkaSnapshotAt = null;
  activeVerifiedBiedronkaItems = [];
  activeVerifiedBiedronkaBySku = new Map();
  // Restore baseline PL_CATALOGUE_PRODUCTS prices & metadata from RAW_REGIONAL_PRODUCTS
  for (let i = 0; i < RAW_REGIONAL_PRODUCTS.length; i++) {
    const raw = RAW_REGIONAL_PRODUCTS[i];
    const prod = PL_CATALOGUE_PRODUCTS[i];
    if (!prod) continue;
    prod.ean = raw.ean;
    prod.namePl = raw.namePl;
    prod.packageSize = raw.packageSize;
    prod.packageUnit = raw.packageUnit;
    prod.packageLabelPl = raw.packageLabelPl;
    prod.prices = {
      biedronka: makePrice(raw.id, 'biedronka', 'PL', 'PLN', raw.biedronka.reg, raw.biedronka.promo, raw.packageSize, raw.packageUnit, {
        loyaltyRequired: Boolean(raw.biedronka.loyaltyPl),
        loyaltyConditionPl: raw.biedronka.loyaltyPl,
        loyaltyConditionEn: raw.biedronka.loyaltyEn,
        promoValidUntil: raw.biedronka.validUntil ?? '2026-11-16',
      }),
    };
  }
  // Restore snapshot-only PL entries back to unpriced (never fabricate demo prices)
  for (const snapOnly of SNAPSHOT_ONLY_PL_PRODUCTS) {
    const prod = PL_CATALOGUE_PRODUCTS.find((p) => p.id === snapOnly.id);
    if (!prod) continue;
    prod.ean = '';
    prod.namePl = snapOnly.namePl;
    prod.packageSize = 0;
    prod.packageUnit = snapOnly.packageUnit;
    prod.packageLabelPl = '';
    prod.prices = {};
  }
}

/**
 * Applies a complete, validated Glovo Warsaw Biedronka snapshot to the in-memory PL catalogue.
 * Only verified items with conservative canonical matches and compatible dimensions update prices;
 * canonicals missing from the verified snapshot are marked unavailable/unpriced rather than fabricated.
 */
export function applyVerifiedBiedronkaSnapshotToCatalogue(
  items: VerifiedBiedronkaSnapshotItem[],
  meta: { snapshotId: string | null; activatedAt: string | null; referenceNowMs?: number }
): void {
  if (!meta.snapshotId || !items || items.length === 0) {
    return;
  }

  activeVerifiedBiedronkaSnapshotId = meta.snapshotId;
  activeVerifiedBiedronkaSnapshotAt = meta.activatedAt;
  activeVerifiedBiedronkaItems = items;
  activeVerifiedBiedronkaBySku = new Map(items.map((it) => [it.sku, it]));

  const bdMeta = SUPERMARKETS.find((s) => s.id === 'biedronka');
  if (bdMeta && meta.activatedAt) {
    bdMeta.lastSyncedAt = meta.activatedAt;
    bdMeta.adapterStatus = 'PUBLIC_CATALOGUE_CONNECTED';
  }

  const nowMs = meta.referenceNowMs ?? Date.now();
  const byCanonical = new Map<string, VerifiedBiedronkaSnapshotItem[]>();
  for (const item of items) {
    if (!item.canonicalIngredient || item.matchConfidence !== 'HIGH') continue;
    if (!item.packageSize || !item.packageUnit || item.unitPricePln === null) continue;
    const key = item.canonicalIngredient.toLowerCase();
    const list = byCanonical.get(key) || [];
    list.push(item);
    byCanonical.set(key, list);
  }

  for (const prod of PL_CATALOGUE_PRODUCTS) {
    const candidates = byCanonical.get(prod.canonicalIngredient.toLowerCase()) || [];
    // Conservative dimension match: only accept verified items with the exact same packageUnit
    const dimCompatible = candidates.filter((c) => c.packageUnit === prod.packageUnit && c.isAvailable);

    if (dimCompatible.length === 0) {
      // Mark as unpriced/unavailable in the active verified snapshot so shopping list leaves it unpriced
      prod.prices.biedronka = undefined;
      continue;
    }

    // Deterministic best-value selection using policy-effective unit price, then SKU tie-breaker
    const computePolicyUnit = (item: VerifiedBiedronkaSnapshotItem) => {
      const pPrice = resolvePolicyEffectivePrice(
        item.regularPricePln,
        item.promoPricePln,
        'PL',
        'biedronka'
      );
      const sz = item.packageSize!;
      const u = item.packageUnit!;
      const unitVal =
        u === 'g' || u === 'ml'
          ? Number(((pPrice / sz) * 1000).toFixed(2))
          : Number((pPrice / sz).toFixed(2));
      const unitSuffix = u === 'g' ? 'kg' : u === 'ml' ? 'L' : 'szt.';
      return {
        policyPrice: pPrice,
        unitPricePln: unitVal,
        unitPriceLabel: `${unitVal.toFixed(2).replace('.', ',')} zł / ${unitSuffix}`,
      };
    };

    dimCompatible.sort((a, b) => {
      const ua = computePolicyUnit(a).unitPricePln;
      const ub = computePolicyUnit(b).unitPricePln;
      return ua - ub || a.sku.localeCompare(b.sku);
    });
    const chosen = dimCompatible[0];
    const pkgSize = chosen.packageSize!;
    const pkgUnit = chosen.packageUnit!;
    const policyCalc = computePolicyUnit(chosen);
    const showPromos = shouldShowPromoIndicators('PL', 'biedronka');
    const discountPercent =
      showPromos && chosen.promoPricePln !== null && chosen.regularPricePln > 0
        ? Math.round(((chosen.regularPricePln - chosen.promoPricePln) / chosen.regularPricePln) * 100)
        : null;

    const timestampForAge = chosen.observedAt || chosen.fetchedAt;
    const checkedMs = timestampForAge ? new Date(timestampForAge).getTime() : NaN;
    const ageHours = Number.isFinite(checkedMs)
      ? Math.max(0, Number(((nowMs - checkedMs) / (1000 * 3600)).toFixed(1)))
      : 0;
    const isOutdated = ageHours > 120; // 5-day freshness cadence

    prod.ean = chosen.sku;
    prod.namePl = chosen.namePl;
    prod.packageSize = pkgSize;
    prod.packageUnit = pkgUnit;
    prod.packageLabelPl = chosen.packageLabelPl || prod.packageLabelPl;
    prod.prices.biedronka = {
      id: `price-${prod.id}-biedronka-${chosen.sku}`,
      productId: prod.id,
      supermarketId: 'biedronka',
      regionCode: 'PL',
      country: 'Poland',
      currencyCode: 'PLN',
      regularPricePln: chosen.regularPricePln,
      promoPricePln: chosen.promoPricePln,
      effectivePricePln: policyCalc.policyPrice,
      unitPricePln: policyCalc.unitPricePln,
      unitPriceLabel: policyCalc.unitPriceLabel,
      loyaltyRequired: false,
      loyaltyConditionPl: null,
      loyaltyConditionEn: null,
      loyaltyConditionAz: null,
      promoValidUntil: null,
      discountPercent,
      storeChannel: 'ONLINE_AND_STORE',
      storeLocation: chosen.storeLocation,
      sourceName: chosen.sourceName,
      sourceUrl: chosen.glovoProductUrl || chosen.sourceUrl,
      verificationStatus: isOutdated ? 'OUTDATED_PRICE' : 'LIVE_MONITORED_CATALOGUE',
      lastUpdatedAt: chosen.observedAt || chosen.fetchedAt,
      isAvailable: chosen.isAvailable,
      isOutdated,
      priceAgeHours: ageHours,
    };
  }
}
