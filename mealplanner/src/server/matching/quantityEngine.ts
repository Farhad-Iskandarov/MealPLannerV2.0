import {
  PlannedMeal,
  PantryItem,
  ShoppingItem,
  ShoppingList,
  SupermarketSlug,
  ShoppingCategory,
  MatchConfidence,
  RegionCode,
  CurrencyCode,
} from '../../shared/types';
import {
  ALL_CATALOGUE_PRODUCTS,
  getCatalogueProductsForRegion,
} from '../supermarkets/catalogueData';
import {
  getDefaultCurrencyForRegion,
  isSupermarketInRegion,
  formatMoney,
} from '../../shared/regionConfig';

const LIQUID_CANONICALS = new Set(['olive_oil', 'milk', 'oat_milk', 'water', 'vinegar', 'soy_sauce']);

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const INGREDIENT_ALIASES: Record<string, string> = {
  // Polish & English aliases
  kurczak: 'chicken_breast',
  'piers z kurczaka': 'chicken_breast',
  'filet z kurczaka': 'chicken_breast',
  chicken: 'chicken_breast',
  jajka: 'eggs',
  jajko: 'eggs',
  jaja: 'eggs',
  egg: 'eggs',
  banan: 'banana',
  banany: 'banana',
  pomidor: 'tomato',
  pomidory: 'tomato',
  tomatoes: 'tomato',
  jablko: 'apple',
  jablka: 'apple',
  apples: 'apple',
  ziemniak: 'potato',
  ziemniaki: 'potato',
  potatoes: 'potato',
  marchewka: 'carrot',
  marchew: 'carrot',
  carrots: 'carrot',
  cebula: 'onion',
  onions: 'onion',
  czosnek: 'garlic',
  brokul: 'broccoli',
  szpinak: 'spinach',
  schab: 'pork_loin',
  losos: 'salmon',
  twarog: 'cottage_cheese',
  jogurt: 'greek_yogurt',
  skyr: 'greek_yogurt',
  makaron: 'pasta',
  soczewica: 'red_lentils',
  chleb: 'wholegrain_bread',
  oliwa: 'olive_oil',
  olej: 'olive_oil',
  papryka: 'paprika',
  owsianka: 'oat_flakes',
  'platki owsiane': 'oat_flakes',
  oats: 'oat_flakes',
  // Azerbaijani aliases (normalized ASCII equivalents of ə, ı, ö, ü, ğ, ç, ş)
  toyuq: 'chicken_breast',
  'toyuq filesi': 'chicken_breast',
  'toyuq dos eti': 'chicken_breast',
  yumurta: 'eggs',
  'kend yumurtasi': 'eggs',
  alma: 'apple',
  'quba almasi': 'apple',
  kartof: 'potato',
  'gedebey kartofu': 'potato',
  kok: 'carrot',
  sogan: 'onion',
  sarimsaq: 'garlic',
  brokoli: 'broccoli',
  ispanaq: 'spinach',
  goyerti: 'spinach',
  kesmik: 'cottage_cheese',
  qatiq: 'greek_yogurt',
  'suzme qatiq': 'greek_yogurt',
  duyu: 'rice',
  'uzun duyu': 'rice',
  'uzunzeneli duyu': 'rice',
  'basmati duyu': 'rice',
  mercimek: 'red_lentils',
  'qirmizi mercimek': 'red_lentils',
  corek: 'wholegrain_bread',
  lavas: 'wholegrain_bread',
  tendir: 'wholegrain_bread',
  'zeytun yagi': 'olive_oil',
  'kere yagi': 'olive_oil',
  sud: 'milk',
  yulaf: 'oat_flakes',
  'yulaf ezmesi': 'oat_flakes',
  qizilbaliq: 'salmon',
  'dana eti': 'pork_loin',
};

/**
 * Maps a free-text ingredient name (Polish, English, or Azerbaijani, e.g. "Ryż", "rice", "Düyü", "Toyuq filesi")
 * to a canonical ingredient key used by the catalogue, so pantry items and custom recipes can be
 * matched to supermarket products. Returns null when no confident match exists.
 */
export function resolveCanonicalIngredient(name: string): string | null {
  const q = normalizeText(name);
  if (q.length < 3) return null;
  const qKey = q.replace(/\s+/g, '_');
  // 1. exact canonical key or known alias
  const exact = ALL_CATALOGUE_PRODUCTS.find((p) => p.canonicalIngredient === qKey);
  if (exact) return exact.canonicalIngredient;
  if (INGREDIENT_ALIASES[q]) return INGREDIENT_ALIASES[q];
  // 2. product name equals / starts with the query
  for (const p of ALL_CATALOGUE_PRODUCTS) {
    const pl = normalizeText(p.namePl);
    const en = normalizeText(p.nameEn);
    const az = p.nameAz ? normalizeText(p.nameAz) : '';
    if (
      pl === q ||
      en === q ||
      (az && az === q) ||
      pl.startsWith(q) ||
      en.startsWith(q) ||
      (az && az.startsWith(q))
    ) {
      return p.canonicalIngredient;
    }
  }
  // 3. query starts with an alias (e.g. "pomidory koktajlowe", "toyuq döş əti")
  for (const [alias, canonical] of Object.entries(INGREDIENT_ALIASES)) {
    if (q.startsWith(`${alias} `)) return canonical;
  }
  return null;
}

export interface NormalizedQuantityResult {
  amount: number;
  baseUnit: 'g' | 'ml' | 'pcs' | 'to_taste';
  isReliable: boolean;
}

/**
 * Converts recipe or pantry ingredient quantities into canonical base units ('g', 'ml', 'pcs').
 * Rejects unreliable cross-dimension conversions (e.g., converting pieces of unknown weight to grams
 * unless a known standard household equivalent exists like garlic cloves or medium bananas).
 */
export function normalizeIngredientQuantity(
  amount: number,
  unit: string,
  canonicalIngredient?: string
): NormalizedQuantityResult {
  const u = unit.trim().toLowerCase();
  if (u === 'to_taste' || u === 'do smaku' || u === 'zövqə görə' || amount <= 0) {
    return { amount: 0, baseUnit: 'to_taste', isReliable: true };
  }
  if (u === 'g' || u === 'qr' || u === 'qram' || u === 'gram' || u === 'grams') {
    return { amount: Math.round(amount * 100) / 100, baseUnit: 'g', isReliable: true };
  }
  if (u === 'kg' || u === 'kq' || u === 'kilogram') {
    return { amount: Math.round(amount * 1000 * 100) / 100, baseUnit: 'g', isReliable: true };
  }
  if (u === 'ml' || u === 'milliliter') {
    return { amount: Math.round(amount * 100) / 100, baseUnit: 'ml', isReliable: true };
  }
  if (u === 'l' || u === 'litr' || u === 'liter' || u === 'litre') {
    return { amount: Math.round(amount * 1000 * 100) / 100, baseUnit: 'ml', isReliable: true };
  }
  if (u === 'cloves' || u === 'clove' || u === 'ząbek' || u === 'ząbki' || u === 'diş') {
    // 1 clove of garlic is ~5g
    return { amount: amount * 5, baseUnit: 'g', isReliable: true };
  }
  if (u === 'tbsp' || u === 'łyżka' || u === 'łyżki' || u === 'x.q.' || u === 'xörək qaşığı') {
    // Volume measures are exact for liquids (1 tbsp = 15 ml). For solids the gram weight depends on
    // density, so the result is an approximation and flagged as not reliable.
    if (canonicalIngredient && LIQUID_CANONICALS.has(canonicalIngredient)) {
      return { amount: Math.round(amount * 15 * 100) / 100, baseUnit: 'ml', isReliable: true };
    }
    return { amount: Math.round(amount * 15 * 100) / 100, baseUnit: 'g', isReliable: false };
  }
  if (u === 'tsp' || u === 'łyżeczka' || u === 'łyżeczki' || u === 'ç.q.' || u === 'çay qaşığı') {
    if (canonicalIngredient && LIQUID_CANONICALS.has(canonicalIngredient)) {
      return { amount: Math.round(amount * 5 * 100) / 100, baseUnit: 'ml', isReliable: true };
    }
    return { amount: Math.round(amount * 5 * 100) / 100, baseUnit: 'g', isReliable: false };
  }
  if (u === 'pcs' || u === 'piece' || u === 'pieces' || u === 'szt' || u === 'szt.' || u === 'ədəd') {
    return { amount, baseUnit: 'pcs', isReliable: true };
  }

  return { amount, baseUnit: 'pcs', isReliable: false };
}

export function formatBaseQuantity(amount: number, unit: 'g' | 'ml' | 'pcs'): string {
  const rounded = Math.round(amount);
  if (unit === 'g') {
    if (rounded >= 1000 && rounded % 100 === 0) {
      return `${(rounded / 1000).toString().replace('.', ',')} kg`;
    }
    return `${rounded} g`;
  }
  if (unit === 'ml') {
    if (rounded >= 1000 && rounded % 100 === 0) {
      return `${(rounded / 1000).toString().replace('.', ',')} L`;
    }
    return `${rounded} ml`;
  }
  return `${rounded} pcs`;
}

export interface PackageCalculation {
  recommendedPackages: number;
  totalPurchasedAmount: number;
  leftoverAmount: number;
}

/**
 * Calculates how many supermarket packages are required to cover netRequiredAmount
 * and how much leftover ingredient will remain for the user's Pantry.
 */
export function calculateSupermarketPackages(
  netRequiredAmount: number,
  packageSize: number
): PackageCalculation {
  if (netRequiredAmount <= 0 || packageSize <= 0) {
    return {
      recommendedPackages: 0,
      totalPurchasedAmount: 0,
      leftoverAmount: 0,
    };
  }
  const recommendedPackages = Math.max(1, Math.ceil(netRequiredAmount / packageSize));
  const totalPurchasedAmount = recommendedPackages * packageSize;
  const leftoverAmount = Math.max(0, Math.round((totalPurchasedAmount - netRequiredAmount) * 100) / 100);

  return {
    recommendedPackages,
    totalPurchasedAmount,
    leftoverAmount,
  };
}

interface AggregatedNeed {
  canonicalIngredient: string;
  namePl: string;
  nameEn: string;
  nameAz?: string;
  category: ShoppingCategory;
  icon: string;
  requiredAmount: number;
  requiredUnit: 'g' | 'ml' | 'pcs';
  hasUncertainConversion: boolean;
}

/**
 * Generates a complete Smart Shopping List from planned meals, subtracting available Pantry items
 * when subtractPantry is true, matching each ingredient to real regional supermarket products & package sizes,
 * and computing cross-supermarket basket totals in the active region's currency (PLN or AZN).
 */
export function buildSmartShoppingList(params: {
  shoppingListId: string;
  userId: string;
  weeklyPlanId: string;
  supermarketId: SupermarketSlug;
  regionCode?: RegionCode;
  currencyCode?: CurrencyCode;
  plannedMeals: PlannedMeal[];
  pantryItems: PantryItem[];
  subtractPantry: boolean;
  existingPurchasedMap?: Map<string, boolean>;
  manualItems?: ShoppingItem[];
}): ShoppingList {
  const {
    shoppingListId,
    userId,
    weeklyPlanId,
    supermarketId,
    plannedMeals,
    pantryItems,
    subtractPantry,
    existingPurchasedMap = new Map(),
    manualItems = [],
  } = params;

  const regionCode: RegionCode =
    params.regionCode || (isSupermarketInRegion(supermarketId, 'AZ') ? 'AZ' : 'PL');
  const currencyCode: CurrencyCode =
    params.currencyCode || getDefaultCurrencyForRegion(regionCode);

  const regionalProducts = getCatalogueProductsForRegion(regionCode);

  const aggregated = new Map<string, AggregatedNeed>();

  for (const meal of plannedMeals) {
    const scaleFactor = meal.servings / Math.max(1, meal.recipe.baseServings);
    for (const ing of meal.recipe.ingredients) {
      if (ing.unit === 'to_taste' || ing.normalizedBaseUnit === 'to_taste') {
        continue; // Salt & black pepper to taste are household staples unless added manually
      }
      const normalized = normalizeIngredientQuantity(
        ing.amount * scaleFactor,
        ing.unit,
        ing.canonicalIngredient
      );
      if (normalized.baseUnit === 'to_taste' || normalized.amount <= 0) {
        continue;
      }

      const canonicalKey =
        resolveCanonicalIngredient(ing.canonicalIngredient) ||
        resolveCanonicalIngredient(ing.namePl) ||
        resolveCanonicalIngredient(ing.nameEn) ||
        (ing.nameAz ? resolveCanonicalIngredient(ing.nameAz) : null) ||
        ing.canonicalIngredient.toLowerCase();
      const key = canonicalKey.toLowerCase();
      const existing = aggregated.get(key);
      if (existing && existing.requiredUnit === normalized.baseUnit) {
        existing.requiredAmount = Math.round((existing.requiredAmount + normalized.amount) * 100) / 100;
        if (!normalized.isReliable) {
          existing.hasUncertainConversion = true;
        }
      } else if (!existing) {
        aggregated.set(key, {
          canonicalIngredient: canonicalKey,
          namePl: ing.namePl,
          nameEn: ing.nameEn,
          nameAz: ing.nameAz,
          category: ing.category,
          icon: ing.icon,
          requiredAmount: Math.round(normalized.amount * 100) / 100,
          requiredUnit: normalized.baseUnit,
          hasUncertainConversion: !normalized.isReliable,
        });
      }
    }
  }

  // Map pantry items by canonicalIngredient
  const pantryByCanonical = new Map<string, { amount: number; unit: 'g' | 'ml' | 'pcs' }>();
  if (subtractPantry) {
    for (const p of pantryItems) {
      const resolvedKey =
        resolveCanonicalIngredient(p.canonicalIngredient) ||
        resolveCanonicalIngredient(p.namePl) ||
        resolveCanonicalIngredient(p.nameEn) ||
        (p.nameAz ? resolveCanonicalIngredient(p.nameAz) : null) ||
        p.canonicalIngredient.toLowerCase();
      const key = resolvedKey.toLowerCase();
      const prev = pantryByCanonical.get(key);
      if (prev && prev.unit === p.normalizedUnit) {
        prev.amount += p.normalizedAmount;
      } else if (!prev) {
        pantryByCanonical.set(key, { amount: p.normalizedAmount, unit: p.normalizedUnit });
      }
    }
  }

  const generatedItems: ShoppingItem[] = [];

  for (const [key, need] of aggregated.entries()) {
    const product = regionalProducts.find(
      (p) => p.canonicalIngredient.toLowerCase() === key
    );

    const pantryEntry = pantryByCanonical.get(key);
    let pantryDeductedAmount = 0;
    if (subtractPantry && pantryEntry && pantryEntry.unit === need.requiredUnit) {
      pantryDeductedAmount = Math.min(need.requiredAmount, pantryEntry.amount);
    }

    const netRequiredAmount = Math.max(
      0,
      Math.round((need.requiredAmount - pantryDeductedAmount) * 100) / 100
    );

    if (netRequiredAmount <= 0) {
      continue;
    }

    let matchConfidence: MatchConfidence = 'HIGH';
    if (!product) {
      matchConfidence = 'UNCERTAIN';
    } else if (need.hasUncertainConversion || product.packageUnit !== need.requiredUnit) {
      matchConfidence = 'MEDIUM';
    }

    const packageSize = product ? product.packageSize : 500;
    const pkgCalc = calculateSupermarketPackages(netRequiredAmount, packageSize);

    const defaultFallbackPrice = regionCode === 'AZ' ? 2.69 : 5.99;
    const fallbackStoreSlug: SupermarketSlug = regionCode === 'AZ' ? 'bravo' : 'biedronka';
    const storePrice = product?.prices[supermarketId] || product?.prices[fallbackStoreSlug];
    const effectiveUnitPkgPrice = storePrice ? storePrice.effectivePricePln : defaultFallbackPrice;
    const regularUnitPkgPrice = storePrice ? storePrice.regularPricePln : defaultFallbackPrice;

    const lineTotalPln = Number((pkgCalc.recommendedPackages * effectiveUnitPkgPrice).toFixed(2));
    const regularLineTotalPln = Number((pkgCalc.recommendedPackages * regularUnitPkgPrice).toFixed(2));

    // Check primary alternative store within the same region
    const altStoreId: SupermarketSlug =
      regionCode === 'AZ'
        ? supermarketId === 'bravo'
          ? 'araz'
          : 'bravo'
        : supermarketId === 'biedronka'
        ? 'lidl'
        : 'biedronka';
    const altPriceObj = product?.prices[altStoreId];
    const alternativeStorePricePln = altPriceObj
      ? Number((pkgCalc.recommendedPackages * altPriceObj.effectivePricePln).toFixed(2))
      : null;

    const itemId = `item-${shoppingListId}-${key}`;
    const isPurchased = existingPurchasedMap.get(key) ?? false;

    const productAzName = product?.nameAz || need.nameAz || product?.nameEn || need.nameEn;

    generatedItems.push({
      id: itemId,
      shoppingListId,
      canonicalIngredient: need.canonicalIngredient,
      namePl: product ? product.namePl : need.namePl,
      nameEn: product ? product.nameEn : need.nameEn,
      nameAz: productAzName,
      category: product ? product.category : need.category,
      icon: product ? product.icon : need.icon,
      requiredAmount: need.requiredAmount,
      requiredUnit: need.requiredUnit,
      requiredDisplayLabel: formatBaseQuantity(need.requiredAmount, need.requiredUnit),
      pantryDeductedAmount,
      netRequiredAmount,
      matchedProductId: product ? product.id : null,
      matchedProductNamePl: product ? `${product.namePl} (${product.brand})` : need.namePl,
      matchedProductNameEn: product ? `${product.nameEn} (${product.brand})` : need.nameEn,
      matchedProductNameAz: product ? `${productAzName} (${product.brand})` : productAzName,
      matchedBrand: product ? product.brand : regionCode === 'AZ' ? 'Yerli brend' : 'Marka własna',
      ean: product ? product.ean : null,
      recommendedPackages: pkgCalc.recommendedPackages,
      packageSizeLabel: product
        ? pkgCalc.recommendedPackages > 1
          ? `${pkgCalc.recommendedPackages} × ${product.packageLabelPl}`
          : product.packageLabelPl
        : formatBaseQuantity(netRequiredAmount, need.requiredUnit),
      totalPurchasedAmount: pkgCalc.totalPurchasedAmount,
      leftoverAmount: pkgCalc.leftoverAmount,
      leftoverDisplayLabel: formatBaseQuantity(pkgCalc.leftoverAmount, need.requiredUnit),
      unitPricePln: storePrice ? storePrice.unitPricePln : effectiveUnitPkgPrice,
      unitPriceLabel: storePrice ? storePrice.unitPriceLabel : formatMoney(effectiveUnitPkgPrice, currencyCode),
      regularLineTotalPln,
      lineTotalPln,
      supermarketId,
      priceVerificationStatus: storePrice ? storePrice.verificationStatus : 'ESTIMATED_MARKET_AVG',
      loyaltyRequired: storePrice ? storePrice.loyaltyRequired : false,
      loyaltyConditionPl: storePrice ? storePrice.loyaltyConditionPl : null,
      loyaltyConditionEn: storePrice ? storePrice.loyaltyConditionEn : null,
      loyaltyConditionAz: storePrice?.loyaltyConditionAz ?? null,
      promoValidUntil: storePrice ? storePrice.promoValidUntil : null,
      storeChannel: storePrice ? storePrice.storeChannel : 'PHYSICAL_STORE',
      lastUpdatedAt: storePrice ? storePrice.lastUpdatedAt : new Date().toISOString(),
      matchConfidence,
      isPurchased,
      isManual: false,
      alternativeStorePricePln,
      alternativeStoreId: altStoreId,
    });
  }

  const allItems = [...generatedItems, ...manualItems];

  const estimatedTotalPln = Number(
    allItems.reduce((sum, item) => sum + item.lineTotalPln, 0).toFixed(2)
  );
  const regularTotalWithoutPromosPln = Number(
    allItems.reduce((sum, item) => sum + item.regularLineTotalPln, 0).toFixed(2)
  );
  const totalSavingsPln = Number(
    Math.max(0, regularTotalWithoutPromosPln - estimatedTotalPln).toFixed(2)
  );

  const stores: SupermarketSlug[] =
    regionCode === 'AZ'
      ? ['bravo', 'araz', 'bazarstore', 'rahat']
      : ['biedronka', 'lidl', 'auchan', 'kaufland'];
  const comparisonByStore = {} as ShoppingList['comparisonByStore'];

  for (const store of stores) {
    let storeTotal = 0;
    let storeRegular = 0;
    let availableCount = 0;
    let missingCount = 0;

    for (const item of allItems) {
      const prod = regionalProducts.find(
        (p) => p.canonicalIngredient === item.canonicalIngredient || p.id === item.matchedProductId
      );
      const priceRec = prod?.prices[store];
      if (priceRec) {
        availableCount++;
        storeTotal += item.recommendedPackages * priceRec.effectivePricePln;
        storeRegular += item.recommendedPackages * priceRec.regularPricePln;
      } else {
        if (item.isManual) {
          availableCount++;
        } else {
          missingCount++;
        }
        storeTotal += item.lineTotalPln;
        storeRegular += item.regularLineTotalPln;
      }
    }

    comparisonByStore[store] = {
      totalBasketPln: Number(storeTotal.toFixed(2)),
      availableItemsCount: availableCount,
      missingItemsCount: missingCount,
      savingsVsRegularPln: Number(Math.max(0, storeRegular - storeTotal).toFixed(2)),
    };
  }

  const boughtCount = allItems.filter((i) => i.isPurchased).length;
  const toBuyCount = allItems.length - boughtCount;

  return {
    id: shoppingListId,
    userId,
    weeklyPlanId,
    supermarketId,
    regionCode,
    currencyCode,
    subtractPantry,
    items: allItems,
    totalItemsCount: allItems.length,
    toBuyCount,
    boughtCount,
    estimatedTotalPln,
    regularTotalWithoutPromosPln,
    totalSavingsPln,
    comparisonByStore,
    updatedAt: new Date().toISOString(),
  };
}
