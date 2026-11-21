import {
  CurrencyCode,
  MatchConfidence,
  MonitoredProductRecord,
  PriceVerificationStatus,
  RegionCode,
  ShoppingCategory,
  SupermarketSlug,
} from '../../shared/types';
import { resolveCanonicalIngredient } from '../matching/quantityEngine';
import { calculateNormalizedUnitPrice } from '../supermarkets/supermarketService';

export const BAZARSTORE_PRIMARY_URL = 'https://bazarstore.az/b%C3%BCt%C3%BCn-m%C9%99hsullar';
export const BAZARSTORE_ALTERNATIVE_URL = 'https://bazarstore.az/bütün-məhsullar';
export const BAZARSTORE_SHOPIFY_PRODUCTS_URL = 'https://bazarstore.az/products.json?limit=250';
export const BAZARSTORE_SHOPIFY_COLLECTION_URL =
  'https://bazarstore.az/collections/all/products.json?limit=250';

export const MONITOR_INTERVAL_HOURS = 24;
export const OUTDATED_THRESHOLD_HOURS = 48;

export interface RawScrapedProductInput {
  externalId?: string | null;
  ean?: string | null;
  title: string;
  variantTitle?: string | null;
  brand?: string | null;
  category?: ShoppingCategory | string | null;
  regularPrice: number;
  discountedPrice?: number | null;
  isAvailable?: boolean;
  imageUrl?: string | null;
  productUrl?: string | null;
  packageSize?: number;
  packageUnit?: 'g' | 'ml' | 'pcs';
  canonicalIngredient?: string | null;
  nameEn?: string | null;
  namePl?: string | null;
}

export interface NormalizedMonitoredCandidate {
  supermarketId: SupermarketSlug;
  regionCode: RegionCode;
  currencyCode: CurrencyCode;
  externalId: string | null;
  variantKey: string;
  ean: string | null;
  canonicalIngredient: string | null;
  nameAz: string;
  nameEn: string;
  namePl: string;
  brand: string;
  category: ShoppingCategory;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'pcs';
  packageLabelAz: string;
  imageUrl: string;
  productUrl: string;
  regularPrice: number;
  discountedPrice: number | null;
  effectivePrice: number;
  unitPrice: number;
  unitPriceLabel: string;
  isAvailable: boolean;
  verificationStatus: PriceVerificationStatus;
  matchConfidence: MatchConfidence;
}

const KNOWN_AZ_BRANDS = [
  'Milla',
  'Səba',
  'Mərcan',
  'Azərsun',
  'Final',
  'Bizim Tarla',
  'Zeytun Bağları',
  'Xonça',
  'Çörəkçi',
  'Giləzi',
  'Çil-Çil',
  'Atena',
  'Ankara',
  'Besta',
  'Bol Ət',
  'Nemetova',
  'İpəkyolu',
  'Superfresh',
  'Vici',
  'Bonduelle',
  'Tamashaee',
  'Sultan',
  'Karmen',
  'Saville',
  'İvanovka',
  'Azərsüd',
  'Sevimli Dad',
  'Quba Bağları',
  'Gədəbəy',
  'Zirə',
  'Abşeron',
  'Caspian Fish',
  'Alpro',
  'Hercules',
  'Makfa',
  'Bazarstore',
];

export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function slugifyToken(text: string): string {
  return text
    .toLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extracts package size and unit ('g', 'ml', 'pcs') from an Azerbaijani or international product title
 * (e.g. "Milla Süd 2.5% 1 L" -> { size: 1000, unit: 'ml', labelAz: '1 L' },
 *  "Azərsun Qırmızı Mərcimək 400 q" -> { size: 400, unit: 'g', labelAz: '400 q' },
 *  "Kök kq" -> { size: 1000, unit: 'g', labelAz: '1 kq' },
 *  "Kök Super Paket 1kq" -> { size: 1000, unit: 'g', labelAz: '1 kq' },
 *  "Çil-Çil Yumurta Ağ 10 lu" -> { size: 10, unit: 'pcs', labelAz: '10 ədəd' }).
 */
export function extractPackageQuantityFromTitle(
  title: string,
  fallbackSize = 500,
  fallbackUnit: 'g' | 'ml' | 'pcs' = 'g'
): { packageSize: number; packageUnit: 'g' | 'ml' | 'pcs'; packageLabelAz: string } {
  const normalized = decodeHtmlEntities(title).replace(',', '.');

  // 1. Kilograms with explicit number: e.g. "1 kq", "1kq", "1.5 kg", "0.5 kq"
  const kgMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:kq|kg|kiloqram)(?=\s|$|[),.;])/i);
  if (kgMatch) {
    const kg = parseFloat(kgMatch[1]);
    if (kg > 0 && kg <= 50) {
      const grams = Math.round(kg * 1000);
      return {
        packageSize: grams,
        packageUnit: 'g',
        packageLabelAz: `${kgMatch[1]} kq`,
      };
    }
  }

  // 2. Grams: e.g. "500 q", "400 qr", "250 g", "180 qram"
  const gMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:qram|qr|q|g|gr)(?=\s|$|[),.;])/i);
  if (gMatch) {
    const g = Math.round(parseFloat(gMatch[1]));
    if (g > 0 && g <= 25000) {
      return {
        packageSize: g,
        packageUnit: 'g',
        packageLabelAz: `${g} q`,
      };
    }
  }

  // 3. Liters: e.g. "1 L", "1.5 lt", "2 litr"
  const lMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:litr|lt|l)(?=\s|$|[),.;])/i);
  if (lMatch) {
    const l = parseFloat(lMatch[1]);
    if (l > 0 && l <= 20) {
      const ml = Math.round(l * 1000);
      return {
        packageSize: ml,
        packageUnit: 'ml',
        packageLabelAz: `${lMatch[1]} L`,
      };
    }
  }

  // 4. Milliliters: e.g. "500 ml", "330 ml"
  const mlMatch = normalized.match(/(\d+(?:\.\d+)?)\s*ml(?=\s|$|[),.;])/i);
  if (mlMatch) {
    const ml = Math.round(parseFloat(mlMatch[1]));
    if (ml > 0 && ml <= 10000) {
      return {
        packageSize: ml,
        packageUnit: 'ml',
        packageLabelAz: `${ml} ml`,
      };
    }
  }

  // 5. Pieces: e.g. "10 ədəd", "15 əd.", "10 lu", "12li", "6 pcs", "10 szt."
  const pcsMatch = normalized.match(
    /(\d+)\s*(?:ədəd|əd\.?|lu|lü|li|lı|pcs|szt\.?)(?=\s|$|[),.;])/i
  );
  if (pcsMatch) {
    const pcs = parseInt(pcsMatch[1], 10);
    if (pcs > 0 && pcs <= 200) {
      return {
        packageSize: pcs,
        packageUnit: 'pcs',
        packageLabelAz: `${pcs} ədəd`,
      };
    }
  }

  // 6. Standalone "kq" or "kg" without a leading number (e.g. "Kök kq", "BANAN KQ", "SOĞAN KQ", "KARTOF KG") -> 1 kq (1000 g)
  if (/(?:^|\s)(?:kq|kg)(?=\s|$|[),.;])/i.test(normalized)) {
    return {
      packageSize: 1000,
      packageUnit: 'g',
      packageLabelAz: '1 kq',
    };
  }

  // Fallback formatting
  const labelAz =
    fallbackUnit === 'g'
      ? fallbackSize >= 1000 && fallbackSize % 100 === 0
        ? `${fallbackSize / 1000} kq`
        : `${fallbackSize} q`
      : fallbackUnit === 'ml'
      ? fallbackSize >= 1000 && fallbackSize % 100 === 0
        ? `${fallbackSize / 1000} L`
        : `${fallbackSize} ml`
      : `${fallbackSize} ədəd`;

  return {
    packageSize: fallbackSize,
    packageUnit: fallbackUnit,
    packageLabelAz: labelAz,
  };
}

/**
 * Extracts a distinguishing variant modifier (such as fat percentage "2.5%", "3.2%", "Extra Virgin", "Basmati")
 * so variants of the same brand and weight remain distinct.
 */
function extractVariantSpecifier(title: string, variantTitle?: string | null): string {
  const combined = `${title} ${variantTitle || ''}`.trim();
  const pctMatch = combined.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (pctMatch) {
    return `pct-${pctMatch[1].replace(',', '.')}`;
  }
  if (variantTitle && variantTitle.toLowerCase() !== 'default title') {
    return slugifyToken(variantTitle).slice(0, 24) || 'std';
  }
  return 'std';
}

function inferBrandFromTitle(title: string, explicitBrand?: string | null): string {
  if (explicitBrand && explicitBrand.trim()) {
    return explicitBrand.trim();
  }
  const lower = title.toLowerCase();
  for (const b of KNOWN_AZ_BRANDS) {
    if (lower.includes(b.toLowerCase())) {
      return b;
    }
  }
  return 'Bazarstore Seçimi';
}

const NON_INGREDIENT_EXCLUSION_REGEX =
  /(?:^|[\s,.;()-])(?:pişik\s+yemi|pisik\s+yemi|it\s+yemi|purina|felix|whiskas|pedigree|kitekat|şampun|sampun|sabun|krem|losyon|dezodorant|təmizləyici|temizleyici|yuyucu|sarımsaqəzən|sarimsaqezen|döşəkçə|dosekce|dondurma|vafli|peçenye|pecenye|kruassan|şokolad|sokolad|kökə|koke|suxari|çips|cips|pure|püre|şirəsi|siresi|kefir|kokteyl|ketçup|ketchup|mayonez|turşusu|tursusu|salatı|salati|araq|şərab|serab)(?=$|[\s,.;()-])/i;

const PRODUCT_TITLE_KEYWORD_MAP: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /(?:^|[\s,.;()-])(?:yulaf\s+südü|oat\s+milk|oat\s+drink|alpro.*yulaf)(?=$|[\s,.;()-])/i, canonical: 'oat_milk' },
  { pattern: /(?:^|[\s,.;()-])(?:süd|sud|milk|mleko)(?=$|[\s,.;()-])/i, canonical: 'milk' },
  { pattern: /(?:^|[\s,.;()-])(?:toyuq|kurczak|chicken)(?=$|[\s,.;()-])/i, canonical: 'chicken_breast' },
  { pattern: /(?:^|[\s,.;()-])(?:yumurta|eggs?|jaja|jajka)(?=$|[\s,.;()-])/i, canonical: 'eggs' },
  { pattern: /(?:^|[\s,.;()-])(?:qatıq|qatiq|süzmə|suzme|yogurt|jogurt|skyr)(?=$|[\s,.;()-])/i, canonical: 'greek_yogurt' },
  { pattern: /(?:^|[\s,.;()-])(?:kəsmik|kesmik|twaróg|twarog|cottage\s+cheese)(?=$|[\s,.;()-])/i, canonical: 'cottage_cheese' },
  { pattern: /(?:^|[\s,.;()-])(?:düyü|duyu|rice|ryż|ryz|basmati)(?=$|[\s,.;()-])/i, canonical: 'rice' },
  { pattern: /(?:^|[\s,.;()-])(?:mərcimək|mercimek|mərci|merci|lentils?|soczewica)(?=$|[\s,.;()-])/i, canonical: 'red_lentils' },
  { pattern: /(?:^|[\s,.;()-])(?:yulaf|herkules|hercules|oat\s+flakes|owsiane)(?=$|[\s,.;()-])/i, canonical: 'oat_flakes' },
  { pattern: /(?:^|[\s,.;()-])(?:makaron|əriştə|eriste|pasta|spaghetti|penne)(?=$|[\s,.;()-])/i, canonical: 'pasta' },
  { pattern: /(?:^|[\s,.;()-])(?:pomidor\s+konserv|soyulmuş.*pomidor|canned\s+tomato|pomidory\s+krojone)(?=$|[\s,.;()-])/i, canonical: 'canned_tomatoes' },
  { pattern: /(?:^|[\s,.;()-])(?:pomidor|tomato|pomidory)(?=$|[\s,.;()-])/i, canonical: 'tomato' },
  { pattern: /(?:^|[\s,.;()-])(?:kartof|potato|ziemniak)(?=$|[\s,.;()-])/i, canonical: 'potato' },
  { pattern: /(?:^|[\s,.;()-])(?:soğan|sogan|onion|cebula)(?=$|[\s,.;()-])/i, canonical: 'onion' },
  { pattern: /(?:^|[\s,.;()-])(?:sarımsaq|sarimsaq|garlic|czosnek)(?=$|[\s,.;()-])/i, canonical: 'garlic' },
  { pattern: /(?:^|[\s,.;()-])(?:sarıkök|sarikok|paprika|toz\s+bibər)(?=$|[\s,.;()-])/i, canonical: 'paprika' },
  { pattern: /(?:^|[\s,.;()-])(?:kök|kok|carrot|marchew)(?=$|[\s,.;()-])/i, canonical: 'carrot' },
  { pattern: /(?:^|[\s,.;()-])(?:brokk?oli|brokuł)(?=$|[\s,.;()-])/i, canonical: 'broccoli' },
  { pattern: /(?:^|[\s,.;()-])(?:ispanaq|göyərti|goyerti|spinach|szpinak)(?=$|[\s,.;()-])/i, canonical: 'spinach' },
  { pattern: /(?:^|[\s,.;()-])(?:alma|apple|jabłk)(?=$|[\s,.;()-])/i, canonical: 'apple' },
  { pattern: /(?:^|[\s,.;()-])(?:banan|banana)(?=$|[\s,.;()-])/i, canonical: 'banana' },
  { pattern: /(?:^|[\s,.;()-])(?:qızılbalıq|qizilbaliq|forel|salmon|łosoś)(?=$|[\s,.;()-])/i, canonical: 'salmon' },
  { pattern: /(?:^|[\s,.;()-])(?:tofu)(?=$|[\s,.;()-])/i, canonical: 'tofu' },
  { pattern: /(?:^|[\s,.;()-])(?:çörək|corek|lavaş|lavas|bread|chleb)(?=$|[\s,.;()-])/i, canonical: 'wholegrain_bread' },
  { pattern: /(?:^|[\s,.;()-])(?:zeytun\s+yağı|zeytun\s+yagi|olive\s+oil|oliwa)(?=$|[\s,.;()-])/i, canonical: 'olive_oil' },
  { pattern: /(?:^|[\s,.;()-])(?:dondurulmuş\s+tərəvəz|tərəvəz\s+mix|qarışıq\s+tərəvəz|frozen\s+veg|mieszanka\s+warzywna)(?=$|[\s,.;()-])/i, canonical: 'frozen_vegetables' },
  { pattern: /(?:^|[\s,.;()-])(?:dana\s+və\s+quzu|dana\s+əti|dana\s+eti|schab|pork\s+loin)(?=$|[\s,.;()-])/i, canonical: 'pork_loin' },
];

export function resolveCanonicalFromProductTitle(title: string): string | null {
  const decoded = decodeHtmlEntities(title)
    .toLocaleLowerCase('az-AZ')
    .replace(/i̇/g, 'i');
  if (NON_INGREDIENT_EXCLUSION_REGEX.test(decoded)) {
    return null;
  }
  const direct = resolveCanonicalIngredient(decoded);
  if (direct) return direct;
  for (const entry of PRODUCT_TITLE_KEYWORD_MAP) {
    if (entry.pattern.test(decoded)) {
      return entry.canonical;
    }
  }
  return null;
}

function inferCategoryFromCanonical(canonical: string | null): ShoppingCategory {
  switch (canonical) {
    case 'banana':
    case 'tomato':
    case 'carrot':
    case 'potato':
    case 'onion':
    case 'garlic':
    case 'broccoli':
    case 'spinach':
    case 'apple':
      return 'Fruit & Vegetables';
    case 'chicken_breast':
    case 'pork_loin':
    case 'salmon':
      return 'Meat & Fish';
    case 'milk':
    case 'eggs':
    case 'greek_yogurt':
    case 'cottage_cheese':
    case 'tofu':
      return 'Dairy';
    case 'wholegrain_bread':
      return 'Bakery';
    case 'rice':
    case 'oat_flakes':
    case 'pasta':
    case 'red_lentils':
    case 'canned_tomatoes':
      return 'Dry Products';
    case 'frozen_vegetables':
      return 'Frozen Products';
    case 'oat_milk':
      return 'Drinks';
    default:
      return 'Other';
  }
}

/**
 * Validates and normalizes a raw product entry from Bazarstore into a deduplicated,
 * unit-price-normalized candidate. Returns null if prices are invalid or corrupted.
 */
export function normalizeBazarstoreProductCandidate(
  input: RawScrapedProductInput,
  supermarketId: SupermarketSlug = 'bazarstore'
): NormalizedMonitoredCandidate | null {
  const rawTitle = (input.title || '').trim();
  if (!rawTitle || rawTitle.length < 2) {
    return null;
  }

  const p1 = Number(input.regularPrice);
  const p2 =
    input.discountedPrice !== undefined && input.discountedPrice !== null
      ? Number(input.discountedPrice)
      : null;

  if (!Number.isFinite(p1) || p1 <= 0 || p1 > 500) {
    return null;
  }
  if (p2 !== null && (!Number.isFinite(p2) || p2 <= 0 || p2 > 500)) {
    return null;
  }

  // Normalize regular vs discounted price in case upstream swapped compare_at_price and price
  const regularPrice = p2 !== null ? Number(Math.max(p1, p2).toFixed(2)) : Number(p1.toFixed(2));
  const discountedPrice =
    p2 !== null && Math.min(p1, p2) < regularPrice
      ? Number(Math.min(p1, p2).toFixed(2))
      : null;
  const effectivePrice = discountedPrice !== null ? discountedPrice : regularPrice;

  const fullTitle =
    input.variantTitle &&
    input.variantTitle.toLowerCase() !== 'default title' &&
    !rawTitle.toLowerCase().includes(input.variantTitle.toLowerCase())
      ? `${rawTitle} (${input.variantTitle.trim()})`
      : rawTitle;

  const pkg =
    input.packageSize && input.packageSize > 0 && input.packageUnit
      ? extractPackageQuantityFromTitle(fullTitle, input.packageSize, input.packageUnit)
      : extractPackageQuantityFromTitle(fullTitle, 500, 'g');

  // If explicit packageSize/packageUnit were supplied and the title had no quantity token, keep explicit values
  const finalSize =
    input.packageSize && input.packageSize > 0 && pkg.packageSize === 500 && !/\d/.test(fullTitle)
      ? input.packageSize
      : pkg.packageSize;
  const finalUnit = input.packageUnit || pkg.packageUnit;

  const canonical =
    input.canonicalIngredient !== undefined
      ? input.canonicalIngredient
      : resolveCanonicalFromProductTitle(fullTitle);

  const brand = inferBrandFromTitle(fullTitle, input.brand);
  const variantSpec = extractVariantSpecifier(rawTitle, input.variantTitle);
  const brandSlug = slugifyToken(brand) || 'generic';
  const itemSlug = canonical || slugifyToken(rawTitle).slice(0, 32) || 'product';

  // Variant key uniquely distinguishes supermarket + canonical/product + exact size/unit + brand + variant specifier
  const variantKey = `${supermarketId}:${itemSlug}:${finalSize}${finalUnit}:${brandSlug}:${variantSpec}`;

  const unitCalc = calculateNormalizedUnitPrice(effectivePrice, finalSize, finalUnit, 'AZN');

  const matchConfidence: MatchConfidence = canonical
    ? finalSize > 0
      ? 'HIGH'
      : 'MEDIUM'
    : 'UNCERTAIN';

  const category =
    (input.category as ShoppingCategory) || inferCategoryFromCanonical(canonical);

  return {
    supermarketId,
    regionCode: 'AZ',
    currencyCode: 'AZN',
    externalId: input.externalId ? String(input.externalId) : null,
    variantKey,
    ean: input.ean ? String(input.ean) : null,
    canonicalIngredient: canonical,
    nameAz: fullTitle,
    nameEn: input.nameEn || fullTitle,
    namePl: input.namePl || input.nameEn || fullTitle,
    brand,
    category,
    packageSize: finalSize,
    packageUnit: finalUnit,
    packageLabelAz: pkg.packageLabelAz,
    imageUrl:
      input.imageUrl ||
      'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80',
    productUrl: input.productUrl || BAZARSTORE_PRIMARY_URL,
    regularPrice,
    discountedPrice,
    effectivePrice,
    unitPrice: unitCalc.unitPricePln,
    unitPriceLabel: unitCalc.unitLabel,
    isAvailable: input.isAvailable !== false,
    verificationStatus: 'LIVE_MONITORED_CATALOGUE',
    matchConfidence,
  };
}

/**
 * Computes age in hours and whether a monitored price record is considered outdated (> 48h old).
 */
export function computePriceStaleness(
  lastCheckedAtIso: string,
  referenceNowMs: number = Date.now(),
  thresholdHours: number = OUTDATED_THRESHOLD_HOURS
): { priceAgeHours: number; isOutdated: boolean } {
  const checkedMs = new Date(lastCheckedAtIso).getTime();
  if (!Number.isFinite(checkedMs)) {
    return { priceAgeHours: 999, isOutdated: true };
  }
  const ageHours = Math.max(0, Number(((referenceNowMs - checkedMs) / (1000 * 3600)).toFixed(1)));
  return {
    priceAgeHours: ageHours,
    isOutdated: ageHours > thresholdHours,
  };
}

/**
 * Parses HTML from https://bazarstore.az/b%C3%BCt%C3%BCn-m%C9%99hsullar (or /bütün-məhsullar)
 * for JSON-LD Product schemas, nopCommerce `<div class="product-item" data-bzdl-item='...'>` cards,
 * or Shopify product card blocks.
 */
export function parseBazarstoreHtmlCatalogue(html: string): RawScrapedProductInput[] {
  const results: RawScrapedProductInput[] = [];
  if (!html || typeof html !== 'string') return results;

  // 1. Extract JSON-LD (<script type="application/ld+json">)
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed)
        ? parsed
        : parsed['@type'] === 'ItemList' && Array.isArray(parsed.itemListElement)
        ? parsed.itemListElement.map((el: any) => el.item || el)
        : [parsed];

      for (const item of items) {
        if (item && (item['@type'] === 'Product' || item.name) && item.offers) {
          const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
          const price = Number(offer?.price ?? offer?.lowPrice);
          if (Number.isFinite(price) && price > 0) {
            results.push({
              externalId: item.sku || item.productID || null,
              ean: item.gtin13 || item.sku || null,
              title: decodeHtmlEntities(String(item.name)),
              brand: typeof item.brand === 'object' ? item.brand?.name : item.brand,
              regularPrice: price,
              isAvailable:
                typeof offer?.availability === 'string'
                  ? !offer.availability.toLowerCase().includes('outofstock')
                  : true,
              imageUrl: Array.isArray(item.image) ? item.image[0] : item.image,
              productUrl: item.url || offer?.url || BAZARSTORE_PRIMARY_URL,
            });
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  // 2. Extract Bazarstore nopCommerce `<div class="product-item" data-productid="..." data-bzdl-item='...'>` cards
  if (html.includes('product-item')) {
    const blocks = html.split(/<div[^>]+class=["'][^"']*product-item[^"']*["']/i).slice(1);
    for (const block of blocks) {
      const idMatch = block.match(/data-productid=["'](\d+)["']/i);
      const bzdlMatch = block.match(/data-bzdl-item=['"]([^'"]+)['"]/i);
      const titleMatch = block.match(
        /<h2[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i
      );
      const actualPriceMatch = block.match(
        /<span[^>]*class=["'][^"']*actual-price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
      );
      const oldPriceMatch = block.match(
        /<span[^>]*class=["'][^"']*old-price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
      );
      const imgMatch = block.match(/<img[^>]+(?:data-lazyloadsrc|src)=["']([^"']+)["']/i);

      let bzdl: any = null;
      if (bzdlMatch) {
        try {
          bzdl = JSON.parse(decodeHtmlEntities(bzdlMatch[1]));
        } catch {
          // Ignore malformed data-bzdl-item JSON
        }
      }

      const cleanTitle = decodeHtmlEntities(
        titleMatch ? titleMatch[2].replace(/<[^>]+>/g, '').trim() : bzdl?.item_name || ''
      ).trim();

      const parseAzPrice = (txt?: string | null): number | null => {
        if (!txt) return null;
        const decoded = decodeHtmlEntities(txt);
        const m = decoded.match(/(\d+(?:[.,]\d+)?)/);
        if (!m) return null;
        const v = parseFloat(m[1].replace(',', '.'));
        return Number.isFinite(v) && v > 0 ? v : null;
      };

      const actualVal =
        parseAzPrice(actualPriceMatch?.[1]) ??
        (typeof bzdl?.price === 'number' && bzdl.price > 0 ? bzdl.price : null);
      const oldVal = parseAzPrice(oldPriceMatch?.[1]);

      if (cleanTitle && actualVal !== null && actualVal > 0) {
        const regPrice = oldVal !== null && oldVal > actualVal ? oldVal : actualVal;
        const discPrice = oldVal !== null && oldVal > actualVal ? actualVal : null;
        const href = titleMatch?.[1] || '';
        const rawImg = imgMatch?.[1] || '';
        const validImg =
          rawImg &&
          !rawImg.startsWith('data:image') &&
          !rawImg.includes('default-image') &&
          !rawImg.includes('test.bazarstore.az')
            ? rawImg.replace(/^\/\//, 'https://')
            : null;

        results.push({
          externalId: String(bzdl?.item_id || idMatch?.[1] || ''),
          ean: bzdl?.item_id ? String(bzdl.item_id) : null,
          title: cleanTitle,
          brand: bzdl?.item_brand ? decodeHtmlEntities(String(bzdl.item_brand)) : null,
          regularPrice: regPrice,
          discountedPrice: discPrice,
          isAvailable: !/bitib|mövcud deyil|out[\s-]*of[\s-]*stock/i.test(block),
          imageUrl: validImg,
          productUrl: href
            ? href.startsWith('http')
              ? href
              : `https://bazarstore.az${href}`
            : BAZARSTORE_PRIMARY_URL,
        });
      }
    }
  }

  // 3. Extract Shopify / generic HTML product card elements if present
  const cardRegex =
    /<div[^>]+class=["'][^"']*(?:product-card|card-wrapper|grid-product)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  while ((match = cardRegex.exec(html)) !== null) {
    const block = match[1];
    const titleMatch =
      block.match(/class=["'][^"']*(?:card__heading|product-card__title|grid-product__title)[^"']*["'][^>]*>([\s\S]*?)<\//i) ||
      block.match(/<a[^>]+href=["'](\/products\/[^"']+)["'][^>]*>([^<]+)<\/a>/i);
    const priceMatches = Array.from(
      decodeHtmlEntities(block).matchAll(/(\d+[.,]\d{2})\s*(?:₼|AZN|manat)?/gi)
    ).map((m) => parseFloat(m[1].replace(',', '.')));

    if (titleMatch && priceMatches.length > 0) {
      const cleanTitle = decodeHtmlEntities(titleMatch[2] || titleMatch[1])
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const reg = Math.max(...priceMatches);
      const disc = priceMatches.length > 1 ? Math.min(...priceMatches) : null;
      const hrefMatch = block.match(/href=["'](\/products\/[^"'?#]+)["']/i);
      const imgMatch = block.match(/<img[^>]+src=["']([^"']+)["']/i);
      const soldOut = /sold[\s-]*out|bitib|mövcud deyil/i.test(block);

      if (cleanTitle && reg > 0) {
        results.push({
          title: cleanTitle,
          regularPrice: reg,
          discountedPrice: disc !== null && disc < reg ? disc : null,
          isAvailable: !soldOut,
          imageUrl: imgMatch ? imgMatch[1].replace(/^\/\//, 'https://') : null,
          productUrl: hrefMatch
            ? `https://bazarstore.az${hrefMatch[1]}`
            : BAZARSTORE_PRIMARY_URL,
        });
      }
    }
  }

  return results;
}

/**
 * Parses Bazarstore nopCommerce `/instantSearchFor?q=...` JSON response payload into RawScrapedProductInput[].
 */
export function parseBazarstoreInstantSearchJson(payload: any): RawScrapedProductInput[] {
  const results: RawScrapedProductInput[] = [];
  const list = Array.isArray(payload?.Products)
    ? payload.Products
    : Array.isArray(payload)
    ? payload
    : [];
  for (const p of list) {
    if (!p || !p.Name) continue;
    const priceVal = Number(p.ProductPrice?.PriceValue ?? 0);
    const oldVal =
      p.ProductPrice?.OldPriceValue !== null && p.ProductPrice?.OldPriceValue !== undefined
        ? Number(p.ProductPrice.OldPriceValue)
        : null;
    if (!Number.isFinite(priceVal) || priceVal <= 0) continue;

    const regPrice = oldVal !== null && Number.isFinite(oldVal) && oldVal > priceVal ? oldVal : priceVal;
    const discPrice = oldVal !== null && Number.isFinite(oldVal) && oldVal > priceVal ? priceVal : null;
    const rawImg =
      p.PictureModels?.[0]?.FullSizeImageUrl || p.PictureModels?.[0]?.ImageUrl || null;
    const validImg =
      rawImg &&
      !String(rawImg).includes('default-image') &&
      !String(rawImg).includes('test.bazarstore.az')
        ? String(rawImg)
        : null;
    const urlPath = p.CustomProperties?.Url || (p.SeName ? `/${p.SeName}` : '');

    results.push({
      externalId: String(p.Sku || p.Id || ''),
      ean: p.Sku ? String(p.Sku) : null,
      title: decodeHtmlEntities(String(p.Name)),
      brand: p.ManufacturerName ? decodeHtmlEntities(String(p.ManufacturerName)) : null,
      regularPrice: regPrice,
      discountedPrice: discPrice,
      isAvailable: p.ProductPrice?.DisableBuyButton !== true,
      imageUrl: validImg,
      productUrl: urlPath
        ? urlPath.startsWith('http')
          ? urlPath
          : `https://bazarstore.az${urlPath}`
        : BAZARSTORE_PRIMARY_URL,
    });
  }
  return results;
}

/**
 * Parses Shopify /products.json or /collections/all/products.json response payload into RawScrapedProductInput[].
 */
export function parseBazarstoreShopifyJson(payload: any): RawScrapedProductInput[] {
  const results: RawScrapedProductInput[] = [];
  if (!payload || !Array.isArray(payload.products)) return results;

  for (const prod of payload.products) {
    if (!prod || !prod.title) continue;
    const imageUrl =
      Array.isArray(prod.images) && prod.images[0]?.src
        ? String(prod.images[0].src)
        : prod.image?.src
        ? String(prod.image.src)
        : null;
    const productUrl = prod.handle
      ? `https://bazarstore.az/products/${prod.handle}`
      : BAZARSTORE_PRIMARY_URL;
    const variants = Array.isArray(prod.variants) && prod.variants.length > 0 ? prod.variants : [prod];

    for (const v of variants) {
      const price = parseFloat(String(v.price ?? '0'));
      const compareAt = v.compare_at_price ? parseFloat(String(v.compare_at_price)) : null;
      if (!Number.isFinite(price) || price <= 0) continue;

      const regPrice =
        compareAt && Number.isFinite(compareAt) && compareAt > price ? compareAt : price;
      const discPrice =
        compareAt && Number.isFinite(compareAt) && compareAt > price ? price : null;

      results.push({
        externalId: String(v.id || prod.id),
        ean: v.barcode || v.sku || null,
        title: String(prod.title),
        variantTitle: v.title && v.title !== 'Default Title' ? String(v.title) : null,
        brand: prod.vendor ? String(prod.vendor) : null,
        category: prod.product_type ? String(prod.product_type) : null,
        regularPrice: regPrice,
        discountedPrice: discPrice,
        isAvailable: v.available !== false,
        imageUrl,
        productUrl,
        packageSize: typeof v.grams === 'number' && v.grams > 0 ? v.grams : undefined,
        packageUnit: typeof v.grams === 'number' && v.grams > 0 ? 'g' : undefined,
      });
    }
  }

  return results;
}

/**
 * Polite, resilient collector that fetches Bazarstore product prices using:
 * 1) Public Shopify JSON endpoints (products.json / collections/all/products.json)
 * 2) Primary HTML catalogue URL (https://bazarstore.az/b%C3%BCt%C3%BCn-m%C9%99hsullar)
 * 3) Alternative HTML URL (https://bazarstore.az/bütün-məhsullar)
 * Never bypasses access restrictions or CAPTCHAs; reports errors cleanly.
 */
export async function fetchLiveBazarstoreCatalogue(options?: {
  timeoutMs?: number;
  customFetch?: typeof fetch;
}): Promise<{
  collected: RawScrapedProductInput[];
  sourceUrlUsed: string;
  errors: string[];
}> {
  const timeoutMs = options?.timeoutMs ?? 6500;
  const fetchFn = options?.customFetch ?? globalThis.fetch;
  const errors: string[] = [];
  const collected: RawScrapedProductInput[] = [];

  if (typeof fetchFn !== 'function') {
    return {
      collected: [],
      sourceUrlUsed: BAZARSTORE_PRIMARY_URL,
      errors: ['Global fetch API unavailable in current runtime'],
    };
  }

  const headers = {
    'User-Agent': 'MealPlannerPriceMonitor/2.0 (+https://mealplanner.app/privacy)',
    Accept: 'application/json, text/html;q=0.9',
    'Accept-Language': 'az,en;q=0.8',
  };

  // Step 1: Try Shopify JSON endpoints first (lightweight, structured, lowest bandwidth)
  for (const jsonUrl of [BAZARSTORE_SHOPIFY_COLLECTION_URL, BAZARSTORE_SHOPIFY_PRODUCTS_URL]) {
    try {
      const res = await fetchFn(jsonUrl, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          const data = await res.json();
          const parsed = parseBazarstoreShopifyJson(data);
          if (parsed.length > 0) {
            return {
              collected: parsed,
              sourceUrlUsed: jsonUrl,
              errors,
            };
          }
        }
      } else {
        errors.push(`HTTP ${res.status} from ${jsonUrl}`);
      }
    } catch (err: any) {
      errors.push(`${jsonUrl}: ${err?.message || 'network timeout/error'}`);
    }
  }

  // Step 2: Try Primary & Alternative HTML catalogue URLs
  for (const htmlUrl of [BAZARSTORE_PRIMARY_URL, BAZARSTORE_ALTERNATIVE_URL]) {
    try {
      const res = await fetchFn(htmlUrl, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const html = await res.text();
        const parsed = parseBazarstoreHtmlCatalogue(html);
        if (parsed.length > 0) {
          return {
            collected: parsed,
            sourceUrlUsed: htmlUrl,
            errors,
          };
        }
        errors.push(`Parsed 0 structured product cards from ${htmlUrl}`);
      } else {
        errors.push(`HTTP ${res.status} from ${htmlUrl}`);
      }
    } catch (err: any) {
      errors.push(`${htmlUrl}: ${err?.message || 'network timeout/error'}`);
    }
  }

  return {
    collected,
    sourceUrlUsed: BAZARSTORE_PRIMARY_URL,
    errors,
  };
}

/**
 * Starts the automated 24-hour background scheduler for Bazarstore price monitoring.
 * Runs independently on the backend server without relying on users opening the Android app.
 */
export function startBazarstorePriceScheduler(dbInstance: {
  getPriceMonitoringSummary: (store?: SupermarketSlug) => { lastSuccessfulSyncAt: string | null };
  runBazarstorePriceSync: (opts?: { triggerType?: 'SCHEDULED_24H' | 'STARTUP_CHECK' }) => Promise<any>;
}): { stop: () => void; intervalMs: number } {
  const intervalMs =
    Number(process.env.PRICE_MONITOR_INTERVAL_MS) || MONITOR_INTERVAL_HOURS * 3600 * 1000;

  // Check on startup if the last successful sync is older than 24 hours
  try {
    const summary = dbInstance.getPriceMonitoringSummary('bazarstore');
    const lastMs = summary.lastSuccessfulSyncAt
      ? new Date(summary.lastSuccessfulSyncAt).getTime()
      : 0;
    if (!lastMs || Date.now() - lastMs >= intervalMs) {
      setTimeout(() => {
        dbInstance
          .runBazarstorePriceSync({ triggerType: 'STARTUP_CHECK' })
          .catch(() => {
            // Errors are logged inside price_sync_runs
          });
      }, 1500).unref?.();
    }
  } catch {
    // Ignore startup check error
  }

  const timer = setInterval(() => {
    dbInstance
      .runBazarstorePriceSync({ triggerType: 'SCHEDULED_24H' })
      .catch(() => {
        // Errors are recorded in price_sync_runs table
      });
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop: () => clearInterval(timer),
    intervalMs,
  };
}
