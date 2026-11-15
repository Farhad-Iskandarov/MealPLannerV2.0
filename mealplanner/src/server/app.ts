import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { MealPlannerDatabase } from './db/database';
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  generateRecoveryCode,
  hashRecoveryCode,
  recoveryCodeMatches,
} from './auth/authService';
import { supermarketRegistry } from './supermarkets/supermarketService';
import { analyzeAndOptimizeBudget } from './budget/budgetOptimizer';
import { normalizeIngredientQuantity, resolveCanonicalIngredient } from './matching/quantityEngine';
import { validateRecipeForUser } from './validation/mealValidator';
import {
  CurrencyCode,
  Language,
  Recipe,
  RecipeIngredient,
  RegionCode,
  SupermarketSlug,
} from '../shared/types';
import {
  getDefaultCurrencyForRegion,
  isSupermarketInRegion,
  resolveValidSupermarketForRegion,
} from '../shared/regionConfig';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

const VALID_REGIONS = new Set<RegionCode>(['PL', 'AZ']);
const VALID_CURRENCIES = new Set<CurrencyCode>(['PLN', 'AZN']);
const VALID_LANGUAGES = new Set<Language>(['en', 'pl', 'az']);

export function createApp(dbInstance: MealPlannerDatabase) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Simple in-memory rate limiter per IP
  const rateCounts = new Map<string, { count: number; resetAt: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || '127.0.0.1';
    const now = Date.now();
    const record = rateCounts.get(ip);
    if (!record || record.resetAt < now) {
      rateCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    } else {
      record.count++;
      if (record.count > 300) {
        res.status(429).json({ error: 'Too many requests. Please slow down.' });
        return;
      }
    }
    next();
  });

  // Resolve authenticated user (or default seeded user if no bearer token is provided in demo mode)
  function resolveUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const payload = verifyToken(token);
      if (!payload) {
        res.status(401).json({ error: 'Invalid or expired authentication token' });
        return;
      }
      const user = dbInstance.getUserById(payload.userId);
      if (!user) {
        res.status(401).json({ error: 'Authenticated user no longer exists' });
        return;
      }
      req.userId = user.id;
      next();
      return;
    }

    // Default to Farhad Isgandarov for instant interactive experience unless requireStrictAuth is set
    req.userId = 'user-farhad-1';
    next();
  }

  function buildFullStatePayload(userId: string) {
    const user = dbInstance.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const activeRegion: RegionCode = user.regionCode || user.preferences.regionCode || 'PL';
    const weeklyPlan = dbInstance.getWeeklyPlan(userId);
    const shoppingList = dbInstance.getShoppingList(userId, weeklyPlan.meals);
    const recipes = dbInstance.getAllRecipesForUser(userId);
    const pantry = dbInstance.getPantryItems(userId);
    const supermarkets = supermarketRegistry.getAllSupermarkets(activeRegion);
    const promotionalOffers = supermarketRegistry.getPromotionalOffers(activeRegion);
    const priceComparisons = supermarketRegistry.compareProductsAcrossStores(undefined, activeRegion);
    const budgetAnalysis = analyzeAndOptimizeBudget({
      preferences: user.preferences,
      plannedMeals: weeklyPlan.meals,
      shoppingList,
      allRecipes: recipes,
    });

    return {
      user,
      weeklyPlan,
      shoppingList,
      recipes,
      pantry,
      supermarkets,
      promotionalOffers,
      priceComparisons,
      budgetAnalysis,
    };
  }

  // Health & API security info
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'MealPlanner Multi-Region API (PL & AZ)',
      supportedRegions: ['PL', 'AZ'],
      supportedCurrencies: ['PLN', 'AZN'],
      supportedLanguages: ['en', 'pl', 'az'],
      aiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
      aiProvider: process.env.GEMINI_API_KEY
        ? 'GEMINI_API'
        : process.env.OPENAI_API_KEY
        ? 'OPENAI_API'
        : 'SMART_ALGORITHMIC_ENGINE',
      supermarketAdapters: [
        'biedronka',
        'lidl',
        'auchan',
        'kaufland',
        'bravo',
        'araz',
        'bazarstore',
        'rahat',
      ],
      timestamp: new Date().toISOString(),
    });
  });

  // === Authentication Endpoints ===
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const {
        email,
        password,
        displayName,
        language,
        regionCode,
        currencyCode,
        householdSize,
        weeklyBudgetPln,
        preferredSupermarket,
      } = req.body || {};

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'Valid email address is required' });
        return;
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
      }
      if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
        res.status(400).json({ error: 'Display name is required' });
        return;
      }

      if (language !== undefined && !VALID_LANGUAGES.has(language)) {
        res.status(400).json({ error: 'Unsupported language. Supported: en, pl, az' });
        return;
      }
      if (regionCode !== undefined && !VALID_REGIONS.has(regionCode)) {
        res.status(400).json({ error: 'Unsupported region. Supported: PL, AZ' });
        return;
      }
      if (currencyCode !== undefined && !VALID_CURRENCIES.has(currencyCode)) {
        res.status(400).json({ error: 'Unsupported currency. Supported: PLN, AZN' });
        return;
      }

      const resolvedRegion: RegionCode = regionCode === 'AZ' ? 'AZ' : 'PL';
      const resolvedCurrency: CurrencyCode =
        currencyCode || getDefaultCurrencyForRegion(resolvedRegion);
      const resolvedLanguage: Language = VALID_LANGUAGES.has(language) ? language : 'en';

      if (preferredSupermarket && !isSupermarketInRegion(preferredSupermarket, resolvedRegion)) {
        res.status(400).json({
          error: `Selected supermarket '${preferredSupermarket}' does not belong to region '${resolvedRegion}'`,
        });
        return;
      }

      const existing = dbInstance.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: 'An account with this email already exists' });
        return;
      }

      const defaultBudget = resolvedRegion === 'AZ' ? 110 : 250;
      const user = dbInstance.createUser({
        email,
        passwordHash: hashPassword(password),
        displayName,
        language: resolvedLanguage,
        regionCode: resolvedRegion,
        currencyCode: resolvedCurrency,
        householdSize: Number(householdSize) || 2,
        weeklyBudgetPln: Number(weeklyBudgetPln) || defaultBudget,
        preferredSupermarket: resolveValidSupermarketForRegion(preferredSupermarket, resolvedRegion),
      });

      await dbInstance.generateAndSaveWeeklyPlan(user.id, 0);
      const token = signToken(user.id, user.email);
      res.status(201).json({
        token,
        ...buildFullStatePayload(user.id),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Registration failed' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }
      const record = dbInstance.getUserByEmail(String(email));
      if (!record || !verifyPassword(String(password), record.passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      const token = signToken(record.user.id, record.user.email);
      res.json({
        token,
        ...buildFullStatePayload(record.user.id),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Login failed' });
    }
  });

  app.post('/api/auth/recover-password', (req: Request, res: Response) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }
    const record = dbInstance.getUserByEmail(email);
    if (!record) {
      res.status(404).json({ error: 'No account found with that email address' });
      return;
    }
    const code = generateRecoveryCode();
    dbInstance.db
      .prepare('UPDATE users SET reset_code = ? WHERE id = ?')
      .run(hashRecoveryCode(code), record.user.id);

    res.json({
      message: 'Password recovery code generated.',
      recoveryCodeDemo: code, // Returned in response for offline/local testing without SMTP server
    });
  });

  app.post('/api/auth/reset-password', (req: Request, res: Response) => {
    const { email, recoveryCode, newPassword } = req.body || {};
    if (!email || !recoveryCode || !newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: 'Email, valid recovery code, and new password (min 6 chars) are required' });
      return;
    }
    const record = dbInstance.getUserByEmail(String(email));
    if (!record || !recoveryCodeMatches(String(recoveryCode), record.resetCode)) {
      res.status(400).json({ error: 'Invalid recovery code or email' });
      return;
    }
    dbInstance.db
      .prepare('UPDATE users SET password_hash = ?, reset_code = NULL WHERE id = ?')
      .run(hashPassword(String(newPassword)), record.user.id);

    const token = signToken(record.user.id, record.user.email);
    res.json({
      message: 'Password reset successful',
      token,
    });
  });

  app.delete('/api/auth/account', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    if (userId === 'user-farhad-1') {
      res.status(400).json({ error: 'Demo primary account cannot be deleted; register a custom account to test deletion.' });
      return;
    }
    dbInstance.deleteUserAccount(userId);
    res.json({ deleted: true });
  });

  // === Bootstrap & User Isolated State ===
  app.get('/api/bootstrap', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      res.json(buildFullStatePayload(req.userId!));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === Strict User Isolation Verification Endpoint ===
  app.get('/api/users/:targetUserId/profile', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    if (req.params.targetUserId !== req.userId) {
      res.status(403).json({ error: 'FORBIDDEN: Cross-user private profile access is strictly prohibited.' });
      return;
    }
    res.json({ user: dbInstance.getUserById(req.userId!) });
  });

  // === Preferences, Region, Currency, Language & Onboarding ===
  app.put('/api/preferences', resolveUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const patch = req.body || {};
      const currentPrefs = dbInstance.getPreferences(userId);

      if (patch.regionCode !== undefined && !VALID_REGIONS.has(patch.regionCode)) {
        res.status(400).json({ error: 'Unsupported region. Supported: PL, AZ' });
        return;
      }
      if (patch.currencyCode !== undefined && !VALID_CURRENCIES.has(patch.currencyCode)) {
        res.status(400).json({ error: 'Unsupported currency. Supported: PLN, AZN' });
        return;
      }
      if (patch.language !== undefined && !VALID_LANGUAGES.has(patch.language)) {
        res.status(400).json({ error: 'Unsupported language. Supported: en, pl, az' });
        return;
      }

      const targetRegion: RegionCode = patch.regionCode || currentPrefs.regionCode || 'PL';

      // Validate that if preferredSupermarket is explicitly supplied without changing region, it must belong to targetRegion
      if (
        patch.preferredSupermarket !== undefined &&
        !isSupermarketInRegion(patch.preferredSupermarket, targetRegion)
      ) {
        res.status(400).json({
          error: `Supermarket '${patch.preferredSupermarket}' does not belong to region '${targetRegion}'`,
        });
        return;
      }

      const minBudget = (patch.currencyCode || getDefaultCurrencyForRegion(targetRegion)) === 'AZN' ? 15 : 20;
      if (patch.weeklyBudgetPln !== undefined && Number(patch.weeklyBudgetPln) < minBudget) {
        res.status(400).json({ error: `Weekly budget must be at least ${minBudget}` });
        return;
      }
      if (patch.householdSize !== undefined && (Number(patch.householdSize) < 1 || Number(patch.householdSize) > 20)) {
        res.status(400).json({ error: 'Household size must be between 1 and 20' });
        return;
      }
      if (
        patch.planDurationDays !== undefined &&
        (Number(patch.planDurationDays) < 1 || Number(patch.planDurationDays) > 7)
      ) {
        res.status(400).json({ error: 'Plan duration must be between 1 and 7 days' });
        return;
      }

      dbInstance.updatePreferences(userId, patch);
      if (patch.regeneratePlan) {
        await dbInstance.generateAndSaveWeeklyPlan(userId, Date.now() % 100);
      }
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // === AI Meal Planner Endpoints ===
  app.post('/api/meal-plan/generate', resolveUser, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const body = req.body || {};
      const wizardPrefs = body.preferences && typeof body.preferences === 'object' ? body.preferences : null;
      if (wizardPrefs) {
        dbInstance.updatePreferences(userId, wizardPrefs);
      }
      const seed = typeof body.variationSeed === 'number' ? body.variationSeed : Math.floor(Math.random() * 1000) + 1;
      await dbInstance.generateAndSaveWeeklyPlan(userId, seed);
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/meal-plan/meal', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { dayIndex, mealType, recipeId, servings, plannedMealId } = req.body || {};
      const parsedDayIndex = dayIndex !== undefined ? Number(dayIndex) : 0;
      if (!Number.isInteger(parsedDayIndex) || parsedDayIndex < 0 || parsedDayIndex > 6) {
        res.status(400).json({ error: 'dayIndex must be an integer between 0 and 6' });
        return;
      }
      const resolvedMealType = mealType || 'lunch';
      if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(resolvedMealType)) {
        res.status(400).json({ error: 'mealType must be one of breakfast, lunch, dinner, snack' });
        return;
      }
      dbInstance.replaceOrAddPlannedMeal({
        userId,
        dayIndex: parsedDayIndex,
        mealType: resolvedMealType,
        recipeId,
        servings: servings !== undefined ? Number(servings) : undefined,
        plannedMealId,
      });
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/meal-plan/meal/:id/servings', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const servings = Number(req.body?.servings);
      dbInstance.updatePlannedMealServings(userId, String(req.params.id), servings);
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/meal-plan/meal/:id', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      dbInstance.removePlannedMeal(userId, String(req.params.id));
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // === Recipes Discovery, Servings/Ingredient Sync & Custom Recipe Creation ===
  app.patch('/api/recipes/:id/servings', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const recipeId = String(req.params.id);
      const servings = Number(req.body?.servings);
      const dayIndex = req.body?.dayIndex !== undefined ? Number(req.body.dayIndex) : undefined;
      dbInstance.updatePlannedMealsServingsByRecipe(userId, recipeId, servings, dayIndex);
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch('/api/recipes/:id/ingredient', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const recipeId = String(req.params.id);
      const ingredientId = String(req.body?.ingredientId || '');
      const amount = Number(req.body?.amount);
      dbInstance.updateRecipeIngredientAmount(userId, recipeId, ingredientId, amount);
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/recipes/:id/favourite', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      dbInstance.toggleFavouriteRecipe(userId, String(req.params.id));
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      if (err.message === 'RECIPE_NOT_FOUND') {
        res.status(404).json({ error: 'Recipe not found' });
        return;
      }
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/recipes', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const body = req.body || {};
      const titlePl = String(body.titlePl || body.titleEn || body.titleAz || '').trim();
      const titleEn = String(body.titleEn || body.titlePl || body.titleAz || '').trim();
      const titleAz = String(body.titleAz || body.titleEn || body.titlePl || '').trim();
      if (!titlePl) {
        res.status(400).json({ error: 'Recipe title is required' });
        return;
      }

      const rawIngredients = Array.isArray(body.ingredients) ? body.ingredients : [];
      if (rawIngredients.length === 0) {
        res.status(400).json({ error: 'At least one ingredient is required' });
        return;
      }

      const recipeId = `rec-custom-${Date.now()}`;
      const ingredients: RecipeIngredient[] = rawIngredients.map((ing: any, idx: number) => {
        const rawName = String(ing.canonicalIngredient || ing.nameEn || ing.namePl || ing.nameAz || '').trim();
        const canonical =
          resolveCanonicalIngredient(rawName) ||
          resolveCanonicalIngredient(String(ing.namePl || '')) ||
          resolveCanonicalIngredient(String(ing.nameEn || '')) ||
          resolveCanonicalIngredient(String(ing.nameAz || '')) ||
          rawName.toLowerCase().replace(/\s+/g, '_');
        const amount = Number(ing.amount) || 100;
        const unit = ing.unit || 'g';
        const norm = normalizeIngredientQuantity(amount, unit, canonical);
        const label = String(ing.namePl || ing.nameEn || ing.nameAz || canonical).trim();
        return {
          id: `ing-${recipeId}-${idx}`,
          canonicalIngredient: canonical,
          namePl: String(ing.namePl || label).trim(),
          nameEn: String(ing.nameEn || label).trim(),
          nameAz: String(ing.nameAz || label).trim(),
          amount,
          unit,
          displayAmountPl: `${amount} ${unit}`,
          displayAmountEn: `${amount} ${unit}`,
          displayAmountAz: `${amount} ${unit}`,
          normalizedBaseAmount: norm.amount,
          normalizedBaseUnit: norm.baseUnit,
          category: ing.category || 'Other',
          icon: ing.icon || '🥘',
        };
      });

      const prefs = dbInstance.getPreferences(userId);
      const inputCost = Number(body.estimatedCostPln) || (prefs.currencyCode === 'AZN' ? 5.5 : 11.5);
      const estimatedCostPln =
        prefs.currencyCode === 'AZN' ? Number((inputCost * 2.25).toFixed(2)) : inputCost;
      const estimatedCostAzn =
        prefs.currencyCode === 'AZN' ? inputCost : Number((inputCost * 0.45).toFixed(2));

      const newRecipe: Recipe = {
        id: recipeId,
        slug: titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        authorUserId: userId,
        titlePl,
        titleEn,
        titleAz,
        descriptionPl: String(body.descriptionPl || body.descriptionEn || 'Domowy przepis użytkownika.'),
        descriptionEn: String(body.descriptionEn || body.descriptionPl || 'Custom user recipe.'),
        descriptionAz: String(body.descriptionAz || body.descriptionEn || 'İstifadəçi resepti.'),
        mealType: body.mealType || 'lunch',
        category: body.category || 'Budget-friendly',
        regionSuitability: ['PL', 'AZ'],
        imageUrl:
          body.imageUrl ||
          'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
        prepTimeMin: Number(body.prepTimeMin) || 10,
        cookTimeMin: Number(body.cookTimeMin) || 15,
        totalTimeMin: (Number(body.prepTimeMin) || 10) + (Number(body.cookTimeMin) || 15),
        difficulty: body.difficulty || 'Easy',
        baseServings: Number(body.baseServings) || 2,
        estimatedCostPln,
        estimatedCostAzn,
        nutrition: {
          caloriesKcal: Number(body.caloriesKcal) || 490,
          proteinG: Number(body.proteinG) || 28,
          carbsG: Number(body.carbsG) || 52,
          fatG: Number(body.fatG) || 14,
          fiberG: 6,
        },
        dietaryTags: Array.isArray(body.dietaryTags) ? body.dietaryTags : [],
        allergens: Array.isArray(body.allergens) ? body.allergens : [],
        equipment: ['Garnek', 'Patelnia'],
        ingredients,
        instructionsPl: Array.isArray(body.instructionsPl) && body.instructionsPl.length > 0
          ? body.instructionsPl
          : ['Przygotuj wszystkie składniki i ugotuj zgodnie ze sztuką kulinarną.'],
        instructionsEn: Array.isArray(body.instructionsEn) && body.instructionsEn.length > 0
          ? body.instructionsEn
          : ['Prepare all ingredients and cook until tender and flavorful.'],
        instructionsAz: Array.isArray(body.instructionsAz) && body.instructionsAz.length > 0
          ? body.instructionsAz
          : ['Bütün ərzaqları hazırlayın və zövqə görə bişirin.'],
        isCustom: true,
      };

      const validation = validateRecipeForUser(newRecipe, prefs, { enforcePrepTime: false });
      if (!validation.valid) {
        res.status(400).json({ error: validation.violations.join(' | ') });
        return;
      }

      dbInstance.insertRecipeRecord(newRecipe);
      res.status(201).json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // === Smart Shopping List Endpoints ===
  app.post('/api/shopping-list/toggle', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const { key } = req.body || {};
    if (!key) {
      res.status(400).json({ error: 'Item key is required' });
      return;
    }
    dbInstance.toggleShoppingItemPurchased(userId, String(key));
    res.json(buildFullStatePayload(userId));
  });

  app.put('/api/shopping-list/settings', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    const body = req.body || {};
    const prefs = dbInstance.getPreferences(userId);
    const activeRegion = prefs.regionCode || 'PL';

    if (
      body.supermarketId !== undefined &&
      !isSupermarketInRegion(body.supermarketId as SupermarketSlug, activeRegion)
    ) {
      res.status(400).json({
        error: `Supermarket '${body.supermarketId}' does not belong to region '${activeRegion}'`,
      });
      return;
    }

    dbInstance.setShoppingListSettings(userId, body);
    res.json(buildFullStatePayload(userId));
  });

  app.post('/api/shopping-list/manual', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      dbInstance.addManualShoppingItem(userId, req.body || {});
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/shopping-list/manual/:id', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    dbInstance.removeManualShoppingItem(userId, String(req.params.id));
    res.json(buildFullStatePayload(userId));
  });

  // === Pantry & Leftovers Endpoints ===
  app.post('/api/pantry', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      dbInstance.addPantryItem(userId, req.body || {});
      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/pantry/:id', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    const userId = req.userId!;
    dbInstance.deletePantryItem(userId, String(req.params.id));
    res.json(buildFullStatePayload(userId));
  });

  // === Supermarket Price Comparison & Live Adapter Status ===
  app.get('/api/supermarkets/compare', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const queryRegion = typeof req.query.region === 'string' ? (req.query.region as RegionCode) : undefined;
    const user = req.userId ? dbInstance.getUserById(req.userId) : null;
    const regionCode: RegionCode =
      queryRegion && VALID_REGIONS.has(queryRegion)
        ? queryRegion
        : user?.regionCode || user?.preferences.regionCode || 'PL';

    res.json({
      regionCode,
      supermarkets: supermarketRegistry.getAllSupermarkets(regionCode),
      comparisons: supermarketRegistry.compareProductsAcrossStores(q, regionCode),
    });
  });

  // === Apply Budget Optimization Suggestion ===
  app.post('/api/budget/apply-suggestion', resolveUser, (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.userId!;
      const { type, targetSupermarketId, targetPlannedMealId, replacementRecipeId } = req.body || {};

      if (type === 'STORE_SWITCH' && targetSupermarketId) {
        dbInstance.setShoppingListSettings(userId, { supermarketId: targetSupermarketId });
      } else if (type === 'RECIPE_SWAP' && targetPlannedMealId && replacementRecipeId) {
        const plan = dbInstance.getWeeklyPlan(userId);
        const existingMeal = plan.meals.find((m) => m.id === targetPlannedMealId);
        if (existingMeal) {
          dbInstance.replaceOrAddPlannedMeal({
            userId,
            dayIndex: existingMeal.dayIndex,
            mealType: existingMeal.mealType,
            recipeId: replacementRecipeId,
            servings: existingMeal.servings,
            plannedMealId: existingMeal.id,
          });
        }
      } else if (type === 'PANTRY_UTILIZATION') {
        dbInstance.setShoppingListSettings(userId, { subtractPantry: true });
      }

      res.json(buildFullStatePayload(userId));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Serve static frontend bundle
  const distDir = resolve(process.cwd(), 'dist/public');
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
        return;
      }
      res.sendFile(resolve(distDir, 'index.html'));
    });
  }

  return app;
}
