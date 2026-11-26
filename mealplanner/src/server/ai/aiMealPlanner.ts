import {
  Recipe,
  PlannedMeal,
  UserPreferences,
  MealType,
  PantryItem,
  CurrencyCode,
  RegionCode,
  FoodVibeOption,
} from '../../shared/types';
import {
  validateRecipeForUser,
  canPrepareWithEquipment,
  collectHardExclusionTerms,
} from '../validation/mealValidator';
import { buildSmartShoppingList } from '../matching/quantityEngine';
import {
  getDefaultCurrencyForRegion,
  formatMoney,
  resolveValidSupermarketForRegion,
} from '../../shared/regionConfig';
import { getCuisineLabel, normalizeCuisinePreference } from '../../shared/cuisineConfig';

export interface AIPlannerInput {
  weeklyPlanId: string;
  weekStartDate: string; // e.g., "2026-11-09" or "2026-11-10"
  preferences: UserPreferences;
  availableRecipes: Recipe[];
  pantryItems: PantryItem[];
  subtractPantry?: boolean;
  variationSeed?: number;
}

export const MAX_BUDGET_FALLBACK_OVERAGE_PLN = 50;
export const MAX_BUDGET_FALLBACK_OVERAGE_AZN = 22.5;

export function getMaxBudgetFallbackOverage(currencyCode: CurrencyCode): number {
  return currencyCode === 'AZN' ? MAX_BUDGET_FALLBACK_OVERAGE_AZN : MAX_BUDGET_FALLBACK_OVERAGE_PLN;
}

export interface AIPlannerOutput {
  meals: PlannedMeal[];
  planDurationDays: number;
  providerUsed: 'GEMINI_API' | 'OPENAI_API' | 'SMART_ALGORITHMIC_ENGINE';
  hasNoSafeRecipes?: boolean;
  noSafeRecipeSlots?: Array<{ dayIndex: number; mealType: MealType; reason: string }>;
  actualBasketTotalPln?: number;
  budgetOveragePln?: number;
  hasIncompleteTotal?: boolean;
  unpricedIngredientCount?: number;
  isBudgetInfeasible?: boolean;
  maxAllowedBudgetPln?: number;
  minimumAchievableBasketPln?: number;
  notesPl: string;
  notesEn: string;
  notesAz: string;
}

type BudgetTier = 'tight' | 'balanced' | 'flexible';

function classifyBudgetTier(
  weeklyBudget: number,
  planDurationDays: number,
  householdSize: number,
  currencyCode: CurrencyCode
): BudgetTier {
  const personDays = Math.max(1, planDurationDays * Math.max(1, householdSize));
  const perPersonDay = weeklyBudget / personDays;
  const tightMax = currencyCode === 'AZN' ? 6.5 : 14.5;
  const flexibleMin = currencyCode === 'AZN' ? 10.5 : 23.0;
  if (perPersonDay <= tightMax) return 'tight';
  if (perPersonDay >= flexibleMin) return 'flexible';
  return 'balanced';
}

function makePlannedMealRecord(
  weeklyPlanId: string,
  dayIndex: number,
  dateStr: string,
  mealType: MealType,
  recipe: Recipe,
  servings: number,
  currencyCode: CurrencyCode
): PlannedMeal {
  const scale = servings / Math.max(1, recipe.baseServings);
  const baseCost = getRecipeBaseCostForCurrency(recipe, currencyCode);
  return {
    id: `pm-${weeklyPlanId}-${dayIndex}-${mealType}`,
    weeklyPlanId,
    dayIndex,
    dateStr,
    mealType,
    servings,
    recipe,
    scaledCostPln: Number((baseCost * scale).toFixed(2)),
    scaledCaloriesKcal: recipe.nutrition.caloriesKcal,
  };
}

function evaluateRealBasket(params: {
  weeklyPlanId: string;
  preferences: UserPreferences;
  plannedMeals: PlannedMeal[];
  pantryItems: PantryItem[];
  subtractPantry: boolean;
  regionCode: RegionCode;
  currencyCode: CurrencyCode;
  hardExcludedTerms: string[];
}): {
  total: number;
  hasIncompleteTotal: boolean;
  unpricedNamesPl: string[];
  unpricedNamesEn: string[];
} {
  const supermarketId = resolveValidSupermarketForRegion(
    params.preferences.preferredSupermarket,
    params.regionCode
  );
  const list = buildSmartShoppingList({
    shoppingListId: `sim-${params.weeklyPlanId}`,
    userId: params.preferences.userId || 'sim-user',
    weeklyPlanId: params.weeklyPlanId,
    supermarketId,
    regionCode: params.regionCode,
    currencyCode: params.currencyCode,
    plannedMeals: params.plannedMeals,
    pantryItems: params.pantryItems,
    subtractPantry: params.subtractPantry,
    hardExcludedTerms: params.hardExcludedTerms,
  });
  const unpriced = list.items.filter((i) => i.isPriced === false);
  return {
    total: list.estimatedTotalPln,
    hasIncompleteTotal: Boolean(list.hasIncompleteTotal || unpriced.length > 0),
    unpricedNamesPl: unpriced.map((i) => i.namePl),
    unpricedNamesEn: unpriced.map((i) => i.nameEn),
  };
}

const WEEK_DATES = [
  '2026-11-10', // Mon 10
  '2026-11-11', // Tue 11
  '2026-11-12', // Wed 12
  '2026-11-13', // Thu 13
  '2026-11-14', // Fri 14
  '2026-11-15', // Sat 15
  '2026-11-16', // Sun 16
];

const FAKEAWAY_RECIPE_IDS = new Set([
  'rec-grilled-chicken-rice',
  'rec-lentil-tomato-curry',
  'rec-az-qutab',
  'rec-chicken-broccoli-skillet',
  'rec-tofu-veggie-rice',
  'rec-chicken-pasta-spinach',
]);

const COMFORT_FOOD_RECIPE_IDS = new Set([
  'rec-vegetable-soup',
  'rec-pork-loin-potatoes',
  'rec-pasta-lentil-bolognese',
  'rec-az-dovga',
  'rec-oatmeal-banana',
  'rec-lentil-tomato-curry',
  'rec-az-shah-plov',
]);

const TRADITIONAL_RECIPE_IDS = new Set([
  'rec-az-shah-plov',
  'rec-az-dovga',
  'rec-az-qutab',
  'rec-az-pomidor-yumurta',
  'rec-pork-loin-potatoes',
  'rec-vegetable-soup',
  'rec-cottage-cheese-sandwich',
]);

const MEAL_PREP_RECIPE_IDS = new Set([
  'rec-grilled-chicken-rice',
  'rec-lentil-tomato-curry',
  'rec-vegetable-soup',
  'rec-pasta-lentil-bolognese',
  'rec-tofu-veggie-rice',
  'rec-pork-loin-potatoes',
  'rec-az-shah-plov',
]);

const MEDITERRANEAN_INGREDIENTS = new Set([
  'olive_oil',
  'tomato',
  'canned_tomatoes',
  'garlic',
  'salmon',
  'pasta',
  'spinach',
]);

export function getRecipeBaseCostForCurrency(recipe: Recipe, currencyCode: CurrencyCode): number {
  if (currencyCode === 'AZN') {
    return recipe.estimatedCostAzn ?? Number((recipe.estimatedCostPln * 0.45).toFixed(2));
  }
  return recipe.estimatedCostPln;
}

/**
 * Scores a candidate recipe based on:
 * - Regional culinary fit (Poland vs Azerbaijan)
 * - Selected Food Vibes & Custom Food Vibes (Step 5 of Wizard)
 * - Kitchen Equipment compatibility (Step 6 of Wizard)
 * - Pantry ingredient overlap (especially expiring items)
 * - Ingredient reuse with already selected recipes in the week
 * - Budget & Duration alignment in the active currency (PLN or AZN)
 * - User dislikes avoidance
 */
function scoreRecipeForPlan(
  recipe: Recipe,
  preferences: UserPreferences,
  pantryItems: PantryItem[],
  alreadyUsedIngredients: Set<string>,
  recentRecipeIds: string[],
  variationOffset: number,
  regionCode: RegionCode,
  currencyCode: CurrencyCode,
  planDurationDays: number,
  budgetContext: {
    budgetTier: BudgetTier;
    marginalBasketDelta: number;
    hasUnpricedIngredient: boolean;
  }
): number {
  let score = 100;

  // Regional culinary fit (only applies when cuisine is 'any'; specific cuisine is region-independent!)
  const selectedCuisine = normalizeCuisinePreference(preferences.preferredCuisine);
  if (selectedCuisine === 'any') {
    if (recipe.regionSuitability && recipe.regionSuitability.length > 0) {
      if (!recipe.regionSuitability.includes(regionCode)) {
        score -= 55;
      }
    }
    if (regionCode === 'AZ' && recipe.id.startsWith('rec-az-')) {
      score += 24;
    }
  }

  // Kitchen Equipment bonus/check
  if (preferences.kitchenEquipment && preferences.kitchenEquipment.length > 0) {
    const eq = canPrepareWithEquipment(recipe.equipment, preferences.kitchenEquipment);
    if (eq.supported) {
      score += 20;
    } else {
      score -= 200;
    }
  }

  // Step 5: Food Vibe multi-select scoring
  const vibes = new Set<FoodVibeOption>(preferences.foodVibes || []);
  if (vibes.has('quick_easy')) {
    if (recipe.totalTimeMin <= 20) score += 30;
    else if (recipe.totalTimeMin <= 25 && recipe.difficulty === 'Easy') score += 18;
    else if (recipe.totalTimeMin > 35) score -= 15;
  }
  if (vibes.has('high_protein') || (preferences.dietaryRestrictions || []).includes('high_protein')) {
    if (recipe.dietaryTags.includes('high_protein') || recipe.nutrition.proteinG >= 26) {
      score += 26;
    }
  }
  if (vibes.has('low_calorie')) {
    if (recipe.nutrition.caloriesKcal <= 450) score += 30;
    else if (recipe.nutrition.caloriesKcal >= 620) score -= 15;
  }
  if (vibes.has('fakeaway') && FAKEAWAY_RECIPE_IDS.has(recipe.id)) {
    score += 28;
  }
  if (vibes.has('budget_friendly')) {
    if (recipe.category === 'Budget-friendly' || recipe.estimatedCostPln <= 10.5) {
      score += budgetContext.budgetTier === 'flexible' ? 12 : 28;
    }
  }
  if (vibes.has('healthy_balanced')) {
    if (recipe.nutrition.fiberG >= 5 || (recipe.nutrition.caloriesKcal <= 560 && recipe.nutrition.proteinG >= 18)) {
      score += 26;
    }
  }
  if (vibes.has('comfort_food') && COMFORT_FOOD_RECIPE_IDS.has(recipe.id)) {
    score += 26;
  }
  if (vibes.has('traditional')) {
    if (TRADITIONAL_RECIPE_IDS.has(recipe.id)) {
      score += 32;
    }
    if (regionCode === 'AZ' && recipe.id.startsWith('rec-az-')) {
      score += 18;
    }
  }
  if (vibes.has('meal_prep') && MEAL_PREP_RECIPE_IDS.has(recipe.id)) {
    score += 26;
  }
  if (vibes.has('family_friendly')) {
    if (recipe.difficulty === 'Easy') score += 22;
  }
  if (vibes.has('mediterranean')) {
    const medMatches = recipe.ingredients.filter((i) =>
      MEDITERRANEAN_INGREDIENTS.has(i.canonicalIngredient)
    ).length;
    if (medMatches >= 2) score += 28;
  }

  // Custom Food Vibes matching
  const customVibes = (preferences.customFoodVibes || [])
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (customVibes.length > 0) {
    const hay = `${recipe.titleEn} ${recipe.titlePl} ${recipe.titleAz || ''} ${recipe.descriptionEn} ${recipe.category} ${recipe.dietaryTags.join(' ')} ${recipe.ingredients.map((i) => `${i.nameEn} ${i.namePl} ${i.nameAz || ''}`).join(' ')}`.toLowerCase();
    for (const cv of customVibes) {
      if (hay.includes(cv)) {
        score += 32;
      }
    }
  }

  // Penalize if used in the last 2 days of the same meal type to prevent boring repetition
  if (recentRecipeIds.slice(-2).includes(recipe.id)) {
    score -= 65;
  } else if (recentRecipeIds.includes(recipe.id)) {
    score -= 15;
  }

  // Reward pantry overlap (especially expiring items) and real ingredient reuse / diversity depending on budget tier
  let reusedCount = 0;
  let newIngredientCount = 0;
  for (const ing of recipe.ingredients) {
    if (ing.unit === 'to_taste') continue;
    if (alreadyUsedIngredients.has(ing.canonicalIngredient)) {
      reusedCount++;
    } else {
      newIngredientCount++;
    }
    const pantryMatch = pantryItems.find(
      (p) => p.canonicalIngredient.toLowerCase() === ing.canonicalIngredient.toLowerCase()
    );
    if (pantryMatch) {
      score += pantryMatch.isExpiringSoon ? 28 : 14;
    }
  }
  if (budgetContext.budgetTier === 'tight') {
    score += reusedCount * 7;
  } else if (budgetContext.budgetTier === 'balanced') {
    score += reusedCount * 4;
  } else {
    // Flexible budget unlocks richer culinary diversity & protein without padding spend
    score += Math.min(20, newIngredientCount * 5);
    score += Math.min(26, recipe.nutrition.proteinG * 0.7);
  }

  // Likes only rank already-eligible recipes (hard exclusions already removed unsafe/disliked recipes)
  const likes = (preferences.likes || [])
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  if (likes.length > 0) {
    const recipeHay = `${recipe.titleEn} ${recipe.titlePl} ${recipe.titleAz || ''} ${recipe.ingredients
      .map((i) => `${i.canonicalIngredient} ${i.nameEn} ${i.namePl} ${i.nameAz || ''}`)
      .join(' ')}`.toLowerCase();
    for (const like of likes) {
      if (recipeHay.includes(like)) {
        score += 28;
      }
    }
  }

  // Real basket pack-price sensitivity (using actual incremental basket cost from buildSmartShoppingList!)
  const baseCost = getRecipeBaseCostForCurrency(recipe, currencyCode);
  const scaledCost = (baseCost * preferences.householdSize) / Math.max(1, recipe.baseServings);
  const delta = Math.max(0, budgetContext.marginalBasketDelta);
  const currencyFactor = currencyCode === 'AZN' ? 2.2 : 1.0;

  if (budgetContext.budgetTier === 'tight') {
    // Tight budget: strongly prefer lowest real marginal basket pack cost + economical dishes
    score -= delta * 5.0 * currencyFactor;
    score -= scaledCost * 1.8 * currencyFactor;
  } else if (budgetContext.budgetTier === 'balanced') {
    // Balanced budget (e.g., 250 PLN): balance real basket cost with nutrition and variety
    score -= delta * 1.6 * currencyFactor;
    score -= scaledCost * 0.5 * currencyFactor;
  } else {
    // Flexible / high budget (e.g., 450–600 PLN): unlock genuinely premium, richer recipes
    // without exceeding target or adding padding
    score += Math.min(36, delta * 0.75 * currencyFactor);
    score += Math.min(28, scaledCost * 0.65 * currencyFactor);
  }

  // Strongly prefer recipes whose ingredients all have verified store prices so totals stay complete
  if (budgetContext.hasUnpricedIngredient) {
    score -= 150;
  }

  // Deterministic variation when user clicks "Regenerate"
  const hash = recipe.id
    .split('')
    .reduce((acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 1 + variationOffset), 0);
  score += hash % 15;

  return score;
}

function sanitizePromptToken(raw: string): string {
  return String(raw || '')
    .replace(/[^\p{L}\p{N}\s,_-]/gu, '')
    .trim()
    .slice(0, 60);
}

/**
 * Optional external Gemini API call (server-side only).
 * If GEMINI_API_KEY is present, requests recipe rankings/selections from Gemini and validates them deterministically.
 */
async function tryExternalGeminiSelection(
  input: AIPlannerInput,
  validPool: Recipe[],
  regionCode: RegionCode,
  currencyCode: CurrencyCode,
  planDurationDays: number
): Promise<Map<string, string> | null> {
  const envObj = typeof process !== 'undefined' && process?.env ? process.env : undefined;
  const apiKey = envObj?.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  const model = envObj?.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const regionLabel = regionCode === 'AZ' ? 'Azerbaijan' : 'Poland';
  try {
    const safeVibes = (input.preferences.foodVibes || []).map(sanitizePromptToken).filter(Boolean).join(', ') || 'balanced';
    const safeEquip = (input.preferences.kitchenEquipment || []).map(sanitizePromptToken).filter(Boolean).join(', ') || 'standard';
    const prompt = `You are the MealPlanner culinary assistant for ${regionLabel} (region: ${regionCode}, currency: ${currencyCode}). Select a ${planDurationDays}-day meal plan (dayIndex 0..${planDurationDays - 1}) for a household of ${input.preferences.householdSize} with budget ${input.preferences.weeklyBudgetPln} ${currencyCode} at supermarket ${input.preferences.preferredSupermarket}.
Food vibes: ${safeVibes}.
Kitchen equipment: ${safeEquip}.
Do not make medical or clinical claims. Only select from the following pre-validated recipe IDs: ${validPool.map((r) => `${r.id} (${r.mealType}, ${getRecipeBaseCostForCurrency(r, currencyCode)} ${currencyCode})`).join(', ')}.
Return JSON object mapping "dayIndex-mealType" to recipeId.`;

    const abortSignal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(8000)
        : undefined;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        ...(abortSignal ? { signal: abortSignal } : {}),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, string>;
    return new Map(Object.entries(parsed));
  } catch {
    return null;
  }
}

function describeActiveConstraints(
  preferences: UserPreferences,
  lang: 'en' | 'pl' | 'az'
): string {
  const parts: string[] = [];
  const cuisine = normalizeCuisinePreference(preferences.preferredCuisine);
  if (cuisine !== 'any') {
    const label = getCuisineLabel(cuisine, lang);
    parts.push(
      lang === 'pl' ? `kuchnia: ${label}` : lang === 'az' ? `mətbəx: ${label}` : `cuisine: ${label}`
    );
  }
  if (preferences.dietaryRestrictions && preferences.dietaryRestrictions.length > 0) {
    const d = preferences.dietaryRestrictions.join(', ');
    parts.push(lang === 'pl' ? `dieta: ${d}` : lang === 'az' ? `pəhriz: ${d}` : `diet: ${d}`);
  }
  if (preferences.allergies && preferences.allergies.length > 0) {
    const a = preferences.allergies.join(', ');
    parts.push(lang === 'pl' ? `alergie: ${a}` : lang === 'az' ? `allergiyalar: ${a}` : `allergies: ${a}`);
  }
  const excluded = [
    ...(preferences.excludedIngredients || []),
    ...(preferences.dislikes || []),
    ...(preferences.customRestrictions || []),
  ]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (excluded.length > 0) {
    const uniq = Array.from(new Set(excluded)).join(', ');
    parts.push(lang === 'pl' ? `wykluczenia: ${uniq}` : lang === 'az' ? `istisnalar: ${uniq}` : `excluded: ${uniq}`);
  }
  return parts.join('; ');
}

function getSlotLabel(slot: MealType, lang: 'en' | 'pl' | 'az'): string {
  if (lang === 'pl') {
    return slot === 'breakfast'
      ? 'śniadanie'
      : slot === 'lunch'
      ? 'obiad'
      : slot === 'dinner'
      ? 'kolacja'
      : 'przekąska';
  }
  if (lang === 'az') {
    return slot === 'breakfast'
      ? 'səhər yeməyi'
      : slot === 'lunch'
      ? 'nahar'
      : slot === 'dinner'
      ? 'şam yeməyi'
      : 'qəlyanaltı';
  }
  return slot;
}

/**
 * Resolves all deterministically safe recipes for a specific meal slot.
 * Strictly preserves mealType, preferredCuisine, allergies, dislikes, excludedIngredients,
 * customRestrictions, and dietaryRestrictions. Relaxes prep time (and if empty, equipment)
 * per-slot only when needed to provide variety without ever leaking another meal slot or cuisine.
 */
function getEligibleRecipesForSlot(
  availableRecipes: Recipe[],
  mealType: MealType,
  preferences: UserPreferences
): Recipe[] {
  const slotRecipes = availableRecipes.filter((r) => r.mealType === mealType);
  if (slotRecipes.length === 0) return [];

  const strict = slotRecipes.filter(
    (r) =>
      validateRecipeForUser(r, preferences, {
        enforcePrepTime: true,
        enforceEquipment: true,
        enforceCuisine: true,
      }).valid
  );
  if (strict.length >= 3) {
    return strict;
  }

  const relaxedPrep = slotRecipes.filter(
    (r) =>
      validateRecipeForUser(r, preferences, {
        enforcePrepTime: false,
        enforceEquipment: true,
        enforceCuisine: true,
      }).valid
  );
  if (relaxedPrep.length > strict.length) {
    return relaxedPrep;
  }
  if (strict.length > 0) {
    return strict;
  }

  // Last resort for this slot: relax kitchen equipment while NEVER relaxing mealType, cuisine, diet, or exclusions
  return slotRecipes.filter(
    (r) =>
      validateRecipeForUser(r, preferences, {
        enforcePrepTime: false,
        enforceEquipment: false,
        enforceCuisine: true,
      }).valid
  );
}

export async function generateValidatedWeeklyMealPlan(
  input: AIPlannerInput
): Promise<AIPlannerOutput> {
  const {
    weeklyPlanId,
    preferences,
    availableRecipes,
    pantryItems,
    subtractPantry = false,
    variationSeed = 0,
  } = input;
  const regionCode: RegionCode = preferences.regionCode || 'PL';
  const currencyCode: CurrencyCode =
    preferences.currencyCode || getDefaultCurrencyForRegion(regionCode);
  const planDurationDays = Math.min(
    7,
    Math.max(1, Math.round(Number(preferences.planDurationDays) || 7))
  );

  const selectedCuisine = normalizeCuisinePreference(preferences.preferredCuisine);
  const hardExcludedTerms = collectHardExclusionTerms(preferences);
  const budgetTier = classifyBudgetTier(
    preferences.weeklyBudgetPln,
    planDurationDays,
    preferences.householdSize,
    currencyCode
  );
  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];
  if (preferences.includeSnacks || preferences.mealsPerDay >= 4) {
    mealTypes.push('snack');
  }

  // Step 1: Resolve eligible recipes STRICTLY per meal slot (never leak dinner into breakfast/lunch!)
  // When >= 2 fully-priced recipes exist for a slot in the active store catalogue/snapshot, prefer
  // fully-priced recipes so baskets never carry avoidable missing prices or false remaining totals.
  const preferFullyPricedForSlot = (slotList: Recipe[]): Recipe[] => {
    if (slotList.length < 2) return slotList;
    const fullyPriced = slotList.filter((r) => {
      const trial = makePlannedMealRecord(
        weeklyPlanId,
        0,
        WEEK_DATES[0],
        r.mealType,
        r,
        preferences.householdSize,
        currencyCode
      );
      const b = evaluateRealBasket({
        weeklyPlanId,
        preferences,
        plannedMeals: [trial],
        pantryItems: [],
        subtractPantry: false,
        regionCode,
        currencyCode,
        hardExcludedTerms,
      });
      return !b.hasIncompleteTotal;
    });
    return fullyPriced.length >= 3 ? fullyPriced : slotList;
  };

  const eligibleBySlot: Record<MealType, Recipe[]> = {
    breakfast: preferFullyPricedForSlot(getEligibleRecipesForSlot(availableRecipes, 'breakfast', preferences)),
    lunch: preferFullyPricedForSlot(getEligibleRecipesForSlot(availableRecipes, 'lunch', preferences)),
    dinner: preferFullyPricedForSlot(getEligibleRecipesForSlot(availableRecipes, 'dinner', preferences)),
    snack: preferFullyPricedForSlot(getEligibleRecipesForSlot(availableRecipes, 'snack', preferences)),
  };

  const validPool = Array.from(
    new Map(
      mealTypes.flatMap((mt) => eligibleBySlot[mt]).map((r) => [r.id, r])
    ).values()
  );

  const constraintsEn = describeActiveConstraints(preferences, 'en');
  const constraintsPl = describeActiveConstraints(preferences, 'pl');
  const constraintsAz = describeActiveConstraints(preferences, 'az');

  // If no safe recipe passes hard cuisine, allergy, dislike, exclusion, and dietary checks for ANY slot, report explicitly!
  if (validPool.length === 0) {
    const cuisineNoteEn =
      selectedCuisine !== 'any'
        ? ` for ${getCuisineLabel(selectedCuisine, 'en')} cuisine`
        : '';
    const cuisineNotePl =
      selectedCuisine !== 'any'
        ? ` dla kuchni: ${getCuisineLabel(selectedCuisine, 'pl')}`
        : '';
    const cuisineNoteAz =
      selectedCuisine !== 'any'
        ? ` (${getCuisineLabel(selectedCuisine, 'az')} mətbəxi üzrə)`
        : '';
    const noSafeRecipeSlots: Array<{ dayIndex: number; mealType: MealType; reason: string }> = [];
    for (let dayIndex = 0; dayIndex < planDurationDays; dayIndex++) {
      for (const mealType of mealTypes) {
        noSafeRecipeSlots.push({
          dayIndex,
          mealType,
          reason: `NO_SAFE_RECIPE: No ${mealType} recipe${cuisineNoteEn} satisfies active constraints (${constraintsEn || 'hard exclusions'}).`,
        });
      }
    }
    return {
      meals: [],
      planDurationDays,
      providerUsed: 'SMART_ALGORITHMIC_ENGINE',
      hasNoSafeRecipes: true,
      noSafeRecipeSlots,
      notesPl: `Brak bezpiecznych przepisów${cuisineNotePl} spełniających wszystkie aktywne ograniczenia (${constraintsPl || 'alergie/dieta/wykluczenia'}). Żaden niebezpieczny posiłek nie został dodany.`,
      notesEn: `No safe recipes${cuisineNoteEn} satisfy all active constraints (${constraintsEn || 'allergies/diet/exclusions'}). No unsafe or wrong-slot meals were added.`,
      notesAz: `Bütün aktiv məhdudiyyətlərə (${constraintsAz || 'allergiya/pəhriz/istisnalar'}) uyğun təhlükəsiz resept tapılmadı${cuisineNoteAz}. Təhlükəsiz olmayan yemək əlavə edilmədi.`,
    };
  }

  const externalMap = await tryExternalGeminiSelection(
    input,
    validPool,
    regionCode,
    currencyCode,
    planDurationDays
  );
  const providerUsed = externalMap ? 'GEMINI_API' : 'SMART_ALGORITHMIC_ENGINE';

  const usedIngredients = new Set<string>();
  const recentByType: Record<MealType, string[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  const slotUsageCount: Record<MealType, Map<string, number>> = {
    breakfast: new Map(),
    lunch: new Map(),
    dinner: new Map(),
    snack: new Map(),
  };
  const lastRecipeIdBySlot: Record<MealType, string | null> = {
    breakfast: null,
    lunch: null,
    dinner: null,
    snack: null,
  };
  let prevDayAllRecipeIds = new Set<string>();

  const plannedMeals: PlannedMeal[] = [];
  const noSafeRecipeSlots: Array<{ dayIndex: number; mealType: MealType; reason: string }> = [];
  const infeasibleMealTypes = new Set<MealType>();
  const limitedVarietyMealTypes = new Set<MealType>();

  for (const mt of mealTypes) {
    if (eligibleBySlot[mt].length === 0) {
      infeasibleMealTypes.add(mt);
    } else if (eligibleBySlot[mt].length === 1 && planDurationDays > 1) {
      limitedVarietyMealTypes.add(mt);
    }
  }

  for (let dayIndex = 0; dayIndex < planDurationDays; dayIndex++) {
    const dateStr = WEEK_DATES[dayIndex] || `2026-11-${10 + dayIndex}`;
    const usedTodayIds = new Set<string>();

    for (const mealType of mealTypes) {
      const slotEligible = eligibleBySlot[mealType];
      // Enforce strict meal slot AND distinct dishes per day (never duplicate a dish on the same day)
      const dayDistinctPool = slotEligible.filter((r) => !usedTodayIds.has(r.id));

      if (dayDistinctPool.length === 0) {
        infeasibleMealTypes.add(mealType);
        noSafeRecipeSlots.push({
          dayIndex,
          mealType,
          reason: `NO_ELIGIBLE_SLOT_RECIPE: No eligible ${mealType} recipe satisfies active constraints (${constraintsEn || 'cuisine/diet/exclusions'}).`,
        });
        continue;
      }

      // 1. Rotate ALL eligible recipes in this slot before repeating any recipe
      const usageMap = slotUsageCount[mealType];
      const minUses = Math.min(...dayDistinctPool.map((r) => usageMap.get(r.id) ?? 0));
      let candidates = dayDistinctPool.filter((r) => (usageMap.get(r.id) ?? 0) === minUses);

      // 2. Avoid consecutive-day repeats in the same meal slot whenever >= 2 eligible recipes exist
      const prevSlotRecipeId = lastRecipeIdBySlot[mealType];
      if (prevSlotRecipeId) {
        const nonConsecutive = candidates.filter((r) => r.id !== prevSlotRecipeId);
        if (nonConsecutive.length > 0) {
          candidates = nonConsecutive;
        }
      }

      // 3. Soft preference to also avoid yesterday's recipes from any other slot when multiple choices remain
      if (candidates.length > 1 && prevDayAllRecipeIds.size > 0) {
        const freshAcrossDay = candidates.filter((r) => !prevDayAllRecipeIds.has(r.id));
        if (freshAcrossDay.length > 0) {
          candidates = freshAcrossDay;
        }
      }

      let chosen: Recipe | undefined;

      // On Monday (dayIndex === 0) with default seed (variationSeed === 0) and Any cuisine, prioritize showcase meals if valid
      if (
        dayIndex === 0 &&
        variationSeed === 0 &&
        selectedCuisine === 'any' &&
        !externalMap &&
        (!preferences.foodVibes || preferences.foodVibes.length === 0) &&
        (!preferences.likes || preferences.likes.length === 0)
      ) {
        const preferredMondayId =
          mealType === 'breakfast'
            ? 'rec-oatmeal-banana'
            : mealType === 'lunch'
            ? 'rec-grilled-chicken-rice'
            : mealType === 'dinner'
            ? 'rec-vegetable-soup'
            : 'rec-skyr-fruit-snack';
        chosen = candidates.find((c) => c.id === preferredMondayId);
      }

      if (!chosen && externalMap) {
        const extId = externalMap.get(`${dayIndex}-${mealType}`);
        if (extId) {
          chosen = candidates.find((c) => c.id === extId);
        }
      }

      if (!chosen) {
        const currentBasket = evaluateRealBasket({
          weeklyPlanId,
          preferences,
          plannedMeals,
          pantryItems,
          subtractPantry,
          regionCode,
          currencyCode,
          hardExcludedTerms,
        });

        const scored = candidates
          .map((c) => {
            const trialMeal = makePlannedMealRecord(
              weeklyPlanId,
              dayIndex,
              dateStr,
              mealType,
              c,
              preferences.householdSize,
              currencyCode
            );
            const trialBasket = evaluateRealBasket({
              weeklyPlanId,
              preferences,
              plannedMeals: [...plannedMeals, trialMeal],
              pantryItems,
              subtractPantry,
              regionCode,
              currencyCode,
              hardExcludedTerms,
            });
            const marginalBasketDelta = Math.max(
              0,
              Number((trialBasket.total - currentBasket.total).toFixed(2))
            );
            const hasUnpricedIngredient =
              trialBasket.unpricedNamesEn.length > currentBasket.unpricedNamesEn.length;
            return {
              recipe: c,
              marginalBasketDelta,
              score: scoreRecipeForPlan(
                c,
                preferences,
                pantryItems,
                usedIngredients,
                recentByType[mealType],
                variationSeed + dayIndex * 7,
                regionCode,
                currencyCode,
                planDurationDays,
                {
                  budgetTier,
                  marginalBasketDelta,
                  hasUnpricedIngredient,
                }
              ),
            };
          })
          .sort(
            (a, b) =>
              b.score - a.score ||
              a.marginalBasketDelta - b.marginalBasketDelta ||
              a.recipe.id.localeCompare(b.recipe.id)
          );

        chosen = scored[0].recipe;
      }

      // Final deterministic safety gate before adding to plan (strict cuisine + slot + exclusions)
      if (chosen.mealType !== mealType) {
        throw new Error(
          `Slot violation blocked meal ${chosen.id}: recipe mealType '${chosen.mealType}' does not match slot '${mealType}'.`
        );
      }
      const safetyCheck = validateRecipeForUser(chosen, preferences, { enforceCuisine: true });
      if (!safetyCheck.valid) {
        throw new Error(
          `Safety violation blocked meal ${chosen.id}: ${safetyCheck.violations.join('; ')}`
        );
      }

      usedTodayIds.add(chosen.id);
      recentByType[mealType].push(chosen.id);
      usageMap.set(chosen.id, (usageMap.get(chosen.id) ?? 0) + 1);
      lastRecipeIdBySlot[mealType] = chosen.id;
      for (const ing of chosen.ingredients) {
        usedIngredients.add(ing.canonicalIngredient);
      }

      plannedMeals.push(
        makePlannedMealRecord(
          weeklyPlanId,
          dayIndex,
          dateStr,
          mealType,
          chosen,
          preferences.householdSize,
          currencyCode
        )
      );
    }

    prevDayAllRecipeIds = usedTodayIds;
  }

  // Post-generation real-basket spending-target aiming & hard +50 PLN cap enforcement:
  // 1) If actual basket > targetBudget: perform deterministic same-slot swaps to aim <= targetBudget first,
  //    then rare fallback only up to targetBudget + MAX_BUDGET_FALLBACK_OVERAGE (50 PLN / 22.50 AZN).
  // 2) If flexible budget and actual basket < 90% of targetBudget: deterministically upgrade to genuinely richer
  //    eligible same-slot recipes (never exceeding targetBudget, never adding padding or unpriced items).
  let finalBasket = evaluateRealBasket({
    weeklyPlanId,
    preferences,
    plannedMeals,
    pantryItems,
    subtractPantry,
    regionCode,
    currencyCode,
    hardExcludedTerms,
  });

  const preserveMondayShowcase =
    variationSeed === 0 &&
    selectedCuisine === 'any' &&
    !externalMap &&
    (!preferences.foodVibes || preferences.foodVibes.length === 0) &&
    (!preferences.likes || preferences.likes.length === 0);

  if (plannedMeals.length > 0 && finalBasket.total > preferences.weeklyBudgetPln + 0.01) {
    const runBudgetSwapPass = (preserveFullRotation: boolean) => {
      for (let iter = 0; iter < plannedMeals.length * 2; iter++) {
        if (finalBasket.total <= preferences.weeklyBudgetPln + 0.01) break;

        let bestSwap: { mealIdx: number; replacement: Recipe; newTotal: number } | null = null;

        for (let idx = 0; idx < plannedMeals.length; idx++) {
          const meal = plannedMeals[idx];
          if (preserveMondayShowcase && meal.dayIndex === 0) continue;
          const slotPool = eligibleBySlot[meal.mealType];
          if (!slotPool || slotPool.length <= 1) continue;

          const slotMeals = plannedMeals.filter((m) => m.mealType === meal.mealType);
          const countOfCurrent = slotMeals.filter((m) => m.recipe.id === meal.recipe.id).length;
          const usedInSlot = new Set(slotMeals.map((m) => m.recipe.id));

          const sameDayIds = new Set(
            plannedMeals
              .filter((m, j) => j !== idx && m.dayIndex === meal.dayIndex)
              .map((m) => m.recipe.id)
          );
          const prevDaySlot = plannedMeals.find(
            (m) => m.dayIndex === meal.dayIndex - 1 && m.mealType === meal.mealType
          )?.recipe.id;
          const nextDaySlot = plannedMeals.find(
            (m) => m.dayIndex === meal.dayIndex + 1 && m.mealType === meal.mealType
          )?.recipe.id;

          for (const cand of slotPool) {
            if (cand.id === meal.recipe.id) continue;
            if (sameDayIds.has(cand.id)) continue;
            if (cand.id === prevDaySlot || cand.id === nextDaySlot) continue;

            // If preserving full rotation, replacing a sole occurrence is only allowed when cand is NOT yet used in this slot
            if (preserveFullRotation && countOfCurrent <= 1 && usedInSlot.has(cand.id)) {
              continue;
            }

            const trialMeals = plannedMeals.slice();
            trialMeals[idx] = makePlannedMealRecord(
              weeklyPlanId,
              meal.dayIndex,
              meal.dateStr,
              meal.mealType,
              cand,
              meal.servings,
              currencyCode
            );
            const trialBasket = evaluateRealBasket({
              weeklyPlanId,
              preferences,
              plannedMeals: trialMeals,
              pantryItems,
              subtractPantry,
              regionCode,
              currencyCode,
              hardExcludedTerms,
            });
            // Never trade a fully-priced item for an unpriced item just to artificially lower the partial sum!
            if (trialBasket.unpricedNamesEn.length > finalBasket.unpricedNamesEn.length) {
              continue;
            }
            if (
              trialBasket.total < finalBasket.total - 0.01 &&
              (!bestSwap ||
                trialBasket.total < bestSwap.newTotal - 0.01 ||
                (Math.abs(trialBasket.total - bestSwap.newTotal) <= 0.01 &&
                  cand.id.localeCompare(bestSwap.replacement.id) < 0))
            ) {
              bestSwap = { mealIdx: idx, replacement: cand, newTotal: trialBasket.total };
            }
          }
        }

        if (!bestSwap) break;
        const target = plannedMeals[bestSwap.mealIdx];
        plannedMeals[bestSwap.mealIdx] = makePlannedMealRecord(
          weeklyPlanId,
          target.dayIndex,
          target.dateStr,
          target.mealType,
          bestSwap.replacement,
          target.servings,
          currencyCode
        );
        finalBasket = evaluateRealBasket({
          weeklyPlanId,
          preferences,
          plannedMeals,
          pantryItems,
          subtractPantry,
          regionCode,
          currencyCode,
          hardExcludedTerms,
        });
      }
    };

    // Pass 1: Full-rotation-preserving swaps first
    runBudgetSwapPass(true);
    // Pass 2 (tight-budget economy fallback): if still over budget, allow swapping toward economical eligible recipes
    // while strictly preserving mealType, 3 distinct dishes/day, no consecutive repeats, and all hard exclusions!
    if (finalBasket.total > preferences.weeklyBudgetPln + 0.01) {
      runBudgetSwapPass(false);
    }
    // Pass 3 (economy-subset rebuild): if single-meal swaps hit a multi-pack local minimum and still exceed budget,
    // rebuild strictly from the most economical 2-3 eligible recipes per slot (avoiding expensive premium packs while
    // strictly preserving mealType, 3 distinct dishes/day, rotation across the economy subset, and zero consecutive repeats!).
    if (finalBasket.total > preferences.weeklyBudgetPln + 0.01) {
      for (const maxPerSlot of [3, 2]) {
        const econMeals: PlannedMeal[] = [];
        const econLastBySlot: Record<MealType, string | null> = {
          breakfast: null,
          lunch: null,
          dinner: null,
          snack: null,
        };
        const econUsage: Record<MealType, Map<string, number>> = {
          breakfast: new Map(),
          lunch: new Map(),
          dinner: new Map(),
          snack: new Map(),
        };

        // Rank each slot's eligible recipes by standalone real cost + base cost (cheapest first)
        const econPoolBySlot: Record<MealType, Recipe[]> = {
          breakfast: [],
          lunch: [],
          dinner: [],
          snack: [],
        };
        for (const mt of mealTypes) {
          const sorted = [...eligibleBySlot[mt]]
            .map((r) => {
              const single = makePlannedMealRecord(
                weeklyPlanId,
                0,
                WEEK_DATES[0],
                mt,
                r,
                preferences.householdSize,
                currencyCode
              );
              const sb = evaluateRealBasket({
                weeklyPlanId,
                preferences,
                plannedMeals: [single],
                pantryItems,
                subtractPantry,
                regionCode,
                currencyCode,
                hardExcludedTerms,
              });
              return {
                recipe: r,
                realCost: sb.total,
                baseCost: getRecipeBaseCostForCurrency(r, currencyCode),
                unpriced: sb.unpricedNamesEn.length,
              };
            })
            .sort(
              (a, b) =>
                a.unpriced - b.unpriced ||
                a.baseCost - b.baseCost ||
                a.realCost - b.realCost ||
                a.recipe.id.localeCompare(b.recipe.id)
            );
          econPoolBySlot[mt] = sorted.slice(0, Math.max(2, maxPerSlot)).map((x) => x.recipe);
        }

        for (let d = 0; d < planDurationDays; d++) {
          const dateStr = WEEK_DATES[d] || `2026-11-${10 + d}`;
          const todayIds = new Set<string>();
          for (const mt of mealTypes) {
            const pool = econPoolBySlot[mt].filter((r) => !todayIds.has(r.id));
            if (pool.length === 0) continue;
            const uMap = econUsage[mt];
            const minU = Math.min(...pool.map((r) => uMap.get(r.id) ?? 0));
            let cands = pool.filter((r) => (uMap.get(r.id) ?? 0) === minU);
            const prev = econLastBySlot[mt];
            if (prev) {
              const noConsec = cands.filter((r) => r.id !== prev);
              if (noConsec.length > 0) cands = noConsec;
            }
            const curB = evaluateRealBasket({
              weeklyPlanId,
              preferences,
              plannedMeals: econMeals,
              pantryItems,
              subtractPantry,
              regionCode,
              currencyCode,
              hardExcludedTerms,
            });
            cands.sort((a, b) => {
              const ba = evaluateRealBasket({
                weeklyPlanId,
                preferences,
                plannedMeals: [
                  ...econMeals,
                  makePlannedMealRecord(weeklyPlanId, d, dateStr, mt, a, preferences.householdSize, currencyCode),
                ],
                pantryItems,
                subtractPantry,
                regionCode,
                currencyCode,
                hardExcludedTerms,
              }).total - curB.total;
              const bb = evaluateRealBasket({
                weeklyPlanId,
                preferences,
                plannedMeals: [
                  ...econMeals,
                  makePlannedMealRecord(weeklyPlanId, d, dateStr, mt, b, preferences.householdSize, currencyCode),
                ],
                pantryItems,
                subtractPantry,
                regionCode,
                currencyCode,
                hardExcludedTerms,
              }).total - curB.total;
              return ba - bb || a.id.localeCompare(b.id);
            });
            const pick = cands[0];
            todayIds.add(pick.id);
            uMap.set(pick.id, (uMap.get(pick.id) ?? 0) + 1);
            econLastBySlot[mt] = pick.id;
            econMeals.push(
              makePlannedMealRecord(
                weeklyPlanId,
                d,
                dateStr,
                mt,
                pick,
                preferences.householdSize,
                currencyCode
              )
            );
          }
        }

        if (econMeals.length === plannedMeals.length) {
          const econBasket = evaluateRealBasket({
            weeklyPlanId,
            preferences,
            plannedMeals: econMeals,
            pantryItems,
            subtractPantry,
            regionCode,
            currencyCode,
            hardExcludedTerms,
          });
          if (
            econBasket.unpricedNamesEn.length <= finalBasket.unpricedNamesEn.length &&
            econBasket.total < finalBasket.total - 0.01
          ) {
            plannedMeals.splice(0, plannedMeals.length, ...econMeals);
            finalBasket = econBasket;
            if (finalBasket.total <= preferences.weeklyBudgetPln + 0.01) break;
          }
        }
      }
    }
  } else if (
    plannedMeals.length > 0 &&
    budgetTier === 'flexible' &&
    finalBasket.total < preferences.weeklyBudgetPln * 0.9
  ) {
    // Target-aiming upgrade pass for flexible/premium budgets:
    // Deterministically upgrade lower-tier slots to genuinely richer eligible recipes from below targetBudget
    // (aiming for [90%, 100%] of targetBudget, never exceeding targetBudget, never adding padding or unpriced items).
    const idealAim = preferences.weeklyBudgetPln * 0.97;
    for (let iter = 0; iter < plannedMeals.length * 2; iter++) {
      if (finalBasket.total >= preferences.weeklyBudgetPln * 0.9) break;

      let bestUpgrade: { mealIdx: number; replacement: Recipe; newTotal: number; dist: number } | null = null;

      for (let idx = 0; idx < plannedMeals.length; idx++) {
        const meal = plannedMeals[idx];
        if (preserveMondayShowcase && meal.dayIndex === 0) continue;
        const slotPool = eligibleBySlot[meal.mealType];
        if (!slotPool || slotPool.length <= 1) continue;

        const sameDayIds = new Set(
          plannedMeals
            .filter((m, j) => j !== idx && m.dayIndex === meal.dayIndex)
            .map((m) => m.recipe.id)
        );
        const prevDaySlot = plannedMeals.find(
          (m) => m.dayIndex === meal.dayIndex - 1 && m.mealType === meal.mealType
        )?.recipe.id;
        const nextDaySlot = plannedMeals.find(
          (m) => m.dayIndex === meal.dayIndex + 1 && m.mealType === meal.mealType
        )?.recipe.id;

        for (const cand of slotPool) {
          if (cand.id === meal.recipe.id) continue;
          if (sameDayIds.has(cand.id)) continue;
          if (cand.id === prevDaySlot || cand.id === nextDaySlot) continue;

          const trialMeals = plannedMeals.slice();
          trialMeals[idx] = makePlannedMealRecord(
            weeklyPlanId,
            meal.dayIndex,
            meal.dateStr,
            meal.mealType,
            cand,
            meal.servings,
            currencyCode
          );
          const trialBasket = evaluateRealBasket({
            weeklyPlanId,
            preferences,
            plannedMeals: trialMeals,
            pantryItems,
            subtractPantry,
            regionCode,
            currencyCode,
            hardExcludedTerms,
          });
          if (trialBasket.unpricedNamesEn.length > finalBasket.unpricedNamesEn.length) {
            continue;
          }
          if (
            trialBasket.total > finalBasket.total + 0.01 &&
            trialBasket.total <= preferences.weeklyBudgetPln
          ) {
            const dist = Math.abs(idealAim - trialBasket.total);
            if (
              !bestUpgrade ||
              dist < bestUpgrade.dist - 0.01 ||
              (Math.abs(dist - bestUpgrade.dist) <= 0.01 &&
                trialBasket.total > bestUpgrade.newTotal) ||
              (Math.abs(trialBasket.total - bestUpgrade.newTotal) <= 0.01 &&
                cand.id.localeCompare(bestUpgrade.replacement.id) < 0)
            ) {
              bestUpgrade = { mealIdx: idx, replacement: cand, newTotal: trialBasket.total, dist };
            }
          }
        }
      }

      if (!bestUpgrade) break;
      const target = plannedMeals[bestUpgrade.mealIdx];
      plannedMeals[bestUpgrade.mealIdx] = makePlannedMealRecord(
        weeklyPlanId,
        target.dayIndex,
        target.dateStr,
        target.mealType,
        bestUpgrade.replacement,
        target.servings,
        currencyCode
      );
      finalBasket = evaluateRealBasket({
        weeklyPlanId,
        preferences,
        plannedMeals,
        pantryItems,
        subtractPantry,
        regionCode,
        currencyCode,
        hardExcludedTerms,
      });
    }
  }

  const actualBasketTotalPln = finalBasket.total;
  const maxFallbackOverage = getMaxBudgetFallbackOverage(currencyCode);
  const maxAllowedBudgetPln = Number((preferences.weeklyBudgetPln + maxFallbackOverage).toFixed(2));
  const budgetOveragePln =
    actualBasketTotalPln > preferences.weeklyBudgetPln + 0.01
      ? Number((actualBasketTotalPln - preferences.weeklyBudgetPln).toFixed(2))
      : 0;
  const isBudgetInfeasible =
    plannedMeals.length > 0 && actualBasketTotalPln > maxAllowedBudgetPln + 0.01;

  const formattedBudget = formatMoney(preferences.weeklyBudgetPln, currencyCode);
  const formattedBasket = formatMoney(actualBasketTotalPln, currencyCode);
  const formattedMaxAllowed = formatMoney(maxAllowedBudgetPln, currencyCode);
  const formattedCap = formatMoney(maxFallbackOverage, currencyCode);
  const storeUpper = preferences.preferredSupermarket.toUpperCase();

  if (isBudgetInfeasible) {
    const overStr = formatMoney(budgetOveragePln, currencyCode);
    return {
      meals: [],
      planDurationDays,
      providerUsed,
      hasNoSafeRecipes: false,
      isBudgetInfeasible: true,
      actualBasketTotalPln,
      minimumAchievableBasketPln: actualBasketTotalPln,
      maxAllowedBudgetPln,
      budgetOveragePln,
      hasIncompleteTotal: finalBasket.hasIncompleteTotal,
      unpricedIngredientCount: finalBasket.unpricedNamesEn.length,
      notesPl: `Budżet ${formattedBudget} jest nieosiągalny przy obecnych filtrach: najtańszy kwalifikujący się pełny plan kosztuje ${formattedBasket} (o ${overStr} powyżej budżetu, przekraczając maksymalny zapas +${formattedCap} do ${formattedMaxAllowed}). Twój zapisany plan pozostał bez zmian.`,
      notesEn: `Budget ${formattedBudget} is infeasible under current filters: the most economical eligible full plan costs ${formattedBasket} (${overStr} over target, exceeding the maximum +${formattedCap} fallback cap of ${formattedMaxAllowed}). Your saved plan was preserved unchanged.`,
      notesAz: `${formattedBudget} büdcəsi cari filtrlərlə mümkün deyil: ən sərfəli uyğun tam plan ${formattedBasket} təşkil edir (hədəfdən ${overStr} çox, maksimum +${formattedCap} limiti ${formattedMaxAllowed}-i aşır). Saxlanılmış planınız dəyişdirilmədi.`,
    };
  }

  let infeasibilityPl = '';
  let infeasibilityEn = '';
  let infeasibilityAz = '';

  if (infeasibleMealTypes.size > 0) {
    const missingPl = Array.from(infeasibleMealTypes).map((s) => getSlotLabel(s, 'pl')).join(', ');
    const missingEn = Array.from(infeasibleMealTypes).map((s) => getSlotLabel(s, 'en')).join(', ');
    const missingAz = Array.from(infeasibleMealTypes).map((s) => getSlotLabel(s, 'az')).join(', ');
    infeasibilityPl += ` Brak kwalifikujących się przepisów dla pór: ${missingPl} przy aktywnych ograniczeniach (${constraintsPl || 'wykluczenia'}) — pominięto puste sloty zamiast powtarzać dania z innych pór dnia.`;
    infeasibilityEn += ` No eligible recipes matched ${missingEn} under active constraints (${constraintsEn || 'exclusions'}) — those slots were left open rather than repeating dishes from another meal slot.`;
    infeasibilityAz += ` Aktiv məhdudiyyətlər (${constraintsAz || 'istisnalar'}) altında ${missingAz} üçün uyğun resept tapılmadı — başqa vaxtın yeməyini təkrarlamaq əvəzinə həmin slotlar boş saxlanıldı.`;
  }

  if (limitedVarietyMealTypes.size > 0) {
    const limPl = Array.from(limitedVarietyMealTypes).map((s) => getSlotLabel(s, 'pl')).join(', ');
    const limEn = Array.from(limitedVarietyMealTypes).map((s) => getSlotLabel(s, 'en')).join(', ');
    const limAz = Array.from(limitedVarietyMealTypes).map((s) => getSlotLabel(s, 'az')).join(', ');
    infeasibilityPl += ` Uwaga: tylko 1 przepis spełnia ograniczenia dla pory (${limPl}), więc to danie powtarza się w kolejnych dniach; poluzuj wykluczenia lub kuchnię, aby zwiększyć różnorodność.`;
    infeasibilityEn += ` Note: only 1 eligible recipe satisfied constraints for ${limEn}, so that slot repeats across days; relax an exclusion or cuisine filter for more variety.`;
    infeasibilityAz += ` Qeyd: ${limAz} üçün məhdudiyyətlərə yalnız 1 resept uyğun gəldiyi üçün həmin yemək təkrarlanır; daha çox müxtəliflik üçün istisnaları və ya mətbəx filtrini yumşaldın.`;
  }

  if (budgetOveragePln > 0) {
    const overStr = formatMoney(budgetOveragePln, currencyCode);
    infeasibilityPl += ` Uwaga budżetowa: najtańszy pełny plan zgodny z Twoimi zasadami kosztuje ${formattedBasket} (o ${overStr} powyżej budżetu ${formattedBudget}).`;
    infeasibilityEn += ` Budget notice: the most economical eligible full plan costs ${formattedBasket} (${overStr} over your ${formattedBudget} target) while preserving all dietary, exclusion, and variety rules.`;
    infeasibilityAz += ` Büdcə xəbərdarlığı: bütün pəhriz və müxtəliflik qaydalarına uyğun ən sərfəli tam plan ${formattedBasket} təşkil edir (${formattedBudget} hədəfindən ${overStr} çox).`;
  }

  if (finalBasket.hasIncompleteTotal && finalBasket.unpricedNamesEn.length > 0) {
    const missingListPl = finalBasket.unpricedNamesPl.slice(0, 3).join(', ');
    const missingListEn = finalBasket.unpricedNamesEn.slice(0, 3).join(', ');
    infeasibilityPl += ` Suma koszyka jest niepełna: brak zweryfikowanej ceny dla ${finalBasket.unpricedNamesPl.length} skł. (${missingListPl}).`;
    infeasibilityEn += ` Basket total is incomplete: ${finalBasket.unpricedNamesEn.length} ingredient(s) lack a verified store price (${missingListEn}).`;
    infeasibilityAz += ` Səbət cəmi natamamdır: ${finalBasket.unpricedNamesEn.length} ərzaq üçün təsdiqlənmiş mağaza qiyməti yoxdur (${missingListEn}).`;
  }

  return {
    meals: plannedMeals,
    planDurationDays,
    providerUsed,
    hasNoSafeRecipes: plannedMeals.length === 0,
    ...(noSafeRecipeSlots.length > 0 ? { noSafeRecipeSlots } : {}),
    actualBasketTotalPln,
    budgetOveragePln,
    hasIncompleteTotal: finalBasket.hasIncompleteTotal,
    unpricedIngredientCount: finalBasket.unpricedNamesEn.length,
    notesPl: `Plan ${planDurationDays}-dniowy wygenerowany i zweryfikowany deterministycznie (${plannedMeals.length} posiłków dla ${preferences.householdSize} os., koszyk ${formattedBasket} / budżet ${formattedBudget} w sklepie ${storeUpper}).${infeasibilityPl} Wartości odżywcze mają charakter informacyjny i nie stanowią porady medycznej; zawsze sprawdzaj etykiety produktów pod kątem alergenów.`,
    notesEn: `${planDurationDays}-day plan generated and deterministically validated (${plannedMeals.length} meals for ${preferences.householdSize} people, basket ${formattedBasket} / target ${formattedBudget} at ${storeUpper}).${infeasibilityEn} Nutritional estimates are for informational planning only and not medical advice; always verify physical product labels for allergens.`,
    notesAz: `${planDurationDays} günlük yemək planı yaradıldı və deterministik olaraq yoxlanıldı (${preferences.householdSize} nəfər üçün ${plannedMeals.length} yemək, səbət ${formattedBasket} / büdcə ${formattedBudget}, ${storeUpper}).${infeasibilityAz} Qida dəyərləri yalnız məlumat xarakteri daşıyır və tibbi məsləhət deyil; allergenlər üçün həmişə məhsul etiketlərini yoxlayın.`,
  };
}
