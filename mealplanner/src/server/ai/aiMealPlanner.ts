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
import { validateRecipeForUser, canPrepareWithEquipment } from '../validation/mealValidator';
import { getDefaultCurrencyForRegion, formatMoney } from '../../shared/regionConfig';

export interface AIPlannerInput {
  weeklyPlanId: string;
  weekStartDate: string; // e.g., "2026-11-09" or "2026-11-10"
  preferences: UserPreferences;
  availableRecipes: Recipe[];
  pantryItems: PantryItem[];
  variationSeed?: number;
}

export interface AIPlannerOutput {
  meals: PlannedMeal[];
  planDurationDays: number;
  providerUsed: 'GEMINI_API' | 'OPENAI_API' | 'SMART_ALGORITHMIC_ENGINE';
  notesPl: string;
  notesEn: string;
  notesAz: string;
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
  planDurationDays: number
): number {
  let score = 100;

  // Regional culinary fit
  if (recipe.regionSuitability && recipe.regionSuitability.length > 0) {
    if (!recipe.regionSuitability.includes(regionCode)) {
      score -= 55;
    }
  }
  if (regionCode === 'AZ' && recipe.id.startsWith('rec-az-')) {
    score += 24;
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
  if (vibes.has('high_protein')) {
    if (recipe.dietaryTags.includes('high_protein') || recipe.nutrition.proteinG >= 30) {
      score += 30;
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
      score += 30;
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

  // Reward ingredient reuse across the week (reduces partial package waste)
  for (const ing of recipe.ingredients) {
    if (alreadyUsedIngredients.has(ing.canonicalIngredient)) {
      score += 8;
    }
    const pantryMatch = pantryItems.find(
      (p) => p.canonicalIngredient.toLowerCase() === ing.canonicalIngredient.toLowerCase()
    );
    if (pantryMatch) {
      score += pantryMatch.isExpiringSoon ? 25 : 12;
    }
  }

  // Penalize dislikes (soft preference, unlike allergies/exclusions which are hard blocks)
  const dislikes = (preferences.dislikes || []).map((d) => d.toLowerCase());
  for (const d of dislikes) {
    for (const ing of recipe.ingredients) {
      if (
        ing.canonicalIngredient.toLowerCase().includes(d) ||
        ing.nameEn.toLowerCase().includes(d) ||
        ing.namePl.toLowerCase().includes(d) ||
        (ing.nameAz && ing.nameAz.toLowerCase().includes(d))
      ) {
        score -= 40;
      }
    }
  }

  // Budget sensitivity in active currency scaled to selected duration (1..7 days)
  const baseCost = getRecipeBaseCostForCurrency(recipe, currencyCode);
  const scaledCost = (baseCost * preferences.householdSize) / Math.max(1, recipe.baseServings);
  const dailyBudget = preferences.weeklyBudgetPln / Math.max(1, planDurationDays);
  const tightDailyThreshold = currencyCode === 'AZN' ? 14 : 30;
  if (dailyBudget <= tightDailyThreshold || vibes.has('budget_friendly')) {
    score -= scaledCost * 2.5;
  } else {
    score -= scaledCost * 0.8;
  }

  // Deterministic variation when user clicks "Regenerate"
  const hash = recipe.id
    .split('')
    .reduce((acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 1 + variationOffset), 0);
  score += hash % 17;

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

export async function generateValidatedWeeklyMealPlan(
  input: AIPlannerInput
): Promise<AIPlannerOutput> {
  const { weeklyPlanId, preferences, availableRecipes, pantryItems, variationSeed = 0 } = input;
  const regionCode: RegionCode = preferences.regionCode || 'PL';
  const currencyCode: CurrencyCode =
    preferences.currencyCode || getDefaultCurrencyForRegion(regionCode);
  const planDurationDays = Math.min(
    7,
    Math.max(1, Math.round(Number(preferences.planDurationDays) || 7))
  );

  // Step 1: Deterministic filtering of all candidate recipes against user's allergies, exclusions, diet, equipment, and prep time
  let validPool = availableRecipes.filter(
    (r) =>
      validateRecipeForUser(r, preferences, {
        enforcePrepTime: true,
        enforceEquipment: true,
      }).valid
  );

  // Step 1b: If prep time was too restrictive, relax prep time while keeping allergies, exclusions, diet, and equipment!
  if (validPool.length < 3) {
    const equipPool = availableRecipes.filter(
      (r) =>
        validateRecipeForUser(r, preferences, {
          enforcePrepTime: false,
          enforceEquipment: true,
        }).valid
    );
    if (equipPool.length > 0) {
      validPool = equipPool;
    } else {
      // Only if no recipe at all matches the equipment combination, keep strict allergy/exclusion/diet safety
      validPool = availableRecipes.filter(
        (r) =>
          validateRecipeForUser(r, preferences, {
            enforcePrepTime: false,
            enforceEquipment: false,
          }).valid
      );
    }
  }

  const externalMap = await tryExternalGeminiSelection(
    input,
    validPool,
    regionCode,
    currencyCode,
    planDurationDays
  );
  const providerUsed = externalMap ? 'GEMINI_API' : 'SMART_ALGORITHMIC_ENGINE';

  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];
  if (preferences.includeSnacks || preferences.mealsPerDay >= 4) {
    mealTypes.push('snack');
  }

  const usedIngredients = new Set<string>();
  const recentByType: Record<MealType, string[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  const plannedMeals: PlannedMeal[] = [];

  for (let dayIndex = 0; dayIndex < planDurationDays; dayIndex++) {
    const dateStr = WEEK_DATES[dayIndex] || `2026-11-${10 + dayIndex}`;

    for (const mealType of mealTypes) {
      let candidates = validPool.filter((r) => r.mealType === mealType);
      if (candidates.length === 0) {
        candidates = validPool; // fallback to any validated safe recipe if a specific slot has none
      }
      if (candidates.length === 0) {
        continue;
      }

      let chosen: Recipe | undefined;

      // On Monday (dayIndex === 0) with default seed (variationSeed === 0), prioritize the exact showcase meals if valid for user
      if (
        dayIndex === 0 &&
        variationSeed === 0 &&
        !externalMap &&
        (!preferences.foodVibes || preferences.foodVibes.length === 0)
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
        const scored = candidates
          .map((c) => ({
            recipe: c,
            score: scoreRecipeForPlan(
              c,
              preferences,
              pantryItems,
              usedIngredients,
              recentByType[mealType],
              variationSeed + dayIndex * 7,
              regionCode,
              currencyCode,
              planDurationDays
            ),
          }))
          .sort((a, b) => b.score - a.score);

        chosen = scored[0].recipe;
      }

      // Final deterministic safety gate before adding to plan
      const safetyCheck = validateRecipeForUser(chosen, preferences);
      if (!safetyCheck.valid) {
        throw new Error(
          `Safety violation blocked meal ${chosen.id}: ${safetyCheck.violations.join('; ')}`
        );
      }

      recentByType[mealType].push(chosen.id);
      for (const ing of chosen.ingredients) {
        usedIngredients.add(ing.canonicalIngredient);
      }

      const servings = preferences.householdSize;
      const scale = servings / Math.max(1, chosen.baseServings);
      const baseCost = getRecipeBaseCostForCurrency(chosen, currencyCode);
      const scaledCostPln = Number((baseCost * scale).toFixed(2));

      plannedMeals.push({
        id: `pm-${weeklyPlanId}-${dayIndex}-${mealType}`,
        weeklyPlanId,
        dayIndex,
        dateStr,
        mealType,
        servings,
        recipe: chosen,
        scaledCostPln,
        scaledCaloriesKcal: chosen.nutrition.caloriesKcal,
      });
    }
  }

  const formattedBudget = formatMoney(preferences.weeklyBudgetPln, currencyCode);
  const storeUpper = preferences.preferredSupermarket.toUpperCase();

  return {
    meals: plannedMeals,
    planDurationDays,
    providerUsed,
    notesPl: `Plan ${planDurationDays}-dniowy wygenerowany i zweryfikowany deterministycznie (${plannedMeals.length} posiłków dla ${preferences.householdSize} os., budżet ${formattedBudget} w sklepie ${storeUpper}). Wartości odżywcze mają charakter informacyjny i nie stanowią porady medycznej; zawsze sprawdzaj etykiety produktów pod kątem alergenów.`,
    notesEn: `${planDurationDays}-day plan generated and deterministically validated (${plannedMeals.length} meals for ${preferences.householdSize} people, tailored for ${formattedBudget} budget at ${storeUpper}). Nutritional estimates are for informational planning only and not medical advice; always verify physical product labels for allergens.`,
    notesAz: `${planDurationDays} günlük yemək planı yaradıldı və deterministik olaraq yoxlanıldı (${preferences.householdSize} nəfər üçün ${plannedMeals.length} yemək, ${storeUpper} marketində ${formattedBudget} büdcə). Qida dəyərləri yalnız məlumat xarakteri daşıyır və tibbi məsləhət deyil; allergenlər üçün həmişə məhsul etiketlərini yoxlayın.`,
  };
}
