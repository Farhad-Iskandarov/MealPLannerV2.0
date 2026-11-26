import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeIngredientQuantity,
  calculateSupermarketPackages,
  buildSmartShoppingList,
  resolveCanonicalIngredient,
} from '../src/server/matching/quantityEngine';
import { calculateNormalizedUnitPrice, supermarketRegistry } from '../src/server/supermarkets/supermarketService';
import { validateRecipeForUser } from '../src/server/validation/mealValidator';
import { SEED_RECIPES } from '../src/server/recipes/recipeSeedData';
import { MealPlannerDatabase } from '../src/server/db/database';
import { analyzeAndOptimizeBudget } from '../src/server/budget/budgetOptimizer';
import {
  buildDetailedCookingSteps,
  formatScaledIngredientAmount,
  getRecipeCookingMetadata,
} from '../src/shared/recipeGuide';
import {
  toLocaleUpper,
  localizeQuantityLabel,
  formatMinutes,
  formatItemsCount,
} from '../src/shared/regionConfig';
import { translations } from '../src/shared/i18n';
import {
  extractPackageQuantityFromTitle,
  normalizeBazarstoreProductCandidate,
  parseBazarstoreHtmlCatalogue,
  parseBazarstoreShopifyJson,
  computePriceStaleness,
} from '../src/server/monitoring/bazarstoreMonitor';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  generateRecoveryCode,
  hashRecoveryCode,
  recoveryCodeMatches,
} from '../src/server/auth/authService';

describe('MealPlanner Core Business Logic & Integration Suite', () => {
  describe('1. Quantity Intelligence & Package Calculation Engine', () => {
    it('aggregates duplicate rice ingredients (100g + 150g + 200g = 450g) and recommends 1 x 1kg package with 550g remaining', () => {
      const totalRiceNeed = 100 + 150 + 200; // 450g
      const pkg = calculateSupermarketPackages(totalRiceNeed, 1000); // 1kg supermarket package
      expect(pkg.recommendedPackages).toBe(1);
      expect(pkg.totalPurchasedAmount).toBe(1000);
      expect(pkg.leftoverAmount).toBe(550);
    });

    it('recommends 1 x 1kg package for 500g chicken breast requirement and calculates 500g remaining', () => {
      const pkg = calculateSupermarketPackages(500, 1000);
      expect(pkg.recommendedPackages).toBe(1);
      expect(pkg.totalPurchasedAmount).toBe(1000);
      expect(pkg.leftoverAmount).toBe(500);
    });

    it('converts household units (kg, g, l, ml, tbsp, tsp, garlic cloves) reliably', () => {
      expect(normalizeIngredientQuantity(1.5, 'kg')).toEqual({
        amount: 1500,
        baseUnit: 'g',
        isReliable: true,
      });
      expect(normalizeIngredientQuantity(0.5, 'l')).toEqual({
        amount: 500,
        baseUnit: 'ml',
        isReliable: true,
      });
      expect(normalizeIngredientQuantity(2, 'cloves', 'garlic')).toEqual({
        amount: 10,
        baseUnit: 'g',
        isReliable: true,
      });
      expect(normalizeIngredientQuantity(2, 'tbsp', 'olive_oil')).toEqual({
        amount: 30,
        baseUnit: 'ml',
        isReliable: true,
      });
      // Solid tbsp/tsp conversions are density-dependent approximations and marked isReliable: false
      expect(normalizeIngredientQuantity(1, 'tsp', 'paprika')).toEqual({
        amount: 5,
        baseUnit: 'g',
        isReliable: false,
      });
    });

    it('resolves Polish and English free-text ingredient names to canonical supermarket product keys', () => {
      expect(resolveCanonicalIngredient('Ryż')).toBe('rice');
      expect(resolveCanonicalIngredient('Pierś z kurczaka')).toBe('chicken_breast');
      expect(resolveCanonicalIngredient('Banany')).toBe('banana');
      expect(resolveCanonicalIngredient('Płatki owsiane')).toBe('oat_flakes');
    });
  });

  describe('2. Supermarket Price Engine & Unit Normalization', () => {
    it('normalizes unit prices between 500g and 1kg packages to PLN/kg for fair Biedronka vs Lidl comparisons', () => {
      const halfKgPack = calculateNormalizedUnitPrice(4.49, 500, 'g');
      const oneKgPack = calculateNormalizedUnitPrice(5.99, 1000, 'g');
      expect(halfKgPack.unitPricePln).toBe(8.98);
      expect(halfKgPack.unitLabel).toBe('8,98 zł / kg');
      expect(oneKgPack.unitPricePln).toBe(5.99);
      expect(oneKgPack.unitLabel).toBe('5,99 zł / kg');
    });

    it('exposes transparent verification status, EAN barcodes, loyalty conditions, and lastUpdated timestamps', () => {
      const comparisons = supermarketRegistry.compareProductsAcrossStores('banana');
      expect(comparisons.length).toBeGreaterThan(0);
      const banana = comparisons[0];
      expect(banana.ean).toBe('5900112233011');
      // Poland regular-price-only policy displays regular shelf price (6.99) while preserving stored promoPricePln (4.99)
      expect(banana.biedronka?.effectivePricePln).toBe(6.99);
      expect(banana.biedronka?.promoPricePln).toBe(4.99);
      expect(banana.biedronka?.loyaltyRequired).toBe(false);
      expect(banana.biedronka?.verificationStatus).toBe('VERIFIED_LEAFLET_PROMO');
      expect(banana.lidl).toBeNull();

      const riceComparisons = supermarketRegistry.compareProductsAcrossStores('rice');
      expect(riceComparisons[0].biedronka?.effectivePricePln).toBe(5.99);
      expect(riceComparisons[0].biedronka?.verificationStatus).toBe('DEMONSTRATION_CATALOGUE');
    });
  });

  describe('3. Deterministic Allergy, Exclusion & Dietary Validator', () => {
    const chickenRecipe = SEED_RECIPES.find((r) => r.id === 'rec-grilled-chicken-rice')!;
    const oatmealRecipe = SEED_RECIPES.find((r) => r.id === 'rec-oatmeal-banana')!;
    const lentilRecipe = SEED_RECIPES.find((r) => r.id === 'rec-lentil-tomato-curry')!;

    it('deterministically blocks recipes containing user allergens (gluten, milk)', () => {
      const check = validateRecipeForUser(oatmealRecipe, {
        dietaryRestrictions: [],
        customRestrictions: [],
        allergies: ['milk', 'gluten'],
        excludedIngredients: [],
        preferredPrepTimeMin: 60,
      });
      expect(check.valid).toBe(false);
      expect(check.violations.some((v) => v.includes('ALLERGY_VIOLATION'))).toBe(true);
    });

    it('deterministically blocks meat recipes when user selects vegetarian or vegan diet', () => {
      const check = validateRecipeForUser(chickenRecipe, {
        dietaryRestrictions: ['vegan'],
        customRestrictions: [],
        allergies: [],
        excludedIngredients: [],
        preferredPrepTimeMin: 60,
      });
      expect(check.valid).toBe(false);
      expect(check.violations.some((v) => v.includes('DIET_VIOLATION'))).toBe(true);

      const veganCheck = validateRecipeForUser(lentilRecipe, {
        dietaryRestrictions: ['vegan', 'gluten_free', 'lactose_free'],
        customRestrictions: [],
        allergies: ['milk', 'gluten'],
        excludedIngredients: [],
        preferredPrepTimeMin: 60,
      });
      expect(veganCheck.valid).toBe(true);
    });

    it('deterministically blocks recipes containing excluded ingredients', () => {
      const check = validateRecipeForUser(chickenRecipe, {
        dietaryRestrictions: [],
        customRestrictions: [],
        allergies: [],
        excludedIngredients: ['garlic'],
        preferredPrepTimeMin: 60,
      });
      expect(check.valid).toBe(false);
      expect(check.violations.some((v) => v.includes('EXCLUDED_INGREDIENT'))).toBe(true);
    });
  });

  describe('4. Persistent SQLite Database, Auth, Pantry Subtraction & User Isolation', () => {
    let db: MealPlannerDatabase;

    beforeEach(async () => {
      db = new MealPlannerDatabase(':memory:');
      await db.seedIfEmpty();
    });

    it('hashes passwords and recovery codes securely and signs/verifies JWT tokens', () => {
      const hash = hashPassword('MySecretPass123');
      expect(verifyPassword('MySecretPass123', hash)).toBe(true);
      expect(verifyPassword('WrongPass', hash)).toBe(false);

      const token = signToken('user-123', 'test@example.pl');
      const decoded = verifyToken(token);
      expect(decoded?.userId).toBe('user-123');
      expect(decoded?.email).toBe('test@example.pl');

      const code = generateRecoveryCode();
      expect(code).toMatch(/^\d{8}$/);
      const codeHash = hashRecoveryCode(code);
      expect(codeHash).not.toBe(code);
      expect(recoveryCodeMatches(code, codeHash)).toBe(true);
      expect(recoveryCodeMatches('00000000', codeHash)).toBe(false);
    });

    it('seeds Farhad Isgandarov profile, 7-day meal plan (21 meals), 12 pantry items, and shopping list', () => {
      const user = db.getUserById('user-farhad-1');
      expect(user?.displayName).toBe('Farhad Isgandarov');
      expect(user?.preferences.weeklyBudgetPln).toBe(250);

      const pantry = db.getPantryItems('user-farhad-1');
      expect(pantry.length).toBe(12);

      const plan = db.getWeeklyPlan('user-farhad-1');
      expect(plan.meals.length).toBe(21);

      // Verify Monday Nov 10 matches the reference photo meals (420 + 620 + 380 = 1420 kcal, 27.40 PLN)
      const mondayMeals = plan.meals.filter((m) => m.dayIndex === 0);
      expect(mondayMeals.reduce((s, m) => s + m.scaledCaloriesKcal, 0)).toBe(1420);
      expect(Number(mondayMeals.reduce((s, m) => s + m.scaledCostPln, 0).toFixed(2))).toBe(27.4);
    });

    it('subtracts available pantry quantities from shopping list when subtractPantry is enabled', () => {
      const listWithoutPantry = db.getShoppingList('user-farhad-1');
      const listWithPantry = db.setShoppingListSettings('user-farhad-1', { subtractPantry: true });
      expect(listWithPantry.estimatedTotalPln).toBeLessThan(listWithoutPantry.estimatedTotalPln);
    });

    it('enforces strict user data isolation between separate accounts', async () => {
      const user2 = db.createUser({
        email: 'kasia@polska.pl',
        passwordHash: hashPassword('KasiaPass123'),
        displayName: 'Kasia Nowak',
        weeklyBudgetPln: 180,
      });
      await db.generateAndSaveWeeklyPlan(user2.id, 2);

      // User 2 has 0 pantry items while User 1 has 12 pantry items
      expect(db.getPantryItems(user2.id).length).toBe(0);
      expect(db.getPantryItems('user-farhad-1').length).toBe(12);

      // Attempting to delete User 1's pantry item as User 2 has zero effect on User 1
      const user1ItemId = db.getPantryItems('user-farhad-1')[0].id;
      db.deletePantryItem(user2.id, user1ItemId);
      expect(db.getPantryItems('user-farhad-1').length).toBe(12);
    });

    it('identifies expensive items and provides budget optimization suggestions when over budget', () => {
      db.updatePreferences('user-farhad-1', { weeklyBudgetPln: 120 });
      const user = db.getUserById('user-farhad-1')!;
      const plan = db.getWeeklyPlan('user-farhad-1');
      const list = db.getShoppingList('user-farhad-1', plan.meals);
      const recipes = db.getAllRecipesForUser('user-farhad-1');

      const analysis = analyzeAndOptimizeBudget({
        preferences: user.preferences,
        plannedMeals: plan.meals,
        shoppingList: list,
        allRecipes: recipes,
      });

      expect(analysis.isOverBudget).toBe(true);
      expect(analysis.expensiveItems.length).toBeGreaterThan(0);
      expect(analysis.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('5. Multi-Region, Currency (PLN/AZN) & Trilingual (EN/PL/AZ) Architecture', () => {
    let db: MealPlannerDatabase;

    beforeEach(async () => {
      db = new MealPlannerDatabase(':memory:');
      await db.seedIfEmpty();
    });

    it('Scenario A — Poland: defaults to PL, PLN (zł), Polish supermarkets, and PLN reference catalogue prices', () => {
      const user = db.getUserById('user-farhad-1')!;
      expect(user.regionCode).toBe('PL');
      expect(user.currencyCode).toBe('PLN');
      expect(user.preferences.preferredSupermarket).toBe('biedronka');

      const plStores = supermarketRegistry.getAllStores('PL');
      const plIds = plStores.map((s) => s.id);
      expect(plIds).toEqual(['biedronka']);
      expect(plIds).not.toContain('bravo');
      expect(plIds).not.toContain('araz');

      const shoppingList = db.getShoppingList('user-farhad-1');
      expect(shoppingList.regionCode).toBe('PL');
      expect(shoppingList.currencyCode).toBe('PLN');
      const chickenItem = shoppingList.items.find((i) => i.canonicalIngredient === 'chicken_breast')!;
      expect(chickenItem.unitPricePln).toBe(24.9); // Biedronka 1kg chicken breast regular shelf unit price in PLN
      expect(chickenItem.recommendedPackages).toBeGreaterThanOrEqual(1);
      expect(chickenItem.lineTotalPln).toBe(Number((chickenItem.recommendedPackages * 24.9).toFixed(2)));
    });

    it('Scenario B — Azerbaijan: switching region to AZ selects AZN (₼), Bravo supermarket, Azerbaijani stores, and real AZN product prices (never 1:1 symbol replacement)', () => {
      // Switch Farhad from PL (250 PLN) to AZ
      const updatedUser = db.updatePreferences('user-farhad-1', { regionCode: 'AZ' });
      expect(updatedUser.regionCode).toBe('AZ');
      expect(updatedUser.currencyCode).toBe('AZN');
      expect(updatedUser.preferences.preferredSupermarket).toBe('bravo');
      // 250 PLN historical budget is converted via reference rate (Math.round(250 * 0.425) = 106 AZN), NOT kept as 250 AZN!
      expect(updatedUser.preferences.weeklyBudgetPln).toBe(106);

      const azStores = supermarketRegistry.getAllStores('AZ');
      const azIds = azStores.map((s) => s.id);
      expect(azIds).toEqual(['bravo', 'araz', 'bazarstore', 'rahat', 'oba', 'birmarket']);
      expect(azIds).not.toContain('biedronka');
      expect(azIds).not.toContain('lidl');

      const azList = db.getShoppingList('user-farhad-1');
      expect(azList.regionCode).toBe('AZ');
      expect(azList.currencyCode).toBe('AZN');
      expect(azList.supermarketId).toBe('bravo');

      const chickenAz = azList.items.find((i) => i.canonicalIngredient === 'chicken_breast');
      expect(chickenAz).toBeTruthy();
      // Critical check: Chicken breast in PL is 24.90 PLN/kg; in AZ (Bravo) it is 10.99 AZN/kg (NOT 24.90 AZN!)
      expect(chickenAz?.unitPricePln).toBe(10.99);
      expect(chickenAz!.recommendedPackages).toBeGreaterThanOrEqual(1);
      expect(chickenAz?.lineTotalPln).toBe(Number((chickenAz!.recommendedPackages * 10.99).toFixed(2)));
      expect(chickenAz?.unitPriceLabel).toContain('₼');

      // Store comparison in AZ compares Bravo, Araz, Bazarstore, Rahat
      expect(azList.comparisonByStore.bravo).toBeDefined();
      expect(azList.comparisonByStore.araz).toBeDefined();
      expect(azList.comparisonByStore.bazarstore).toBeDefined();
      expect(azList.comparisonByStore.rahat).toBeDefined();
      expect(azList.comparisonByStore.biedronka).toBeUndefined();
    });

    it('resolves Azerbaijani ingredient names and units (Toyuq döş əti, Düyü, Kərə yağı, Göyərti, kq, qr, ədəd, diş, x.q., ç.q.)', () => {
      expect(resolveCanonicalIngredient('Toyuq döş əti')).toBe('chicken_breast');
      expect(resolveCanonicalIngredient('Uzun düyü')).toBe('rice');
      expect(resolveCanonicalIngredient('Qatıq')).toBe('greek_yogurt');
      expect(resolveCanonicalIngredient('Göyərti dəstəsi')).toBe('spinach');

      expect(normalizeIngredientQuantity(1.5, 'kq')).toEqual({
        amount: 1500,
        baseUnit: 'g',
        isReliable: true,
      });
      expect(normalizeIngredientQuantity(250, 'qr')).toEqual({
        amount: 250,
        baseUnit: 'g',
        isReliable: true,
      });
      expect(normalizeIngredientQuantity(2, 'diş', 'garlic')).toEqual({
        amount: 10,
        baseUnit: 'g',
        isReliable: true,
      });
    });

    it('includes authentic Azerbaijani national dishes (Toyuqlu Azərbaycan Plovu, Dovğa, Qutab, Pomidor-Yumurta) with trilingual translations', () => {
      const recipes = db.getAllRecipesForUser('user-farhad-1');
      const plov = recipes.find((r) => r.id === 'rec-az-shah-plov');
      const dovga = recipes.find((r) => r.id === 'rec-az-dovga');
      const qutab = recipes.find((r) => r.id === 'rec-az-qutab');
      const pomidorYumurta = recipes.find((r) => r.id === 'rec-az-pomidor-yumurta');

      expect(plov).toBeTruthy();
      expect(plov?.titleAz).toContain('Plovu');
      expect(plov?.estimatedCostAzn).toBeGreaterThan(0);
      expect(dovga?.titleAz).toContain('Dovğa');
      expect(qutab?.titleAz).toContain('Qutab');
      expect(pomidorYumurta?.titleAz).toContain('Pomidor-Yumurta');
    });

    it('Scenario C & E — Language independence & Existing user data preservation when switching regions', () => {
      // Existing user has 21 planned meals and 12 pantry items
      const mealsBefore = db.getWeeklyPlan('user-farhad-1').meals.length;
      const pantryBefore = db.getPantryItems('user-farhad-1').length;
      expect(mealsBefore).toBe(21);
      expect(pantryBefore).toBe(12);

      // Switch to Azerbaijan + English
      const azEn = db.updatePreferences('user-farhad-1', {
        regionCode: 'AZ',
        language: 'en',
      });
      expect(azEn.regionCode).toBe('AZ');
      expect(azEn.currencyCode).toBe('AZN');
      expect(azEn.language).toBe('en');

      // Switch language to Azerbaijani without changing region/currency/prices
      const azAz = db.updatePreferences('user-farhad-1', { language: 'az' });
      expect(azAz.regionCode).toBe('AZ');
      expect(azAz.currencyCode).toBe('AZN');
      expect(azAz.language).toBe('az');

      // Switch to Poland + Azerbaijani language
      const plAz = db.updatePreferences('user-farhad-1', {
        regionCode: 'PL',
        language: 'az',
      });
      expect(plAz.regionCode).toBe('PL');
      expect(plAz.currencyCode).toBe('PLN');
      expect(plAz.language).toBe('az');

      // Verify existing user data (21 planned meals & 12 pantry items) was never deleted
      expect(db.getWeeklyPlan('user-farhad-1').meals.length).toBe(21);
      expect(db.getPantryItems('user-farhad-1').length).toBe(12);
    });
  });

  describe('6. Six-Step AI Meal Plan Wizard (Duration 1–7 Days, Equipment Filtering, Keto, Food Vibes & Servings 1–12)', () => {
    let db: MealPlannerDatabase;

    beforeEach(async () => {
      db = new MealPlannerDatabase(':memory:');
      await db.seedIfEmpty();
    });

    it('generates a meal plan for the exact selected duration (e.g., 3 days = 9 meals: 3 breakfasts, 3 lunches, 3 dinners)', async () => {
      db.updatePreferences('user-farhad-1', {
        planDurationDays: 3,
        householdSize: 4,
        preferredSupermarket: 'lidl',
      });
      const plan = await db.generateAndSaveWeeklyPlan('user-farhad-1', 1);
      expect(plan.planDurationDays).toBe(3);
      expect(plan.meals.length).toBe(9);
      expect(plan.meals.filter((m) => m.mealType === 'breakfast').length).toBe(3);
      expect(plan.meals.filter((m) => m.mealType === 'lunch').length).toBe(3);
      expect(plan.meals.filter((m) => m.mealType === 'dinner').length).toBe(3);
      expect(plan.meals.every((m) => m.dayIndex >= 0 && m.dayIndex < 3)).toBe(true);
      expect(plan.meals.every((m) => m.servings === 4)).toBe(true);
    });

    it('strictly filters out oven-only recipes when the user only selects Hob / Stovetop in Step 6', async () => {
      db.updatePreferences('user-farhad-1', {
        kitchenEquipment: ['hob'],
        planDurationDays: 5,
      });
      const plan = await db.generateAndSaveWeeklyPlan('user-farhad-1', 2);
      expect(plan.meals.length).toBe(15);
      // rec-baked-salmon-broccoli ('Piekarnik') and rec-pork-loin-potatoes ('Piekarnik', 'Garnek') require an oven
      for (const meal of plan.meals) {
        expect(meal.recipe.id).not.toBe('rec-baked-salmon-broccoli');
        expect(meal.recipe.id).not.toBe('rec-pork-loin-potatoes');
      }
    });

    it('strictly respects Keto dietary preference and excluded ingredients across all generated meals', async () => {
      db.updatePreferences('user-farhad-1', {
        dietaryRestrictions: ['keto'],
        excludedIngredients: ['salmon'],
        kitchenEquipment: ['hob', 'oven'],
        planDurationDays: 4,
      });
      const plan = await db.generateAndSaveWeeklyPlan('user-farhad-1', 3);
      expect(plan.meals.length).toBe(12);
      for (const meal of plan.meals) {
        const canonicals = meal.recipe.ingredients.map((i) => i.canonicalIngredient);
        expect(canonicals).not.toContain('salmon');
        expect(canonicals).not.toContain('rice');
        expect(canonicals).not.toContain('pasta');
        expect(canonicals).not.toContain('oat_flakes');
        expect(canonicals).not.toContain('potato');
      }
    });
  });

  describe('7. Recipe Details Page: Complete Step-by-Step Instructions, Cooking Metadata, Servings Scaling & Shopping List Sync', () => {
    let db: MealPlannerDatabase;

    beforeEach(async () => {
      db = new MealPlannerDatabase(':memory:');
      await db.seedIfEmpty();
    });

    it('provides complete beginner-friendly step-by-step instructions, cooking temperature, equipment, and scaled ingredients for every recipe in the catalogue', () => {
      const recipes = db.getAllRecipesForUser('user-farhad-1');
      expect(recipes.length).toBeGreaterThanOrEqual(18);

      for (const rec of recipes) {
        for (const lang of ['en', 'pl', 'az'] as const) {
          const meta = getRecipeCookingMetadata(rec, lang, ['hob', 'oven']);
          expect(meta.prepTimeMin).toBe(rec.prepTimeMin);
          expect(meta.cookTimeMin).toBe(rec.cookTimeMin);
          expect(meta.totalTimeMin).toBe(rec.totalTimeMin);
          expect(meta.temperatureLabel.length).toBeGreaterThan(5);
          expect(meta.equipmentLabels.length).toBeGreaterThan(0);

          const steps2 = buildDetailedCookingSteps(rec, 2, lang);
          expect(steps2.length).toBeGreaterThanOrEqual(3);
          for (const st of steps2) {
            expect(st.stepNumber).toBeGreaterThanOrEqual(1);
            expect(st.title.length).toBeGreaterThan(2);
            expect(st.instruction.length).toBeGreaterThan(15);
          }

          // When servings double from 2 to 4, scaled ingredient amounts double in the recipe steps
          const firstMeasuredIng = rec.ingredients.find((i) => i.unit !== 'to_taste');
          if (firstMeasuredIng) {
            const amt2 = formatScaledIngredientAmount(firstMeasuredIng, 2 / rec.baseServings, lang);
            const amt4 = formatScaledIngredientAmount(firstMeasuredIng, 4 / rec.baseServings, lang);
            expect(amt2).not.toEqual(amt4);
          }
        }
      }
    });

    it('synchronizes shopping list and budget immediately when recipe servings or ingredient quantities change', () => {
      const initialPlan = db.getWeeklyPlan('user-farhad-1');
      const initialBasketCost = initialPlan.totalEstimatedBasketPln;

      // Increase Grilled Chicken with Rice servings on Monday from 2 to 8 portions
      const afterServingsPlan = db.updatePlannedMealsServingsByRecipe(
        'user-farhad-1',
        'rec-grilled-chicken-rice',
        8,
        0
      );
      const mondayLunch = afterServingsPlan.meals.find(
        (m) => m.dayIndex === 0 && m.recipe.id === 'rec-grilled-chicken-rice'
      );
      expect(mondayLunch?.servings).toBe(8);
      expect(afterServingsPlan.totalMealPortionsCostPln).toBeGreaterThan(
        initialPlan.totalMealPortionsCostPln
      );
      expect(afterServingsPlan.totalEstimatedBasketPln).toBeGreaterThanOrEqual(initialBasketCost);

      // Increase chicken breast base ingredient amount on Grilled Chicken with Rice from 500g to 1200g
      const afterIngPlan = db.updateRecipeIngredientAmount(
        'user-farhad-1',
        'rec-grilled-chicken-rice',
        'ing-gcr-1',
        1200
      );
      const updatedChickenItem = db
        .getShoppingList('user-farhad-1', afterIngPlan.meals)
        .items.find((i) => i.canonicalIngredient === 'chicken_breast');
      expect(updatedChickenItem?.requiredAmount).toBeGreaterThan(2000);
      expect(afterIngPlan.totalEstimatedBasketPln).toBeGreaterThan(initialBasketCost);
    });

    it('verifies Azerbaijani typography (Ə, ə, Ğ, ğ, I, ı, İ, i, Ö, ö, Ş, ş, Ü, ü, Ç, ç), locale-aware casing, and EN/PL/AZ translation completeness', () => {
      // 1. Verify EN, PL, AZ translation keys are 100% symmetric and non-empty
      const enKeys = Object.keys(translations.en).sort();
      const plKeys = Object.keys(translations.pl).sort();
      const azKeys = Object.keys(translations.az).sort();
      expect(plKeys).toEqual(enKeys);
      expect(azKeys).toEqual(enKeys);

      // 2. Verify authentic Azerbaijani diacritics across UI & recipe corpus
      const azCorpus = JSON.stringify(translations.az) + JSON.stringify(SEED_RECIPES.map((r) => ({ t: r.titleAz, d: r.descriptionAz, i: r.instructionsAz })));
      for (const ch of ['Ə', 'ə', 'ğ', 'ı', 'İ', 'ö', 'ş', 'ü', 'ç']) {
        expect(azCorpus).toContain(ch);
      }

      // 3. Verify locale-aware uppercase preserves dotted İ (U+0130) and dotless I (U+0049) in Azerbaijani
      expect(toLocaleUpper('i̇nfo və alış-veriş', 'az')).toContain('ALIŞ-VERİŞ');
      expect(toLocaleUpper('səhər yeməyi', 'az')).toBe('SƏHƏR YEMƏYİ');

      // 4. Verify localized quantity labels, minutes, and pluralized item counts across EN, PL, AZ
      expect(localizeQuantityLabel('500 g', 'az')).toBe('500 q');
      expect(localizeQuantityLabel('1 kg', 'az')).toBe('1 kq');
      expect(localizeQuantityLabel('10 szt.', 'az')).toBe('10 ədəd');
      expect(localizeQuantityLabel('10 ədəd', 'pl')).toBe('10 szt.');
      expect(localizeQuantityLabel('10 szt.', 'en')).toBe('10 pcs');

      expect(formatMinutes(25, 'en')).toBe('25 min');
      expect(formatMinutes(25, 'pl')).toBe('25 min');
      expect(formatMinutes(25, 'az')).toBe('25 dəq');

      expect(formatItemsCount(1, 'en')).toBe('1 item');
      expect(formatItemsCount(4, 'en')).toBe('4 items');
      expect(formatItemsCount(1, 'pl')).toBe('1 produkt');
      expect(formatItemsCount(3, 'pl')).toBe('3 produkty');
      expect(formatItemsCount(6, 'pl')).toBe('6 produktów');
      expect(formatItemsCount(5, 'az')).toBe('5 məhsul');
    });
  });

  describe('8. Bazar Store 24-Hour Automated Price Monitoring, Variant Disambiguation, Price History & Outdated Price Detection', () => {
    let db: MealPlannerDatabase;

    beforeEach(async () => {
      db = new MealPlannerDatabase(':memory:');
      await db.seedIfEmpty();
    });

    it('extracts package quantities and distinguishes different sizes and variants accurately without duplicates', () => {
      expect(extractPackageQuantityFromTitle('Səba Toyuq Döş Əti 1.2 kq')).toEqual({
        packageSize: 1200,
        packageUnit: 'g',
        packageLabelAz: '1.2 kq',
      });
      expect(extractPackageQuantityFromTitle('Azərsun Qırmızı Mərcimək 400 q')).toEqual({
        packageSize: 400,
        packageUnit: 'g',
        packageLabelAz: '400 q',
      });
      expect(extractPackageQuantityFromTitle('Milla Təbii Süd 2.5% 1 L')).toEqual({
        packageSize: 1000,
        packageUnit: 'ml',
        packageLabelAz: '1 L',
      });
      expect(extractPackageQuantityFromTitle('Giləzi Kənd Yumurtası 15 ədəd')).toEqual({
        packageSize: 15,
        packageUnit: 'pcs',
        packageLabelAz: '15 ədəd',
      });
      expect(extractPackageQuantityFromTitle('Kök kq')).toEqual({
        packageSize: 1000,
        packageUnit: 'g',
        packageLabelAz: '1 kq',
      });
      expect(extractPackageQuantityFromTitle('Kök Super Paket 1kq')).toEqual({
        packageSize: 1000,
        packageUnit: 'g',
        packageLabelAz: '1 kq',
      });
      expect(extractPackageQuantityFromTitle('Çil-Çil Yumurta Ağ 10 lu')).toEqual({
        packageSize: 10,
        packageUnit: 'pcs',
        packageLabelAz: '10 ədəd',
      });

      // Verify non-food / pet food items containing ingredient words are excluded from canonical ingredient matching
      const catFoodWithCarrot = normalizeBazarstoreProductCandidate({
        title: 'PURİNA ONE PİŞİK YEMİ 75 Q MAL ƏTLİ KÖK',
        regularPrice: 1.05,
      })!;
      expect(catFoodWithCarrot.canonicalIngredient).toBeNull();

      // Verify all 18 seeded recipes (including Mərcimək souslu makaron / rec-pasta-lentil-bolognese) have valid image URLs
      const lentilPasta = SEED_RECIPES.find((r) => r.id === 'rec-pasta-lentil-bolognese')!;
      expect(lentilPasta).toBeTruthy();
      expect(lentilPasta.imageUrl).not.toContain('photo-1621996346565-e3d5d6281298');
      expect(lentilPasta.imageUrl).toContain('https://images.unsplash.com/photo-');

      const milk25 = normalizeBazarstoreProductCandidate({
        title: 'Milla Süd 2.5% 1 L',
        regularPrice: 2.59,
        discountedPrice: 2.15,
      })!;
      const milk32 = normalizeBazarstoreProductCandidate({
        title: 'Milla Süd 3.2% 1 L',
        regularPrice: 2.85,
        discountedPrice: 2.45,
      })!;
      expect(milk25.canonicalIngredient).toBe('milk');
      expect(milk32.canonicalIngredient).toBe('milk');
      expect(milk25.variantKey).not.toBe(milk32.variantKey);
      expect(milk25.effectivePrice).toBe(2.15);
      expect(milk25.regularPrice).toBe(2.59);
    });

    it('parses Shopify JSON, JSON-LD, and Bazarstore nopCommerce product-item HTML cards with hex entities', () => {
      const shopifyParsed = parseBazarstoreShopifyJson({
        products: [
          {
            id: 9901,
            title: 'Besta Basmati Düyü 1 kq',
            handle: 'besta-basmati-duyu-1-kq',
            vendor: 'Besta',
            product_type: 'Quru Ərzaqlar',
            images: [{ src: 'https://cdn.shopify.com/rice.jpg' }],
            variants: [
              {
                id: 99011,
                title: '1 kq',
                barcode: '30201206',
                price: '3.99',
                compare_at_price: '4.55',
                available: true,
                grams: 1000,
              },
            ],
          },
        ],
      });
      expect(shopifyParsed.length).toBe(1);
      expect(shopifyParsed[0].regularPrice).toBe(4.55);
      expect(shopifyParsed[0].discountedPrice).toBe(3.99);
      expect(shopifyParsed[0].brand).toBe('Besta');

      const htmlParsed = parseBazarstoreHtmlCatalogue(`
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Səba Təzə Toyuq Filesi 1 kq",
                "sku": "BZ-CHICKEN-1KG",
                "brand": { "@type": "Brand", "name": "Səba" },
                "offers": {
                  "@type": "Offer",
                  "price": "10.90",
                  "priceCurrency": "AZN",
                  "availability": "https://schema.org/InStock"
                }
              }
            </script>
          </head>
          <body>
            <div class="product-item" data-productid="16745" data-bzdl-item='{"item_id":"30036089","item_name":"K&#xF6;k kq","item_brand":"MEYVE-TEREVEZ","price":1.29}'>
              <div class="details">
                <h2 class="product-title"><a href="/kok-yerli-kg">K&#xF6;k kq</a></h2>
                <div class="prices">
                  <span class="price old-price">1,49 &#x20BC;</span>
                  <span class="price actual-price">1,29 &#x20BC;</span>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);
      expect(htmlParsed.length).toBe(2);
      expect(htmlParsed[0].title).toBe('Səba Təzə Toyuq Filesi 1 kq');
      expect(htmlParsed[0].regularPrice).toBe(10.9);
      expect(htmlParsed[1].title).toBe('Kök kq');
      expect(htmlParsed[1].regularPrice).toBe(1.49);
      expect(htmlParsed[1].discountedPrice).toBe(1.29);
    });

    it('updates Bazarstore prices, matches Kök kq (1.29 ₼ / 1.49 ₼) & Kök Super Paket 1kq (1.69 ₼), records historical price changes, and rejects anomalies', async () => {
      // Switch user to Azerbaijan + Bazarstore
      db.updatePreferences('user-farhad-1', {
        regionCode: 'AZ',
        currencyCode: 'AZN',
        preferredSupermarket: 'bazarstore',
      });

      const beforeList = db.getShoppingList('user-farhad-1');
      const carrotBefore = beforeList.items.find((i) => i.canonicalIngredient === 'carrot');
      if (carrotBefore) {
        expect(carrotBefore.nameAz).toBe('Kök kq');
        expect(carrotBefore.unitPricePln).toBe(1.29);
        expect(carrotBefore.regularLineTotalPln).toBe(1.49 * carrotBefore.recommendedPackages);
        expect(carrotBefore.lineTotalPln).toBe(1.29 * carrotBefore.recommendedPackages);
      }

      const chickenBefore = beforeList.items.find((i) => i.canonicalIngredient === 'chicken_breast')!;
      expect(chickenBefore.unitPricePln).toBe(10.9);

      // Verify both Kök kq (1.29 ₼) and Kök Super Paket 1kq (1.69 ₼) exist in monitored_products
      const monitoredCarrots = db
        .getMonitoredProducts('bazarstore')
        .filter((p) => p.canonicalIngredient === 'carrot');
      expect(monitoredCarrots.length).toBeGreaterThanOrEqual(2);
      expect(monitoredCarrots.some((c) => c.effectivePrice === 1.29 && c.regularPrice === 1.49)).toBe(true);
      expect(monitoredCarrots.some((c) => c.effectivePrice === 1.69 && c.nameAz.includes('Super Paket'))).toBe(true);

      // Run a price sync where Bazarstore drops Chicken Breast 1 kq price from 10.90 ₼ to 9.49 ₼,
      // includes a duplicate entry in the same batch (which must be deduplicated),
      // and includes an invalid 9999 ₼ anomaly (which must be rejected)
      const syncRun = await db.runBazarstorePriceSync({
        triggerType: 'MANUAL_API',
        customItems: [
          {
            externalId: 'bz-prod-chicken-breast',
            ean: '4760112233035',
            title: 'Səba Toyuq döş əti (filesi) kq',
            brand: 'Səba',
            regularPrice: 11.9,
            discountedPrice: 9.49,
            isAvailable: true,
            packageSize: 1000,
            packageUnit: 'g',
            canonicalIngredient: 'chicken_breast',
          },
          // Duplicate in same batch -> ignored
          {
            externalId: 'bz-prod-chicken-breast',
            ean: '4760112233035',
            title: 'Səba Toyuq döş əti (filesi) kq',
            brand: 'Səba',
            regularPrice: 11.9,
            discountedPrice: 9.49,
            isAvailable: true,
            packageSize: 1000,
            packageUnit: 'g',
            canonicalIngredient: 'chicken_breast',
          },
          // Corrupted >5x spike on rice (from 3.99 ₼ to 85.00 ₼) -> rejected by anomaly guard
          {
            externalId: 'bz-prod-rice',
            title: 'Besta Basmati Düyü 1 kq',
            brand: 'Besta',
            regularPrice: 85.0,
            isAvailable: true,
            packageSize: 1000,
            packageUnit: 'g',
            canonicalIngredient: 'rice',
          },
        ],
      });

      expect(syncRun.status).toBe('SUCCESS');
      expect(syncRun.productsUpdated).toBe(1);
      expect(syncRun.priceChangesRecorded).toBe(1);
      expect(syncRun.errorsCount).toBe(1);
      expect(syncRun.errorSummary).toContain('PRICE_ANOMALY_REJECTED');

      // Verify shopping list immediately reflects the new 9.49 ₼ chicken breast price (and rice was NOT corrupted to 85 ₼)
      const afterList = db.getShoppingList('user-farhad-1');
      const chickenAfter = afterList.items.find((i) => i.canonicalIngredient === 'chicken_breast')!;
      const riceAfter = afterList.items.find((i) => i.canonicalIngredient === 'rice')!;
      expect(chickenAfter.unitPricePln).toBe(9.49);
      expect(afterList.estimatedTotalPln).toBeLessThan(beforeList.estimatedTotalPln);
      expect(riceAfter.unitPricePln).toBe(3.99);

      // Verify historical price change was recorded
      const history = db.getProductPriceHistory('chicken_breast', 'bazarstore');
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].effectivePrice).toBe(9.49);
      expect(history[0].previousEffectivePrice).toBe(10.9);
      expect(history[0].priceDelta).toBe(-1.41);
    });

    it('clearly identifies outdated prices (>48 hours old) and handles network failures safely without losing existing prices', async () => {
      // Simulate a failed network fetch
      const failedRun = await db.runBazarstorePriceSync({
        triggerType: 'SCHEDULED_24H',
        customFetch: async () => {
          throw new Error('ECONNREFUSED bazarstore.az');
        },
      });
      expect(failedRun.status).toBe('PARTIAL_FALLBACK');
      expect(failedRun.errorsCount).toBeGreaterThan(0);

      // Verify existing monitored products are preserved and not wiped
      const productsNow = db.getMonitoredProducts('bazarstore');
      expect(productsNow.length).toBeGreaterThanOrEqual(27);

      // Simulate checking staleness 72 hours into the future without a successful sync
      const futureMs = Date.now() + 72 * 3600 * 1000;
      const summaryFuture = db.getPriceMonitoringSummary('bazarstore', futureMs);
      expect(summaryFuture.isStale).toBe(true);
      expect(summaryFuture.outdatedProductsCount).toBe(productsNow.length);

      const staleCheck = computePriceStaleness(new Date().toISOString(), futureMs);
      expect(staleCheck.isOutdated).toBe(true);
      expect(staleCheck.priceAgeHours).toBeGreaterThanOrEqual(72);
    });
  });
});
