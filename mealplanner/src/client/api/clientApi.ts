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
} from '../../shared/types';
import {
  PromotionalBannerOffer,
  getPromotionalOffersForRegion,
} from '../../server/supermarkets/catalogueData';
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
import { validateRecipeForUser } from '../../server/validation/mealValidator';
import {
  getDefaultCurrencyForRegion,
  resolveValidSupermarketForRegion,
  convertHistoricalMonetaryAmount,
  formatMoney,
} from '../../shared/regionConfig';

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
}

const TOKEN_STORAGE_KEY = 'mealplanner_auth_token';
const OFFLINE_STATE_KEY = 'mealplanner_offline_state_v2';

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

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

/**
 * Creates a full offline fallback state (used when running inside standalone Android APK without server connection).
 */
async function getOrInitOfflineState(): Promise<AppStatePayload> {
  try {
    const raw = localStorage.getItem(OFFLINE_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppStatePayload;
      if (parsed?.user && parsed?.supermarkets) {
        return parsed;
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
    remainingBudgetPln: Number((user.preferences.weeklyBudgetPln - shoppingList.estimatedTotalPln).toFixed(2)),
    budgetUsagePercent: Math.round((shoppingList.estimatedTotalPln / user.preferences.weeklyBudgetPln) * 100),
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
  const manualItems = state.shoppingList.items.filter((i) => i.isManual);
  const shoppingList = buildSmartShoppingList({
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
  });

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
    remainingBudgetPln: Number((targetBudgetPln - totalEstimatedBasketPln).toFixed(2)),
    budgetUsagePercent: Math.round((totalEstimatedBasketPln / Math.max(1, targetBudgetPln)) * 100),
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
          variationSeed: Date.now() % 100,
        });
        state.weeklyPlan.meals = aiOut.meals;
      }

      return recomputeOfflineDerived(state);
    }
  },

  async generateMealPlan(
    variationSeed?: number,
    preferences?: Partial<UserPreferences>
  ): Promise<AppStatePayload> {
    try {
      const data = await apiRequest<AppStatePayload>('/api/meal-plan/generate', {
        method: 'POST',
        body: JSON.stringify({ variationSeed, preferences }),
      });
      saveOfflineState(data);
      return data;
    } catch {
      const state = await getOrInitOfflineState();
      if (preferences) {
        const nextRegion: RegionCode =
          preferences.regionCode || state.user.regionCode || state.user.preferences.regionCode || 'PL';
        const nextCurrency: CurrencyCode =
          preferences.currencyCode ||
          state.user.currencyCode ||
          state.user.preferences.currencyCode ||
          getDefaultCurrencyForRegion(nextRegion);
        const nextStore = resolveValidSupermarketForRegion(
          preferences.preferredSupermarket ?? state.user.preferences.preferredSupermarket,
          nextRegion
        );
        state.user.regionCode = nextRegion;
        state.user.currencyCode = nextCurrency;
        state.user.preferences = {
          ...state.user.preferences,
          ...preferences,
          regionCode: nextRegion,
          currencyCode: nextCurrency,
          preferredSupermarket: nextStore,
        };
        state.shoppingList.supermarketId = nextStore;
      }
      const aiOut = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: state.weeklyPlan.id,
        weekStartDate: '2026-11-10',
        preferences: state.user.preferences,
        availableRecipes: state.recipes,
        pantryItems: state.pantry,
        variationSeed: variationSeed ?? Math.floor(Math.random() * 500) + 1,
      });
      state.weeklyPlan.meals = aiOut.meals;
      state.weeklyPlan.planDurationDays = state.user.preferences.planDurationDays || 7;
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
      const check = validateRecipeForUser(recipe, state.user.preferences);
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
        imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
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
        if (rep && meal) {
          meal.recipe = rep;
          const baseCost = getRecipeBaseCostForCurrency(rep, state.user.currencyCode || 'PLN');
          meal.scaledCostPln = Number(
            ((baseCost * meal.servings) / Math.max(1, rep.baseServings)).toFixed(2)
          );
          meal.scaledCaloriesKcal = rep.nutrition.caloriesKcal;
        }
      }
      return recomputeOfflineDerived(state);
    }
  },
};
