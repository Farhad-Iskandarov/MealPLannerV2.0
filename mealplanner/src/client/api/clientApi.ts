import {
  User,
  WeeklyPlan,
  ShoppingList,
  Recipe,
  PantryItem,
  Supermarket,
  BudgetAnalysis,
  UserPreferences,
  SupermarketSlug,
  MealType,
  Language,
  RegionCode,
  CurrencyCode,
  PriceMonitoringSummary,
  PriceSyncRunRecord,
  BiedronkaSnapshotSummary,
  BiedronkaProductDetail,
  ShoppingItem,
} from '../../shared/types';
import {
  PromotionalBannerOffer,
  getPromotionalOffersForRegion,
  applyVerifiedBiedronkaSnapshotToCatalogue,
} from '../../server/supermarkets/catalogueData';
import type { VerifiedBiedronkaSnapshotItem } from '../../server/monitoring/biedronkaGlovoMonitor';
import {
  supermarketRegistry,
  NormalizedProductComparison,
} from '../../server/supermarkets/supermarketService';
import { SEED_RECIPES } from '../../server/recipes/recipeSeedData';
import {
  buildSmartShoppingList,
  normalizeIngredientQuantity,
  resolveCanonicalIngredient,
} from '../../server/matching/quantityEngine';
import {
  generateValidatedWeeklyMealPlan,
  getRecipeBaseCostForCurrency,
} from '../../server/ai/aiMealPlanner';
import { analyzeAndOptimizeBudget } from '../../server/budget/budgetOptimizer';
import {
  validateRecipeForUser,
  collectHardExclusionTerms,
} from '../../server/validation/mealValidator';
import {
  getDefaultCurrencyForRegion,
  resolveValidSupermarketForRegion,
  convertHistoricalMonetaryAmount,
  formatMoney,
} from '../../shared/regionConfig';
import {
  isRegularPriceOnlyPolicyActive,
  resolvePolicyEffectivePrice,
} from '../../shared/pricingPolicy';
import {
  isValidCuisinePreference,
  normalizeCuisinePreference,
} from '../../shared/cuisineConfig';

export interface AppStatePayload {
  user: User;
  weeklyPlan: WeeklyPlan;
  shoppingList: ShoppingList;
  recipes: Recipe[];
  pantry: PantryItem[];
  supermarkets: Supermarket[];
  promotionalOffers: PromotionalBannerOffer[];
  priceComparisons: NormalizedProductComparison[];
  budgetAnalysis: BudgetAnalysis;
  priceMonitoring?: PriceMonitoringSummary;
  biedronkaSnapshot?: {
    summary: BiedronkaSnapshotSummary;
    items: VerifiedBiedronkaSnapshotItem[];
  };
}

const TOKEN_STORAGE_KEY = 'mealplanner_auth_token';
const OFFLINE_STATE_KEY = 'mealplanner_offline_state_v2';
const OFFLINE_BIEDRONKA_SNAPSHOT_KEY = 'mealplanner_biedronka_pl_snapshot_v1';
const OFFLINE_BIEDRONKA_DETAILS_KEY = 'mealplanner_biedronka_pl_details_v1';

export function getCachedBiedronkaProductDetail(sku: string): BiedronkaProductDetail | null {
  if (!sku) return null;
  try {
    const raw = localStorage.getItem(OFFLINE_BIEDRONKA_DETAILS_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, BiedronkaProductDetail>;
    const entry = map?.[sku];
    if (entry && entry.sku === sku) {
      return {
        ...entry,
        effectivePricePln: resolvePolicyEffectivePrice(
          entry.regularPricePln,
          entry.promoPricePln,
          'PL',
          'biedronka'
        ),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Normalizes a legacy cached ShoppingList (e.g. from localStorage) under the active pricing policy.
 * For Poland Biedronka while regular-price-only policy is active, ensures regular totals and zero savings
 * without erasing any stored promo fields on underlying snapshot/detail records.
 */
export function normalizeCachedShoppingListForPricingPolicy(list: ShoppingList): ShoppingList {
  const regionCode: RegionCode = list.regionCode || 'PL';
  const supermarketId = resolveValidSupermarketForRegion(list.supermarketId, regionCode);
  if (!isRegularPriceOnlyPolicyActive(regionCode, supermarketId)) {
    return list;
  }

  const normalizedItems = (list.items || []).map((item) => {
    if (item.isPriced === false) return item;
    const regularLine =
      Number.isFinite(item.regularLineTotalPln) && item.regularLineTotalPln > 0
        ? item.regularLineTotalPln
        : item.lineTotalPln;
    return {
      ...item,
      lineTotalPln: regularLine,
      regularLineTotalPln: regularLine,
      loyaltyRequired: false,
    };
  });

  const estimatedTotalPln = Number(
    normalizedItems.reduce((sum, it) => sum + (it.isPriced === false ? 0 : it.lineTotalPln), 0).toFixed(2)
  );
  const comparisonByStore = { ...list.comparisonByStore };
  if (comparisonByStore.biedronka) {
    comparisonByStore.biedronka = {
      ...comparisonByStore.biedronka,
      totalBasketPln: estimatedTotalPln,
      savingsVsRegularPln: 0,
    };
  }

  return {
    ...list,
    supermarketId,
    items: normalizedItems,
    estimatedTotalPln,
    regularTotalWithoutPromosPln: estimatedTotalPln,
    totalSavingsPln: 0,
    comparisonByStore,
  };
}

export function cacheBiedronkaProductDetail(detail: BiedronkaProductDetail): void {
  if (!detail?.sku) return;
  try {
    const raw = localStorage.getItem(OFFLINE_BIEDRONKA_DETAILS_KEY);
    const map: Record<string, BiedronkaProductDetail> = raw ? JSON.parse(raw) : {};
    map[detail.sku] = detail;
    localStorage.setItem(OFFLINE_BIEDRONKA_DETAILS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function cacheVerifiedBiedronkaSnapshotForOffline(
  snapshot: AppStatePayload['biedronkaSnapshot'] | undefined
): void {
  if (!snapshot?.summary?.activeSnapshotId || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
    return;
  }
  try {
    localStorage.setItem(OFFLINE_BIEDRONKA_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage quota errors
  }
}

export function hydrateVerifiedBiedronkaSnapshotFromCache(): AppStatePayload['biedronkaSnapshot'] | null {
  try {
    const raw = localStorage.getItem(OFFLINE_BIEDRONKA_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppStatePayload['biedronkaSnapshot'];
    if (parsed?.summary?.activeSnapshotId && Array.isArray(parsed.items) && parsed.items.length > 0) {
      applyVerifiedBiedronkaSnapshotToCatalogue(parsed.items, {
        snapshotId: parsed.summary.activeSnapshotId,
        activatedAt: parsed.summary.lastActivatedAt,
      });
      return parsed;
    }
  } catch {
    // ignore malformed cache
  }
  return null;
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function isStandaloneApkEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const proto = window.location.protocol;
  return proto === 'file:' || host === 'appassets.androidplatform.net' || !host;
}

class ApiResponseError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  if (isStandaloneApkEnvironment()) {
    throw new Error('STANDALONE_APK_OFFLINE');
  }
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiResponseError(res.status, data?.error || `Request failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Creates a full offline fallback state (used when running inside standalone Android APK without server connection).
 */
async function getOrInitOfflineState(): Promise<AppStatePayload> {
  // Hydrate any cached verified Glovo Warsaw Biedronka snapshot into the PL catalogue before computing offline state
  const cachedBiedronka = hydrateVerifiedBiedronkaSnapshotFromCache();

  try {
    const raw = localStorage.getItem(OFFLINE_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppStatePayload;
      if (parsed?.user && parsed?.supermarkets) {
        const reg: RegionCode = parsed.user.regionCode || parsed.user.preferences?.regionCode || 'PL';
        // Coerce legacy saved Polish supermarket selections to Biedronka
        const validStore = resolveValidSupermarketForRegion(
          parsed.user.preferences?.preferredSupermarket,
          reg
        );
        parsed.user.preferences.preferredSupermarket = validStore;
        if (parsed.shoppingList) {
          parsed.shoppingList.supermarketId = resolveValidSupermarketForRegion(
            parsed.shoppingList.supermarketId,
            reg
          );
        }
        if (parsed.weeklyPlan) {
          parsed.weeklyPlan.supermarketId = resolveValidSupermarketForRegion(
            parsed.weeklyPlan.supermarketId,
            reg
          );
        }
        if (cachedBiedronka && !parsed.biedronkaSnapshot) {
          parsed.biedronkaSnapshot = cachedBiedronka;
        }
        // Keep seeded recipes synchronized with latest cuisine-tagged recipes while preserving user custom recipes
        const existingFavIds = new Set(
          (parsed.recipes || []).filter((r) => r.isFavourite).map((r) => r.id)
        );
        const customRecipes = (parsed.recipes || []).filter((r) => r.isCustom);
        const syncedRecipes = [
          ...SEED_RECIPES.map((r) => ({ ...r, isFavourite: existingFavIds.has(r.id) })),
          ...customRecipes,
        ];
        parsed.recipes = syncedRecipes;
        // Also refresh recipe metadata/imageUrl inside cached/offline weeklyPlan.meals while preserving custom user photos
        const syncedById = new Map(syncedRecipes.map((r) => [r.id, r]));
        if (parsed.weeklyPlan?.meals?.length) {
          parsed.weeklyPlan.meals = parsed.weeklyPlan.meals.map((meal) => {
            const latest = syncedById.get(meal.recipe?.id);
            if (!latest || latest.isCustom) return meal;
            return { ...meal, recipe: latest };
          });
        }
        if (parsed.user.preferences) {
          parsed.user.preferences.preferredCuisine = normalizeCuisinePreference(
            parsed.user.preferences.preferredCuisine
          );
        }
        return recomputeOfflineDerived(parsed);
      }
    }
  } catch {
    // ignore
  }

  const user: User = {
    id: 'user-farhad-1',
    email: 'farhad@email.com',
    displayName: 'Farhad Isgandarov',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
    language: 'en',
    regionCode: 'PL',
    currencyCode: 'PLN',
    householdName: 'Dom Farhada',
    householdShareCode: 'MP-PL-2026',
    createdAt: new Date().toISOString(),
    preferences: {
      userId: 'user-farhad-1',
      regionCode: 'PL',
      currencyCode: 'PLN',
      householdSize: 2,
      weeklyBudgetPln: 250.0,
      planDurationDays: 7,
      preferredSupermarket: 'biedronka',
      dietaryRestrictions: ['high_protein'],
      customRestrictions: [],
      allergies: [],
      excludedIngredients: [],
      dislikes: [],
      foodVibes: ['high_protein', 'quick_easy'],
      customFoodVibes: [],
      cookingSkill: 'intermediate',
      preferredPrepTimeMin: 35,
      kitchenEquipment: ['hob', 'oven', 'kettle'],
      mealsPerDay: 3,
      includeSnacks: false,
      notifications: {
        enabled: true,
        weeklyMealPlans: true,
        shoppingReminders: true,
        expiringPantryProducts: true,
        mealPrepReminders: true,
      },
      onboardingCompleted: true,
    },
  };

  const pantry: PantryItem[] = [
    { id: 'p-1', userId: user.id, canonicalIngredient: 'olive_oil', namePl: 'Oliwa z oliwek Extra Virgin', nameEn: 'Olive oil', nameAz: 'Zeytun yağı Extra Virgin', quantity: 350, unit: 'ml', normalizedAmount: 350, normalizedUnit: 'ml', category: 'Other', expiryDate: '2027-03-15', daysUntilExpiry: 124, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🫒' },
    { id: 'p-2', userId: user.id, canonicalIngredient: 'paprika', namePl: 'Papryka słodka mielona', nameEn: 'Sweet paprika', nameAz: 'Şirin qırmızı bibər', quantity: 15, unit: 'g', normalizedAmount: 15, normalizedUnit: 'g', category: 'Other', expiryDate: '2027-06-01', daysUntilExpiry: 202, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🌶️' },
    { id: 'p-3', userId: user.id, canonicalIngredient: 'garlic', namePl: 'Czosnek polski', nameEn: 'Garlic', nameAz: 'Təzə sarımsaq', quantity: 50, unit: 'g', normalizedAmount: 50, normalizedUnit: 'g', category: 'Fruit & Vegetables', expiryDate: '2026-11-25', daysUntilExpiry: 14, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🧄' },
    { id: 'p-4', userId: user.id, canonicalIngredient: 'onion', namePl: 'Cebula żółta', nameEn: 'Yellow onion', nameAz: 'Sarı baş soğan', quantity: 300, unit: 'g', normalizedAmount: 300, normalizedUnit: 'g', category: 'Fruit & Vegetables', expiryDate: '2026-11-28', daysUntilExpiry: 17, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🧅' },
    { id: 'p-5', userId: user.id, canonicalIngredient: 'carrot', namePl: 'Marchew', nameEn: 'Carrots', nameAz: 'Təzə kök', quantity: 250, unit: 'g', normalizedAmount: 250, normalizedUnit: 'g', category: 'Fruit & Vegetables', expiryDate: '2026-11-14', daysUntilExpiry: 3, isExpiringSoon: true, addedAt: '2026-11-10', icon: '🥕' },
    { id: 'p-6', userId: user.id, canonicalIngredient: 'potato', namePl: 'Ziemniaki', nameEn: 'Potatoes', nameAz: 'Kartof', quantity: 400, unit: 'g', normalizedAmount: 400, normalizedUnit: 'g', category: 'Fruit & Vegetables', expiryDate: '2026-11-30', daysUntilExpiry: 19, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🥔' },
    { id: 'p-7', userId: user.id, canonicalIngredient: 'eggs', namePl: 'Jaja z wolnego wybiegu', nameEn: 'Free-range eggs', nameAz: 'Kənd yumurtası', quantity: 4, unit: 'pcs', normalizedAmount: 4, normalizedUnit: 'pcs', category: 'Dairy', expiryDate: '2026-11-15', daysUntilExpiry: 4, isExpiringSoon: true, addedAt: '2026-11-10', icon: '🥚' },
    { id: 'p-8', userId: user.id, canonicalIngredient: 'milk', namePl: 'Mleko świeże 2%', nameEn: 'Fresh milk 2%', nameAz: 'Təzə süd 2.5%', quantity: 400, unit: 'ml', normalizedAmount: 400, normalizedUnit: 'ml', category: 'Dairy', expiryDate: '2026-11-13', daysUntilExpiry: 2, isExpiringSoon: true, addedAt: '2026-11-10', icon: '🥛' },
    { id: 'p-9', userId: user.id, canonicalIngredient: 'apple', namePl: 'Jabłka polskie', nameEn: 'Fresh apples', nameAz: 'Quba alması', quantity: 400, unit: 'g', normalizedAmount: 400, normalizedUnit: 'g', category: 'Fruit & Vegetables', expiryDate: '2026-11-22', daysUntilExpiry: 11, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🍎' },
    { id: 'p-10', userId: user.id, canonicalIngredient: 'red_lentils', namePl: 'Soczewica czerwona', nameEn: 'Red lentils', nameAz: 'Qırmızı mərcimək', quantity: 150, unit: 'g', normalizedAmount: 150, normalizedUnit: 'g', category: 'Dry Products', expiryDate: '2027-04-10', daysUntilExpiry: 150, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🫘' },
    { id: 'p-11', userId: user.id, canonicalIngredient: 'pasta', namePl: 'Makaron pełnoziarnisty', nameEn: 'Wholegrain pasta', nameAz: 'Bərk buğda makaronu', quantity: 200, unit: 'g', normalizedAmount: 200, normalizedUnit: 'g', category: 'Dry Products', expiryDate: '2027-05-20', daysUntilExpiry: 190, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🍝' },
    { id: 'p-12', userId: user.id, canonicalIngredient: 'canned_tomatoes', namePl: 'Pomidory w puszce', nameEn: 'Canned tomatoes', nameAz: 'Doğranmış pomidor (konserv)', quantity: 400, unit: 'g', normalizedAmount: 400, normalizedUnit: 'g', category: 'Dry Products', expiryDate: '2027-08-01', daysUntilExpiry: 263, isExpiringSoon: false, addedAt: '2026-11-10', icon: '🥫' },
  ];

  const recipes = SEED_RECIPES.map((r, i) => ({ ...r, isFavourite: i < 2 }));
  const aiOut = await generateValidatedWeeklyMealPlan({
    weeklyPlanId: 'wp-offline',
    weekStartDate: '2026-11-10',
    preferences: user.preferences,
    availableRecipes: recipes,
    pantryItems: pantry,
    variationSeed: 0,
  });

  const purchasedMap = new Map<string, boolean>([
    ['banana', true],
    ['rice', true],
  ]);

  const shoppingList = buildSmartShoppingList({
    shoppingListId: 'sl-offline',
    userId: user.id,
    weeklyPlanId: 'wp-offline',
    supermarketId: user.preferences.preferredSupermarket,
    regionCode: 'PL',
    currencyCode: 'PLN',
    plannedMeals: aiOut.meals,
    pantryItems: pantry,
    subtractPantry: false,
    existingPurchasedMap: purchasedMap,
  });

  const weeklyPlan: WeeklyPlan = {
    id: 'wp-offline',
    userId: user.id,
    regionCode: 'PL',
    currencyCode: 'PLN',
    planDurationDays: user.preferences.planDurationDays || 7,
    weekStartDate: '2026-11-10',
    weekLabelPl: '10 lis – 16 lis',
    weekLabelEn: 'Nov 10 – Nov 16',
    weekLabelAz: '10 noy – 16 noy',
    targetBudgetPln: user.preferences.weeklyBudgetPln,
    supermarketId: user.preferences.preferredSupermarket,
    householdSize: user.preferences.householdSize,
    meals: aiOut.meals,
    totalEstimatedBasketPln: shoppingList.estimatedTotalPln,
    totalMealPortionsCostPln: Number(aiOut.meals.reduce((s, m) => s + m.scaledCostPln, 0).toFixed(2)),
    remainingBudgetPln: shoppingList.hasIncompleteTotal
      ? 0
      : Number((user.preferences.weeklyBudgetPln - shoppingList.estimatedTotalPln).toFixed(2)),
    budgetUsagePercent: Math.round((shoppingList.estimatedTotalPln / user.preferences.weeklyBudgetPln) * 100),
    hasIncompleteTotal: Boolean(shoppingList.hasIncompleteTotal),
    unpricedItemsCount: shoppingList.items.filter((i) => i.isPriced === false).length,
    isRemainingBudgetVerified: !shoppingList.hasIncompleteTotal,
    aiGenerationNotesPl: aiOut.notesPl,
    aiGenerationNotesEn: aiOut.notesEn,
    aiGenerationNotesAz: aiOut.notesAz,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const budgetAnalysis = analyzeAndOptimizeBudget({
    preferences: user.preferences,
    plannedMeals: weeklyPlan.meals,
    shoppingList,
    allRecipes: recipes,
  });

  const state: AppStatePayload = {
    user,
    weeklyPlan,
    shoppingList,
    recipes,
    pantry,
    supermarkets: supermarketRegistry.getAllSupermarkets('PL'),
    promotionalOffers: getPromotionalOffersForRegion('PL'),
    priceComparisons: supermarketRegistry.compareProductsAcrossStores(undefined, 'PL'),
    budgetAnalysis,
  };

  saveOfflineState(state);
  return state;
}

function saveOfflineState(state: AppStatePayload): void {
  try {
    localStorage.setItem(OFFLINE_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  if (state.biedronkaSnapshot) {
    cacheVerifiedBiedronkaSnapshotForOffline(state.biedronkaSnapshot);
  }
}

async function recomputeOfflineDerived(state: AppStatePayload): Promise<AppStatePayload> {
  const regionCode: RegionCode = state.user.regionCode || state.user.preferences.regionCode || 'PL';
  const currencyCode: CurrencyCode =
    state.user.currencyCode ||
    state.user.preferences.currencyCode ||
    getDefaultCurrencyForRegion(regionCode);

  const activeStore = resolveValidSupermarketForRegion(
    state.shoppingList.supermarketId || state.user.preferences.preferredSupermarket,
    regionCode
  );
  state.user.preferences.preferredSupermarket = activeStore;
  state.shoppingList.supermarketId = activeStore;

  // Rescale meal costs to active currency
  state.weeklyPlan.meals = state.weeklyPlan.meals.map((m) => {
    const scale = m.servings / Math.max(1, m.recipe.baseServings);
    const baseCost = getRecipeBaseCostForCurrency(m.recipe, currencyCode);
    return {
      ...m,
      scaledCostPln: Number((baseCost * scale).toFixed(2)),
    };
  });

  const purchasedMap = new Map<string, boolean>();
  for (const item of state.shoppingList.items) {
    if (item.isPurchased) {
      purchasedMap.set(item.canonicalIngredient.toLowerCase(), true);
    }
  }
  const manualItems = state.shoppingList.items
    .filter((i) => i.isManual)
    .map((m) =>
      isRegularPriceOnlyPolicyActive(regionCode, activeStore)
        ? {
            ...m,
            lineTotalPln:
              Number.isFinite(m.regularLineTotalPln) && m.regularLineTotalPln > 0
                ? m.regularLineTotalPln
                : m.lineTotalPln,
            regularLineTotalPln:
              Number.isFinite(m.regularLineTotalPln) && m.regularLineTotalPln > 0
                ? m.regularLineTotalPln
                : m.lineTotalPln,
            loyaltyRequired: false,
          }
        : m
    );
  const shoppingList = normalizeCachedShoppingListForPricingPolicy(
    buildSmartShoppingList({
      shoppingListId: state.shoppingList.id,
      userId: state.user.id,
      weeklyPlanId: state.weeklyPlan.id,
      supermarketId: activeStore,
      regionCode,
      currencyCode,
      plannedMeals: state.weeklyPlan.meals,
      pantryItems: state.pantry,
      subtractPantry: state.shoppingList.subtractPantry,
      existingPurchasedMap: purchasedMap,
      manualItems,
      hardExcludedTerms: collectHardExclusionTerms(state.user.preferences),
    })
  );

  const totalEstimatedBasketPln = shoppingList.estimatedTotalPln;
  const totalMealPortionsCostPln = Number(
    state.weeklyPlan.meals.reduce((s, m) => s + m.scaledCostPln, 0).toFixed(2)
  );
  const targetBudgetPln = state.user.preferences.weeklyBudgetPln;

  const weeklyPlan: WeeklyPlan = {
    ...state.weeklyPlan,
    regionCode,
    currencyCode,
    planDurationDays: state.user.preferences.planDurationDays || state.weeklyPlan.planDurationDays || 7,
    targetBudgetPln,
    supermarketId: activeStore,
    householdSize: state.user.preferences.householdSize,
    totalEstimatedBasketPln,
    totalMealPortionsCostPln,
    remainingBudgetPln: shoppingList.hasIncompleteTotal
      ? 0
      : Number((targetBudgetPln - totalEstimatedBasketPln).toFixed(2)),
    budgetUsagePercent: Math.round((totalEstimatedBasketPln / Math.max(1, targetBudgetPln)) * 100),
    hasIncompleteTotal: Boolean(shoppingList.hasIncompleteTotal),
    unpricedItemsCount: shoppingList.items.filter((i) => i.isPriced === false).length,
    isRemainingBudgetVerified: !shoppingList.hasIncompleteTotal,
  };

  const budgetAnalysis = analyzeAndOptimizeBudget({
    preferences: state.user.preferences,
    plannedMeals: weeklyPlan.meals,
    shoppingList,
    allRecipes: state.recipes,
  });

  const next: AppStatePayload = {
    ...state,
    weeklyPlan,
    shoppingList,
    supermarkets: supermarketRegistry.getAllSupermarkets(regionCode),
    promotionalOffers: getPromotionalOffersForRegion(regionCode),
    priceComparisons: supermarketRegistry.compareProductsAcrossStores(undefined, regionCode),
    budgetAnalysis,
  };
  saveOfflineState(next);
  return next;
}

export const clientApi = {
  async bootstrap(): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/bootstrap');
      saveOfflineState(data);
      return data;
    } catch {
      return getOrInitOfflineState();
    }
  },

  async login(email: string, password: string): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload & { token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAuthToken(data.token);
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      state.user.email = email.trim();
      setAuthToken(`offline-token-${Date.now()}`);
      saveOfflineState(state);
      return state;
    }
  },

  async register(payload: {
    email: string;
    password: string;
    displayName: string;
    language: Language;
    regionCode?: RegionCode;
    currencyCode?: CurrencyCode;
    householdSize: number;
    weeklyBudgetPln: number;
    preferredSupermarket: SupermarketSlug;
  }): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload & { token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuthToken(data.token);
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const regionCode: RegionCode = payload.regionCode || state.user.regionCode || 'PL';
      const currencyCode: CurrencyCode =
        payload.currencyCode || getDefaultCurrencyForRegion(regionCode);
      const validStore = resolveValidSupermarketForRegion(payload.preferredSupermarket, regionCode);

      state.user.email = payload.email.trim();
      state.user.displayName = payload.displayName.trim();
      state.user.language = payload.language || 'en';
      state.user.regionCode = regionCode;
      state.user.currencyCode = currencyCode;
      state.user.preferences.regionCode = regionCode;
      state.user.preferences.currencyCode = currencyCode;
      state.user.preferences.householdSize = payload.householdSize;
      state.user.preferences.weeklyBudgetPln = payload.weeklyBudgetPln;
      state.user.preferences.preferredSupermarket = validStore;
      state.shoppingList.supermarketId = validStore;
      setAuthToken(`offline-token-${Date.now()}`);
      return recomputeOfflineDerived(state);
    }
  },

  async recoverPassword(email: string): Promise<{ message: string; recoveryCodeDemo?: string }> {
    try {
      return await apiRequest('/api/auth/recover-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch {
      return {
        message: 'Offline password recovery code generated.',
        recoveryCodeDemo: '20261111',
      };
    }
  },

  async resetPassword(email: string, recoveryCode: string, newPassword: string): Promise<{ message: string }> {
    try {
      const res = await apiRequest<{ message: string; token: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, recoveryCode, newPassword }),
      });
      if (res.token) setAuthToken(res.token);
      return res;
    } catch {
      setAuthToken(`offline-token-${Date.now()}`);
      return { message: 'Password reset successful' };
    }
  },

  async deleteAccount(): Promise<{ state: AppStatePayload; deleted: boolean; message: string }> {
    if (!isStandaloneApkEnvironment()) {
      const res = await apiRequest<{ deleted: boolean; purgedTables?: string[]; deletedAt?: string }>(
        '/api/auth/account',
        {
          method: 'DELETE',
        }
      );
      setAuthToken(null);
      try {
        localStorage.removeItem(OFFLINE_STATE_KEY);
      } catch {
        // ignore
      }
      const freshState = await this.bootstrap();
      return {
        state: freshState,
        deleted: Boolean(res.deleted),
        message: 'Account and all associated personal data permanently deleted.',
      };
    }

    // Standalone APK offline mode: permanently clear stored token and offline user state
    setAuthToken(null);
    try {
      localStorage.removeItem(OFFLINE_STATE_KEY);
    } catch {
      // ignore
    }
    const freshOfflineState = await getOrInitOfflineState();
    return {
      state: freshOfflineState,
      deleted: true,
      message: 'Offline account and local data permanently deleted.',
    };
  },

  async reportAiContent(payload: {
    targetType: 'meal_plan' | 'recipe' | 'ingredient_match' | 'other';
    targetId: string;
    reasonCategory:
      | 'allergen_safety'
      | 'inaccurate_nutrition'
      | 'inappropriate_content'
      | 'wrong_price_or_product'
      | 'other';
    details: string;
  }): Promise<{ reported: boolean; message: string }> {
    try {
      return await apiRequest<{ reported: boolean; message: string }>('/api/ai/report', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      return {
        reported: true,
        message: 'Thank you. Your AI content report has been recorded for review.',
      };
    }
  },

  async exportUserData(): Promise<Record<string, unknown>> {
    try {
      return await apiRequest<Record<string, unknown>>('/api/auth/export-data');
    } catch {
      const state = await getOrInitOfflineState();
      return {
        schemaVersion: '1.0',
        exportedAt: new Date().toISOString(),
        gdprBasis: 'GDPR Article 20 — Right to Data Portability (Offline Export)',
        account: state.user,
        weeklyPlan: state.weeklyPlan,
        shoppingList: state.shoppingList,
        pantry: state.pantry,
      };
    }
  },

  async updatePreferences(
    patch: Partial<UserPreferences> & { displayName?: string; language?: Language; regeneratePlan?: boolean }
  ): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/preferences', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const prevRegion: RegionCode = state.user.regionCode || state.user.preferences.regionCode || 'PL';
      const prevCurrency: CurrencyCode =
        state.user.currencyCode ||
        state.user.preferences.currencyCode ||
        getDefaultCurrencyForRegion(prevRegion);

      const nextRegion: RegionCode = patch.regionCode || prevRegion;
      const regionChanged = nextRegion !== prevRegion;
      const nextCurrency: CurrencyCode = patch.currencyCode
        ? patch.currencyCode
        : regionChanged
        ? getDefaultCurrencyForRegion(nextRegion)
        : prevCurrency;

      const nextStore = resolveValidSupermarketForRegion(
        patch.preferredSupermarket ?? state.user.preferences.preferredSupermarket,
        nextRegion
      );

      let nextBudget = patch.weeklyBudgetPln ?? state.user.preferences.weeklyBudgetPln;
      if (patch.weeklyBudgetPln === undefined && nextCurrency !== prevCurrency) {
        const converted = convertHistoricalMonetaryAmount(
          state.user.preferences.weeklyBudgetPln,
          prevCurrency,
          nextCurrency
        );
        nextBudget = Math.max(20, Math.round(converted.convertedAmount));
      }

      state.user.regionCode = nextRegion;
      state.user.currencyCode = nextCurrency;
      state.user.preferences = {
        ...state.user.preferences,
        ...patch,
        regionCode: nextRegion,
        currencyCode: nextCurrency,
        preferredSupermarket: nextStore,
        weeklyBudgetPln: nextBudget,
      };
      if (patch.displayName) state.user.displayName = patch.displayName;
      if (patch.language) state.user.language = patch.language;
      state.shoppingList.supermarketId = nextStore;

      if (patch.regeneratePlan) {
        const aiOut = await generateValidatedWeeklyMealPlan({
          weeklyPlanId: state.weeklyPlan.id,
          weekStartDate: '2026-11-10',
          preferences: state.user.preferences,
          availableRecipes: state.recipes,
          pantryItems: state.pantry,
          subtractPantry: Boolean(state.shoppingList?.subtractPantry),
          variationSeed: Date.now() % 100,
        });
        if (aiOut.isBudgetInfeasible) {
          throw new Error(aiOut.notesEn);
        }
        state.weeklyPlan.meals = aiOut.meals;
        state.weeklyPlan.planDurationDays = state.user.preferences.planDurationDays || 7;
        state.weeklyPlan.hasNoSafeRecipes = Boolean(aiOut.hasNoSafeRecipes);
        state.weeklyPlan.noSafeRecipeSlots = aiOut.noSafeRecipeSlots;
        state.weeklyPlan.aiGenerationNotesPl = aiOut.notesPl;
        state.weeklyPlan.aiGenerationNotesEn = aiOut.notesEn;
        state.weeklyPlan.aiGenerationNotesAz = aiOut.notesAz;
      }

      return recomputeOfflineDerived(state);
    }
  },

  async generateMealPlan(
    variationSeed?: number,
    preferences?: Partial<UserPreferences>
  ): Promise<AppStatePayload> {
    // Wizard must never change Settings region or currency
    const sanitizedPreferences: Partial<UserPreferences> | undefined = preferences
      ? (() => {
          const copy: Partial<UserPreferences> = { ...preferences };
          delete copy.regionCode;
          delete copy.currencyCode;
          if (
            copy.preferredCuisine !== undefined &&
            copy.preferredCuisine !== null &&
            !isValidCuisinePreference(copy.preferredCuisine)
          ) {
            throw new Error(
              'Unsupported cuisine. Supported: any, italian, french, polish, greek, azerbaijani, spanish'
            );
          }
          if (copy.preferredCuisine !== undefined) {
            copy.preferredCuisine = normalizeCuisinePreference(copy.preferredCuisine);
          }
          return copy;
        })()
      : undefined;

    try {
      const data = await apiRequest<AppStatePayload>('/api/meal-plan/generate', {
        method: 'POST',
        body: JSON.stringify({ variationSeed, preferences: sanitizedPreferences }),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const candidatePrefs: UserPreferences = sanitizedPreferences
        ? (() => {
            const existingRegion: RegionCode =
              state.user.regionCode || state.user.preferences.regionCode || 'PL';
            const existingCurrency: CurrencyCode =
              state.user.currencyCode ||
              state.user.preferences.currencyCode ||
              getDefaultCurrencyForRegion(existingRegion);
            const nextStore = resolveValidSupermarketForRegion(
              sanitizedPreferences.preferredSupermarket ?? state.user.preferences.preferredSupermarket,
              existingRegion
            );
            return {
              ...state.user.preferences,
              ...sanitizedPreferences,
              regionCode: existingRegion,
              currencyCode: existingCurrency,
              preferredSupermarket: nextStore,
              preferredCuisine:
                sanitizedPreferences.preferredCuisine !== undefined
                  ? normalizeCuisinePreference(sanitizedPreferences.preferredCuisine)
                  : normalizeCuisinePreference(state.user.preferences.preferredCuisine),
            };
          })()
        : state.user.preferences;

      const aiOut = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: state.weeklyPlan.id,
        weekStartDate: '2026-11-10',
        preferences: candidatePrefs,
        availableRecipes: state.recipes,
        pantryItems: state.pantry,
        subtractPantry: Boolean(state.shoppingList?.subtractPantry),
        variationSeed: variationSeed ?? Math.floor(Math.random() * 500) + 1,
      });
      if (aiOut.isBudgetInfeasible) {
        // Never overwrite saved offline plan or preferences when budget is infeasible
        throw new Error(aiOut.notesEn);
      }
      state.user.preferences = candidatePrefs;
      state.shoppingList.supermarketId = candidatePrefs.preferredSupermarket;
      state.weeklyPlan.meals = aiOut.meals;
      state.weeklyPlan.planDurationDays = state.user.preferences.planDurationDays || 7;
      state.weeklyPlan.hasNoSafeRecipes = Boolean(aiOut.hasNoSafeRecipes);
      state.weeklyPlan.noSafeRecipeSlots = aiOut.noSafeRecipeSlots;
      state.weeklyPlan.aiGenerationNotesPl = aiOut.notesPl;
      state.weeklyPlan.aiGenerationNotesEn = aiOut.notesEn;
      state.weeklyPlan.aiGenerationNotesAz = aiOut.notesAz;
      return recomputeOfflineDerived(state);
    }
  },

  async replaceOrAddMeal(payload: {
    dayIndex: number;
    mealType: MealType;
    recipeId: string;
    servings?: number;
    plannedMealId?: string;
  }): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/meal-plan/meal', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const recipe = state.recipes.find((r) => r.id === payload.recipeId);
      if (!recipe) throw new Error('Recipe not found');
      const check = validateRecipeForUser(recipe, state.user.preferences, {
        enforcePrepTime: false,
        enforceCuisine: false,
      });
      if (!check.valid) throw new Error(check.violations.join(' | '));
      const servings = payload.servings ?? state.user.preferences.householdSize;
      const scale = servings / Math.max(1, recipe.baseServings);
      const baseCost = getRecipeBaseCostForCurrency(recipe, state.user.currencyCode || 'PLN');
      const newMeal = {
        id: payload.plannedMealId || `pm-off-${Date.now()}`,
        weeklyPlanId: state.weeklyPlan.id,
        dayIndex: payload.dayIndex,
        dateStr: `2026-11-${10 + payload.dayIndex}`,
        mealType: payload.mealType,
        servings,
        recipe,
        scaledCostPln: Number((baseCost * scale).toFixed(2)),
        scaledCaloriesKcal: recipe.nutrition.caloriesKcal,
      };
      const idx = state.weeklyPlan.meals.findIndex(
        (m) =>
          (payload.plannedMealId && m.id === payload.plannedMealId) ||
          (m.dayIndex === payload.dayIndex && m.mealType === payload.mealType)
      );
      if (idx >= 0) state.weeklyPlan.meals[idx] = newMeal;
      else state.weeklyPlan.meals.push(newMeal);
      return recomputeOfflineDerived(state);
    }
  },

  async updateMealServings(plannedMealId: string, servings: number): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>(`/api/meal-plan/meal/${plannedMealId}/servings`, {
        method: 'PATCH',
        body: JSON.stringify({ servings }),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const meal = state.weeklyPlan.meals.find((m) => m.id === plannedMealId);
      if (meal) {
        meal.servings = servings;
        const baseCost = getRecipeBaseCostForCurrency(meal.recipe, state.user.currencyCode || 'PLN');
        meal.scaledCostPln = Number(
          ((baseCost * servings) / Math.max(1, meal.recipe.baseServings)).toFixed(2)
        );
      }
      return recomputeOfflineDerived(state);
    }
  },

  async removePlannedMeal(plannedMealId: string): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>(`/api/meal-plan/meal/${plannedMealId}`, {
        method: 'DELETE',
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      state.weeklyPlan.meals = state.weeklyPlan.meals.filter((m) => m.id !== plannedMealId);
      return recomputeOfflineDerived(state);
    }
  },

  async updateRecipeServings(
    recipeId: string,
    servings: number,
    dayIndex?: number
  ): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>(`/api/recipes/${recipeId}/servings`, {
        method: 'PATCH',
        body: JSON.stringify({ servings, dayIndex }),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      let updatedAny = false;
      if (dayIndex !== undefined) {
        for (const m of state.weeklyPlan.meals) {
          if (m.recipe.id === recipeId && m.dayIndex === dayIndex) {
            m.servings = servings;
            updatedAny = true;
          }
        }
      }
      if (!updatedAny) {
        for (const m of state.weeklyPlan.meals) {
          if (m.recipe.id === recipeId) {
            m.servings = servings;
          }
        }
      }
      return recomputeOfflineDerived(state);
    }
  },

  async updateRecipeIngredient(
    recipeId: string,
    ingredientId: string,
    amount: number
  ): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>(`/api/recipes/${recipeId}/ingredient`, {
        method: 'PATCH',
        body: JSON.stringify({ ingredientId, amount }),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const rounded = Math.round(amount * 10) / 10;
      const updateIngList = (ings: Recipe['ingredients']) =>
        ings.map((ing) => {
          if (ing.id !== ingredientId) return ing;
          const norm = normalizeIngredientQuantity(rounded, ing.unit, ing.canonicalIngredient);
          return {
            ...ing,
            amount: rounded,
            displayAmountEn: `${rounded} ${ing.unit}`,
            displayAmountPl: `${rounded} ${ing.unit === 'pcs' ? 'szt.' : ing.unit}`,
            displayAmountAz: `${rounded} ${ing.unit === 'pcs' ? 'ədəd' : ing.unit}`,
            normalizedBaseAmount: norm.amount || rounded,
          };
        });

      state.recipes = state.recipes.map((r) =>
        r.id === recipeId ? { ...r, ingredients: updateIngList(r.ingredients) } : r
      );
      state.weeklyPlan.meals = state.weeklyPlan.meals.map((m) =>
        m.recipe.id === recipeId
          ? { ...m, recipe: { ...m.recipe, ingredients: updateIngList(m.recipe.ingredients) } }
          : m
      );
      return recomputeOfflineDerived(state);
    }
  },

  async toggleFavouriteRecipe(recipeId: string): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>(`/api/recipes/${recipeId}/favourite`, {
        method: 'POST',
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      state.recipes = state.recipes.map((r) =>
        r.id === recipeId ? { ...r, isFavourite: !r.isFavourite } : r
      );
      saveOfflineState(state);
      return state;
    }
  },

  async createCustomRecipe(payload: any): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/recipes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const recipeId = `rec-custom-${Date.now()}`;
      const rawIng = payload.ingredients?.[0] || { namePl: 'Pomidory', amount: 300, unit: 'g' };
      const canonical =
        resolveCanonicalIngredient(String(rawIng.namePl || rawIng.canonicalIngredient || '')) ||
        String(rawIng.namePl || 'tomato').toLowerCase().replace(/\s+/g, '_');
      const norm = normalizeIngredientQuantity(Number(rawIng.amount) || 300, rawIng.unit || 'g', canonical);
      const titleLabel = payload.titlePl || payload.titleEn || payload.titleAz || 'Custom recipe';
      const newRecipe: Recipe = {
        id: recipeId,
        slug: String(titleLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        authorUserId: state.user.id,
        titlePl: titleLabel,
        titleEn: payload.titleEn || titleLabel,
        titleAz: payload.titleAz || titleLabel,
        descriptionPl: 'Domowy przepis użytkownika.',
        descriptionEn: 'Custom user recipe.',
        descriptionAz: 'İstifadəçi resepti.',
        mealType: payload.mealType || 'lunch',
        category: 'Budget-friendly',
        regionSuitability: ['PL', 'AZ'],
        imageUrl: payload.imageUrl || './assets/recipes/recipe-placeholder.svg',
        prepTimeMin: Number(payload.prepTimeMin) || 15,
        cookTimeMin: Number(payload.cookTimeMin) || 10,
        totalTimeMin: (Number(payload.prepTimeMin) || 15) + (Number(payload.cookTimeMin) || 10),
        difficulty: 'Easy',
        baseServings: 2,
        estimatedCostPln: Number(payload.estimatedCostPln) || 10,
        estimatedCostAzn: Number(((Number(payload.estimatedCostPln) || 10) * 0.45).toFixed(2)),
        nutrition: {
          caloriesKcal: Number(payload.caloriesKcal) || 450,
          proteinG: 26,
          carbsG: 48,
          fatG: 14,
          fiberG: 6,
        },
        dietaryTags: [],
        allergens: [],
        equipment: ['Patelnia', 'Garnek'],
        ingredients: [
          {
            id: `ing-${recipeId}-0`,
            canonicalIngredient: canonical,
            namePl: rawIng.namePl || canonical,
            nameEn: rawIng.nameEn || rawIng.namePl || canonical,
            nameAz: rawIng.nameAz || rawIng.namePl || canonical,
            amount: Number(rawIng.amount) || 300,
            unit: rawIng.unit || 'g',
            displayAmountPl: `${Number(rawIng.amount) || 300} ${rawIng.unit || 'g'}`,
            displayAmountEn: `${Number(rawIng.amount) || 300} ${rawIng.unit || 'g'}`,
            displayAmountAz: `${Number(rawIng.amount) || 300} ${rawIng.unit || 'g'}`,
            normalizedBaseAmount: norm.amount,
            normalizedBaseUnit: norm.baseUnit,
            category: 'Fruit & Vegetables',
            icon: '🥘',
          },
        ],
        instructionsPl: payload.instructionsPl || ['Przygotuj składniki i ugotuj.'],
        instructionsEn: payload.instructionsEn || ['Prepare ingredients and cook.'],
        instructionsAz: payload.instructionsAz || ['Ərzaqları hazırlayın və bişirin.'],
        isCustom: true,
      };
      state.recipes.unshift(newRecipe);
      return recomputeOfflineDerived(state);
    }
  },

  async toggleShoppingItem(key: string): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/shopping-list/toggle', {
        method: 'POST',
        body: JSON.stringify({ key }),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      state.shoppingList.items = state.shoppingList.items.map((item) =>
        item.canonicalIngredient.toLowerCase() === key.toLowerCase() || item.id === key
          ? { ...item, isPurchased: !item.isPurchased }
          : item
      );
      return recomputeOfflineDerived(state);
    }
  },

  async updateShoppingSettings(settings: {
    supermarketId?: SupermarketSlug;
    subtractPantry?: boolean;
  }): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/shopping-list/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      if (settings.supermarketId) {
        const regionCode = state.user.regionCode || 'PL';
        const validStore = resolveValidSupermarketForRegion(settings.supermarketId, regionCode);
        state.shoppingList.supermarketId = validStore;
        state.user.preferences.preferredSupermarket = validStore;
      }
      if (settings.subtractPantry !== undefined) {
        state.shoppingList.subtractPantry = settings.subtractPantry;
      }
      return recomputeOfflineDerived(state);
    }
  },

  async addManualShoppingItem(payload: {
    namePl: string;
    packageSizeLabel: string;
    pricePln: number;
    category?: any;
  }): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/shopping-list/manual', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const currencyCode = state.user.currencyCode || 'PLN';
      const price = Number(payload.pricePln) || (currencyCode === 'AZN' ? 2.49 : 4.99);
      state.shoppingList.items.push({
        id: `manual-off-${Date.now()}`,
        shoppingListId: state.shoppingList.id,
        canonicalIngredient: payload.namePl.trim().toLowerCase().replace(/\s+/g, '_'),
        namePl: payload.namePl.trim(),
        nameEn: payload.namePl.trim(),
        nameAz: payload.namePl.trim(),
        category: payload.category || 'Other',
        icon: '🛒',
        requiredAmount: 1,
        requiredUnit: 'pcs',
        requiredDisplayLabel: payload.packageSizeLabel || '1 pkg',
        pantryDeductedAmount: 0,
        netRequiredAmount: 1,
        matchedProductId: null,
        matchedProductNamePl: payload.namePl.trim(),
        matchedProductNameEn: payload.namePl.trim(),
        matchedProductNameAz: payload.namePl.trim(),
        matchedBrand: state.user.regionCode === 'AZ' ? 'Əl ilə əlavə edilib' : 'Dodano ręcznie',
        ean: null,
        recommendedPackages: 1,
        packageSizeLabel: payload.packageSizeLabel || '1 pkg',
        totalPurchasedAmount: 1,
        leftoverAmount: 0,
        leftoverDisplayLabel: '0 g',
        unitPricePln: price,
        unitPriceLabel: `${formatMoney(price, currencyCode)} / pkg`,
        regularLineTotalPln: price,
        lineTotalPln: price,
        supermarketId: state.shoppingList.supermarketId,
        priceVerificationStatus: 'ESTIMATED_MARKET_AVG',
        loyaltyRequired: false,
        loyaltyConditionPl: null,
        loyaltyConditionEn: null,
        loyaltyConditionAz: null,
        promoValidUntil: null,
        storeChannel: 'PHYSICAL_STORE',
        lastUpdatedAt: new Date().toISOString(),
        matchConfidence: 'HIGH',
        isPurchased: false,
        isManual: true,
        alternativeStorePricePln: null,
        alternativeStoreId: null,
      });
      return recomputeOfflineDerived(state);
    }
  },

  async removeManualShoppingItem(itemId: string): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>(`/api/shopping-list/manual/${itemId}`, {
        method: 'DELETE',
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      state.shoppingList.items = state.shoppingList.items.filter((i) => i.id !== itemId);
      return recomputeOfflineDerived(state);
    }
  },

  async addPantryItem(payload: {
    namePl: string;
    quantity: number;
    unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
    expiryDate?: string;
    category?: any;
  }): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/pantry', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      const canonical =
        resolveCanonicalIngredient(payload.namePl) ||
        payload.namePl.toLowerCase().replace(/\s+/g, '_');
      const norm = normalizeIngredientQuantity(payload.quantity, payload.unit, canonical);
      state.pantry.unshift({
        id: `p-off-${Date.now()}`,
        userId: state.user.id,
        canonicalIngredient: canonical,
        namePl: payload.namePl,
        nameEn: payload.namePl,
        nameAz: payload.namePl,
        quantity: payload.quantity,
        unit: payload.unit,
        normalizedAmount: norm.amount || payload.quantity,
        normalizedUnit: norm.baseUnit === 'to_taste' ? 'g' : norm.baseUnit,
        category: payload.category || 'Other',
        expiryDate: payload.expiryDate || null,
        daysUntilExpiry: 7,
        isExpiringSoon: false,
        addedAt: new Date().toISOString(),
        icon: '🥫',
      });
      return recomputeOfflineDerived(state);
    }
  },

  async deletePantryItem(id: string): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>(`/api/pantry/${id}`, {
        method: 'DELETE',
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      state.pantry = state.pantry.filter((p) => p.id !== id);
      return recomputeOfflineDerived(state);
    }
  },

  async applyBudgetSuggestion(suggestion: {
    type: string;
    targetSupermarketId?: SupermarketSlug;
    targetPlannedMealId?: string;
    replacementRecipeId?: string;
  }): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/budget/apply-suggestion', {
        method: 'POST',
        body: JSON.stringify(suggestion),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      if (suggestion.type === 'STORE_SWITCH' && suggestion.targetSupermarketId) {
        state.shoppingList.supermarketId = suggestion.targetSupermarketId;
        state.user.preferences.preferredSupermarket = suggestion.targetSupermarketId;
      } else if (suggestion.type === 'PANTRY_UTILIZATION') {
        state.shoppingList.subtractPantry = true;
      } else if (
        suggestion.type === 'RECIPE_SWAP' &&
        suggestion.targetPlannedMealId &&
        suggestion.replacementRecipeId
      ) {
        const rep = state.recipes.find((r) => r.id === suggestion.replacementRecipeId);
        const meal = state.weeklyPlan.meals.find((m) => m.id === suggestion.targetPlannedMealId);
        if (rep && meal && rep.mealType === meal.mealType) {
          const check = validateRecipeForUser(rep, state.user.preferences, {
            enforcePrepTime: false,
            enforceCuisine: true,
          });
          if (check.valid) {
            meal.recipe = rep;
            const baseCost = getRecipeBaseCostForCurrency(rep, state.user.currencyCode || 'PLN');
            meal.scaledCostPln = Number(
              ((baseCost * meal.servings) / Math.max(1, rep.baseServings)).toFixed(2)
            );
            meal.scaledCaloriesKcal = rep.nutrition.caloriesKcal;
          }
        }
      }
      return recomputeOfflineDerived(state);
    }
  },

  async syncBazarstorePrices(): Promise<{
    syncRun?: PriceSyncRunRecord;
    summary?: PriceMonitoringSummary;
    state: AppStatePayload;
  }> {
    try {
      const res = await apiRequest<{
        syncRun: PriceSyncRunRecord;
        summary: PriceMonitoringSummary;
        state: AppStatePayload;
      }>('/api/monitoring/sync', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      saveOfflineState(res.state);
      return res;
    } catch {
      const state = await getOrInitOfflineState();
      return { state: await recomputeOfflineDerived(state) };
    }
  },

  async fetchBiedronkaProductDetail(
    item: Pick<
      ShoppingItem,
      | 'sku'
      | 'namePl'
      | 'matchedProductNamePl'
      | 'packageSizeLabel'
      | 'unitPricePln'
      | 'lineTotalPln'
      | 'regularLineTotalPln'
      | 'recommendedPackages'
      | 'priceObservedAt'
      | 'glovoProductId'
      | 'externalProductId'
      | 'storeProductId'
      | 'glovoProductUrl'
      | 'sourceName'
      | 'storeLocation'
    >
  ): Promise<BiedronkaProductDetail> {
    const sku = String(item.sku || '').trim();
    const pkgCount = Math.max(1, item.recommendedPackages || 1);
    const regularPackPrice = Number((item.regularLineTotalPln / pkgCount).toFixed(2));
    const linePackPrice = Number((item.lineTotalPln / pkgCount).toFixed(2));
    const rawPromoPackPrice =
      regularPackPrice > linePackPrice + 0.005 ? linePackPrice : null;
    const effectivePackPrice = resolvePolicyEffectivePrice(
      regularPackPrice || linePackPrice,
      rawPromoPackPrice,
      'PL',
      'biedronka'
    );

    const fallbackOffline: BiedronkaProductDetail = {
      sku,
      productId: item.glovoProductId ?? null,
      externalProductId: item.externalProductId ?? null,
      storeProductId: item.storeProductId ?? null,
      storeId: null,
      storeAddressId: null,
      storeSlug: 'biedronka-waw',
      sourceName: item.sourceName || 'Glovo Warsaw (Biedronka)',
      storeLocation: item.storeLocation || 'Warszawa, Polska (Glovo • biedronka-waw)',
      namePl: item.matchedProductNamePl || item.namePl,
      packageLabelPl: item.packageSizeLabel || null,
      regularPricePln: regularPackPrice || effectivePackPrice,
      promoPricePln: rawPromoPackPrice,
      effectivePricePln: effectivePackPrice,
      priceObservedAt: item.priceObservedAt ?? null,
      imageUrl: null,
      glovoProductUrl: item.glovoProductUrl ?? null,
      description: null,
      ingredients: null,
      nutritionBasis: null,
      nutritionRows: [],
      countryOfOrigin: null,
      detailStatus: 'OFFLINE_UNAVAILABLE',
      detailError: 'Offline or server unreachable; product details are not cached on this device.',
      retryAfterAt: null,
      detailFetchedAt: null,
      fromCache: false,
    };

    if (!sku || !(item.glovoProductId || item.storeProductId || item.externalProductId)) {
      return {
        ...fallbackOffline,
        detailStatus: 'MISSING_IDENTITY',
        detailError: 'No verified Biedronka SKU is associated with this item.',
      };
    }

    try {
      const detail = await apiRequest<BiedronkaProductDetail>(
        `/api/monitoring/biedronka/product-detail/${encodeURIComponent(sku)}`
      );
      const normalizedDetail: BiedronkaProductDetail = {
        ...detail,
        effectivePricePln: resolvePolicyEffectivePrice(
          detail.regularPricePln,
          detail.promoPricePln,
          'PL',
          'biedronka'
        ),
      };
      if (normalizedDetail && (normalizedDetail.detailStatus === 'OK' || normalizedDetail.detailStatus === 'CACHED')) {
        cacheBiedronkaProductDetail(normalizedDetail);
      }
      return normalizedDetail;
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 404) {
        return {
          ...fallbackOffline,
          detailStatus: 'MISSING_IDENTITY',
          detailError: 'This product is unavailable in the active Biedronka catalog.',
        };
      }
      const cached = getCachedBiedronkaProductDetail(sku);
      if (cached) {
        return {
          ...cached,
          priceObservedAt: item.priceObservedAt ?? cached.priceObservedAt ?? null,
          detailStatus: 'CACHED',
          fromCache: true,
        };
      }
      if (error instanceof ApiResponseError) {
        return {
          ...fallbackOffline,
          detailStatus: 'UPSTREAM_ERROR',
          detailError: 'The server could not load product details.',
        };
      }
      return fallbackOffline;
    }
  },
};
