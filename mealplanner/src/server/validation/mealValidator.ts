import { Recipe, UserPreferences, DietaryOption, PlannedMeal, MealType } from '../../shared/types';
import { normalizeCuisinePreference } from '../../shared/cuisineConfig';

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
  'pearl_barley', // barley contains gluten (hordein)
]);

const LACTOSE_CANONICALS = new Set([
  'milk',
  'greek_yogurt',
  'cottage_cheese',
  'cheese',
]);

const HIGH_CARB_KETO_EXCLUDED_CANONICALS = new Set([
  'rice',
  'risotto_rice',
  'pasta',
  'wholegrain_bread',
  'oat_flakes',
  'pearl_barley',
  'potato',
  'banana',
  'red_lentils',
]);

function foldDiacritics(input: string): string {
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
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Known compound & alias families for deterministic hard exclusion enforcement
 * across allergies, dislikes, excludedIngredients, and customRestrictions.
 */
const EXCLUSION_FAMILIES: Array<{
  family: string;
  triggers: string[];
  canonicals: string[];
  compoundKeywords: string[];
}> = [
  {
    family: 'onion',
    triggers: [
      'onion',
      'onions',
      'cebula',
      'cebuli',
      'cebule',
      'cebulka',
      'cebulowy',
      'cebulowa',
      'dymka',
      'szczypiorek',
      'szczypior',
      'szalotka',
      'shallot',
      'scallion',
      'spring onion',
      'red onion',
      'yellow onion',
      'chives',
      'por',
      'leek',
      'sogan',
      'onion powder',
    ],
    canonicals: ['onion', 'red_onion', 'spring_onion', 'shallot', 'chives', 'leek'],
    compoundKeywords: [
      'onion',
      'cebula',
      'cebuli',
      'cebule',
      'cebulka',
      'cebulow',
      'dymka',
      'szczypiorek',
      'szalotka',
      'shallot',
      'scallion',
      'chives',
      'sogan',
    ],
  },
  {
    family: 'milk',
    triggers: ['milk', 'dairy', 'mleko', 'nabial', 'laktoza', 'lactose', 'sud', 'qatiq', 'kesmik'],
    canonicals: ['milk', 'greek_yogurt', 'cottage_cheese', 'cheese', 'butter', 'cream'],
    compoundKeywords: [
      'milk',
      'mleko',
      'dairy',
      'nabial',
      'yogurt',
      'jogurt',
      'skyr',
      'cottage cheese',
      'twarog',
      'cheese',
      'ser ',
      'serek',
      'parmesan',
      'parmezan',
      'mozzarella',
      'feta',
      'ricotta',
      'mascarpone',
      'butter',
      'maslo',
      'cream',
      'smietana',
      'pesto',
      'whey',
      'serwatka',
      'casein',
      'kazeina',
      'kefir',
      'maslanka',
      'qatiq',
      'kesmik',
    ],
  },
  {
    family: 'gluten',
    triggers: ['gluten', 'wheat', 'pszenica', 'maka', 'qluten'],
    canonicals: ['pasta', 'wholegrain_bread', 'wheat_flour', 'oat_flakes', 'pearl_barley'],
    compoundKeywords: [
      'gluten',
      'wheat',
      'pszenic',
      'pasta',
      'makaron',
      'bread',
      'chleb',
      'bulka',
      'breadcrumbs',
      'bulka tarta',
      'couscous',
      'kuskus',
      'flour',
      'maka',
      'oat',
      'owsian',
      'yulaf',
      'pierogi',
      'tortilla',
      'lavash',
      'lavas',
      'barley',
      'pearl barley',
      'jeczmien',
      'kasza jeczmienna',
      'perlowa',
      'peczak',
      'arpa yarmasi',
      'rye',
      'zyto',
      'zytni',
    ],
  },
  {
    family: 'eggs',
    triggers: ['egg', 'eggs', 'jaja', 'jajka', 'jajko', 'yumurta'],
    canonicals: ['eggs'],
    compoundKeywords: [
      'egg',
      'jaja',
      'jajka',
      'jajko',
      'jajeczn',
      'mayonnaise',
      'majonez',
      'omlet',
      'omelette',
      'yumurta',
    ],
  },
  {
    family: 'soy',
    triggers: ['soy', 'soja', 'soya', 'tofu'],
    canonicals: ['tofu', 'tofu_pesto', 'soy_sauce'],
    compoundKeywords: ['soy', 'soja', 'soya', 'tofu', 'edamame', 'tempeh', 'miso', 'sos sojowy', 'soy sauce'],
  },
  {
    family: 'nuts',
    triggers: ['nut', 'nuts', 'peanut', 'peanuts', 'orzech', 'orzechy', 'orzeszki', 'migdal', 'almond', 'cashew', 'hazelnut', 'pistachio', 'qoz', 'findiq'],
    canonicals: ['nuts', 'peanuts', 'almonds', 'walnuts', 'cashews', 'hazelnuts', 'pistachios'],
    compoundKeywords: [
      'nut',
      'peanut',
      'orzech',
      'orzeszk',
      'migdal',
      'almond',
      'walnut',
      'hazelnut',
      'laskow',
      'cashew',
      'nerkowc',
      'pistachio',
      'pistacj',
      'pecan',
      'pesto',
      'maslo orzechowe',
      'peanut butter',
      'qoz',
      'findiq',
      'badam',
    ],
  },
  {
    family: 'fish',
    triggers: ['fish', 'ryba', 'ryby', 'seafood', 'baliq', 'salmon', 'losos'],
    canonicals: ['salmon', 'cod', 'tuna', 'trout'],
    compoundKeywords: [
      'fish',
      'ryb',
      'salmon',
      'losos',
      'cod',
      'dorsz',
      'tuna',
      'tunczyk',
      'trout',
      'pstrag',
      'forel',
      'anchovy',
      'anchois',
      'fish sauce',
      'sos rybny',
      'qizilbaliq',
    ],
  },
  {
    family: 'garlic',
    triggers: ['garlic', 'czosnek', 'czosnku', 'sarimsaq'],
    canonicals: ['garlic'],
    compoundKeywords: ['garlic', 'czosnek', 'czosnk', 'sarimsaq'],
  },
];

function wordOrPhraseMatch(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (haystack === needle) return true;
  if (needle.includes(' ')) {
    return haystack.includes(needle);
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s,.;()/\\-_])${escaped}(?=$|[\\s,.;()/\\-_])`, 'i').test(haystack);
}

/**
 * Checks whether an ingredient (or shopping item) matches a user's hard exclusion term
 * (allergy, dislike, excluded ingredient, or custom restriction), including known compounds
 * and onion/cebula aliases.
 */
export function matchIngredientAgainstExclusionTerm(
  ingredient: {
    canonicalIngredient: string;
    namePl?: string;
    nameEn?: string;
    nameAz?: string;
  },
  rawTerm: string
): { matched: boolean; family?: string; reason?: string } {
  const term = foldDiacritics(rawTerm);
  if (!term) return { matched: false };

  const canonical = foldDiacritics(ingredient.canonicalIngredient).replace(/_/g, ' ');
  const rawCanonical = foldDiacritics(ingredient.canonicalIngredient);
  const hay = foldDiacritics(
    `${canonical} ${ingredient.namePl || ''} ${ingredient.nameEn || ''} ${ingredient.nameAz || ''}`
  );

  // 1. Direct normalized match on canonical or localized names
  if (
    rawCanonical === term.replace(/\s+/g, '_') ||
    wordOrPhraseMatch(hay, term) ||
    (term.length >= 4 && hay.includes(term))
  ) {
    return { matched: true, reason: `direct match '${rawTerm}'` };
  }

  // 2. Family / compound / alias expansion (e.g. onion/cebula, milk/pesto/parmesan, gluten/pasta, soy/tofu)
  for (const fam of EXCLUSION_FAMILIES) {
    const termTriggersFamily = fam.triggers.some(
      (tr) => tr === term || (term.length >= 3 && (tr.includes(term) || term.includes(tr)))
    );
    if (!termTriggersFamily) continue;

    if (fam.canonicals.includes(rawCanonical)) {
      return {
        matched: true,
        family: fam.family,
        reason: `family '${fam.family}' canonical match for '${rawTerm}'`,
      };
    }
    for (const kw of fam.compoundKeywords) {
      if (kw.endsWith(' ') ? hay.includes(kw) : wordOrPhraseMatch(hay, kw) || (kw.length >= 5 && hay.includes(kw))) {
        return {
          matched: true,
          family: fam.family,
          reason: `compound/alias '${kw}' in family '${fam.family}' for '${rawTerm}'`,
        };
      }
    }
  }

  return { matched: false };
}

/**
 * Collects all hard-excluded user terms (allergies + dislikes + excludedIngredients + customRestrictions).
 */
export function collectHardExclusionTerms(
  preferences: Pick<
    UserPreferences,
    'allergies' | 'excludedIngredients' | 'customRestrictions'
  > & { dislikes?: string[] }
): string[] {
  return Array.from(
    new Set(
      [
        ...(preferences.allergies || []),
        ...(preferences.dislikes || []),
        ...(preferences.excludedIngredients || []),
        ...(preferences.customRestrictions || []),
      ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
    )
  );
}

/**
 * Returns true if an ingredient or shopping item is hard-excluded by the user's allergies,
 * dislikes, excluded ingredients, or custom restrictions.
 */
export function isIngredientHardExcluded(
  ingredient: {
    canonicalIngredient: string;
    namePl?: string;
    nameEn?: string;
    nameAz?: string;
  },
  hardExclusionTerms: string[]
): { excluded: boolean; matchedTerm?: string; reason?: string } {
  for (const term of hardExclusionTerms) {
    const res = matchIngredientAgainstExclusionTerm(ingredient, term);
    if (res.matched) {
      return { excluded: true, matchedTerm: term, reason: res.reason };
    }
  }
  return { excluded: false };
}

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

    // Toaster / Toster (also easily made on a dry skillet/hob or oven)
    if (req.includes('toster') || req.includes('toaster')) {
      if (userSet.has('toaster') || userSet.has('hob') || userSet.has('oven') || userSet.has('grill')) {
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
    dislikes?: string[];
    kitchenEquipment?: string[];
    preferredCuisine?: UserPreferences['preferredCuisine'];
  },
  options?: { enforcePrepTime?: boolean; enforceEquipment?: boolean; enforceCuisine?: boolean }
): ValidationResult {
  const violations: string[] = [];

  // 0. Strict Cuisine Filter (independent of region, store, language, and currency)
  const enforceCuisine = options?.enforceCuisine !== false;
  const preferredCuisine = normalizeCuisinePreference(preferences.preferredCuisine);
  if (enforceCuisine && preferredCuisine !== 'any') {
    if (recipe.cuisine !== preferredCuisine) {
      violations.push(
        `CUISINE_MISMATCH: Recipe cuisine '${recipe.cuisine || 'unspecified'}' does not match selected cuisine '${preferredCuisine}'.`
      );
    }
  }

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

  // 3. Deterministic Allergy Validation (including known compounds & aliases)
  const lowerAllergies = (preferences.allergies || []).map((a) => a.trim()).filter(Boolean);
  const recipeTitleHay = foldDiacritics(
    `${recipe.titlePl || ''} ${recipe.titleEn || ''} ${recipe.titleAz || ''} ${recipe.descriptionPl || ''} ${recipe.descriptionEn || ''}`
  );
  for (const allergy of lowerAllergies) {
    const normAllergy = foldDiacritics(allergy);
    const recipeAllergens = (recipe.allergens || []).map((a) => foldDiacritics(a));
    if (recipeAllergens.includes(normAllergy)) {
      violations.push(`ALLERGY_VIOLATION: Recipe contains declared allergen '${allergy}'.`);
    }
    // Check declared recipe allergens against compound families too (e.g. 'dairy'/'mleko' -> 'milk')
    for (const fam of EXCLUSION_FAMILIES) {
      if (fam.triggers.includes(normAllergy) && recipeAllergens.includes(fam.family)) {
        violations.push(`ALLERGY_VIOLATION: Recipe contains declared allergen family '${fam.family}' matching '${allergy}'.`);
      }
    }
    for (const ing of recipe.ingredients || []) {
      const m = matchIngredientAgainstExclusionTerm(ing, allergy);
      if (m.matched) {
        violations.push(
          `ALLERGY_VIOLATION: Ingredient '${ing.nameEn}' matches user allergy '${allergy}' (${m.reason}).`
        );
      }
    }
    // Also guard against known compound dishes mentioned in recipe title (e.g., pesto/mayo)
    for (const fam of EXCLUSION_FAMILIES) {
      if (fam.triggers.includes(normAllergy)) {
        for (const compound of ['pesto', 'parmesan', 'parmezan', 'majonez', 'mayonnaise']) {
          if (fam.compoundKeywords.includes(compound) && wordOrPhraseMatch(recipeTitleHay, compound)) {
            violations.push(
              `ALLERGY_VIOLATION: Recipe title/description contains compound '${compound}' in allergy family '${fam.family}'.`
            );
          }
        }
      }
    }
  }

  // 4. Deterministic Hard Exclusions: Dislikes, Excluded Ingredients & Custom Restrictions (with compounds & onion/cebula aliases)
  const hardExclusions = [
    ...(preferences.dislikes || []),
    ...(preferences.excludedIngredients || []),
    ...(preferences.customRestrictions || []),
  ]
    .map((e) => e.trim())
    .filter(Boolean);

  for (const excl of hardExclusions) {
    for (const ing of recipe.ingredients || []) {
      const m = matchIngredientAgainstExclusionTerm(ing, excl);
      if (m.matched) {
        violations.push(
          `EXCLUDED_INGREDIENT: Recipe uses excluded/disliked ingredient '${ing.nameEn}' (${m.reason}).`
        );
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

/**
 * Deterministically validates a generated weekly meal plan for:
 * 1. Correct meal slot assignment (`meal.recipe.mealType === meal.mealType`)
 * 2. Distinct dishes within every day (no duplicate recipe on the same `dayIndex`)
 * 3. Rotation of all eligible slot recipes before repeating
 * 4. No consecutive-day repeats for the same slot when >= 2 eligible recipes exist
 */
export function validateWeeklyPlanVariety(
  meals: PlannedMeal[],
  eligibleCountBySlot?: Partial<Record<MealType, number>>
): ValidationResult {
  const violations: string[] = [];

  // 1. Correct meal slot
  for (const m of meals) {
    if (m.recipe.mealType !== m.mealType) {
      violations.push(
        `SLOT_MISMATCH: Day ${m.dayIndex} slot '${m.mealType}' has recipe '${m.recipe.id}' with mealType '${m.recipe.mealType}'.`
      );
    }
  }

  // 2. Distinct dishes per day
  const byDay = new Map<number, PlannedMeal[]>();
  for (const m of meals) {
    const arr = byDay.get(m.dayIndex) || [];
    arr.push(m);
    byDay.set(m.dayIndex, arr);
  }
  for (const [dayIndex, dayMeals] of byDay.entries()) {
    const seen = new Set<string>();
    for (const m of dayMeals) {
      if (seen.has(m.recipe.id)) {
        violations.push(
          `DUPLICATE_DAILY_DISH: Day ${dayIndex} repeats recipe '${m.recipe.id}' across multiple slots.`
        );
      }
      seen.add(m.recipe.id);
    }
  }

  // 3. Consecutive-day repeats & full rotation per slot
  const bySlot = new Map<MealType, PlannedMeal[]>();
  for (const m of meals) {
    const arr = bySlot.get(m.mealType) || [];
    arr.push(m);
    bySlot.set(m.mealType, arr);
  }
  for (const [slot, slotMeals] of bySlot.entries()) {
    const sorted = [...slotMeals].sort((a, b) => a.dayIndex - b.dayIndex);
    const eligibleCount = eligibleCountBySlot?.[slot];

    if (eligibleCount === undefined || eligibleCount >= 2) {
      for (let i = 1; i < sorted.length; i++) {
        if (
          sorted[i].dayIndex === sorted[i - 1].dayIndex + 1 &&
          sorted[i].recipe.id === sorted[i - 1].recipe.id
        ) {
          violations.push(
            `CONSECUTIVE_REPEAT: Slot '${slot}' repeats '${sorted[i].recipe.id}' on consecutive days ${sorted[i - 1].dayIndex} and ${sorted[i].dayIndex}.`
          );
        }
      }
    }

    if (eligibleCount !== undefined && eligibleCount > 0 && sorted.length > 0) {
      const uniqueUsed = new Set(sorted.map((m) => m.recipe.id)).size;
      const expectedMinUnique = Math.min(eligibleCount, sorted.length);
      if (uniqueUsed < expectedMinUnique) {
        violations.push(
          `INCOMPLETE_ROTATION: Slot '${slot}' used only ${uniqueUsed} unique recipes across ${sorted.length} days (${eligibleCount} eligible available).`
        );
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
