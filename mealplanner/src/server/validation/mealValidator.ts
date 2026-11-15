import { Recipe, UserPreferences, DietaryOption } from '../../shared/types';

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

const ANIMAL_MEAT_CANONICALS = new Set([
  'chicken_breast',
  'pork_loin',
  'beef',
  'turkey',
  'ham',
  'bacon',
]);

const FISH_CANONICALS = new Set([
  'salmon',
  'cod',
  'tuna',
  'trout',
]);

const DAIRY_EGGS_CANONICALS = new Set([
  'milk',
  'greek_yogurt',
  'cottage_cheese',
  'cheese',
  'butter',
  'eggs',
]);

const GLUTEN_CANONICALS = new Set([
  'pasta',
  'wholegrain_bread',
  'wheat_flour',
  'oat_flakes', // standard oats unless certified GF
]);

const LACTOSE_CANONICALS = new Set([
  'milk',
  'greek_yogurt',
  'cottage_cheese',
  'cheese',
]);

const HIGH_CARB_KETO_EXCLUDED_CANONICALS = new Set([
  'rice',
  'pasta',
  'wholegrain_bread',
  'oat_flakes',
  'potato',
  'banana',
  'red_lentils',
]);

/**
 * Normalizes a user's kitchen equipment list (whether in English, Polish, Azerbaijani, or wizard IDs)
 * into a canonical set of appliance keys:
 * 'oven', 'hob', 'air_fryer', 'microwave', 'toaster', 'kettle', 'blender',
 * 'food_processor', 'rice_cooker', 'slow_cooker', 'grill', 'other'
 */
export function normalizeUserEquipmentSet(rawEquipment: string[] | undefined): Set<string> {
  const result = new Set<string>();
  for (const item of rawEquipment || []) {
    const s = item.trim().toLowerCase();
    if (!s) continue;
    result.add(s);
    if (s.includes('oven') || s.includes('piekarnik') || s.includes('soba')) {
      result.add('oven');
    }
    if (
      s.includes('hob') ||
      s.includes('stove') ||
      s.includes('patelnia') ||
      s.includes('garnek') ||
      s.includes('kuchenka') ||
      s.includes('tava') ||
      s.includes('qazan') ||
      s.includes('plite') ||
      s.includes('plitə')
    ) {
      result.add('hob');
    }
    if (s.includes('air_fryer') || s.includes('air fryer') || s.includes('frytkownica') || s.includes('aerogril')) {
      result.add('air_fryer');
    }
    if (s.includes('microwave') || s.includes('mikrofal') || s.includes('mikrodalğalı')) {
      result.add('microwave');
    }
    if (s.includes('toaster') || s.includes('toster')) {
      result.add('toaster');
    }
    if (s.includes('kettle') || s.includes('czajnik') || s.includes('çaydan')) {
      result.add('kettle');
    }
    if (s.includes('blender') || s.includes('mikser')) {
      result.add('blender');
    }
    if (s.includes('food_processor') || s.includes('food processor') || s.includes('robot kuchenny') || s.includes('mətbəx kombaynı')) {
      result.add('food_processor');
    }
    if (s.includes('rice_cooker') || s.includes('rice cooker') || s.includes('ryżowar') || s.includes('düyübişirən')) {
      result.add('rice_cooker');
    }
    if (s.includes('slow_cooker') || s.includes('slow cooker') || s.includes('wolnowar') || s.includes('multivarka')) {
      result.add('slow_cooker');
    }
    if (s.includes('grill') || s.includes('qril')) {
      result.add('grill');
    }
  }
  return result;
}

/**
 * Checks whether a recipe's required equipment list can be realistically prepared
 * using the user's available kitchen equipment.
 */
export function canPrepareWithEquipment(
  recipeEquipment: string[] | undefined,
  userEquipment: string[] | undefined
): { supported: boolean; missing: string[] } {
  if (!userEquipment || userEquipment.length === 0) {
    return { supported: true, missing: [] };
  }
  if (!recipeEquipment || recipeEquipment.length === 0) {
    return { supported: true, missing: [] };
  }

  const userSet = normalizeUserEquipmentSet(userEquipment);
  const missing: string[] = [];

  for (const reqRaw of recipeEquipment) {
    const req = reqRaw.trim().toLowerCase();
    // Bowls / knives / basic utensils need no powered appliance
    if (!req || req.includes('miska') || req.includes('bowl') || req.includes('deska') || req.includes('nóż')) {
      continue;
    }

    // Combined "Patelnia grillowa / Piekarnik" (Grill pan OR Oven)
    if ((req.includes('patelnia') || req.includes('grill')) && req.includes('piekarnik')) {
      if (userSet.has('hob') || userSet.has('oven') || userSet.has('grill') || userSet.has('air_fryer')) {
        continue;
      }
      missing.push(reqRaw);
      continue;
    }

    // Oven / Piekarnik requirement
    if (req.includes('piekarnik') || req.includes('oven') || req.includes('soba')) {
      if (userSet.has('oven') || userSet.has('air_fryer')) {
        continue;
      }
      missing.push(reqRaw);
      continue;
    }

    // Skillet / Frying pan / Patelnia / Tava
    if (req.includes('patelnia') || req.includes('tava') || req.includes('skillet') || req.includes('pan')) {
      if (userSet.has('hob') || userSet.has('grill') || userSet.has('air_fryer') || userSet.has('slow_cooker')) {
        continue;
      }
      missing.push(reqRaw);
      continue;
    }

    // Pot / Garnek / Qazan / Hob
    if (req.includes('garnek') || req.includes('qazan') || req.includes('pot') || req.includes('hob') || req.includes('stove')) {
      if (
        userSet.has('hob') ||
        userSet.has('slow_cooker') ||
        userSet.has('rice_cooker') ||
        userSet.has('microwave')
      ) {
        continue;
      }
      missing.push(reqRaw);
      continue;
    }

    // Blender / Food processor
    if (req.includes('blender')) {
      if (userSet.has('blender') || userSet.has('food_processor')) {
        continue;
      }
      missing.push(reqRaw);
      continue;
    }
    if (req.includes('food_processor') || req.includes('food processor') || req.includes('robot')) {
      if (userSet.has('food_processor') || userSet.has('blender')) {
        continue;
      }
      missing.push(reqRaw);
      continue;
    }

    // Air fryer
    if (req.includes('air_fryer') || req.includes('air fryer')) {
      if (userSet.has('air_fryer') || userSet.has('oven')) {
        continue;
      }
      missing.push(reqRaw);
      continue;
    }

    // Grill
    if (req.includes('grill') || req.includes('qril')) {
      if (userSet.has('grill') || userSet.has('hob') || userSet.has('oven') || userSet.has('air_fryer')) {
        continue;
      }
      missing.push(reqRaw);
      continue;
    }

    // Direct match fallback
    if (!userSet.has(req)) {
      missing.push(reqRaw);
    }
  }

  return {
    supported: missing.length === 0,
    missing,
  };
}

/**
 * Deterministically validates a single Recipe structure, measurements, user dietary/allergy rules,
 * and optional kitchen equipment availability.
 */
export function validateRecipeForUser(
  recipe: Recipe,
  preferences: Pick<
    UserPreferences,
    'dietaryRestrictions' | 'customRestrictions' | 'allergies' | 'excludedIngredients' | 'preferredPrepTimeMin'
  > & {
    kitchenEquipment?: string[];
  },
  options?: { enforcePrepTime?: boolean; enforceEquipment?: boolean }
): ValidationResult {
  const violations: string[] = [];

  // 1. Required fields & schema validation
  if (!recipe.titlePl?.trim() || !recipe.titleEn?.trim()) {
    violations.push('MISSING_TITLE: Recipe must have both Polish and English titles.');
  }
  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    violations.push('EMPTY_INGREDIENTS: Recipe must include at least one ingredient.');
  }
  if (!recipe.instructionsPl || recipe.instructionsPl.length === 0) {
    violations.push('EMPTY_INSTRUCTIONS: Recipe must include cooking instructions.');
  }
  if (!Number.isFinite(recipe.baseServings) || recipe.baseServings <= 0 || recipe.baseServings > 20) {
    violations.push(`INVALID_SERVINGS: Serving size (${recipe.baseServings}) must be between 1 and 20.`);
  }
  if (!Number.isFinite(recipe.totalTimeMin) || recipe.totalTimeMin <= 0 || recipe.totalTimeMin > 480) {
    violations.push(`INVALID_TIME: Total cooking time (${recipe.totalTimeMin} min) is invalid.`);
  }

  // 2. Check impossible measurements
  for (const ing of recipe.ingredients || []) {
    if (ing.unit !== 'to_taste') {
      if (!Number.isFinite(ing.amount) || ing.amount <= 0) {
        violations.push(`IMPOSSIBLE_MEASUREMENT: Ingredient ${ing.canonicalIngredient} has non-positive amount (${ing.amount}).`);
      }
      if (ing.normalizedBaseUnit === 'g' && ing.normalizedBaseAmount > 10000) {
        violations.push(`IMPOSSIBLE_MEASUREMENT: Ingredient ${ing.canonicalIngredient} exceeds 10 kg in a single recipe.`);
      }
      if (ing.normalizedBaseUnit === 'ml' && ing.normalizedBaseAmount > 10000) {
        violations.push(`IMPOSSIBLE_MEASUREMENT: Ingredient ${ing.canonicalIngredient} exceeds 10 L in a single recipe.`);
      }
    }
  }

  // 3. Deterministic Allergy Validation
  const lowerAllergies = (preferences.allergies || []).map((a) => a.trim().toLowerCase()).filter(Boolean);
  for (const allergy of lowerAllergies) {
    const recipeAllergens = (recipe.allergens || []).map((a) => a.trim().toLowerCase());
    if (recipeAllergens.includes(allergy)) {
      violations.push(`ALLERGY_VIOLATION: Recipe contains declared allergen '${allergy}'.`);
    }
    for (const ing of recipe.ingredients || []) {
      const hay = `${ing.canonicalIngredient} ${ing.namePl} ${ing.nameEn} ${ing.nameAz || ''}`.toLowerCase();
      if (hay.includes(allergy)) {
        violations.push(`ALLERGY_VIOLATION: Ingredient '${ing.nameEn}' matches user allergy '${allergy}'.`);
      }
      if ((allergy === 'milk' || allergy === 'dairy' || allergy === 'mleko' || allergy === 'laktoza' || allergy === 'süd' || allergy === 'sud' || allergy === 'qatıq') && LACTOSE_CANONICALS.has(ing.canonicalIngredient)) {
        violations.push(`ALLERGY_VIOLATION: Ingredient '${ing.nameEn}' contains dairy/lactose.`);
      }
      if ((allergy === 'gluten' || allergy === 'pszenica' || allergy === 'qlüten') && GLUTEN_CANONICALS.has(ing.canonicalIngredient)) {
        violations.push(`ALLERGY_VIOLATION: Ingredient '${ing.nameEn}' contains gluten.`);
      }
      if ((allergy === 'eggs' || allergy === 'egg' || allergy === 'jajka' || allergy === 'jaja' || allergy === 'yumurta') && ing.canonicalIngredient === 'eggs') {
        violations.push(`ALLERGY_VIOLATION: Ingredient '${ing.nameEn}' contains eggs.`);
      }
      if ((allergy === 'fish' || allergy === 'ryby' || allergy === 'balıq' || allergy === 'baliq') && FISH_CANONICALS.has(ing.canonicalIngredient)) {
        violations.push(`ALLERGY_VIOLATION: Ingredient '${ing.nameEn}' contains fish.`);
      }
      if ((allergy === 'soy' || allergy === 'soja' || allergy === 'soya') && ing.canonicalIngredient === 'tofu') {
        violations.push(`ALLERGY_VIOLATION: Ingredient '${ing.nameEn}' contains soy.`);
      }
    }
  }

  // 4. Deterministic Excluded Ingredients & Custom Restrictions Validation
  const exclusions = [
    ...(preferences.excludedIngredients || []),
    ...(preferences.customRestrictions || []),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  for (const excl of exclusions) {
    for (const ing of recipe.ingredients || []) {
      const hay = `${ing.canonicalIngredient} ${ing.namePl} ${ing.nameEn} ${ing.nameAz || ''}`.toLowerCase();
      if (hay.includes(excl)) {
        violations.push(`EXCLUDED_INGREDIENT: Recipe uses excluded ingredient '${ing.nameEn}' (matched '${excl}').`);
      }
    }
  }

  // 5. Deterministic Dietary Restriction Checks
  const diets = new Set<DietaryOption>(preferences.dietaryRestrictions || []);
  if (diets.has('vegetarian')) {
    for (const ing of recipe.ingredients || []) {
      if (ANIMAL_MEAT_CANONICALS.has(ing.canonicalIngredient) || FISH_CANONICALS.has(ing.canonicalIngredient)) {
        violations.push(`DIET_VIOLATION: Vegetarian diet excludes meat/fish ingredient '${ing.nameEn}'.`);
      }
    }
  }
  if (diets.has('vegan')) {
    for (const ing of recipe.ingredients || []) {
      if (
        ANIMAL_MEAT_CANONICALS.has(ing.canonicalIngredient) ||
        FISH_CANONICALS.has(ing.canonicalIngredient) ||
        DAIRY_EGGS_CANONICALS.has(ing.canonicalIngredient)
      ) {
        violations.push(`DIET_VIOLATION: Vegan diet excludes animal product '${ing.nameEn}'.`);
      }
    }
  }
  if (diets.has('pescatarian')) {
    for (const ing of recipe.ingredients || []) {
      if (ANIMAL_MEAT_CANONICALS.has(ing.canonicalIngredient)) {
        violations.push(`DIET_VIOLATION: Pescatarian diet excludes land meat '${ing.nameEn}'.`);
      }
    }
  }
  if (diets.has('gluten_free')) {
    if ((recipe.allergens || []).map((a) => a.toLowerCase()).includes('gluten')) {
      violations.push('DIET_VIOLATION: Gluten-free diet excludes recipes containing gluten.');
    }
    for (const ing of recipe.ingredients || []) {
      if (GLUTEN_CANONICALS.has(ing.canonicalIngredient)) {
        violations.push(`DIET_VIOLATION: Gluten-free diet excludes '${ing.nameEn}'.`);
      }
    }
  }
  if (diets.has('lactose_free')) {
    for (const ing of recipe.ingredients || []) {
      if (LACTOSE_CANONICALS.has(ing.canonicalIngredient)) {
        violations.push(`DIET_VIOLATION: Lactose-free diet excludes dairy ingredient '${ing.nameEn}'.`);
      }
    }
  }
  if (diets.has('keto')) {
    for (const ing of recipe.ingredients || []) {
      if (HIGH_CARB_KETO_EXCLUDED_CANONICALS.has(ing.canonicalIngredient)) {
        violations.push(`DIET_VIOLATION: Keto diet excludes high-carbohydrate ingredient '${ing.nameEn}'.`);
      }
    }
  }

  // 6. Optional Kitchen Equipment Check
  if (options?.enforceEquipment && preferences.kitchenEquipment && preferences.kitchenEquipment.length > 0) {
    const equipCheck = canPrepareWithEquipment(recipe.equipment, preferences.kitchenEquipment);
    if (!equipCheck.supported) {
      violations.push(
        `EQUIPMENT_VIOLATION: Recipe requires kitchen equipment [${equipCheck.missing.join(', ')}] not available in user's kitchen.`
      );
    }
  }

  // 7. Optional preparation time check
  if (
    options?.enforcePrepTime &&
    preferences.preferredPrepTimeMin > 0 &&
    recipe.totalTimeMin > preferences.preferredPrepTimeMin
  ) {
    violations.push(
      `PREP_TIME_EXCEEDED: Recipe takes ${recipe.totalTimeMin} min, exceeding limit of ${preferences.preferredPrepTimeMin} min.`
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
