import { describe, it, expect } from 'vitest';
import { Server } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MealPlannerDatabase } from '../src/server/db/database';
import { createApp } from '../src/server/app';
import { SEED_RECIPES } from '../src/server/recipes/recipeSeedData';
import { generateValidatedWeeklyMealPlan } from '../src/server/ai/aiMealPlanner';
import { buildSmartShoppingList } from '../src/server/matching/quantityEngine';
import { analyzeAndOptimizeBudget } from '../src/server/budget/budgetOptimizer';
import {
  validateRecipeForUser,
  validateWeeklyPlanVariety,
} from '../src/server/validation/mealValidator';
import {
  matchConservativePolishCanonical,
  normalizeGlovoBiedronkaTile,
} from '../src/server/monitoring/biedronkaGlovoMonitor';
import {
  applyVerifiedBiedronkaSnapshotToCatalogue,
  clearVerifiedBiedronkaSnapshot,
  getActiveVerifiedBiedronkaSnapshot,
} from '../src/server/supermarkets/catalogueData';
import {
  SUPPORTED_CUISINES,
  normalizeCuisinePreference,
} from '../src/shared/cuisineConfig';
import { clientApi } from '../src/client/api/clientApi';
import { CuisineSlug, UserPreferences } from '../src/shared/types';

function makeBasePrefs(overrides?: Partial<UserPreferences>): UserPreferences {
  return {
    userId: 'u-test',
    regionCode: 'PL',
    currencyCode: 'PLN',
    householdSize: 2,
    weeklyBudgetPln: 260,
    planDurationDays: 7,
    preferredSupermarket: 'biedronka',
    preferredCuisine: 'any',
    dietaryRestrictions: [],
    customRestrictions: [],
    allergies: [],
    excludedIngredients: [],
    dislikes: [],
    likes: [],
    foodVibes: [],
    customFoodVibes: [],
    cookingSkill: 'intermediate',
    preferredPrepTimeMin: 45,
    kitchenEquipment: ['hob', 'oven', 'kettle', 'toaster'],
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
    ...overrides,
  };
}

describe('Generate AI Plan Wizard — Read-Only Region, Six Cuisines, Strict Filtering, SQLite Round-Trip & Offline Generator', () => {
  it('provides at least 3 distinct breakfasts, 3 lunches, and 3 dinners for every one of the 6 cuisines with curated shopping-list ingredients and trilingual copy', () => {
    for (const cuisine of SUPPORTED_CUISINES) {
      const recipes = SEED_RECIPES.filter((r) => r.cuisine === cuisine);
      const breakfasts = recipes.filter((r) => r.mealType === 'breakfast');
      const lunches = recipes.filter((r) => r.mealType === 'lunch');
      const dinners = recipes.filter((r) => r.mealType === 'dinner');

      expect(breakfasts.length, `${cuisine} breakfasts`).toBeGreaterThanOrEqual(3);
      expect(lunches.length, `${cuisine} lunches`).toBeGreaterThanOrEqual(3);
      expect(dinners.length, `${cuisine} dinners`).toBeGreaterThanOrEqual(3);

      // Unique titles & slugs
      expect(new Set(recipes.map((r) => r.id)).size).toBe(recipes.length);
      expect(new Set(recipes.map((r) => r.titleEn)).size).toBe(recipes.length);

      for (const r of recipes) {
        expect(r.titleEn.trim().length).toBeGreaterThan(3);
        expect(r.titlePl.trim().length).toBeGreaterThan(3);
        expect((r.titleAz || '').trim().length).toBeGreaterThan(3);
        expect(r.instructionsEn.length).toBeGreaterThanOrEqual(2);
        expect(r.instructionsPl.length).toBeGreaterThanOrEqual(2);
        expect((r.instructionsAz || []).length).toBeGreaterThanOrEqual(2);
        expect(r.ingredients.length).toBeGreaterThanOrEqual(3);
        for (const ing of r.ingredients) {
          expect(ing.canonicalIngredient.trim().length).toBeGreaterThan(0);
          if (ing.unit !== 'to_taste') {
            expect(ing.amount).toBeGreaterThan(0);
            expect(ing.normalizedBaseAmount).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('strictly limits deterministic generated plans to the selected cuisine for all six cuisines and builds valid shopping lists', async () => {
    for (const cuisine of SUPPORTED_CUISINES) {
      const prefs = makeBasePrefs({ preferredCuisine: cuisine, planDurationDays: 7 });
      const runA = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: `wp-${cuisine}`,
        weekStartDate: '2026-11-10',
        preferences: prefs,
        availableRecipes: SEED_RECIPES,
        pantryItems: [],
        variationSeed: 5,
      });
      const runB = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: `wp-${cuisine}`,
        weekStartDate: '2026-11-10',
        preferences: prefs,
        availableRecipes: SEED_RECIPES,
        pantryItems: [],
        variationSeed: 5,
      });

      expect(runA.hasNoSafeRecipes).toBeFalsy();
      expect(runA.meals.length).toBe(21);
      // Deterministic output
      expect(runA.meals.map((m) => m.recipe.id)).toEqual(runB.meals.map((m) => m.recipe.id));
      // Every single meal strictly belongs to the selected cuisine
      for (const m of runA.meals) {
        expect(m.recipe.cuisine).toBe(cuisine);
      }
      // Distinct choices across breakfast, lunch, and dinner
      const uniqueBreakfasts = new Set(runA.meals.filter((m) => m.mealType === 'breakfast').map((m) => m.recipe.id));
      const uniqueLunches = new Set(runA.meals.filter((m) => m.mealType === 'lunch').map((m) => m.recipe.id));
      const uniqueDinners = new Set(runA.meals.filter((m) => m.mealType === 'dinner').map((m) => m.recipe.id));
      expect(uniqueBreakfasts.size).toBeGreaterThanOrEqual(2);
      expect(uniqueLunches.size).toBeGreaterThanOrEqual(2);
      expect(uniqueDinners.size).toBeGreaterThanOrEqual(2);

      // Shopping list builds cleanly from the cuisine plan
      const list = buildSmartShoppingList({
        shoppingListId: `sl-${cuisine}`,
        userId: 'u-test',
        weeklyPlanId: `wp-${cuisine}`,
        supermarketId: 'biedronka',
        regionCode: 'PL',
        currencyCode: 'PLN',
        plannedMeals: runA.meals,
        pantryItems: [],
        subtractPantry: false,
      });
      expect(list.items.length).toBeGreaterThan(0);
    }
  });

  it('enforces strict empty fallback with NO cross-cuisine leakage when no dishes of the selected cuisine satisfy hard exclusions, and keeps fallback within cuisine when equipment is restrictive', async () => {
    // 1. Strict empty fallback: Italian cuisine + exclusions removing every Italian dish
    // (non-Italian recipes like rec-grilled-chicken-rice still pass exclusions, so any leak would appear!)
    const impossibleItalian = makeBasePrefs({
      preferredCuisine: 'italian',
      planDurationDays: 3,
      allergies: ['eggs', 'milk', 'gluten', 'fish'],
      dislikes: ['tomato', 'canned_tomatoes', 'onion', 'rice'],
    });

    const emptyRes = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-it-empty',
      weekStartDate: '2026-11-10',
      preferences: impossibleItalian,
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 0,
    });

    expect(emptyRes.hasNoSafeRecipes).toBe(true);
    expect(emptyRes.meals).toEqual([]);
    expect(emptyRes.noSafeRecipeSlots?.length).toBe(9);
    expect(emptyRes.notesEn).toContain('Italian');

    // 2. Restrictive equipment fallback (kettle only): relaxes equipment ONLY within French cuisine, never leaking non-French dishes!
    const kettleFrench = makeBasePrefs({
      preferredCuisine: 'french',
      planDurationDays: 2,
      kitchenEquipment: ['kettle'],
    });
    const fallbackRes = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-fr-fallback',
      weekStartDate: '2026-11-10',
      preferences: kettleFrench,
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 1,
    });
    expect(fallbackRes.meals.length).toBe(6);
    for (const m of fallbackRes.meals) {
      expect(m.recipe.cuisine).toBe('french');
    }
  });

  it('keeps cuisine completely independent of region, store, language, and currency (PL+Azerbaijani and AZ+Polish/Spanish)', async () => {
    // Poland (PLN, Biedronka) + Azerbaijani cuisine
    const plAzPrefs = makeBasePrefs({
      regionCode: 'PL',
      currencyCode: 'PLN',
      preferredSupermarket: 'biedronka',
      preferredCuisine: 'azerbaijani',
      planDurationDays: 4,
    });
    const plAzPlan = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-pl-az',
      weekStartDate: '2026-11-10',
      preferences: plAzPrefs,
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 2,
    });
    expect(plAzPlan.meals.length).toBe(12);
    expect(plAzPlan.meals.every((m) => m.recipe.cuisine === 'azerbaijani')).toBe(true);

    // Azerbaijan (AZN, Bravo) + Polish cuisine
    const azPlPrefs = makeBasePrefs({
      regionCode: 'AZ',
      currencyCode: 'AZN',
      preferredSupermarket: 'bravo',
      preferredCuisine: 'polish',
      weeklyBudgetPln: 130,
      planDurationDays: 4,
    });
    const azPlPlan = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-az-pl',
      weekStartDate: '2026-11-10',
      preferences: azPlPrefs,
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 2,
    });
    expect(azPlPlan.meals.length).toBe(12);
    expect(azPlPlan.meals.every((m) => m.recipe.cuisine === 'polish')).toBe(true);
  });

  it('persists preferredCuisine across SQLite disk round-trip, preserves Settings region/currency in POST /api/meal-plan/generate, validates invalid cuisines, and retains cuisine on regenerate', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'mealplanner-cuisine-e2e-'));
    const tempDbPath = join(tempDir, 'cuisine-test.sqlite');

    let db: MealPlannerDatabase | null = null;
    let reopened: MealPlannerDatabase | null = null;
    let server: Server | null = null;

    try {
      db = new MealPlannerDatabase(tempDbPath);
      await db.seedIfEmpty();
      const app = createApp(db);

      let baseUrl = '';
      server = await new Promise<Server>((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => {
          const addr = s.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve(s);
        });
      });

      // 1. Existing profile without a cuisine defaults safely to 'any'
      const initPrefs = db.getPreferences('user-farhad-1');
      expect(initPrefs.regionCode).toBe('PL');
      expect(initPrefs.currencyCode).toBe('PLN');
      expect(initPrefs.preferredCuisine).toBe('any');

      // 2. Invalid cuisine values are rejected with HTTP 400
      const badGenRes = await fetch(`${baseUrl}/api/meal-plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferences: { preferredCuisine: 'martian' },
        }),
      });
      expect(badGenRes.status).toBe(400);

      const badPrefRes = await fetch(`${baseUrl}/api/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredCuisine: 'klingon' }),
      });
      expect(badPrefRes.status).toBe(400);

      // 3. Wizard POST /api/meal-plan/generate MUST NEVER change Settings region or currency,
      // even if a crafted request attempts to pass regionCode: 'AZ', currencyCode: 'AZN'
      const wizRes = await fetch(`${baseUrl}/api/meal-plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variationSeed: 11,
          preferences: {
            regionCode: 'AZ',
            currencyCode: 'AZN',
            preferredSupermarket: 'biedronka',
            preferredCuisine: 'greek',
            planDurationDays: 3,
            householdSize: 2,
            weeklyBudgetPln: 240,
          },
        }),
      });
      expect(wizRes.status).toBe(200);
      const wizPayload = await wizRes.json();
      expect(wizPayload.user.regionCode).toBe('PL');
      expect(wizPayload.user.currencyCode).toBe('PLN');
      expect(wizPayload.user.preferences.regionCode).toBe('PL');
      expect(wizPayload.user.preferences.currencyCode).toBe('PLN');
      expect(wizPayload.user.preferences.preferredCuisine).toBe('greek');
      expect(wizPayload.weeklyPlan.meals.length).toBe(9);
      expect(
        wizPayload.weeklyPlan.meals.every((m: any) => m.recipe.cuisine === 'greek')
      ).toBe(true);

      // 4. Regenerate without passing preferences retains 'greek' and leaves Settings region/currency untouched
      const regenRes = await fetch(`${baseUrl}/api/meal-plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationSeed: 77 }),
      });
      expect(regenRes.status).toBe(200);
      const regenPayload = await regenRes.json();
      expect(regenPayload.user.regionCode).toBe('PL');
      expect(regenPayload.user.currencyCode).toBe('PLN');
      expect(regenPayload.user.preferences.preferredCuisine).toBe('greek');
      expect(
        regenPayload.weeklyPlan.meals.every((m: any) => m.recipe.cuisine === 'greek')
      ).toBe(true);

      // 5. Close server & DB, reopen from disk -> verify SQLite round-trip persistence
      const srv = server;
      server = null;
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      db.db.close();
      db = null;

      reopened = new MealPlannerDatabase(tempDbPath);
      await reopened.seedIfEmpty();
      const persistedPrefs = reopened.getPreferences('user-farhad-1');
      expect(persistedPrefs.preferredCuisine).toBe('greek');
      expect(persistedPrefs.regionCode).toBe('PL');
      expect(persistedPrefs.currencyCode).toBe('PLN');
      // Re-seeding / syncing seed recipes on restart MUST NEVER cascade-delete saved planned_meals
      expect(reopened.getWeeklyPlan('user-farhad-1').meals.length).toBe(9);

      // Backward compatibility: legacy/corrupt NULL value falls back safely to 'any'
      reopened.db
        .prepare("UPDATE preferences SET preferred_cuisine = '' WHERE user_id = 'user-farhad-1'")
        .run();
      expect(reopened.getPreferences('user-farhad-1').preferredCuisine).toBe('any');
      expect(normalizeCuisinePreference(undefined)).toBe('any');
      expect(normalizeCuisinePreference(null)).toBe('any');
    } finally {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = null;
      }
      if (db) {
        try {
          db.db.close();
        } catch {
          // ignore
        }
        db = null;
      }
      if (reopened) {
        try {
          reopened.db.close();
        } catch {
          // ignore
        }
        reopened = null;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('enforces strict cuisine filtering, region/currency immutability, and retention across regenerate in the offline clientApi generator', async () => {
    const store = new Map<string, string>();
    const origLocalStorage = (globalThis as any).localStorage;
    const origFetch = globalThis.fetch;

    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
    globalThis.fetch = (async () => {
      throw new Error('Offline network unavailable');
    }) as typeof fetch;

    try {
      // Invalid cuisine throws immediately even offline
      await expect(
        clientApi.generateMealPlan(1, { preferredCuisine: 'invalid_cuisine' as any })
      ).rejects.toThrow(/Unsupported cuisine/i);

      // Generate Spanish plan offline while attempting to pass regionCode: 'AZ' -> region stays PL/PLN!
      const offlinePlan = await clientApi.generateMealPlan(3, {
        regionCode: 'AZ',
        currencyCode: 'AZN',
        preferredCuisine: 'spanish' as CuisineSlug,
        planDurationDays: 3,
      });

      expect(offlinePlan.user.regionCode).toBe('PL');
      expect(offlinePlan.user.currencyCode).toBe('PLN');
      expect(offlinePlan.user.preferences.preferredCuisine).toBe('spanish');
      expect(offlinePlan.weeklyPlan.meals.length).toBe(9);
      expect(offlinePlan.weeklyPlan.meals.every((m) => m.recipe.cuisine === 'spanish')).toBe(true);

      // Offline regenerate retains Spanish cuisine
      const regenOffline = await clientApi.generateMealPlan(9);
      expect(regenOffline.user.preferences.preferredCuisine).toBe('spanish');
      expect(regenOffline.weeklyPlan.meals.length).toBe(9);
      expect(regenOffline.weeklyPlan.meals.every((m) => m.recipe.cuisine === 'spanish')).toBe(true);
    } finally {
      (globalThis as any).localStorage = origLocalStorage;
      globalThis.fetch = origFetch;
    }
  });

  it('uses genuine pearl_barley in Traditional Polish Krupnik with strict gluten blocking and truthful unpriced/matched Glovo handling (no fabricated prices)', () => {
    const krupnik = SEED_RECIPES.find((r) => r.id === 'rec-pl-krupnik-tradycyjny');
    expect(krupnik).toBeDefined();
    const canonicals = krupnik!.ingredients.map((i) => i.canonicalIngredient);
    expect(canonicals).toContain('pearl_barley');
    expect(canonicals).not.toContain('oat_flakes');
    expect(krupnik!.allergens).toContain('gluten');
    expect(krupnik!.dietaryTags).not.toContain('gluten_free');

    // Gluten allergy AND gluten_free diet must both reject Krupnik
    const glutenAllergyCheck = validateRecipeForUser(
      krupnik!,
      makeBasePrefs({ allergies: ['gluten'] })
    );
    expect(glutenAllergyCheck.valid).toBe(false);

    const glutenFreeDietCheck = validateRecipeForUser(
      krupnik!,
      makeBasePrefs({ dietaryRestrictions: ['gluten_free'] })
    );
    expect(glutenFreeDietCheck.valid).toBe(false);

    // Conservative Glovo Polish matcher accepts authentic pearl barley & rejects prepared soup/ambiguous items
    expect(matchConservativePolishCanonical('Plony Natury Kasza jęczmienna perłowa 400 g', 'g')).toEqual({
      canonicalIngredient: 'pearl_barley',
      category: 'Dry Products',
      matchConfidence: 'HIGH',
    });
    expect(matchConservativePolishCanonical('Krupnik zupa z kaszą jęczmienną 450 g', 'g')).toBeNull();

    const prevSnapshot = getActiveVerifiedBiedronkaSnapshot();
    try {
      // Without pearl_barley in the active verified snapshot -> truthfully unpriced (no fabricated price)
      clearVerifiedBiedronkaSnapshot();
      const unpricedList = buildSmartShoppingList({
        shoppingListId: 'sl-krupnik-unpriced',
        userId: 'u-test',
        weeklyPlanId: 'wp-krupnik',
        supermarketId: 'biedronka',
        regionCode: 'PL',
        currencyCode: 'PLN',
        plannedMeals: [
          {
            id: 'pm-k1',
            weeklyPlanId: 'wp-krupnik',
            dayIndex: 0,
            dateStr: '2026-11-10',
            mealType: 'lunch',
            recipe: krupnik!,
            servings: 2,
            scaledCostPln: krupnik!.estimatedCostPln,
            scaledCaloriesKcal: krupnik!.nutrition.caloriesKcal,
          },
        ],
        pantryItems: [],
        subtractPantry: false,
      });
      const barleyRow = unpricedList.items.find((i) => i.canonicalIngredient === 'pearl_barley');
      expect(barleyRow).toBeDefined();
      expect(barleyRow!.isPriced).toBe(false);
      expect(barleyRow!.lineTotalPln).toBe(0);
      expect(barleyRow!.recommendedPackages).toBe(0);
      expect(unpricedList.hasIncompleteTotal).toBe(true);

      // With pearl_barley present in an active verified Biedronka snapshot -> truthfully priced from snapshot
      const barleyItem = normalizeGlovoBiedronkaTile(
        {
          sku: 'sku-barley-400',
          namePl: 'Plony Natury Kasza jęczmienna perłowa 400 g',
          regularPricePln: 3.99,
          promoPricePln: null,
          sections: ['Kasze i ryż'],
          observedAt: '2026-11-22T10:15:00.000Z',
        },
        'snap-barley-test',
        '2026-11-22T10:20:00.000Z'
      );
      expect(barleyItem).not.toBeNull();
      expect(barleyItem!.canonicalIngredient).toBe('pearl_barley');

      applyVerifiedBiedronkaSnapshotToCatalogue([barleyItem!], {
        snapshotId: 'snap-barley-test',
        activatedAt: '2026-11-22T10:20:00.000Z',
      });

      const pricedList = buildSmartShoppingList({
        shoppingListId: 'sl-krupnik-priced',
        userId: 'u-test',
        weeklyPlanId: 'wp-krupnik',
        supermarketId: 'biedronka',
        regionCode: 'PL',
        currencyCode: 'PLN',
        plannedMeals: [
          {
            id: 'pm-k2',
            weeklyPlanId: 'wp-krupnik',
            dayIndex: 0,
            dateStr: '2026-11-10',
            mealType: 'lunch',
            recipe: krupnik!,
            servings: 2,
            scaledCostPln: krupnik!.estimatedCostPln,
            scaledCaloriesKcal: krupnik!.nutrition.caloriesKcal,
          },
        ],
        pantryItems: [],
        subtractPantry: false,
      });
      const pricedBarleyRow = pricedList.items.find((i) => i.canonicalIngredient === 'pearl_barley');
      expect(pricedBarleyRow).toBeDefined();
      expect(pricedBarleyRow!.isPriced).toBe(true);
      expect(pricedBarleyRow!.recommendedPackages).toBe(1);
      expect(pricedBarleyRow!.lineTotalPln).toBe(3.99);
    } finally {
      clearVerifiedBiedronkaSnapshot();
      if (prevSnapshot.snapshotId && prevSnapshot.items.length > 0) {
        applyVerifiedBiedronkaSnapshotToCatalogue(prevSnapshot.items, {
          snapshotId: prevSnapshot.snapshotId,
          activatedAt: prevSnapshot.activatedAt,
        });
      }
    }
  });

  it('specifies genuine Arborio risotto_rice for Risotto alle Verdure with truthful unpriced/matched handling and clearly labels adaptations in EN/PL/AZ', () => {
    const risotto = SEED_RECIPES.find((r) => r.id === 'rec-it-risotto-verdure');
    expect(risotto).toBeDefined();
    expect(risotto!.ingredients.map((i) => i.canonicalIngredient)).toContain('risotto_rice');
    expect(risotto!.allergens).toEqual([]);
    expect(risotto!.dietaryTags).toContain('gluten_free');

    // Conservative matcher distinguishes Arborio risotto rice from generic long-grain rice & rejects ready meals
    expect(matchConservativePolishCanonical('Riso Gallo Ryż do risotto Arborio 500 g', 'g')).toEqual({
      canonicalIngredient: 'risotto_rice',
      category: 'Dry Products',
      matchConfidence: 'HIGH',
    });
    expect(matchConservativePolishCanonical('Risotto z grzybami danie gotowe 300 g', 'g')).toBeNull();
    expect(matchConservativePolishCanonical('Ryż biały długoziarnisty 1 kg', 'g')?.canonicalIngredient).toBe('rice');

    // Key adaptations must be clearly labeled in EN, PL, and AZ
    const adaptationIds = [
      'rec-es-espinacas-andaluza',
      'rec-fr-salade-nicoise',
      'rec-it-bruschetta-ricotta',
      'rec-fr-ratatouille-provencale',
      'rec-pl-racuchy-jablkowe',
      'rec-pl-leczo-polskie',
      'rec-pl-ryba-w-warzywach',
      'rec-gr-spanakopita-skillet',
      'rec-gr-salmon-plaki',
      'rec-es-salmon-a-la-vasca',
    ];
    for (const id of adaptationIds) {
      const r = SEED_RECIPES.find((rec) => rec.id === id);
      expect(r, `Missing adaptation recipe ${id}`).toBeDefined();
      expect(r!.titleEn).toMatch(/adaptation/i);
      expect(r!.titlePl).toMatch(/wariacja/i);
      expect(r!.titleAz || '').toMatch(/adaptasiya/i);
    }
  });

  it('maintains 100% consistent allergen and dietaryTag metadata against ingredients across all seed recipes', () => {
    const glutenSet = new Set(['pasta', 'wholegrain_bread', 'wheat_flour', 'oat_flakes', 'pearl_barley']);
    const dairySet = new Set(['milk', 'greek_yogurt', 'cottage_cheese', 'cheese', 'butter']);
    const meatSet = new Set(['chicken_breast', 'pork_loin', 'beef', 'turkey']);
    const fishSet = new Set(['salmon', 'cod', 'tuna', 'trout']);

    for (const r of SEED_RECIPES) {
      const canonicals = r.ingredients.map((i) => i.canonicalIngredient);

      if (canonicals.some((c) => glutenSet.has(c))) {
        expect(r.allergens, `${r.id} should declare gluten allergen`).toContain('gluten');
        expect(r.dietaryTags, `${r.id} must not be tagged gluten_free`).not.toContain('gluten_free');
      }
      if (canonicals.some((c) => dairySet.has(c))) {
        expect(r.allergens, `${r.id} should declare milk allergen`).toContain('milk');
        expect(r.dietaryTags, `${r.id} must not be tagged vegan`).not.toContain('vegan');
        expect(r.dietaryTags, `${r.id} must not be tagged lactose_free`).not.toContain('lactose_free');
      }
      if (canonicals.includes('eggs')) {
        expect(r.allergens, `${r.id} should declare eggs allergen`).toContain('eggs');
        expect(r.dietaryTags, `${r.id} must not be tagged vegan`).not.toContain('vegan');
      }
      if (canonicals.some((c) => fishSet.has(c))) {
        expect(r.allergens, `${r.id} should declare fish allergen`).toContain('fish');
        expect(r.dietaryTags, `${r.id} must not be tagged vegan`).not.toContain('vegan');
        expect(r.dietaryTags, `${r.id} must not be tagged vegetarian`).not.toContain('vegetarian');
      }
      if (canonicals.includes('tofu')) {
        expect(r.allergens, `${r.id} should declare soy allergen`).toContain('soy');
      }
      if (canonicals.some((c) => meatSet.has(c))) {
        expect(r.dietaryTags, `${r.id} must not be tagged vegan`).not.toContain('vegan');
        expect(r.dietaryTags, `${r.id} must not be tagged vegetarian`).not.toContain('vegetarian');
        expect(r.dietaryTags, `${r.id} must not be tagged pescatarian`).not.toContain('pescatarian');
      }
    }
  });

  it('prevents dinner pasta from leaking into breakfast/lunch under tight 120 PLN constrained Italian profile and explicitly explains infeasible slots', async () => {
    const reportedPrefs = makeBasePrefs({
      preferredCuisine: 'italian',
      weeklyBudgetPln: 120,
      planDurationDays: 7,
      dietaryRestrictions: ['high_protein', 'vegetarian', 'lactose_free'],
      excludedIngredients: ['garlic', 'broccoli', 'oat_flakes'],
      foodVibes: ['quick_easy', 'high_protein', 'budget_friendly'],
      preferredPrepTimeMin: 25,
    });

    const res = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-reported-120',
      weekStartDate: '2026-11-10',
      preferences: reportedPrefs,
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 0,
    });

    // No dinner recipe may ever appear in breakfast or lunch (on Wednesday or any day)
    expect(res.meals.every((m) => m.recipe.mealType === m.mealType)).toBe(true);
    expect(res.meals.filter((m) => m.mealType === 'breakfast')).toHaveLength(0);
    expect(res.meals.filter((m) => m.mealType === 'lunch')).toHaveLength(0);
    // Only the single surviving dinner (rec-pasta-lentil-bolognese) fills dinner slots
    expect(res.meals.filter((m) => m.mealType === 'dinner')).toHaveLength(7);
    // Wednesday (dayIndex 2) has at most 1 distinct dish, NEVER 3 identical pasta slots
    const wedMeals = res.meals.filter((m) => m.dayIndex === 2);
    expect(new Set(wedMeals.map((m) => m.recipe.id)).size).toBe(wedMeals.length);
    // Infeasible breakfast + lunch slots (14 total) are reported with explicit constraint explanation
    expect(res.noSafeRecipeSlots?.length).toBe(14);
    expect(res.notesEn).toMatch(/breakfast.*lunch/i);
    expect(res.notesEn).toMatch(/Italian/i);
    expect(res.notesEn).toMatch(/garlic/i);
    expect(res.notesPl).toMatch(/śniadanie.*obiad/i);
    expect(res.notesAz).toMatch(/səhər yeməyi.*nahar/i);

    // Shopping list totals reflect ONLY the 7 valid dinner meals (not 21 duplicated slots)
    const list = buildSmartShoppingList({
      shoppingListId: 'sl-reported-120',
      userId: 'u-test',
      weeklyPlanId: 'wp-reported-120',
      supermarketId: 'biedronka',
      regionCode: 'PL',
      currencyCode: 'PLN',
      plannedMeals: res.meals,
      pantryItems: [],
      subtractPantry: false,
    });
    expect(list.items.length).toBeGreaterThan(0);
    expect(list.estimatedTotalPln).toBeGreaterThan(0);
  });

  it('enforces exact meal slots, 3 distinct dishes per day, full eligible-recipe rotation before repeats, and zero consecutive repeats across 120 PLN budget, regeneration, budget optimizer, and offline mode', async () => {
    // 1. Test all 6 cuisines + 'any' at a feasible full-rotation budget (400 PLN) and across multiple regeneration seeds
    const cuisinesToTest: Array<'any' | CuisineSlug> = ['any', ...SUPPORTED_CUISINES];
    for (const cuisine of cuisinesToTest) {
      for (const seed of [0, 7, 42]) {
        const prefs = makeBasePrefs({
          preferredCuisine: cuisine,
          weeklyBudgetPln: 400,
          planDurationDays: 7,
          foodVibes: ['budget_friendly', 'quick_easy'],
        });
        const plan = await generateValidatedWeeklyMealPlan({
          weeklyPlanId: `wp-var-${cuisine}-${seed}`,
          weekStartDate: '2026-11-10',
          preferences: prefs,
          availableRecipes: SEED_RECIPES,
          pantryItems: [],
          variationSeed: seed,
        });

        expect(plan.meals.length, `${cuisine} seed ${seed}`).toBe(21);

        // Compute eligible count per slot (matching planner's fully-priced preference when >= 3 exist)
        const countEffectiveEligible = (slot: 'breakfast' | 'lunch' | 'dinner') => {
          const raw = SEED_RECIPES.filter(
            (r) =>
              r.mealType === slot &&
              validateRecipeForUser(r, prefs, { enforcePrepTime: false, enforceCuisine: true }).valid
          );
          const fullyPriced = raw.filter((r) => {
            const sl = buildSmartShoppingList({
              shoppingListId: `sl-check-${r.id}`,
              userId: prefs.userId,
              weeklyPlanId: `wp-check-${r.id}`,
              supermarketId: prefs.preferredSupermarket,
              regionCode: prefs.regionCode,
              currencyCode: prefs.currencyCode,
              plannedMeals: [
                {
                  id: `pm-${r.id}`,
                  weeklyPlanId: `wp-check-${r.id}`,
                  dayIndex: 0,
                  dateStr: '2026-11-10',
                  mealType: slot,
                  recipe: r,
                  servings: prefs.householdSize,
                  scaledCostPln: 0,
                  scaledCaloriesKcal: 0,
                },
              ],
              pantryItems: [],
              subtractPantry: false,
            });
            return sl.items.every((item) => item.isPriced);
          });
          return fullyPriced.length >= 3 ? fullyPriced.length : raw.length;
        };
        const eligibleCounts = {
          breakfast: countEffectiveEligible('breakfast'),
          lunch: countEffectiveEligible('lunch'),
          dinner: countEffectiveEligible('dinner'),
        };

        const varietyCheck = validateWeeklyPlanVariety(plan.meals, eligibleCounts);
        expect(varietyCheck.violations, `${cuisine} seed ${seed}`).toEqual([]);
        expect(varietyCheck.valid).toBe(true);

        // Every day has exactly 3 distinct dishes
        for (let d = 0; d < 7; d++) {
          const dayMeals = plan.meals.filter((m) => m.dayIndex === d);
          expect(dayMeals.length).toBe(3);
          expect(new Set(dayMeals.map((m) => m.recipe.id)).size).toBe(3);
        }
      }
    }

    // 2. Budget optimization suggestions preserve slot, cuisine, daily distinctness, and non-consecutive variety
    const itPrefs = makeBasePrefs({
      preferredCuisine: 'italian',
      weeklyBudgetPln: 120,
      planDurationDays: 7,
    });
    const itPlan = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-opt-it',
      weekStartDate: '2026-11-10',
      preferences: itPrefs,
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 3,
    });
    const itList = buildSmartShoppingList({
      shoppingListId: 'sl-opt-it',
      userId: 'u-test',
      weeklyPlanId: 'wp-opt-it',
      supermarketId: 'biedronka',
      regionCode: 'PL',
      currencyCode: 'PLN',
      plannedMeals: itPlan.meals,
      pantryItems: [],
      subtractPantry: false,
    });
    const analysis = analyzeAndOptimizeBudget({
      preferences: itPrefs,
      plannedMeals: itPlan.meals,
      shoppingList: itList,
      allRecipes: SEED_RECIPES,
    });
    for (const sug of analysis.suggestions.filter((s) => s.type === 'RECIPE_SWAP')) {
      const targetMeal = itPlan.meals.find((m) => m.id === sug.targetPlannedMealId)!;
      const repRecipe = SEED_RECIPES.find((r) => r.id === sug.replacementRecipeId)!;
      expect(repRecipe.mealType).toBe(targetMeal.mealType);
      expect(repRecipe.cuisine).toBe('italian');
      const sameDayIds = new Set(
        itPlan.meals.filter((m) => m.dayIndex === targetMeal.dayIndex).map((m) => m.recipe.id)
      );
      expect(sameDayIds.has(repRecipe.id)).toBe(false);
    }

    // 3. Offline generator enforces identical variety & infeasible-slot reporting
    const store = new Map<string, string>();
    const origLocalStorage = (globalThis as any).localStorage;
    const origFetch = globalThis.fetch;
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };
    globalThis.fetch = (async () => {
      throw new Error('Offline network unavailable');
    }) as typeof fetch;

    try {
      const offlineTight = await clientApi.generateMealPlan(5, {
        preferredCuisine: 'polish',
        weeklyBudgetPln: 200,
        planDurationDays: 7,
        dietaryRestrictions: [],
        excludedIngredients: [],
        foodVibes: ['budget_friendly'],
      });
      expect(offlineTight.weeklyPlan.meals.length).toBe(21);
      const offVariety = validateWeeklyPlanVariety(offlineTight.weeklyPlan.meals, {
        breakfast: 3,
        lunch: 3,
        dinner: 3,
      });
      expect(offVariety.violations).toEqual([]);
      expect(offVariety.valid).toBe(true);
    } finally {
      (globalThis as any).localStorage = origLocalStorage;
      globalThis.fetch = origFetch;
    }
  });

  it('generates 21 varied, fully priced Polish meals within 250 PLN for the exact Poland/Biedronka high_protein+vegetarian+lactose_free repro fixture and adapts cleanly across low/250/high budgets and pantry', async () => {
    const baseRepro = makeBasePrefs({
      regionCode: 'PL',
      currencyCode: 'PLN',
      preferredSupermarket: 'biedronka',
      preferredCuisine: 'polish',
      planDurationDays: 7,
      householdSize: 2,
      mealsPerDay: 3,
      includeSnacks: false,
      weeklyBudgetPln: 250,
      dietaryRestrictions: ['high_protein', 'vegetarian', 'lactose_free'],
      excludedIngredients: ['garlic', 'broccoli', 'oat_flakes'],
      allergies: [],
      dislikes: [],
      preferredPrepTimeMin: 35,
      kitchenEquipment: ['hob', 'oven', 'kettle'],
    });

    // 1. Exact 250 PLN repro fixture (fixed seed 7)
    const plan250 = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-repro-250',
      weekStartDate: '2026-11-10',
      preferences: baseRepro,
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      subtractPantry: false,
      variationSeed: 7,
    });

    expect(plan250.meals.length).toBe(21);
    expect(plan250.noSafeRecipeSlots).toBeUndefined();
    expect(plan250.hasNoSafeRecipes).toBe(false);
    expect(plan250.hasIncompleteTotal).toBe(false);
    expect(plan250.unpricedIngredientCount).toBe(0);

    // Every meal satisfies strict Polish cuisine, diet, exclusions, and exact slot
    for (const m of plan250.meals) {
      expect(m.recipe.cuisine).toBe('polish');
      expect(m.recipe.mealType).toBe(m.mealType);
      expect(
        validateRecipeForUser(m.recipe, baseRepro, {
          enforcePrepTime: false,
          enforceCuisine: true,
        }).valid
      ).toBe(true);
    }

    // Variety: 3 distinct dishes/day, full rotation across eligible slots, zero consecutive repeats
    const variety250 = validateWeeklyPlanVariety(plan250.meals, {
      breakfast: 4,
      lunch: 3,
      dinner: 3,
    });
    expect(variety250.violations).toEqual([]);
    expect(variety250.valid).toBe(true);

    // Actual shopping basket total matches generator output and fits 250 PLN budget
    const basket250 = buildSmartShoppingList({
      shoppingListId: 'sl-repro-250',
      userId: 'u-test',
      weeklyPlanId: 'wp-repro-250',
      supermarketId: 'biedronka',
      regionCode: 'PL',
      currencyCode: 'PLN',
      plannedMeals: plan250.meals,
      pantryItems: [],
      subtractPantry: false,
    });
    expect(basket250.hasIncompleteTotal).toBe(false);
    expect(plan250.actualBasketTotalPln).toBe(basket250.estimatedTotalPln);
    expect(basket250.estimatedTotalPln).toBeLessThanOrEqual(250);
    expect(plan250.budgetOveragePln).toBe(0);

    // 2. Multi-seed 120 / 250 / 600 PLN spending-target aiming & strict +50 PLN cap (user filters + normal defaults)
    for (const seed of [0, 7, 19]) {
      const plan120 = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: `wp-repro-120-${seed}`,
        weekStartDate: '2026-11-10',
        preferences: { ...baseRepro, weeklyBudgetPln: 120 },
        availableRecipes: SEED_RECIPES,
        pantryItems: [],
        subtractPantry: false,
        variationSeed: seed,
      });
      const plan250s = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: `wp-repro-250-${seed}`,
        weekStartDate: '2026-11-10',
        preferences: { ...baseRepro, weeklyBudgetPln: 250 },
        availableRecipes: SEED_RECIPES,
        pantryItems: [],
        subtractPantry: false,
        variationSeed: seed,
      });
      const plan600 = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: `wp-repro-600-${seed}`,
        weekStartDate: '2026-11-10',
        preferences: { ...baseRepro, weeklyBudgetPln: 600 },
        availableRecipes: SEED_RECIPES,
        pantryItems: [],
        subtractPantry: false,
        variationSeed: seed,
      });

      // 120 PLN: either fits <= 120, or uses rare fallback strictly <= 120 + 50 = 170 PLN, or rejects as infeasible (never saves over-cap!)
      if (!plan120.isBudgetInfeasible) {
        expect(plan120.meals.length).toBe(21);
        expect(plan120.actualBasketTotalPln!).toBeLessThanOrEqual(170);
        expect(plan120.unpricedIngredientCount).toBe(0);
        expect(validateWeeklyPlanVariety(plan120.meals).valid).toBe(true);
      } else {
        expect(plan120.meals).toEqual([]);
        expect(plan120.minimumAchievableBasketPln!).toBeGreaterThan(170);
      }

      // 250 PLN: 21 varied meals within 250 PLN, 0 missing prices
      expect(plan250s.isBudgetInfeasible).toBeFalsy();
      expect(plan250s.meals.length).toBe(21);
      expect(plan250s.actualBasketTotalPln!).toBeLessThanOrEqual(250);
      expect(plan250s.unpricedIngredientCount).toBe(0);
      expect(validateWeeklyPlanVariety(plan250s.meals).valid).toBe(true);

      // 600 PLN: aims near target from below (540–600 PLN), 0 missing prices, genuinely premium dishes, valid variety
      expect(plan600.isBudgetInfeasible).toBeFalsy();
      expect(plan600.meals.length).toBe(21);
      expect(plan600.actualBasketTotalPln!).toBeGreaterThanOrEqual(540);
      expect(plan600.actualBasketTotalPln!).toBeLessThanOrEqual(600);
      expect(plan600.unpricedIngredientCount).toBe(0);
      expect(validateWeeklyPlanVariety(plan600.meals).valid).toBe(true);
    }

    // Normal defaults (Any cuisine, no restrictions) at 120 / 250 / 600 PLN
    const normalPrefs = makeBasePrefs({
      preferredCuisine: 'any',
      dietaryRestrictions: [],
      excludedIngredients: [],
      planDurationDays: 7,
      householdSize: 2,
    });
    const norm250 = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-norm-250',
      weekStartDate: '2026-11-10',
      preferences: { ...normalPrefs, weeklyBudgetPln: 250 },
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      subtractPantry: false,
      variationSeed: 7,
    });
    const norm600 = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-norm-600',
      weekStartDate: '2026-11-10',
      preferences: { ...normalPrefs, weeklyBudgetPln: 600 },
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      subtractPantry: false,
      variationSeed: 7,
    });
    expect(norm250.meals.length).toBe(21);
    expect(norm250.actualBasketTotalPln!).toBeLessThanOrEqual(250);
    expect(norm600.meals.length).toBe(21);
    expect(norm600.actualBasketTotalPln!).toBeGreaterThanOrEqual(540);
    expect(norm600.actualBasketTotalPln!).toBeLessThanOrEqual(600);

    // 3. Infeasible budget (e.g. 50 PLN -> max cap 100 PLN) MUST return isBudgetInfeasible=true, 0 meals, and never save over-cap!
    const planInfeasible = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-repro-50-infeasible',
      weekStartDate: '2026-11-10',
      preferences: { ...baseRepro, weeklyBudgetPln: 50 },
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      subtractPantry: false,
      variationSeed: 7,
    });
    expect(planInfeasible.isBudgetInfeasible).toBe(true);
    expect(planInfeasible.meals).toEqual([]);
    expect(planInfeasible.maxAllowedBudgetPln).toBe(100);
    expect(planInfeasible.minimumAchievableBasketPln!).toBeGreaterThan(100);
    expect(planInfeasible.notesEn).toMatch(/infeasible/i);
    expect(planInfeasible.notesEn).toMatch(/preserved unchanged/i);

    // 4. Pantry subtraction lowers real basket total during generation
    const pantry = [
      {
        id: 'p-1',
        userId: 'u-test',
        canonicalIngredient: 'eggs',
        namePl: 'Jaja',
        nameEn: 'Eggs',
        quantity: 20,
        unit: 'pcs' as const,
        normalizedAmount: 20,
        normalizedUnit: 'pcs' as const,
        category: 'Dairy' as const,
        expiryDate: null,
        daysUntilExpiry: 10,
        isExpiringSoon: false,
        addedAt: '2026-11-10T00:00:00Z',
        icon: '🥚',
      },
      {
        id: 'p-2',
        userId: 'u-test',
        canonicalIngredient: 'potato',
        namePl: 'Ziemniaki',
        nameEn: 'Potatoes',
        quantity: 2000,
        unit: 'g' as const,
        normalizedAmount: 2000,
        normalizedUnit: 'g' as const,
        category: 'Fruit & Vegetables' as const,
        expiryDate: null,
        daysUntilExpiry: 10,
        isExpiringSoon: false,
        addedAt: '2026-11-10T00:00:00Z',
        icon: '🥔',
      },
    ];
    const planWithPantry = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-repro-pantry',
      weekStartDate: '2026-11-10',
      preferences: baseRepro,
      availableRecipes: SEED_RECIPES,
      pantryItems: pantry,
      subtractPantry: true,
      variationSeed: 7,
    });
    expect(planWithPantry.meals.length).toBe(21);
    expect(planWithPantry.actualBasketTotalPln!).toBeLessThanOrEqual(250);
    // Pantry subtraction strictly lowers the basket cost of the same generated plan
    const samePlanWithoutPantry = buildSmartShoppingList({
      shoppingListId: 'sl-repro-pantry-off',
      userId: 'u-test',
      weeklyPlanId: 'wp-repro-pantry',
      supermarketId: 'biedronka',
      regionCode: 'PL',
      currencyCode: 'PLN',
      plannedMeals: planWithPantry.meals,
      pantryItems: pantry,
      subtractPantry: false,
    });
    expect(planWithPantry.actualBasketTotalPln!).toBeLessThan(samePlanWithoutPantry.estimatedTotalPln);

    // Regression: seed=17 with preferredPrepTimeMin=25 must stay <= 250 PLN at 250 and land in [540, 600] at 600
    const prep25At250 = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-repro-prep25-250-s17',
      weekStartDate: '2026-11-10',
      preferences: { ...baseRepro, preferredPrepTimeMin: 25, weeklyBudgetPln: 250 },
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 17,
    });
    expect(prep25At250.meals.length).toBe(21);
    expect(prep25At250.actualBasketTotalPln!).toBeLessThanOrEqual(250);
    expect(prep25At250.budgetOveragePln).toBe(0);
    expect(prep25At250.unpricedIngredientCount ?? 0).toBe(0);
    expect(validateWeeklyPlanVariety(prep25At250.meals).valid).toBe(true);

    const prep25At600 = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-repro-prep25-600-s17',
      weekStartDate: '2026-11-10',
      preferences: { ...baseRepro, preferredPrepTimeMin: 25, weeklyBudgetPln: 600 },
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 17,
    });
    expect(prep25At600.meals.length).toBe(21);
    expect(prep25At600.actualBasketTotalPln!).toBeGreaterThanOrEqual(540);
    expect(prep25At600.actualBasketTotalPln!).toBeLessThanOrEqual(600);
    expect(prep25At600.unpricedIngredientCount ?? 0).toBe(0);
    expect(validateWeeklyPlanVariety(prep25At600.meals).valid).toBe(true);

    // Regression: Italian seed=0 preserves full 3/3 rotation per slot whenever budget allows (300 PLN)
    const italianFullRot = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: 'wp-it-fullrot-s0',
      weekStartDate: '2026-11-10',
      preferences: makeBasePrefs({
        preferredCuisine: 'italian',
        weeklyBudgetPln: 300,
        planDurationDays: 7,
        foodVibes: ['budget_friendly', 'quick_easy'],
      }),
      availableRecipes: SEED_RECIPES,
      pantryItems: [],
      variationSeed: 0,
    });
    expect(italianFullRot.meals.length).toBe(21);
    expect(italianFullRot.actualBasketTotalPln!).toBeLessThanOrEqual(300);
    expect(
      validateWeeklyPlanVariety(italianFullRot.meals, { breakfast: 3, lunch: 3, dinner: 3 }).violations
    ).toEqual([]);
  });

  it('preserves saved plan and preferences on HTTP 422 and offline when requested budget exceeds +50 PLN cap, and never reports false remaining budget when prices are missing', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'mealplanner-budget-cap-'));
    const tempDbPath = join(tempDir, 'cap-test.sqlite');
    let db: MealPlannerDatabase | null = null;
    let server: Server | null = null;

    try {
      db = new MealPlannerDatabase(tempDbPath);
      await db.seedIfEmpty();
      const app = createApp(db);

      let baseUrl = '';
      server = await new Promise<Server>((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => {
          const addr = s.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve(s);
        });
      });

      const beforePlan = db.getWeeklyPlan('user-farhad-1');
      const beforeMealIds = beforePlan.meals.map((m) => `${m.dayIndex}:${m.mealType}:${m.recipe.id}`);
      const beforeBudget = db.getPreferences('user-farhad-1').weeklyBudgetPln;

      // Request an infeasible 40 PLN budget (max +50 cap = 90 PLN) via POST /api/meal-plan/generate -> HTTP 422, saved plan preserved!
      const infeasibleRes = await fetch(`${baseUrl}/api/meal-plan/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variationSeed: 7,
          preferences: {
            preferredCuisine: 'polish',
            weeklyBudgetPln: 40,
            planDurationDays: 7,
            householdSize: 2,
          },
        }),
      });
      expect(infeasibleRes.status).toBe(422);
      const errBody = await infeasibleRes.json();
      expect(errBody.code).toBe('BUDGET_INFEASIBLE');
      expect(errBody.preservedSavedPlan).toBe(true);

      // Saved plan AND preferences must remain 100% untouched!
      const afterPlan = db.getWeeklyPlan('user-farhad-1');
      expect(afterPlan.meals.map((m) => `${m.dayIndex}:${m.mealType}:${m.recipe.id}`)).toEqual(beforeMealIds);
      expect(db.getPreferences('user-farhad-1').weeklyBudgetPln).toBe(beforeBudget);

      // Never treat missing prices as zero / true remaining when basket has unpriced ingredients
      const krupnik = SEED_RECIPES.find((r) => r.id === 'rec-pl-krupnik-tradycyjny')!;
      const partialList = buildSmartShoppingList({
        shoppingListId: 'sl-partial-check',
        userId: 'u-test',
        weeklyPlanId: 'wp-partial',
        supermarketId: 'biedronka',
        regionCode: 'PL',
        currencyCode: 'PLN',
        plannedMeals: [
          {
            id: 'pm-p1',
            weeklyPlanId: 'wp-partial',
            dayIndex: 0,
            dateStr: '2026-11-10',
            mealType: 'lunch',
            recipe: krupnik,
            servings: 2,
            scaledCostPln: krupnik.estimatedCostPln,
            scaledCaloriesKcal: krupnik.nutrition.caloriesKcal,
          },
        ],
        pantryItems: [],
        subtractPantry: false,
      });
      expect(partialList.hasIncompleteTotal).toBe(true);
      const partialAnalysis = analyzeAndOptimizeBudget({
        preferences: makeBasePrefs({ weeklyBudgetPln: 600 }),
        plannedMeals: [],
        shoppingList: partialList,
        allRecipes: SEED_RECIPES,
      });
      expect(partialAnalysis.hasIncompleteTotal).toBe(true);
      expect(partialAnalysis.isRemainingBudgetVerified).toBe(false);
      expect(partialAnalysis.unpricedItemsCount).toBeGreaterThanOrEqual(1);
      // Must NOT report 600 - partialTotal as true remaining!
      expect(partialAnalysis.differencePln).toBe(0);
    } finally {
      if (server) {
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      if (db) {
        try {
          db.db.close();
        } catch {
          // ignore
        }
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('audits all recipe photos (no books/curry/tacos/wrong-dish URLs), bundles local placeholder across web & Android assets, and preserves custom user photos', async () => {
    const bannedUrls = [
      'photo-1517673132405-a56a62b18caf', // books
      'photo-1585937421612-70a008356fbe', // Indian curry
      'photo-1544025162-d76694265947', // BBQ pork ribs & fries
      'photo-1565299585323-38d6b0865b47', // tacos
      'photo-1495214783159-3503fd1b572d', // berry French toast
      'photo-1547592180-85f173990554', // salmon & rice plate
      'photo-1546069901-ba9599a7e63c', // tofu salad bowl
    ];
    for (const r of SEED_RECIPES) {
      expect(r.imageUrl, `${r.id} must have a real photo, not SVG placeholder`).not.toContain('recipe-placeholder.svg');
      expect(r.imageUrl.trim().length, `${r.id} must have non-empty imageUrl`).toBeGreaterThan(0);
      for (const bad of bannedUrls) {
        expect(r.imageUrl, `${r.id} should not use ${bad}`).not.toContain(bad);
      }
      if (r.imageUrl.startsWith('./assets/')) {
        const rel = r.imageUrl.slice('./'.length);
        expect(existsSync(join(process.cwd(), 'public', rel)), `Missing public asset ${rel}`).toBe(true);
        expect(existsSync(join(process.cwd(), 'android/app/src/main/assets/www', rel)), `Missing Android asset ${rel}`).toBe(true);
      }
    }

    // Verify custom user photos survive SQLite sync and offline weeklyPlan sync refreshes seeded photos
    const tempDir = mkdtempSync(join(tmpdir(), 'mealplanner-photo-sync-'));
    const db = new MealPlannerDatabase(join(tempDir, 'photos.sqlite'));
    try {
      await db.seedIfEmpty({ seedDemoUser: true });
      const customImg = 'https://example.com/my-custom-user-dish.jpg';
      db.insertRecipeRecord({
        ...SEED_RECIPES[0],
        id: 'rec-custom-user-photo',
        slug: 'custom-user-photo',
        authorUserId: 'user-farhad-1',
        titleEn: 'My Custom Dish',
        titlePl: 'Moje Danie',
        titleAz: 'Mənim Yeməyim',
        imageUrl: customImg,
        isCustom: true,
        ingredients: SEED_RECIPES[0].ingredients.map((ing, idx) => ({
          ...ing,
          id: `ing-custom-photo-${idx}`,
        })),
      });
      // Re-run seed sync via seedIfEmpty
      await db.seedIfEmpty({ seedDemoUser: true });
      const custom = db.getAllRecipesForUser('user-farhad-1').find((r) => r.id === 'rec-custom-user-photo');
      expect(custom?.imageUrl).toBe(customImg);

      const buckwheatApple = db.getAllRecipesForUser('user-farhad-1').find(
        (r) => r.id === 'rec-pl-econ-kasza-gryczana-jablko-slonecznik'
      );
      expect(buckwheatApple?.imageUrl).toBe('./assets/recipes/polish-buckwheat-apple-sunflower.webp');

      const buckwheatTofu = db.getAllRecipesForUser('user-farhad-1').find(
        (r) => r.id === 'rec-pl-econ-kasza-gryczana-tofu-cebula'
      );
      expect(buckwheatTofu?.imageUrl).toBe('./assets/recipes/polish-buckwheat-tofu-onion.webp');

      const barleyBanana = db.getAllRecipesForUser('user-farhad-1').find(
        (r) => r.id === 'rec-pl-econ-kasza-jeczmienna-banan-slonecznik'
      );
      expect(barleyBanana?.imageUrl).toBe('./assets/recipes/polish-barley-banana-sunflower.webp');
    } finally {
      try {
        db.db.close();
      } catch {
        // ignore
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
