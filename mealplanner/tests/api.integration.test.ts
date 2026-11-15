import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'node:http';
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MealPlannerDatabase } from '../src/server/db/database';
import { createApp } from '../src/server/app';

describe('MealPlanner HTTP REST API & Security Integration Tests', () => {
  let server: Server;
  let baseUrl = '';
  let db: MealPlannerDatabase;

  beforeAll(async () => {
    db = new MealPlannerDatabase(':memory:');
    await db.seedIfEmpty();
    const app = createApp(db);
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/health returns service status without leaking any secret API keys', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(JSON.stringify(body)).not.toContain('JWT_SECRET');
  });

  it('POST /api/auth/register, POST /api/auth/login, and cross-user isolation check (403 FORBIDDEN)', async () => {
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'piotr@kowalski.pl',
        password: 'SecurePassword99',
        displayName: 'Piotr Kowalski',
        language: 'pl',
        householdSize: 3,
        weeklyBudgetPln: 300,
        preferredSupermarket: 'lidl',
      }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    expect(regData.token).toBeTruthy();
    expect(regData.user.displayName).toBe('Piotr Kowalski');

    // Attempt to access another user's private profile (user-farhad-1) using Piotr's token -> must return 403 FORBIDDEN
    const forbiddenRes = await fetch(`${baseUrl}/api/users/user-farhad-1/profile`, {
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    expect(forbiddenRes.status).toBe(403);

    // Accessing own profile succeeds
    const ownRes = await fetch(`${baseUrl}/api/users/${regData.user.id}/profile`, {
      headers: { Authorization: `Bearer ${regData.token}` },
    });
    expect(ownRes.status).toBe(200);
  });

  it('POST /api/auth/recover-password and /api/auth/reset-password completes password recovery flow', async () => {
    const recRes = await fetch(`${baseUrl}/api/auth/recover-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'piotr@kowalski.pl' }),
    });
    expect(recRes.status).toBe(200);
    const recBody = await recRes.json();
    expect(recBody.recoveryCodeDemo).toBeTruthy();

    const resetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'piotr@kowalski.pl',
        recoveryCode: recBody.recoveryCodeDemo,
        newPassword: 'BrandNewPassword2026!',
      }),
    });
    expect(resetRes.status).toBe(200);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'piotr@kowalski.pl',
        password: 'BrandNewPassword2026!',
      }),
    });
    expect(loginRes.status).toBe(200);
  });

  it('rejects adding a meal that violates user allergies deterministically on the backend', async () => {
    // Set user allergy to 'fish'
    await fetch(`${baseUrl}/api/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allergies: ['fish'] }),
    });

    // Attempt to add Baked Atlantic Salmon ('rec-baked-salmon-broccoli')
    const badMealRes = await fetch(`${baseUrl}/api/meal-plan/meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dayIndex: 1,
        mealType: 'lunch',
        recipeId: 'rec-baked-salmon-broccoli',
      }),
    });
    expect(badMealRes.status).toBe(400);
    const errBody = await badMealRes.json();
    expect(errBody.error).toContain('ALLERGY_VIOLATION');

    // Clear allergies back to []
    await fetch(`${baseUrl}/api/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allergies: [] }),
    });
  });

  it('validates dayIndex, mealType, and non-existent recipe IDs with clean 400/404 responses', async () => {
    const badDayRes = await fetch(`${baseUrl}/api/meal-plan/meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dayIndex: 99,
        mealType: 'lunch',
        recipeId: 'rec-grilled-chicken-rice',
      }),
    });
    expect(badDayRes.status).toBe(400);

    const badTypeRes = await fetch(`${baseUrl}/api/meal-plan/meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dayIndex: 1,
        mealType: 'midnight_feast',
        recipeId: 'rec-grilled-chicken-rice',
      }),
    });
    expect(badTypeRes.status).toBe(400);

    const missingFavRes = await fetch(`${baseUrl}/api/recipes/rec-does-not-exist-999/favourite`, {
      method: 'POST',
    });
    expect(missingFavRes.status).toBe(404);
  });

  it('executes the complete 17-step End-to-End User Journey with persistent disk SQLite verification', async () => {
    const tempDbFile = resolve(process.cwd(), 'data/e2e-journey-test.sqlite');
    if (existsSync(tempDbFile)) rmSync(tempDbFile, { force: true });

    const diskDb = new MealPlannerDatabase(tempDbFile);
    await diskDb.seedIfEmpty();
    const e2eApp = createApp(diskDb);

    let e2eServer!: Server;
    let e2eUrl = '';
    await new Promise<void>((res) => {
      e2eServer = e2eApp.listen(0, '127.0.0.1', () => {
        const addr = e2eServer.address() as { port: number };
        e2eUrl = `http://127.0.0.1:${addr.port}`;
        res();
      });
    });

    try {
      // Steps 1–5: Register a new user account, complete onboarding, set 250 PLN weekly budget,
      // select Biedronka, and choose a high-protein diet
      const regRes = await fetch(`${e2eUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'anna.nowak@mealplanner.pl',
          password: 'AnnaStrongPassword2026!',
          displayName: 'Anna Nowak',
          language: 'pl',
          householdSize: 2,
          weeklyBudgetPln: 250,
          preferredSupermarket: 'biedronka',
        }),
      });
      expect(regRes.status).toBe(201);
      const regPayload = await regRes.json();
      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regPayload.token}`,
      };

      const onboardRes = await fetch(`${e2eUrl}/api/preferences`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          weeklyBudgetPln: 250,
          preferredSupermarket: 'biedronka',
          householdSize: 2,
          dietaryRestrictions: ['high_protein'],
          allergies: ['peanuts'],
          excludedIngredients: [],
          onboardingCompleted: true,
        }),
      });
      expect(onboardRes.status).toBe(200);

      // Step 6: Generate a weekly meal plan
      const genRes = await fetch(`${e2eUrl}/api/meal-plan/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ variationSeed: 1 }),
      });
      expect(genRes.status).toBe(200);
      const genState = await genRes.json();
      expect(genState.weeklyPlan.meals.length).toBe(21); // 7 days x 3 meals

      // Step 7: Open a recipe and verify ingredients, instructions, and nutrition
      const targetRecipe = genState.recipes.find((r: any) => r.id === 'rec-grilled-chicken-rice');
      expect(targetRecipe).toBeTruthy();
      expect(targetRecipe.ingredients.length).toBe(7);
      expect(targetRecipe.instructionsPl.length).toBeGreaterThan(0);

      // Step 8: Replace one meal on Day 2 (Wednesday lunch -> Herb-Roasted Pork Loin with Potatoes & Carrots)
      const replaceRes = await fetch(`${e2eUrl}/api/meal-plan/meal`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          dayIndex: 2,
          mealType: 'lunch',
          recipeId: 'rec-pork-loin-potatoes',
          servings: 2,
        }),
      });
      expect(replaceRes.status).toBe(200);
      const afterReplace = await replaceRes.json();
      const wedLunch = afterReplace.weeklyPlan.meals.find(
        (m: any) => m.dayIndex === 2 && m.mealType === 'lunch'
      );
      expect(wedLunch.recipe.id).toBe('rec-pork-loin-potatoes');

      // Steps 9–11: Generate/inspect shopping list, check ingredient quantities & supermarket product matches/prices
      const listBeforePantry = afterReplace.shoppingList;
      expect(listBeforePantry.supermarketId).toBe('biedronka');
      expect(listBeforePantry.items.length).toBeGreaterThan(0);
      const riceItemBefore = listBeforePantry.items.find(
        (i: any) => i.canonicalIngredient === 'rice'
      );
      expect(riceItemBefore).toBeTruthy();
      expect(riceItemBefore.matchedProductId).toBe('prod-rice');
      expect(riceItemBefore.unitPricePln).toBe(5.99);

      // Step 12: Add a pantry ingredient in Polish ("Ryż", 500 g) and enable pantry subtraction
      const addPantryRes = await fetch(`${e2eUrl}/api/pantry`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          namePl: 'Ryż',
          quantity: 500,
          unit: 'g',
          category: 'Dry Products',
        }),
      });
      expect(addPantryRes.status).toBe(200);

      const subtractRes = await fetch(`${e2eUrl}/api/shopping-list/settings`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ subtractPantry: true }),
      });
      expect(subtractRes.status).toBe(200);
      const afterPantryState = await subtractRes.json();

      // Step 13: Verify the shopping list updates (rice pantryDeductedAmount > 0 or netRequired reduced)
      const riceItemAfter = afterPantryState.shoppingList.items.find(
        (i: any) => i.canonicalIngredient === 'rice'
      );
      if (riceItemAfter) {
        expect(riceItemAfter.pantryDeductedAmount).toBeGreaterThan(0);
        expect(riceItemAfter.netRequiredAmount).toBeLessThan(riceItemBefore.requiredAmount);
      }

      // Step 14: Mark products as purchased
      const toggleRes = await fetch(`${e2eUrl}/api/shopping-list/toggle`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ key: 'chicken_breast' }),
      });
      expect(toggleRes.status).toBe(200);
      const afterToggle = await toggleRes.json();
      expect(afterToggle.shoppingList.boughtCount).toBeGreaterThanOrEqual(1);

      // Step 15: Check remaining budget
      expect(typeof afterToggle.weeklyPlan.remainingBudgetPln).toBe('number');
      expect(afterToggle.budgetAnalysis.weeklyBudgetPln).toBe(250);

      // Steps 16–17: Close the database/server, reopen from disk, and verify all data persists
      await new Promise<void>((res) => e2eServer.close(() => res()));
      diskDb.db.close();

      const reopenedDb = new MealPlannerDatabase(tempDbFile);
      const persistedUser = reopenedDb.getUserByEmail('anna.nowak@mealplanner.pl');
      expect(persistedUser?.user.displayName).toBe('Anna Nowak');
      expect(persistedUser?.user.preferences.dietaryRestrictions).toContain('high_protein');
      const persistedPlan = reopenedDb.getWeeklyPlan(persistedUser!.user.id);
      expect(persistedPlan.meals.length).toBe(21);
      const persistedPantry = reopenedDb.getPantryItems(persistedUser!.user.id);
      expect(persistedPantry.length).toBe(1);
      expect(persistedPantry[0].canonicalIngredient).toBe('rice');
      const persistedList = reopenedDb.getShoppingList(persistedUser!.user.id);
      expect(persistedList.boughtCount).toBeGreaterThanOrEqual(1);
      reopenedDb.db.close();
    } finally {
      try {
        if (existsSync(tempDbFile)) rmSync(tempDbFile, { force: true });
      } catch {
        // ignore cleanup lock on Windows if any
      }
    }
  });

  it('Scenario A, B, C, D, E — Multi-Region (Poland & Azerbaijan), Currency (PLN & AZN), and Language (EN, PL, AZ) HTTP API & Persistence Verification', async () => {
    const tempRegionDb = resolve(process.cwd(), 'data/e2e-region-test.sqlite');
    if (existsSync(tempRegionDb)) rmSync(tempRegionDb, { force: true });

    const rDb = new MealPlannerDatabase(tempRegionDb);
    await rDb.seedIfEmpty();
    const rApp = createApp(rDb);

    let rServer!: Server;
    let rUrl = '';
    await new Promise<void>((res) => {
      rServer = rApp.listen(0, '127.0.0.1', () => {
        const addr = rServer.address() as { port: number };
        rUrl = `http://127.0.0.1:${addr.port}`;
        res();
      });
    });

    try {
      // 1. Register a new user in Azerbaijan with Azerbaijani language and Bravo supermarket
      const regRes = await fetch(`${rUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'leyla.mammadova@baku.az',
          password: 'LeylaStrongPassword2026!',
          displayName: 'Leyla Məmmədova',
          regionCode: 'AZ',
          currencyCode: 'AZN',
          language: 'az',
          householdSize: 2,
          weeklyBudgetPln: 120,
          preferredSupermarket: 'bravo',
        }),
      });
      expect(regRes.status).toBe(201);
      const regBody = await regRes.json();
      const authHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regBody.token}`,
      };

      expect(regBody.user.regionCode).toBe('AZ');
      expect(regBody.user.currencyCode).toBe('AZN');
      expect(regBody.user.language).toBe('az');
      expect(regBody.user.preferences.preferredSupermarket).toBe('bravo');
      expect(regBody.supermarkets.map((s: any) => s.id)).toEqual([
        'bravo',
        'araz',
        'bazarstore',
        'rahat',
        'oba',
        'birmarket',
      ]);
      expect(regBody.shoppingList.currencyCode).toBe('AZN');

      // 2. Switch supermarket within Azerbaijan to Araz
      const storeRes = await fetch(`${rUrl}/api/shopping-list/settings`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ supermarketId: 'araz' }),
      });
      expect(storeRes.status).toBe(200);
      const storeBody = await storeRes.json();
      expect(storeBody.shoppingList.supermarketId).toBe('araz');
      expect(storeBody.shoppingList.currencyCode).toBe('AZN');

      // 3. Switch language to English while keeping Azerbaijan region & AZN currency (Scenario C)
      const langRes = await fetch(`${rUrl}/api/preferences`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ language: 'en' }),
      });
      expect(langRes.status).toBe(200);
      const langBody = await langRes.json();
      expect(langBody.user.regionCode).toBe('AZ');
      expect(langBody.user.currencyCode).toBe('AZN');
      expect(langBody.user.language).toBe('en');

      // 4. Switch region to Poland (PL) -> currency updates to PLN, supermarket updates to biedronka, existing meal plan preserved (Scenario E)
      const plRes = await fetch(`${rUrl}/api/preferences`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ regionCode: 'PL' }),
      });
      expect(plRes.status).toBe(200);
      const plBody = await plRes.json();
      expect(plBody.user.regionCode).toBe('PL');
      expect(plBody.user.currencyCode).toBe('PLN');
      expect(plBody.user.preferences.preferredSupermarket).toBe('biedronka');
      expect(plBody.supermarkets.map((s: any) => s.id)).toEqual([
        'biedronka',
        'lidl',
        'auchan',
        'kaufland',
        'carrefour',
        'zabka',
      ]);
      expect(plBody.weeklyPlan.meals.length).toBe(21);

      // 5. Switch back to Azerbaijan + Azerbaijani language and verify persistence across DB reopen (Scenario D)
      await fetch(`${rUrl}/api/preferences`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ regionCode: 'AZ', language: 'az', preferredSupermarket: 'bazarstore' }),
      });

      await new Promise<void>((res) => rServer.close(() => res()));
      rDb.db.close();

      const reopened = new MealPlannerDatabase(tempRegionDb);
      const persisted = reopened.getUserByEmail('leyla.mammadova@baku.az');
      expect(persisted?.user.regionCode).toBe('AZ');
      expect(persisted?.user.currencyCode).toBe('AZN');
      expect(persisted?.user.language).toBe('az');
      expect(persisted?.user.preferences.preferredSupermarket).toBe('bazarstore');
      reopened.db.close();
    } finally {
      try {
        if (existsSync(tempRegionDb)) rmSync(tempRegionDb, { force: true });
      } catch {
        // ignore cleanup lock on Windows
      }
    }
  });

  it('generates a custom 6-Step AI Wizard Meal Plan via POST /api/meal-plan/generate with supermarket, diet/exclusions, people, budget/duration, food vibes & kitchen equipment', async () => {
    const wizRes = await fetch(`${baseUrl}/api/meal-plan/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variationSeed: 7,
        preferences: {
          regionCode: 'PL',
          currencyCode: 'PLN',
          preferredSupermarket: 'auchan',
          dietaryRestrictions: ['high_protein'],
          allergies: ['nuts'],
          excludedIngredients: ['pork_loin'],
          householdSize: 3,
          weeklyBudgetPln: 210,
          planDurationDays: 5,
          foodVibes: ['quick_easy', 'high_protein', 'mediterranean'],
          customFoodVibes: ['fresh herbs'],
          kitchenEquipment: ['hob', 'kettle'],
        },
      }),
    });
    expect(wizRes.status).toBe(200);
    const body = await wizRes.json();
    expect(body.weeklyPlan.planDurationDays).toBe(5);
    expect(body.weeklyPlan.supermarketId).toBe('auchan');
    expect(body.weeklyPlan.householdSize).toBe(3);
    expect(body.weeklyPlan.meals.length).toBe(15); // 5 days x 3 meals (breakfast, lunch, dinner)
    expect(body.user.preferences.foodVibes).toEqual(['quick_easy', 'high_protein', 'mediterranean']);
    expect(body.user.preferences.kitchenEquipment).toEqual(['hob', 'kettle']);
    // Verify excluded ingredient (pork_loin) and oven-only recipes are strictly excluded
    for (const m of body.weeklyPlan.meals) {
      expect(m.servings).toBe(3);
      expect(m.recipe.id).not.toBe('rec-pork-loin-potatoes');
      expect(m.recipe.id).not.toBe('rec-baked-salmon-broccoli');
    }
    expect(body.shoppingList.supermarketId).toBe('auchan');
    expect(body.shoppingList.items.length).toBeGreaterThan(0);
  });

  it('synchronizes Recipe Details servings and ingredient quantity edits with the shopping list and budget via PATCH /api/recipes/:id/servings and /ingredient', async () => {
    const srvRes = await fetch(`${baseUrl}/api/recipes/rec-grilled-chicken-rice/servings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servings: 6, dayIndex: 0 }),
    });
    expect(srvRes.status).toBe(200);
    const srvBody = await srvRes.json();
    const updatedMeal = srvBody.weeklyPlan.meals.find(
      (m: any) => m.dayIndex === 0 && m.recipe.id === 'rec-grilled-chicken-rice'
    );
    expect(updatedMeal?.servings).toBe(6);

    const ingRes = await fetch(`${baseUrl}/api/recipes/rec-grilled-chicken-rice/ingredient`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredientId: 'ing-gcr-1', amount: 750 }),
    });
    expect(ingRes.status).toBe(200);
    const ingBody = await ingRes.json();
    const updatedRec = ingBody.recipes.find((r: any) => r.id === 'rec-grilled-chicken-rice');
    const chickenIng = updatedRec.ingredients.find((i: any) => i.id === 'ing-gcr-1');
    expect(chickenIng.amount).toBe(750);
  });
});
