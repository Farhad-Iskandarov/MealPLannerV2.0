import {
  BiedronkaNutritionRow,
  MatchConfidence,
  PriceVerificationStatus,
  ShoppingCategory,
} from '../../shared/types';
import { calculateNormalizedUnitPrice } from '../supermarkets/supermarketService';

export const GLOVO_BIEDRONKA_STORE_URL =
  'https://glovoapp.com/en/pl/warszawa/stores/biedronka-waw';
export const GLOVO_API_BASE = 'https://api.glovoapp.com';
export const GLOVO_BIEDRONKA_SOURCE_NAME = 'Glovo Warsaw (Biedronka)';
export const GLOVO_BIEDRONKA_STORE_LOCATION = 'Warszawa, Polska (Glovo • biedronka-waw)';

export const BIEDRONKA_REFRESH_CADENCE_DAYS = 5;
export const BIEDRONKA_REFRESH_INTERVAL_MS = BIEDRONKA_REFRESH_CADENCE_DAYS * 24 * 3600 * 1000;
export const BIEDRONKA_STALE_THRESHOLD_HOURS = BIEDRONKA_REFRESH_CADENCE_DAYS * 24; // 120 hours
export const DEFAULT_BIEDRONKA_MAX_SECTIONS = 1000;
export const DEFAULT_BIEDRONKA_SECTIONS_PER_TICK = 50;
export const DEFAULT_BIEDRONKA_INITIAL_BACKOFF_MS = 15 * 60 * 1000; // 15 minutes
export const DEFAULT_BIEDRONKA_MAX_BACKOFF_MS = 6 * 3600 * 1000; // 6 hours

export const GLOVO_SECTION_REGEX =
  /(\/v4\/stores\/\d+\/addresses\/\d+\/content)\/main\?nodeType=DEEP_LINK&link=[\w.-]+#([\w.-]+\.(\d+))/g;

export const GLOVO_WARSAW_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Glovo-Location-City-Code': 'WAW',
  'Glovo-Location-Country-Code': 'PL',
  'Glovo-Language-Code': 'pl',
};

export interface GlovoRawProductTile {
  sku: string;
  productId?: string | null;
  externalProductId?: string | null;
  storeProductId?: string | null;
  storeId?: string | null;
  storeAddressId?: string | null;
  namePl: string;
  regularPricePln: number;
  promoPricePln: number | null;
  sections: string[];
  isAvailable?: boolean;
  observedAt?: string | null;
}

export interface VerifiedBiedronkaSnapshotItem {
  id: string;
  snapshotId: string;
  sku: string;
  productId?: string | null;
  externalProductId?: string | null;
  storeProductId?: string | null;
  storeId?: string | null;
  storeAddressId?: string | null;
  glovoProductUrl?: string | null;
  namePl: string;
  canonicalIngredient: string | null;
  matchConfidence: MatchConfidence;
  category: ShoppingCategory;
  regularPricePln: number;
  promoPricePln: number | null;
  effectivePricePln: number;
  packageSize: number | null;
  packageUnit: 'g' | 'ml' | 'pcs' | null;
  packageLabelPl: string | null;
  unitPricePln: number | null;
  unitPriceLabel: string | null;
  sections: string[];
  isAvailable: boolean;
  sourceName: string;
  storeLocation: string;
  sourceUrl: string;
  verificationStatus: PriceVerificationStatus;
  fetchedAt: string;
  observedAt?: string | null;
}

/**
 * Parses raw JSON text from Glovo without losing precision on 64-bit / >53-bit integer IDs
 * (e.g. productId 4611686018881015235 or 29-digit storeProductId).
 * Scans string literals verbatim and quotes any unquoted integer literal with >= 15 digits
 * outside strings before calling JSON.parse.
 */
export function parseGlovoJsonLossless(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') return null;
  let out = '';
  let i = 0;
  const len = rawText.length;

  while (i < len) {
    const ch = rawText[i];
    if (ch === '"') {
      // Copy string literal verbatim including escapes
      let j = i + 1;
      while (j < len) {
        const c = rawText[j];
        if (c === '\\') {
          j += 2;
          continue;
        }
        if (c === '"') {
          j++;
          break;
        }
        j++;
      }
      out += rawText.slice(i, j);
      i = j;
      continue;
    }

    // Check for bare integer token outside strings
    if ((ch >= '0' && ch <= '9') || (ch === '-' && i + 1 < len && rawText[i + 1] >= '0' && rawText[i + 1] <= '9')) {
      let j = ch === '-' ? i + 1 : i;
      while (j < len && rawText[j] >= '0' && rawText[j] <= '9') {
        j++;
      }
      const nextCh = j < len ? rawText[j] : '';
      const isPureInteger = nextCh !== '.' && nextCh !== 'e' && nextCh !== 'E';
      const digitCount = j - (ch === '-' ? i + 1 : i);
      if (isPureInteger && digitCount >= 15) {
        out += `"${rawText.slice(i, j)}"`;
        i = j;
        continue;
      }
      out += rawText.slice(i, j);
      i = j;
      continue;
    }

    out += ch;
    i++;
  }

  return JSON.parse(out);
}

/**
 * Extracts storeId and storeAddressId from a Glovo section path like "/v4/stores/46905/addresses/868734/content".
 */
export function extractGlovoStoreIdsFromPath(
  path: string | null | undefined
): { storeId: string; storeAddressId: string } | null {
  if (!path) return null;
  const m = String(path).match(/\/v\d+\/stores\/(\d+)\/addresses\/(\d+)/);
  if (!m) return null;
  return { storeId: m[1], storeAddressId: m[2] };
}

/**
 * Builds an exact optional Glovo Warsaw Biedronka product deep link using lossless string IDs.
 * Returns null if no exact product identity IDs are available.
 */
export function buildGlovoProductUrl(ids: {
  productId?: string | null;
  externalProductId?: string | null;
  storeProductId?: string | null;
}): string | null {
  const params = new URLSearchParams();
  if (ids.productId && String(ids.productId).trim()) {
    params.set('productId', String(ids.productId).trim());
  }
  if (ids.externalProductId && String(ids.externalProductId).trim()) {
    params.set('externalProductId', String(ids.externalProductId).trim());
  }
  if (ids.storeProductId && String(ids.storeProductId).trim()) {
    params.set('storeProductId', String(ids.storeProductId).trim());
  }
  const qs = params.toString();
  if (!qs) return null;
  return `${GLOVO_BIEDRONKA_STORE_URL}?${qs}`;
}

export interface GlovoSectionCoverage {
  section: string;
  sectionId: string;
  priceCards: number;
  status: 'ok' | 'no_price_cards' | 'rate_limited' | 'http_error' | 'network_error' | 'skipped_after_limit';
  httpStatus?: number;
  error?: string;
}

export interface GlovoFetchSnapshotResult {
  status: 'COMPLETE' | 'PARTIAL_REJECTED' | 'RATE_LIMITED' | 'FAILED';
  isComplete: boolean;
  rateLimited: boolean;
  totalSections: number;
  succeededSections: number;
  failedSections: number;
  items: VerifiedBiedronkaSnapshotItem[];
  coverage: GlovoSectionCoverage[];
  errors: string[];
  sourceName: string;
  storeLocation: string;
  sourceUrl: string;
  fetchedAt: string;
}

/**
 * Normalizes Polish text by folding all Polish diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż)
 * and collapsing whitespace.
 */
export function normalizePolishText(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses Polish decimal numbers using either comma ("4,99", "0,5") or dot ("4.99").
 */
export function parsePolishDecimal(raw: string | number | null | undefined): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s+/g, '').replace(',', '.');
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses an HTTP Retry-After header (seconds or HTTP-date) into milliseconds.
 */
export function parseRetryAfterHeader(
  headerValue: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  if (!headerValue || !headerValue.trim()) return null;
  const trimmed = headerValue.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const secs = parseFloat(trimmed);
    return Number.isFinite(secs) && secs >= 0 ? Math.round(secs * 1000) : null;
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - nowMs);
  }
  return null;
}

/**
 * Extracts explicit pack size & unit ('g', 'ml', 'pcs') from an original Polish product name,
 * handling Polish diacritics, decimal commas ("0,5 kg", "1,5 l"), and multipacks ("6 x 200 ml").
 * Returns null if no unambiguous pack size/unit is found (conservative — never invents a 500 g default).
 */
export function extractPolishPackSize(namePl: string): {
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'pcs';
  packageLabelPl: string;
} | null {
  const norm = normalizePolishText(namePl).replace(/(\d),(\d)/g, '$1.$2');

  // 1. Multipacks: e.g. "6 x 200 ml", "4x125 g", "2 x 0.5 l"
  const multiMatch = norm.match(
    /(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|szt\.?)(?=\s|$|[),.;/])/i
  );
  if (multiMatch) {
    const count = parseInt(multiMatch[1], 10);
    const each = parseFloat(multiMatch[2]);
    const rawUnit = multiMatch[3].toLowerCase().replace('.', '');
    if (count > 0 && count <= 48 && each > 0) {
      if (rawUnit === 'kg') {
        const grams = Math.round(count * each * 1000);
        return {
          packageSize: grams,
          packageUnit: 'g',
          packageLabelPl: `${count} × ${String(each).replace('.', ',')} kg`,
        };
      }
      if (rawUnit === 'g') {
        const grams = Math.round(count * each);
        return {
          packageSize: grams,
          packageUnit: 'g',
          packageLabelPl: `${count} × ${each} g`,
        };
      }
      if (rawUnit === 'l') {
        const ml = Math.round(count * each * 1000);
        return {
          packageSize: ml,
          packageUnit: 'ml',
          packageLabelPl: `${count} × ${String(each).replace('.', ',')} l`,
        };
      }
      if (rawUnit === 'ml') {
        const ml = Math.round(count * each);
        return {
          packageSize: ml,
          packageUnit: 'ml',
          packageLabelPl: `${count} × ${each} ml`,
        };
      }
      if (rawUnit === 'szt') {
        const pcs = Math.round(count * each);
        return {
          packageSize: pcs,
          packageUnit: 'pcs',
          packageLabelPl: `${pcs} szt.`,
        };
      }
    }
  }

  // 2. Explicit kilograms: e.g. "1 kg", "0,5 kg", "1.5 kg", "2kg"
  const kgMatch = norm.match(/(\d+(?:\.\d+)?)\s*kg(?=\s|$|[),.;/])/i);
  if (kgMatch) {
    const kg = parseFloat(kgMatch[1]);
    if (kg > 0 && kg <= 25) {
      return {
        packageSize: Math.round(kg * 1000),
        packageUnit: 'g',
        packageLabelPl: `${kgMatch[1].replace('.', ',')} kg`,
      };
    }
  }

  // 3. Explicit grams: e.g. "500 g", "400g", "250 g"
  const gMatch = norm.match(/(\d+(?:\.\d+)?)\s*g(?=\s|$|[),.;/])/i);
  if (gMatch) {
    const g = Math.round(parseFloat(gMatch[1]));
    if (g > 0 && g <= 25000) {
      return {
        packageSize: g,
        packageUnit: 'g',
        packageLabelPl: `${g} g`,
      };
    }
  }

  // 4. Explicit liters: e.g. "1 l", "0,5 l", "1,5 l"
  const lMatch = norm.match(/(\d+(?:\.\d+)?)\s*(?:l|litr)(?=\s|$|[),.;/])/i);
  if (lMatch) {
    const l = parseFloat(lMatch[1]);
    if (l > 0 && l <= 20) {
      return {
        packageSize: Math.round(l * 1000),
        packageUnit: 'ml',
        packageLabelPl: `${lMatch[1].replace('.', ',')} l`,
      };
    }
  }

  // 5. Explicit milliliters: e.g. "500 ml", "750ml"
  const mlMatch = norm.match(/(\d+(?:\.\d+)?)\s*ml(?=\s|$|[),.;/])/i);
  if (mlMatch) {
    const ml = Math.round(parseFloat(mlMatch[1]));
    if (ml > 0 && ml <= 10000) {
      return {
        packageSize: ml,
        packageUnit: 'ml',
        packageLabelPl: `${ml} ml`,
      };
    }
  }

  // 6. Explicit pieces: e.g. "10 szt.", "6 szt", "12 sztuk"
  const pcsMatch = norm.match(/(\d+)\s*(?:szt\.?|sztuk|sztuki|pcs)(?=\s|$|[),.;/])/i);
  if (pcsMatch) {
    const pcs = parseInt(pcsMatch[1], 10);
    if (pcs > 0 && pcs <= 100) {
      return {
        packageSize: pcs,
        packageUnit: 'pcs',
        packageLabelPl: `${pcs} szt.`,
      };
    }
  }

  // 7. Standalone "luzem" / "cena za 1 kg" / trailing "kg" for loose produce
  if (/(?:^|\s)(?:za\s*1\s*kg|\/\s*kg|luzem\s+kg|kg)(?=\s|$|[),.;])/i.test(norm)) {
    return {
      packageSize: 1000,
      packageUnit: 'g',
      packageLabelPl: '1 kg',
    };
  }

  return null;
}

/**
 * Exclusions for processed snacks, beverages, pet food, cosmetics, and household items
 * that contain staple food words in their names.
 */
const POLISH_NON_STAPLE_EXCLUSION_REGEX =
  /(?:^|[\s,.;()-])(?:chipsy|chrupki|paluszki|krakersy|herbatniki|ciastka|ciasto|baton|batonik|wafel|czekolada|cukierki|zelki|lody|deser|budyn|kisiel|sok|nektar|napoj\s+gazowany|ketchup|ketczup|sos\s+czosnkowy|sos\s+pomidorowy|majonez|zupka|zupa\s+blyskawiczna|karma\s+dla|szampon|mydlo|krem|zel\s+pod|plyn\s+do|proszek\s+do|krazki\s+cebulowe|frytki|puree\s+dla|sloiczek|mus\s+owocowy|piwo|wino|wodka|likier|cydr|przyprawa\s+do\s+kurczaka|kostka\s+rosolowa|bulion|pasztet|parowki|kabanosy|kielbasa|wedlina|szynka|salami|konserwa\s+turystyczna|salatka)(?=$|[\s,.;()-])/i;

interface ConservativePolishAliasRule {
  canonical: string;
  expectedUnit: 'g' | 'ml' | 'pcs';
  category: ShoppingCategory;
  pattern: RegExp;
  excludePattern?: RegExp;
}

/**
 * Conservative, verified Polish staple matching rules.
 * Every rule enforces strict dimension compatibility (expectedUnit) and excludes ambiguous variants.
 */
const CONSERVATIVE_POLISH_ALIAS_RULES: ConservativePolishAliasRule[] = [
  {
    canonical: 'oat_milk',
    expectedUnit: 'ml',
    category: 'Drinks',
    pattern: /(?:^|\s)napoj\s+owsian\w*(?:\s|$)/,
  },
  {
    canonical: 'milk',
    expectedUnit: 'ml',
    category: 'Dairy',
    pattern: /(?:^|\s)mleko(?:\s+(?:swieze|uht|wypasione|laciate|spozywcze|pasteryzowane|bez\s+laktozy|ekologiczne|bio|krowie|\d))/,
    excludePattern: /(?:kokosow|sojow|migdalow|owsian|ryzow|zageszczon|skondensowan|w\s+proszku|czekoladow|smakow|dla\s+niemowlat|modyfikowan)/,
  },
  {
    canonical: 'chicken_breast',
    expectedUnit: 'g',
    category: 'Meat & Fish',
    pattern: /(?:filet\s+z\s+piersi\s+kurczaka|piers\s+z\s+kurczaka|piersi\s+z\s+kurczaka|poledwiczki\s+z\s+kurczaka)/,
    excludePattern: /(?:panierowan|nugget|strips|wedzon|pieczon|plasterk|w\s+sosie)/,
  },
  {
    canonical: 'pork_loin',
    expectedUnit: 'g',
    category: 'Meat & Fish',
    pattern: /(?:schab\s+wieprzowy|schab\s+bez\s+kosci)/,
    excludePattern: /(?:wedzon|pieczon|plasterk|w\s+galarecie)/,
  },
  {
    canonical: 'salmon',
    expectedUnit: 'g',
    category: 'Meat & Fish',
    pattern: /(?:filet\s+z\s+lososia|losos\s+atlantycki|losos\s+swiezy|losos\s+porcja)/,
    excludePattern: /(?:pasta|serek|salatka|sushi|karma)/,
  },
  {
    canonical: 'eggs',
    expectedUnit: 'pcs',
    category: 'Dairy',
    pattern: /(?:^|\s)(?:jaja|jajka)(?:\s+(?:z\s+wolnego\s+wybiegu|z\s+chowu|sciolkow|klasy|klasa|ekologicz|wiejskie|swieze|kurze|m|l|xl|\d))/,
    excludePattern: /(?:niespodzianka|czekoladow|przepiorcz)/,
  },
  {
    canonical: 'greek_yogurt',
    expectedUnit: 'g',
    category: 'Dairy',
    pattern: /(?:jogurt\s+naturalny|jogurt\s+grecki|jogurt\s+typu\s+greckiego|skyr\s+naturalny)/,
    excludePattern: /(?:pitny|owocow|truskawk|waniliow|jagodow|brzoskwiniow|z\s+musli)/,
  },
  {
    canonical: 'cottage_cheese',
    expectedUnit: 'g',
    category: 'Dairy',
    pattern: /(?:twarog\s+(?:poltlusty|chudy|tlusty|krajanka|klinek|sernikowy|naturalny)|ser\s+bialy\s+twarogowy)/,
    excludePattern: /(?:smakow|ze\s+szczypiorkiem|z\s+rzodkiewka|waniliow)/,
  },
  {
    canonical: 'tofu',
    expectedUnit: 'g',
    category: 'Dairy',
    pattern: /(?:^|\s)tofu\s+(?:naturalne|bio|wedzone)(?:\s|$)/,
  },
  {
    canonical: 'banana',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)(?:banan|banany)(?:\s|$)/,
    excludePattern: /(?:suszon|chips|jogurt|serek|mus|baton|nektar|sok)/,
  },
  {
    canonical: 'apple',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)(?:jablka|jablko)(?:\s|$)/,
    excludePattern: /(?:suszon|ocet|sok|mus|szarlotk|cydr|chips|przecier)/,
  },
  {
    canonical: 'canned_tomatoes',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:pomidory\s+(?:krojone|pelati|cale\s+bez\s+skorki|w\s+puszce)|pulpa\s+pomidorowa)/,
    excludePattern: /(?:suszon|koncentrat|przecier\s+w\s+kartonie|passata)/,
  },
  {
    canonical: 'tomato',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)(?:pomidor|pomidory)(?:\s+(?:galazka|malinow|rzymsk|czerwone|polskie|szklarniowe|luzem|koktajlowe|\d))/,
    excludePattern: /(?:pusz|krojone|suszon|koncentrat|passata|przecier|zupa|sos|ketchup)/,
  },
  {
    canonical: 'carrot',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)(?:marchew|marchewka)(?:\s|$)/,
    excludePattern: /(?:groszkiem|konserwow|soku|sok|sur[oó]wk|ciasto|mrozon)/,
  },
  {
    canonical: 'potato',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)(?:ziemniaki|ziemniak)(?:\s|$)/,
    excludePattern: /(?:maka|skrobia|platki|puree|frytki|klusk|kopytk|plack)/,
  },
  {
    canonical: 'onion',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)cebula(?:\s+(?:zolta|czerwona|biala|polska|w\s+siatce|luzem|\d)|$)/,
    excludePattern: /(?:prazon|suszon|marynowan|krazki|chips|zupa|przyprawa|pierogi|smazon|farsz)/,
  },
  {
    canonical: 'garlic',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)czosnek(?:\s+(?:polski|swiezy|mlody|glowk|\d)|$)/,
    excludePattern: /(?:granulowan|suszon|mielon|marynowan|sos|bagietk|maslo)/,
  },
  {
    canonical: 'broccoli',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)(?:brokul|brokuly)(?:\s|$)/,
    excludePattern: /(?:zupa|krem\s+z|zapiekank)/,
  },
  {
    canonical: 'spinach',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)szpinak(?:\s+(?:baby|swiezy|liscie|myty|bio|\d)|$)/,
    excludePattern: /(?:mrozon|rozdrabnian|ze\s+smietana|pierogi|makaron|nalesniki)/,
  },
  {
    canonical: 'risotto_rice',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)ryz\s+(?:do\s+risotto|arborio|carnaroli|vialone\s+nano)(?:\s|$)/,
    excludePattern: /(?:danie\s+gotowe|z\s+grzybami|z\s+kurczakiem|z\s+warzywami|sos|instant|w\s+proszku)/,
  },
  {
    canonical: 'rice',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)ryz\s+(?:bialy|dlugoziarnisty|basmati|jasminowy|parboiled|brazowy)/,
    excludePattern: /(?:wafle|napoj|mleko|maka|ocet|na\s+mleku|deser|risotto|arborio|carnaroli)/,
  },
  {
    canonical: 'pearl_barley',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)kasza\s+jeczmienna(?:\s+(?:perlowa|peczak|wiejska|mazurska|gruba|drobna|srednia|bio|\d)|$)/,
    excludePattern: /(?:z\s+warzywami|danie\s+gotowe|zupa|krupnik|salatka|mix)/,
  },
  {
    canonical: 'oat_flakes',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)platki\s+owsiane(?:\s+(?:gorskie|zwykle|blyskawiczne|pelnoziarniste|bio|\d)|$)/,
    excludePattern: /(?:ciastk|baton|granola|musli\s+z\s+czekolada|owsianka\s+kubek)/,
  },
  {
    canonical: 'pasta',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)makaron(?:\s+(?:pelnoziarnisty|penne|spaghetti|fusilli|swiderki|rurki|kokardki|tagliatelle|pszenny|durum|\d))/,
    excludePattern: /(?:blyskawiczny|instant|z\s+sosem|danie\s+gotowe|rosol)/,
  },
  {
    canonical: 'red_lentils',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)soczewica\s+czerwona(?:\s|$)/,
    excludePattern: /(?:pasta|pasztet|zupa|danie|makaron\s+z\s+soczewicy)/,
  },
  {
    canonical: 'wholegrain_bread',
    expectedUnit: 'g',
    category: 'Bakery',
    pattern: /(?:^|\s)chleb\s+(?:zytni|razowy|pelnoziarnisty|graham|z\s+ziarnami|wiejski)/,
    excludePattern: /(?:chrupki|tostowy\s+pszenny|czosnkowy|bulka\s+tarta)/,
  },
  {
    canonical: 'olive_oil',
    expectedUnit: 'ml',
    category: 'Other',
    pattern: /(?:^|\s)(?:oliwa\s+z\s+oliwek|olej\s+rzepakowy)/,
    excludePattern: /(?:tunczyk|sardynk|oliwki|krem|szampon|mydlo|chips)/,
  },
  {
    canonical: 'paprika',
    expectedUnit: 'g',
    category: 'Other',
    pattern: /(?:^|\s)papryka\s+(?:slodka\s+mielona|slodka\s+przyprawa|mielona\s+slodka)/,
    excludePattern: /(?:swieza|czerwona\s+luzem|konserwow|chips|pasta)/,
  },
  {
    canonical: 'frozen_vegetables',
    expectedUnit: 'g',
    category: 'Frozen Products',
    pattern: /(?:warzywa\s+na\s+patelnie|mieszanka\s+warzywna(?:\s+mrozona)?|bukiet\s+warzyw\s+mrozony)/,
    excludePattern: /(?:konserwow|w\s+sloiku|zupa\s+w\s+proszku)/,
  },
  // Verified Polish economy & premium staples (matched conservatively against Glovo Warsaw Biedronka)
  {
    canonical: 'buckwheat',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)kasza\s+gryczana(?:\s+(?:prazona|biala|niepalona|ekologiczna|bio|\d)|$)/,
    excludePattern: /(?:mix|bulgur|soczewica|danie\s+gotowe|z\s+warzywami|salatka)/,
  },
  {
    canonical: 'chickpeas',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)ciecierzyca(?:\s+(?:gotowana|konserwowa|w\s+zalewie|bio|\d)|$)/,
    excludePattern: /(?:pasta|hummus|kuskus|salatka|protein\s+mix|tunczyk|zupa)/,
  },
  {
    canonical: 'sunflower_seeds',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)(?:slonecznik\s+luskany|ziarna\s+slonecznika|pestki\s+slonecznika)(?:\s|$)/,
    excludePattern: /(?:olej|baton|chleb|bulka|w\s+lupinie|karma)/,
  },
  {
    canonical: 'beets',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)buraki\s+(?:czerwone|czerowne|gotowane|swieze)(?:\s|$)/,
    excludePattern: /(?:chips|hummus|karma|barszcz|zupa|salatka|sok)/,
  },
  {
    canonical: 'hummus',
    expectedUnit: 'g',
    category: 'Dairy',
    pattern: /(?:^|\s)hummus\s+(?:orientalny|klasyczny|naturalny|z\s+buraka|paprykowy)(?:\s|$)/,
    excludePattern: /(?:chips|talarki|kuskus|kanapka)/,
  },
  {
    canonical: 'wild_mushrooms',
    expectedUnit: 'g',
    category: 'Frozen Products',
    pattern: /(?:^|\s)(?:podgrzybki\s+(?:krojone|cal[ey]|mrozone)|borowiki\s+(?:krojone|mrozone))(?:\s|$)/,
    excludePattern: /(?:zupa|sledz|sos|pierogi|pasztet|suszone)/,
  },
  {
    canonical: 'almonds',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)migdaly\s+(?:kalifornijskie|luskane|prazone|blanszowane)(?:\s|$)/,
    excludePattern: /(?:czekolad|pralin|ciastk|granola|baton|kwas|tonik|krem|napoj|mleko)/,
  },
  {
    canonical: 'cashews',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)orzechy\s+nerkowca(?:\s|$)/,
    excludePattern: /(?:w\s+karmelu|czekolad|pesto|baton|ciastk|salatka)/,
  },
  {
    canonical: 'hazelnuts',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)orzechy\s+laskowe(?:\s+(?:luskane|prazone|\d)|$)/,
    excludePattern: /(?:czekolad|pralin|wafelek|krem|nutella|ciastk|baton|lody)/,
  },
  {
    canonical: 'pistachios',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)pistacje(?:\s+(?:prazone|solone|luskane|\d)|$)/,
    excludePattern: /(?:lody|krem|granola|czekolad|ciastk|baton)/,
  },
  {
    canonical: 'avocado',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)awokado(?:\s+(?:hass|bio|dojrzale|\d)|$)/,
    excludePattern: /(?:olej|krem|szampon|zel|pasta|guacamole|salatka)/,
  },
  {
    canonical: 'blueberries',
    expectedUnit: 'g',
    category: 'Fruit & Vegetables',
    pattern: /(?:^|\s)(?:borowka|borowki)(?:\s+(?:amerykanska|amerykanskie|swieze|bio|\d)|$)/,
    excludePattern: /(?:jogurt|karma|deser|lody|sok|dzem|mus|ciastk)/,
  },
  {
    canonical: 'sun_dried_tomatoes',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)pomidory\s+suszone(?:\s+(?:z\s+pestkami|w\s+oleju|z\s+ziolami|\d)|$)/,
    excludePattern: /(?:salatka|tunczyk|makaron|kasza|pasta|ser|pierogi)/,
  },
  {
    canonical: 'tofu_pesto',
    expectedUnit: 'g',
    category: 'Dry Products',
    pattern: /(?:^|\s)pesto\s+z\s+tofu(?:\s|$)/,
    excludePattern: /(?:makaron|danie\s+gotowe|pizza)/,
  },
];

/**
 * Conservatively matches an original Polish Glovo Biedronka product name + parsed unit
 * to a verified canonical ingredient. Returns null if ambiguous, excluded, or dimension-mismatched.
 */
export function matchConservativePolishCanonical(
  namePl: string,
  packageUnit: 'g' | 'ml' | 'pcs' | null
): { canonicalIngredient: string; category: ShoppingCategory; matchConfidence: MatchConfidence } | null {
  if (!namePl || !packageUnit) return null;
  const norm = normalizePolishText(namePl);
  if (!norm || norm.length < 3) return null;
  if (POLISH_NON_STAPLE_EXCLUSION_REGEX.test(norm)) {
    return null;
  }

  for (const rule of CONSERVATIVE_POLISH_ALIAS_RULES) {
    if (rule.expectedUnit !== packageUnit) continue;
    if (rule.excludePattern && rule.excludePattern.test(norm)) continue;
    if (rule.pattern.test(norm)) {
      return {
        canonicalIngredient: rule.canonical,
        category: rule.category,
        matchConfidence: 'HIGH',
      };
    }
  }

  return null;
}

/**
 * Normalizes a raw Glovo Warsaw Biedronka product tile into a VerifiedBiedronkaSnapshotItem.
 * Preserves original Polish name, SKU, PLN regular/promo prices, parsed pack size/unit,
 * and Glovo Warsaw provenance. Returns null if SKU, name, or price is invalid.
 */
export function normalizeGlovoBiedronkaTile(
  tile: GlovoRawProductTile,
  snapshotId: string,
  fetchedAtIso: string
): VerifiedBiedronkaSnapshotItem | null {
  const sku = String(tile.sku || '').trim();
  const namePl = String(tile.namePl || '').trim();
  if (!sku || !namePl) return null;

  const reg = parsePolishDecimal(tile.regularPricePln);
  const promo =
    tile.promoPricePln !== null && tile.promoPricePln !== undefined
      ? parsePolishDecimal(tile.promoPricePln)
      : null;

  if (reg === null || reg <= 0 || reg > 2000) return null;
  if (promo !== null && (promo <= 0 || promo > 2000)) return null;

  const regularPricePln = promo !== null ? Number(Math.max(reg, promo).toFixed(2)) : Number(reg.toFixed(2));
  const promoPricePln =
    promo !== null && Math.min(reg, promo) < regularPricePln
      ? Number(Math.min(reg, promo).toFixed(2))
      : null;
  const effectivePricePln = promoPricePln !== null ? promoPricePln : regularPricePln;

  const pack = extractPolishPackSize(namePl);
  const matched = pack ? matchConservativePolishCanonical(namePl, pack.packageUnit) : null;

  let unitPricePln: number | null = null;
  let unitPriceLabel: string | null = null;
  if (pack && pack.packageSize > 0) {
    const calc = calculateNormalizedUnitPrice(effectivePricePln, pack.packageSize, pack.packageUnit, 'PLN');
    unitPricePln = calc.unitPricePln;
    unitPriceLabel = calc.unitLabel;
  }

  const productId = tile.productId ? String(tile.productId).trim() : null;
  const externalProductId = tile.externalProductId ? String(tile.externalProductId).trim() : null;
  const storeProductId = tile.storeProductId ? String(tile.storeProductId).trim() : null;
  const storeId = tile.storeId ? String(tile.storeId).trim() : null;
  const storeAddressId = tile.storeAddressId ? String(tile.storeAddressId).trim() : null;
  const glovoProductUrl = buildGlovoProductUrl({
    productId,
    externalProductId,
    storeProductId,
  });
  const observedAt =
    tile.observedAt !== undefined ? tile.observedAt : fetchedAtIso;

  return {
    id: `bd-snap-${snapshotId}-${sku}`,
    snapshotId,
    sku,
    productId,
    externalProductId,
    storeProductId,
    storeId,
    storeAddressId,
    glovoProductUrl,
    namePl,
    canonicalIngredient: matched ? matched.canonicalIngredient : null,
    matchConfidence: matched ? matched.matchConfidence : 'UNCERTAIN',
    category: matched ? matched.category : 'Other',
    regularPricePln,
    promoPricePln,
    effectivePricePln,
    packageSize: pack ? pack.packageSize : null,
    packageUnit: pack ? pack.packageUnit : null,
    packageLabelPl: pack ? pack.packageLabelPl : null,
    unitPricePln,
    unitPriceLabel,
    sections: Array.from(new Set(tile.sections || [])).sort(),
    isAvailable: tile.isAvailable !== false,
    sourceName: GLOVO_BIEDRONKA_SOURCE_NAME,
    storeLocation: GLOVO_BIEDRONKA_STORE_LOCATION,
    sourceUrl: GLOVO_BIEDRONKA_STORE_URL,
    verificationStatus: 'LIVE_MONITORED_CATALOGUE',
    fetchedAt: fetchedAtIso,
    observedAt,
  };
}

/**
 * Extracts Glovo Warsaw Biedronka section tuples from the public store HTML.
 */
export function extractGlovoSectionsFromHtml(
  homepageHtml: string
): Array<{ path: string; section: string; sectionId: string }> {
  if (!homepageHtml) return [];
  const unescaped = homepageHtml.replace(/\\u0026/g, '&');
  const seen = new Set<string>();
  const sections: Array<{ path: string; section: string; sectionId: string }> = [];
  const regex = new RegExp(GLOVO_SECTION_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = regex.exec(unescaped)) !== null) {
    const key = `${m[1]}|${m[2]}|${m[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sections.push({ path: m[1], section: m[2], sectionId: m[3] });
  }
  return sections;
}

/**
 * Parses a Glovo section `/partial?component=section&id=...` JSON payload into GlovoRawProductTile[].
 */
export function parseGlovoSectionResponse(
  payload: any,
  sectionName: string,
  meta?: {
    storeId?: string | null;
    storeAddressId?: string | null;
    observedAt?: string | null;
  }
): GlovoRawProductTile[] {
  const results: GlovoRawProductTile[] = [];
  const body = payload?.data?.body;
  if (!Array.isArray(body)) return results;

  for (const block of body) {
    const elements = block?.data?.elements;
    if (!Array.isArray(elements)) continue;
    for (const tile of elements) {
      if (tile?.type !== 'PRODUCT_TILE' || !tile.data) continue;
      const product = tile.data;
      const amount = parsePolishDecimal(product.price);
      if (amount === null || amount <= 0) continue;

      const promotion = product.promotion || {};
      const discount =
        !promotion.isPrime && promotion.price !== undefined && promotion.price !== null
          ? parsePolishDecimal(promotion.price)
          : null;
      const productId = product.id !== undefined && product.id !== null ? String(product.id).trim() : null;
      const externalProductId =
        product.externalId !== undefined && product.externalId !== null
          ? String(product.externalId).trim()
          : product.externalProductId !== undefined && product.externalProductId !== null
          ? String(product.externalProductId).trim()
          : null;
      const storeProductId =
        product.storeProductId !== undefined && product.storeProductId !== null
          ? String(product.storeProductId).trim()
          : null;
      const sku = String(storeProductId || externalProductId || productId || '').trim();
      const namePl = String(product.name || '').trim();
      if (!sku || !namePl) continue;

      results.push({
        sku,
        productId,
        externalProductId: externalProductId || storeProductId,
        storeProductId: storeProductId || externalProductId,
        storeId: meta?.storeId ?? null,
        storeAddressId: meta?.storeAddressId ?? null,
        namePl,
        regularPricePln: amount,
        promoPricePln: discount !== null && discount < amount ? discount : null,
        sections: [sectionName],
        isAvailable: product.available !== false,
        observedAt: meta?.observedAt,
      });
    }
  }
  return results;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Paced, bounded Glovo Warsaw Biedronka collector adapted from fetch_all_prices.py.
 * Honors Retry-After and stops cleanly on rate limits (429/401/403).
 * Never marks partial or rate-limited runs as complete.
 */
export async function fetchGlovoBiedronkaWarsawSnapshot(options?: {
  snapshotId?: string;
  customFetch?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  requestDelayMs?: number;
  maxSections?: number;
  maxRetriesPerSection?: number;
  maxRetryAfterMs?: number;
  timeoutMs?: number;
  minValidProducts?: number;
  nowIso?: string;
}): Promise<GlovoFetchSnapshotResult> {
  const fetchFn = options?.customFetch ?? globalThis.fetch;
  const sleepFn = options?.sleepFn ?? defaultSleep;
  const requestDelayMs = options?.requestDelayMs ?? 400;
  const maxSections = options?.maxSections ?? DEFAULT_BIEDRONKA_MAX_SECTIONS;
  const maxRetriesPerSection = options?.maxRetriesPerSection ?? 2;
  const maxRetryAfterMs = options?.maxRetryAfterMs ?? 15_000;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const minValidProducts = options?.minValidProducts ?? 1;
  const fetchedAt = options?.nowIso || new Date().toISOString();
  const snapshotId = options?.snapshotId || `snap-bd-waw-${Date.now()}`;

  const errors: string[] = [];
  const coverage: GlovoSectionCoverage[] = [];

  if (typeof fetchFn !== 'function') {
    return {
      status: 'FAILED',
      isComplete: false,
      rateLimited: false,
      totalSections: 0,
      succeededSections: 0,
      failedSections: 0,
      items: [],
      coverage,
      errors: ['Fetch API unavailable in runtime'],
      sourceName: GLOVO_BIEDRONKA_SOURCE_NAME,
      storeLocation: GLOVO_BIEDRONKA_STORE_LOCATION,
      sourceUrl: GLOVO_BIEDRONKA_STORE_URL,
      fetchedAt,
    };
  }

  // Step 1: Fetch public Glovo Warsaw Biedronka store homepage
  let homepageHtml = '';
  try {
    const homeRes = await fetchFn(GLOVO_BIEDRONKA_STORE_URL, {
      headers: { Accept: 'text/html', 'Accept-Language': 'pl-PL,pl;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (homeRes.status === 429 || homeRes.status === 401 || homeRes.status === 403) {
      return {
        status: 'RATE_LIMITED',
        isComplete: false,
        rateLimited: true,
        totalSections: 0,
        succeededSections: 0,
        failedSections: 0,
        items: [],
        coverage,
        errors: [`Store homepage access limited (HTTP ${homeRes.status})`],
        sourceName: GLOVO_BIEDRONKA_SOURCE_NAME,
        storeLocation: GLOVO_BIEDRONKA_STORE_LOCATION,
        sourceUrl: GLOVO_BIEDRONKA_STORE_URL,
        fetchedAt,
      };
    }
    if (!homeRes.ok) {
      return {
        status: 'FAILED',
        isComplete: false,
        rateLimited: false,
        totalSections: 0,
        succeededSections: 0,
        failedSections: 0,
        items: [],
        coverage,
        errors: [`Store homepage returned HTTP ${homeRes.status}`],
        sourceName: GLOVO_BIEDRONKA_SOURCE_NAME,
        storeLocation: GLOVO_BIEDRONKA_STORE_LOCATION,
        sourceUrl: GLOVO_BIEDRONKA_STORE_URL,
        fetchedAt,
      };
    }
    homepageHtml = await homeRes.text();
  } catch (err: any) {
    return {
      status: 'FAILED',
      isComplete: false,
      rateLimited: false,
      totalSections: 0,
      succeededSections: 0,
      failedSections: 0,
      items: [],
      coverage,
      errors: [`Homepage fetch error: ${err?.message || 'network failure'}`],
      sourceName: GLOVO_BIEDRONKA_SOURCE_NAME,
      storeLocation: GLOVO_BIEDRONKA_STORE_LOCATION,
      sourceUrl: GLOVO_BIEDRONKA_STORE_URL,
      fetchedAt,
    };
  }

  const discoveredSections = extractGlovoSectionsFromHtml(homepageHtml);
  if (discoveredSections.length === 0) {
    return {
      status: 'FAILED',
      isComplete: false,
      rateLimited: false,
      totalSections: 0,
      succeededSections: 0,
      failedSections: 0,
      items: [],
      coverage,
      errors: ['No public Glovo Biedronka Warsaw catalog sections found in store HTML'],
      sourceName: GLOVO_BIEDRONKA_SOURCE_NAME,
      storeLocation: GLOVO_BIEDRONKA_STORE_LOCATION,
      sourceUrl: GLOVO_BIEDRONKA_STORE_URL,
      fetchedAt,
    };
  }

  const boundedSections = discoveredSections.slice(0, maxSections);
  const wasTruncatedByBound = discoveredSections.length > maxSections;
  const tileBySku = new Map<string, GlovoRawProductTile>();
  let accessLimited = false;
  let succeededSections = 0;
  let failedSections = 0;

  for (let idx = 0; idx < boundedSections.length; idx++) {
    const sec = boundedSections[idx];
    if (accessLimited) {
      failedSections++;
      coverage.push({
        section: sec.section,
        sectionId: sec.sectionId,
        priceCards: 0,
        status: 'skipped_after_limit',
      });
      continue;
    }

    if (idx > 0 && requestDelayMs > 0) {
      await sleepFn(requestDelayMs);
    }

    const url = `${GLOVO_API_BASE}${sec.path}/partial?component=section&id=${encodeURIComponent(sec.sectionId)}`;
    let attempt = 0;
    let done = false;

    while (!done && attempt <= maxRetriesPerSection) {
      attempt++;
      try {
        const res = await fetchFn(url, {
          headers: GLOVO_WARSAW_HEADERS,
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.status === 429 || res.status === 503) {
          const retryAfterMs = parseRetryAfterHeader(res.headers?.get?.('retry-after'));
          if (
            attempt <= maxRetriesPerSection &&
            retryAfterMs !== null &&
            retryAfterMs <= maxRetryAfterMs
          ) {
            if (retryAfterMs > 0) {
              await sleepFn(retryAfterMs);
            }
            continue;
          }
          accessLimited = true;
          failedSections++;
          const msg = `HTTP ${res.status} on section ${sec.section} (Retry-After: ${res.headers?.get?.('retry-after') || 'none'})`;
          errors.push(msg);
          coverage.push({
            section: sec.section,
            sectionId: sec.sectionId,
            priceCards: 0,
            status: 'rate_limited',
            httpStatus: res.status,
            error: msg,
          });
          done = true;
          break;
        }

        if (res.status === 401 || res.status === 403) {
          accessLimited = true;
          failedSections++;
          const msg = `HTTP ${res.status} access restricted on section ${sec.section}`;
          errors.push(msg);
          coverage.push({
            section: sec.section,
            sectionId: sec.sectionId,
            priceCards: 0,
            status: 'rate_limited',
            httpStatus: res.status,
            error: msg,
          });
          done = true;
          break;
        }

        if (!res.ok) {
          failedSections++;
          const msg = `HTTP ${res.status} on section ${sec.section}`;
          errors.push(msg);
          coverage.push({
            section: sec.section,
            sectionId: sec.sectionId,
            priceCards: 0,
            status: 'http_error',
            httpStatus: res.status,
            error: msg,
          });
          done = true;
          break;
        }

        const rawText = await res.text();
        const json = parseGlovoJsonLossless(rawText);
        const sectionObservedAt = options?.nowIso || new Date().toISOString();
        const storeIds = extractGlovoStoreIdsFromPath(sec.path);
        const tiles = parseGlovoSectionResponse(json, sec.section, {
          storeId: storeIds?.storeId ?? null,
          storeAddressId: storeIds?.storeAddressId ?? null,
          observedAt: sectionObservedAt,
        });
        for (const t of tiles) {
          const prev = tileBySku.get(t.sku);
          if (prev) {
            prev.sections = Array.from(new Set([...prev.sections, ...t.sections]));
            if (!prev.productId && t.productId) prev.productId = t.productId;
            if (!prev.externalProductId && t.externalProductId) prev.externalProductId = t.externalProductId;
            if (!prev.storeProductId && t.storeProductId) prev.storeProductId = t.storeProductId;
          } else {
            tileBySku.set(t.sku, t);
          }
        }
        succeededSections++;
        coverage.push({
          section: sec.section,
          sectionId: sec.sectionId,
          priceCards: tiles.length,
          status: tiles.length > 0 ? 'ok' : 'no_price_cards',
        });
        done = true;
      } catch (err: any) {
        if (attempt <= maxRetriesPerSection) {
          if (requestDelayMs > 0) await sleepFn(requestDelayMs);
          continue;
        }
        failedSections++;
        const msg = `Network error on section ${sec.section}: ${err?.message || 'timeout'}`;
        errors.push(msg);
        coverage.push({
          section: sec.section,
          sectionId: sec.sectionId,
          priceCards: 0,
          status: 'network_error',
          error: msg,
        });
        done = true;
      }
    }
  }

  const normalizedItems: VerifiedBiedronkaSnapshotItem[] = [];
  for (const tile of tileBySku.values()) {
    const norm = normalizeGlovoBiedronkaTile(tile, snapshotId, fetchedAt);
    if (norm) {
      normalizedItems.push(norm);
    }
  }

  const isComplete =
    !accessLimited &&
    !wasTruncatedByBound &&
    boundedSections.length > 0 &&
    failedSections === 0 &&
    normalizedItems.length >= minValidProducts;

  const status: GlovoFetchSnapshotResult['status'] = isComplete
    ? 'COMPLETE'
    : accessLimited
    ? 'RATE_LIMITED'
    : normalizedItems.length > 0
    ? 'PARTIAL_REJECTED'
    : 'FAILED';

  if (wasTruncatedByBound) {
    errors.push(
      `Snapshot truncated by maxSections bound (${maxSections}/${discoveredSections.length}); refusing to promote partial snapshot`
    );
  }

  return {
    status,
    isComplete,
    rateLimited: accessLimited,
    totalSections: discoveredSections.length,
    succeededSections,
    failedSections,
    items: normalizedItems,
    coverage,
    errors,
    sourceName: GLOVO_BIEDRONKA_SOURCE_NAME,
    storeLocation: GLOVO_BIEDRONKA_STORE_LOCATION,
    sourceUrl: GLOVO_BIEDRONKA_STORE_URL,
    fetchedAt,
  };
}

export interface DiscoveredGlovoSection {
  sectionIndex: number;
  path: string;
  section: string;
  sectionId: string;
}

export interface GlovoBatchFetchResult {
  completedSectionIndices: number[];
  failedSectionIndices: number[];
  items: VerifiedBiedronkaSnapshotItem[];
  rateLimited: boolean;
  retryAfterMs: number | null;
  errors: string[];
}

/**
 * Discovers all Glovo Warsaw Biedronka catalog sections from the public store homepage.
 */
export async function discoverGlovoBiedronkaSections(options?: {
  customFetch?: typeof fetch;
  timeoutMs?: number;
  maxSections?: number;
}): Promise<{
  ok: boolean;
  rateLimited: boolean;
  retryAfterMs: number | null;
  sections: DiscoveredGlovoSection[];
  totalDiscovered: number;
  truncatedByBound: boolean;
  error?: string;
}> {
  const fetchFn = options?.customFetch ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const maxSections = options?.maxSections ?? DEFAULT_BIEDRONKA_MAX_SECTIONS;

  if (typeof fetchFn !== 'function') {
    return {
      ok: false,
      rateLimited: false,
      retryAfterMs: null,
      sections: [],
      totalDiscovered: 0,
      truncatedByBound: false,
      error: 'Fetch API unavailable in runtime',
    };
  }

  try {
    const res = await fetchFn(GLOVO_BIEDRONKA_STORE_URL, {
      headers: { Accept: 'text/html', 'Accept-Language': 'pl-PL,pl;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429 || res.status === 503 || res.status === 401 || res.status === 403) {
      return {
        ok: false,
        rateLimited: true,
        retryAfterMs: parseRetryAfterHeader(res.headers?.get?.('retry-after')),
        sections: [],
        totalDiscovered: 0,
        truncatedByBound: false,
        error: `Store homepage access limited (HTTP ${res.status})`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        rateLimited: false,
        retryAfterMs: null,
        sections: [],
        totalDiscovered: 0,
        truncatedByBound: false,
        error: `Store homepage returned HTTP ${res.status}`,
      };
    }
    const html = await res.text();
    const rawSections = extractGlovoSectionsFromHtml(html);
    if (rawSections.length === 0) {
      return {
        ok: false,
        rateLimited: false,
        retryAfterMs: null,
        sections: [],
        totalDiscovered: 0,
        truncatedByBound: false,
        error: 'No public Glovo Biedronka Warsaw catalog sections found in store HTML',
      };
    }
    const truncatedByBound = rawSections.length > maxSections;
    const bounded = rawSections.slice(0, maxSections).map((s, idx) => ({
      sectionIndex: idx,
      path: s.path,
      section: s.section,
      sectionId: s.sectionId,
    }));
    return {
      ok: !truncatedByBound,
      rateLimited: false,
      retryAfterMs: null,
      sections: bounded,
      totalDiscovered: rawSections.length,
      truncatedByBound,
      error: truncatedByBound
        ? `Discovered ${rawSections.length} sections exceeding maxSections bound (${maxSections})`
        : undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      rateLimited: false,
      retryAfterMs: null,
      sections: [],
      totalDiscovered: 0,
      truncatedByBound: false,
      error: `Homepage fetch error: ${err?.message || 'network failure'}`,
    };
  }
}

/**
 * Fetches a bounded batch of pending sections for a resumable staging snapshot.
 * Honors pacing delay and stops immediately on HTTP 429/503/401/403 returning Retry-After
 * so the caller can persist backoff and resume on a later scheduler tick.
 */
export async function fetchGlovoSectionsBatch(
  sections: DiscoveredGlovoSection[],
  snapshotId: string,
  options?: {
    customFetch?: typeof fetch;
    sleepFn?: (ms: number) => Promise<void>;
    requestDelayMs?: number;
    timeoutMs?: number;
    nowIso?: string;
  }
): Promise<GlovoBatchFetchResult> {
  const fetchFn = options?.customFetch ?? globalThis.fetch;
  const sleepFn = options?.sleepFn ?? defaultSleep;
  const requestDelayMs = options?.requestDelayMs ?? 400;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const fetchedAt = options?.nowIso || new Date().toISOString();

  const completedSectionIndices: number[] = [];
  const failedSectionIndices: number[] = [];
  const errors: string[] = [];
  const tileBySku = new Map<string, GlovoRawProductTile>();
  let rateLimited = false;
  let retryAfterMs: number | null = null;

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (i > 0 && requestDelayMs > 0) {
      await sleepFn(requestDelayMs);
    }

    const url = `${GLOVO_API_BASE}${sec.path}/partial?component=section&id=${encodeURIComponent(sec.sectionId)}`;
    try {
      const res = await fetchFn(url, {
        headers: GLOVO_WARSAW_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 429 || res.status === 503 || res.status === 401 || res.status === 403) {
        rateLimited = true;
        retryAfterMs = parseRetryAfterHeader(res.headers?.get?.('retry-after'));
        errors.push(
          `HTTP ${res.status} on section ${sec.section} (Retry-After: ${res.headers?.get?.('retry-after') || 'none'})`
        );
        // Stop immediately for this tick; section stays PENDING for resumable retry after backoff
        break;
      }

      if (!res.ok) {
        failedSectionIndices.push(sec.sectionIndex);
        errors.push(`HTTP ${res.status} on section ${sec.section}`);
        continue;
      }

      const rawText = await res.text();
      const json = parseGlovoJsonLossless(rawText);
      const sectionObservedAt = options?.nowIso || new Date().toISOString();
      const storeIds = extractGlovoStoreIdsFromPath(sec.path);
      const tiles = parseGlovoSectionResponse(json, sec.section, {
        storeId: storeIds?.storeId ?? null,
        storeAddressId: storeIds?.storeAddressId ?? null,
        observedAt: sectionObservedAt,
      });
      for (const t of tiles) {
        const prev = tileBySku.get(t.sku);
        if (prev) {
          prev.sections = Array.from(new Set([...prev.sections, ...t.sections]));
          if (!prev.productId && t.productId) prev.productId = t.productId;
          if (!prev.externalProductId && t.externalProductId) prev.externalProductId = t.externalProductId;
          if (!prev.storeProductId && t.storeProductId) prev.storeProductId = t.storeProductId;
        } else {
          tileBySku.set(t.sku, t);
        }
      }
      completedSectionIndices.push(sec.sectionIndex);
    } catch (err: any) {
      failedSectionIndices.push(sec.sectionIndex);
      errors.push(`Network error on section ${sec.section}: ${err?.message || 'timeout'}`);
    }
  }

  const items: VerifiedBiedronkaSnapshotItem[] = [];
  for (const tile of tileBySku.values()) {
    const norm = normalizeGlovoBiedronkaTile(tile, snapshotId, fetchedAt);
    if (norm) {
      items.push(norm);
    }
  }

  return {
    completedSectionIndices,
    failedSectionIndices,
    items,
    rateLimited,
    retryAfterMs,
    errors,
  };
}

/**
 * Starts the persisted 5-day background refresh scheduler for Biedronka Warsaw (Glovo).
 * Supports resumable staging across scheduler ticks with persisted Retry-After/backoff:
 * - If a STAGING run exists and its persisted nextRetryAt has elapsed, resumes the next bounded batch.
 * - Otherwise, only starts a new staging run once >= 5 days have elapsed since the last active snapshot.
 */
export function startBiedronkaPriceScheduler(dbInstance: {
  getBiedronkaSnapshotSummary: () => {
    lastActivatedAt: string | null;
    stagingSnapshotId?: string | null;
    stagingNextRetryAt?: string | null;
  };
  runResumableBiedronkaRefreshTick: (opts?: {
    triggerType?: 'SCHEDULED_5D' | 'STARTUP_CHECK';
  }) => Promise<any>;
}): { stop: () => void; intervalMs: number } {
  const intervalMs =
    Number(process.env.BIEDRONKA_REFRESH_INTERVAL_MS) || BIEDRONKA_REFRESH_INTERVAL_MS;
  const allowLiveStartup = process.env.ENABLE_LIVE_BIEDRONKA_REFRESH === 'true';

  const checkAndTickIfDue = (triggerType: 'SCHEDULED_5D' | 'STARTUP_CHECK') => {
    try {
      const summary = dbInstance.getBiedronkaSnapshotSummary();
      const nowMs = Date.now();

      // 1. If a resumable staging run exists, check whether its persisted Retry-After / backoff has elapsed
      if (summary.stagingSnapshotId) {
        const retryAtMs = summary.stagingNextRetryAt
          ? new Date(summary.stagingNextRetryAt).getTime()
          : 0;
        if (!retryAtMs || nowMs >= retryAtMs) {
          dbInstance.runResumableBiedronkaRefreshTick({ triggerType }).catch(() => {
            // Recorded in price_sync_runs; last good snapshot stays active
          });
        }
        return;
      }

      // 2. Otherwise enforce the persisted 5-day interval between successful snapshots
      const lastMs = summary.lastActivatedAt ? new Date(summary.lastActivatedAt).getTime() : 0;
      const isDue = !lastMs || nowMs - lastMs >= intervalMs;
      if (isDue && (triggerType === 'SCHEDULED_5D' || allowLiveStartup)) {
        dbInstance.runResumableBiedronkaRefreshTick({ triggerType }).catch(() => {
          // Recorded in price_sync_runs; last good snapshot stays active
        });
      }
    } catch {
      // Ignore scheduler check errors
    }
  };

  if (allowLiveStartup) {
    setTimeout(() => checkAndTickIfDue('STARTUP_CHECK'), 2500).unref?.();
  }

  // Poll every 15 minutes so resumed staging ticks fire promptly after Retry-After/backoff,
  // while completed snapshots still strictly obey the 5-day interval.
  const pollMs = Math.min(intervalMs, 15 * 60 * 1000);
  const timer = setInterval(() => checkAndTickIfDue('SCHEDULED_5D'), pollMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return {
    stop: () => clearInterval(timer),
    intervalMs,
  };
}

export interface BiedronkaProductIdentity {
  productId?: string | null;
  externalProductId?: string | null;
  storeProductId?: string | null;
  storeId?: string | null;
  storeAddressId?: string | null;
}

/**
 * Losslessly validates product + store identity between expected (active snapshot)
 * and actual (upstream payload or cached SQLite record).
 * - Requires at least one comparable exact product ID (productId, externalProductId, or storeProductId).
 * - Rejects ANY supplied conflicting ID field (including productId, externalProductId, storeProductId, storeId, storeAddressId).
 */
export function validateBiedronkaProductIdentity(
  expected: BiedronkaProductIdentity,
  actual: BiedronkaProductIdentity
): { valid: boolean; reason: string | null } {
  const norm = (v: string | null | undefined): string | null => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };

  const fields: Array<{ key: keyof BiedronkaProductIdentity; isProductId: boolean }> = [
    { key: 'productId', isProductId: true },
    { key: 'externalProductId', isProductId: true },
    { key: 'storeProductId', isProductId: true },
    { key: 'storeId', isProductId: false },
    { key: 'storeAddressId', isProductId: false },
  ];

  let matchedProductIdCount = 0;

  for (const { key, isProductId } of fields) {
    const exp = norm(expected[key]);
    const act = norm(actual[key]);
    if (exp !== null && act !== null) {
      if (exp !== act) {
        return {
          valid: false,
          reason: `Conflicting ${key} (expected ${exp}, received ${act})`,
        };
      }
      if (isProductId) {
        matchedProductIdCount++;
      }
    }
  }

  if (matchedProductIdCount === 0) {
    return {
      valid: false,
      reason:
        'Missing comparable exact product identity (none of productId, externalProductId, or storeProductId matched)',
    };
  }

  return { valid: true, reason: null };
}

export interface ParsedGlovoProductView {
  productId: string | null;
  externalProductId: string | null;
  storeProductId: string | null;
  storeId: string | null;
  storeAddressId: string | null;
  namePl: string | null;
  description: string | null;
  imageUrl: string | null;
  ingredients: string | null;
  nutritionBasis: string | null;
  nutritionRows: BiedronkaNutritionRow[];
  countryOfOrigin: string | null;
}

/**
 * Parses a raw Glovo `/v4/stores/{storeId}/addresses/{storeAddressId}/products/{productId}/view`
 * JSON response losslessly (preserving 64-bit / 29-digit IDs as exact strings).
 * Extracts description, Ingredients, Nutritional information (with exact per-100g/ml basis),
 * and Country of origin from COLLAPSABLE_CONTAINER elements.
 * Never guesses or fabricates missing fields; missing values remain null / [].
 */
export function parseGlovoProductViewResponse(rawJsonText: string): ParsedGlovoProductView | null {
  if (!rawJsonText || typeof rawJsonText !== 'string') return null;
  const parsed = parseGlovoJsonLossless(rawJsonText);
  if (!parsed || typeof parsed !== 'object') return null;

  const dataRoot = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const metaProduct = dataRoot?.metadata?.product || parsed?.metadata?.product || null;

  const productId =
    metaProduct?.id !== undefined && metaProduct?.id !== null
      ? String(metaProduct.id).trim()
      : null;
  const externalProductId =
    metaProduct?.externalId !== undefined && metaProduct?.externalId !== null
      ? String(metaProduct.externalId).trim()
      : null;
  const storeProductId =
    metaProduct?.storeProductId !== undefined && metaProduct?.storeProductId !== null
      ? String(metaProduct.storeProductId).trim()
      : null;

  let storeId: string | null =
    metaProduct?.storeId !== undefined && metaProduct?.storeId !== null
      ? String(metaProduct.storeId).trim()
      : null;
  let storeAddressId: string | null =
    metaProduct?.storeAddressId !== undefined && metaProduct?.storeAddressId !== null
      ? String(metaProduct.storeAddressId).trim()
      : null;

  const inspectEvents = (actions: any) => {
    if (!Array.isArray(actions)) return;
    for (const act of actions) {
      const events = act?.data?.events;
      if (!Array.isArray(events)) continue;
      for (const ev of events) {
        const d = ev?.data;
        if (!d || typeof d !== 'object') continue;
        if (!storeId && d.storeId !== undefined && d.storeId !== null && String(d.storeId).trim()) {
          storeId = String(d.storeId).trim();
        }
        if (
          !storeAddressId &&
          d.storeAddressId !== undefined &&
          d.storeAddressId !== null &&
          String(d.storeAddressId).trim()
        ) {
          storeAddressId = String(d.storeAddressId).trim();
        }
        if (
          !storeAddressId &&
          d.shopId !== undefined &&
          d.shopId !== null &&
          String(d.shopId).trim()
        ) {
          storeAddressId = String(d.shopId).trim();
        }
      }
    }
  };
  inspectEvents(dataRoot?.actions);
  inspectEvents(parsed?.actions);
  if (Array.isArray(dataRoot?.footer?.data?.elements)) {
    for (const el of dataRoot.footer.data.elements) {
      inspectEvents(el?.actions);
    }
  }

  const namePl =
    typeof metaProduct?.name === 'string' && metaProduct.name.trim()
      ? metaProduct.name.trim()
      : typeof dataRoot?.header?.data?.title === 'string' && dataRoot.header.data.title.trim()
      ? dataRoot.header.data.title.trim()
      : null;

  let description: string | null =
    typeof metaProduct?.description === 'string' && metaProduct.description.trim()
      ? metaProduct.description.trim()
      : null;

  const imageUrl: string | null =
    typeof metaProduct?.imageUrl === 'string' && metaProduct.imageUrl.trim()
      ? metaProduct.imageUrl.trim()
      : null;

  let ingredients: string | null = null;
  let nutritionBasis: string | null = null;
  const nutritionRows: BiedronkaNutritionRow[] = [];
  let countryOfOrigin: string | null = null;

  const bodyElements = dataRoot?.body?.data?.elements;
  if (Array.isArray(bodyElements)) {
    for (const el of bodyElements) {
      if (!el || typeof el !== 'object') continue;

      if (
        !description &&
        el.type === 'TEXT' &&
        el.data?.styles?.type === 'EXPANDABLE_TEXT' &&
        typeof el.data?.text === 'string' &&
        el.data.text.trim()
      ) {
        description = el.data.text.trim();
      }

      if (el.type === 'COLLAPSABLE_CONTAINER' && el.data) {
        const rawTitle = typeof el.data.title === 'string' ? el.data.title.trim() : '';
        const normTitle = normalizePolishText(rawTitle);
        const childElements = Array.isArray(el.data.elements) ? el.data.elements : [];

        if (normTitle.includes('skladniki') || normTitle === 'ingredients' || normTitle.includes('ingredients')) {
          const texts = childElements
            .filter((c: any) => c?.type === 'TEXT' && typeof c?.data?.text === 'string' && c.data.text.trim())
            .map((c: any) => c.data.text.trim());
          if (texts.length > 0) {
            ingredients = texts.join('\n');
          }
        } else if (
          normTitle.includes('wartosciach odzywczych') ||
          normTitle.includes('wartosc odzywcza') ||
          normTitle.includes('nutritional') ||
          normTitle.includes('nutrition')
        ) {
          nutritionBasis = rawTitle || null;
          for (const c of childElements) {
            if (c?.type === 'TWO_COLUMN_ROW_TEXT' && c.data) {
              const label = typeof c.data.firstColumnText === 'string' ? c.data.firstColumnText.trim() : '';
              const value = typeof c.data.secondColumnText === 'string' ? c.data.secondColumnText.trim() : '';
              if (label || value) {
                const isSubRow = Boolean(c.data?.styles?.data?.paddingValues?.start);
                nutritionRows.push({ label, value, isSubRow });
              }
            }
          }
        } else if (
          normTitle.includes('kraj pochodzenia') ||
          normTitle.includes('country of origin')
        ) {
          const texts = childElements
            .filter((c: any) => c?.type === 'TEXT' && typeof c?.data?.text === 'string' && c.data.text.trim())
            .map((c: any) => c.data.text.trim());
          if (texts.length > 0) {
            countryOfOrigin = texts.join('\n');
          }
        }
      }
    }
  }

  return {
    productId,
    externalProductId,
    storeProductId,
    storeId,
    storeAddressId,
    namePl,
    description,
    imageUrl,
    ingredients,
    nutritionBasis,
    nutritionRows,
    countryOfOrigin,
  };
}

export interface GlovoProductDetailFetchResult {
  ok: boolean;
  rateLimited: boolean;
  retryAfterMs: number | null;
  httpStatus?: number;
  error: string | null;
  detail: ParsedGlovoProductView | null;
}

/**
 * Performs a single on-demand server-side POST to Glovo's verified product view endpoint
 * for Warsaw Biedronka, validating returned product identity losslessly and honoring 429/Retry-After.
 */
export async function fetchGlovoBiedronkaProductDetail(params: {
  storeId: string;
  storeAddressId: string;
  productId: string;
  externalProductId?: string | null;
  storeProductId?: string | null;
  customFetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<GlovoProductDetailFetchResult> {
  const fetchFn = params.customFetch ?? globalThis.fetch;
  const timeoutMs = params.timeoutMs ?? 15_000;

  if (typeof fetchFn !== 'function') {
    return {
      ok: false,
      rateLimited: false,
      retryAfterMs: null,
      error: 'Fetch API unavailable in runtime',
      detail: null,
    };
  }

  const query = new URLSearchParams();
  if (params.externalProductId) query.set('productExternalId', params.externalProductId);
  if (params.storeProductId) query.set('storeProductId', params.storeProductId);
  const qs = query.toString();
  const url = `${GLOVO_API_BASE}/v4/stores/${encodeURIComponent(params.storeId)}/addresses/${encodeURIComponent(params.storeAddressId)}/products/${encodeURIComponent(params.productId)}/view${qs ? `?${qs}` : ''}`;

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        ...GLOVO_WARSAW_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ editingMode: false, origin: 'STORE' }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 429 || res.status === 503) {
      return {
        ok: false,
        rateLimited: true,
        retryAfterMs: parseRetryAfterHeader(res.headers?.get?.('retry-after')),
        httpStatus: res.status,
        error: `Glovo product detail rate-limited (HTTP ${res.status})`,
        detail: null,
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        rateLimited: false,
        retryAfterMs: null,
        httpStatus: res.status,
        error: `Glovo product detail returned HTTP ${res.status}`,
        detail: null,
      };
    }

    const rawText = await res.text();
    const parsed = parseGlovoProductViewResponse(rawText);
    if (!parsed) {
      return {
        ok: false,
        rateLimited: false,
        retryAfterMs: null,
        httpStatus: res.status,
        error: 'Unable to parse Glovo product detail payload',
        detail: null,
      };
    }

    // Strictly validate exact product + store identity losslessly:
    // require at least one comparable exact product ID and reject ANY conflicting supplied ID field.
    const identityCheck = validateBiedronkaProductIdentity(
      {
        productId: params.productId,
        externalProductId: params.externalProductId ?? null,
        storeProductId: params.storeProductId ?? null,
        storeId: params.storeId,
        storeAddressId: params.storeAddressId,
      },
      {
        productId: parsed.productId,
        externalProductId: parsed.externalProductId,
        storeProductId: parsed.storeProductId,
        storeId: parsed.storeId,
        storeAddressId: parsed.storeAddressId,
      }
    );
    if (!identityCheck.valid) {
      return {
        ok: false,
        rateLimited: false,
        retryAfterMs: null,
        httpStatus: res.status,
        error: `Glovo product identity validation failed: ${identityCheck.reason}`,
        detail: null,
      };
    }

    return {
      ok: true,
      rateLimited: false,
      retryAfterMs: null,
      httpStatus: res.status,
      error: null,
      detail: parsed,
    };
  } catch (err: any) {
    return {
      ok: false,
      rateLimited: false,
      retryAfterMs: null,
      error: `Network error fetching Glovo product detail: ${err?.message || 'timeout'}`,
      detail: null,
    };
  }
}
