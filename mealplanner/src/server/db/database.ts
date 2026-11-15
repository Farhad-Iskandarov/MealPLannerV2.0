import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncType;
};
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  User,
  UserPreferences,
  Recipe,
  WeeklyPlan,
  PlannedMeal,
  ShoppingList,
  ShoppingItem,
  PantryItem,
  SupermarketSlug,
  Language,
  MealType,
  RegionCode,
  CurrencyCode,
} from '../../shared/types';
import { SUPERMARKETS, ALL_CATALOGUE_PRODUCTS } from '../supermarkets/catalogueData';
import { SEED_RECIPES } from '../recipes/recipeSeedData';
import { hashPassword } from '../auth/authService';
import {
  buildSmartShoppingList,
  normalizeIngredientQuantity,
  resolveCanonicalIngredient,
} from '../matching/quantityEngine';
import {
  generateValidatedWeeklyMealPlan,
  getRecipeBaseCostForCurrency,
} from '../ai/aiMealPlanner';
import { validateRecipeForUser } from '../validation/mealValidator';
import {
  getDefaultCurrencyForRegion,
  resolveValidSupermarketForRegion,
  convertHistoricalMonetaryAmount,
  formatMoney,
} from '../../shared/regionConfig';

export class MealPlannerDatabase {
  public db: DatabaseSyncType;

  constructor(dbPath = process.env.DATABASE_PATH || './data/mealplanner.sqlite') {
    if (dbPath !== ':memory:') {
      const fullPath = resolve(dbPath);
      mkdirSync(dirname(fullPath), { recursive: true });
      this.db = new DatabaseSync(fullPath);
    } else {
      this.db = new DatabaseSync(':memory:');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private migrateUsersLanguageConstraintIfNeeded(): void {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get() as { sql?: string } | undefined;
    if (!row?.sql) return;
    // Older schema had CHECK(language IN ('pl', 'en')) without 'az'
    if (row.sql.includes("CHECK(language IN ('pl', 'en'))")) {
      this.db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE users_migrated (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          avatar_url TEXT NOT NULL,
          language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en', 'pl', 'az')),
          region_code TEXT NOT NULL DEFAULT 'PL',
          currency_code TEXT NOT NULL DEFAULT 'PLN',
          reset_code TEXT,
          created_at TEXT NOT NULL
        );
        INSERT INTO users_migrated (id, email, password_hash, display_name, avatar_url, language, reset_code, created_at)
        SELECT id, email, password_hash, display_name, avatar_url, language, reset_code, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_migrated RENAME TO users;
        PRAGMA foreign_keys = ON;
      `);
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en' CHECK(language IN ('en', 'pl', 'az')),
        region_code TEXT NOT NULL DEFAULT 'PL',
        currency_code TEXT NOT NULL DEFAULT 'PLN',
        reset_code TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS households (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        members_count INTEGER NOT NULL CHECK(members_count >= 1 AND members_count <= 20),
        share_code TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        region_code TEXT NOT NULL DEFAULT 'PL',
        currency_code TEXT NOT NULL DEFAULT 'PLN',
        household_size INTEGER NOT NULL DEFAULT 2 CHECK(household_size >= 1 AND household_size <= 20),
        weekly_budget_pln REAL NOT NULL DEFAULT 250.0 CHECK(weekly_budget_pln >= 10),
        preferred_supermarket TEXT NOT NULL DEFAULT 'biedronka',
        dietary_restrictions_json TEXT NOT NULL DEFAULT '[]',
        custom_restrictions_json TEXT NOT NULL DEFAULT '[]',
        allergies_json TEXT NOT NULL DEFAULT '[]',
        excluded_ingredients_json TEXT NOT NULL DEFAULT '[]',
        dislikes_json TEXT NOT NULL DEFAULT '[]',
        cooking_skill TEXT NOT NULL DEFAULT 'intermediate',
        preferred_prep_time_min INTEGER NOT NULL DEFAULT 35,
        kitchen_equipment_json TEXT NOT NULL DEFAULT '[]',
        meals_per_day INTEGER NOT NULL DEFAULT 3,
        include_snacks INTEGER NOT NULL DEFAULT 0,
        notifications_json TEXT NOT NULL,
        onboarding_completed INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS supermarkets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        region_code TEXT NOT NULL DEFAULT 'PL',
        country TEXT NOT NULL,
        currency TEXT NOT NULL,
        primary_color TEXT NOT NULL,
        loyalty_program_name TEXT NOT NULL,
        website_url TEXT NOT NULL,
        adapter_status TEXT NOT NULL,
        last_synced_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        region_code TEXT NOT NULL DEFAULT 'PL',
        currency_code TEXT NOT NULL DEFAULT 'PLN',
        ean TEXT NOT NULL,
        canonical_ingredient TEXT NOT NULL,
        name_pl TEXT NOT NULL,
        name_en TEXT NOT NULL,
        name_az TEXT,
        brand TEXT NOT NULL,
        category TEXT NOT NULL,
        package_size REAL NOT NULL,
        package_unit TEXT NOT NULL,
        package_label_pl TEXT NOT NULL,
        package_label_en TEXT NOT NULL,
        package_label_az TEXT,
        icon TEXT NOT NULL,
        image_url TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS product_prices (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        supermarket_id TEXT NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
        regular_price_pln REAL NOT NULL,
        promo_price_pln REAL,
        effective_price_pln REAL NOT NULL,
        unit_price_pln REAL NOT NULL,
        unit_price_label TEXT NOT NULL,
        loyalty_required INTEGER NOT NULL DEFAULT 0,
        loyalty_condition_pl TEXT,
        loyalty_condition_en TEXT,
        loyalty_condition_az TEXT,
        promo_valid_until TEXT,
        store_channel TEXT NOT NULL,
        store_location TEXT NOT NULL,
        source_name TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        last_updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        supermarket_id TEXT NOT NULL REFERENCES supermarkets(id) ON DELETE CASCADE,
        price_pln REAL NOT NULL,
        recorded_at TEXT NOT NULL,
        source_type TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        author_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        title_pl TEXT NOT NULL,
        title_en TEXT NOT NULL,
        title_az TEXT,
        description_pl TEXT NOT NULL,
        description_en TEXT NOT NULL,
        description_az TEXT,
        meal_type TEXT NOT NULL,
        category TEXT NOT NULL,
        region_suitability_json TEXT NOT NULL DEFAULT '["PL","AZ"]',
        image_url TEXT NOT NULL,
        prep_time_min INTEGER NOT NULL,
        cook_time_min INTEGER NOT NULL,
        total_time_min INTEGER NOT NULL,
        difficulty TEXT NOT NULL,
        base_servings INTEGER NOT NULL,
        estimated_cost_pln REAL NOT NULL,
        estimated_cost_azn REAL,
        nutrition_json TEXT NOT NULL,
        dietary_tags_json TEXT NOT NULL,
        allergens_json TEXT NOT NULL,
        equipment_json TEXT NOT NULL,
        instructions_pl_json TEXT NOT NULL,
        instructions_en_json TEXT NOT NULL,
        instructions_az_json TEXT,
        is_custom INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ingredients (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        canonical_ingredient TEXT NOT NULL,
        name_pl TEXT NOT NULL,
        name_en TEXT NOT NULL,
        name_az TEXT,
        amount REAL NOT NULL,
        unit TEXT NOT NULL,
        display_amount_pl TEXT NOT NULL,
        display_amount_en TEXT NOT NULL,
        display_amount_az TEXT,
        normalized_base_amount REAL NOT NULL,
        normalized_base_unit TEXT NOT NULL,
        category TEXT NOT NULL,
        icon TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS weekly_plans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        region_code TEXT NOT NULL DEFAULT 'PL',
        currency_code TEXT NOT NULL DEFAULT 'PLN',
        week_start_date TEXT NOT NULL,
        week_label_pl TEXT NOT NULL,
        week_label_en TEXT NOT NULL,
        week_label_az TEXT,
        target_budget_pln REAL NOT NULL,
        supermarket_id TEXT NOT NULL,
        household_size INTEGER NOT NULL,
        ai_notes_pl TEXT NOT NULL,
        ai_notes_en TEXT NOT NULL,
        ai_notes_az TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS planned_meals (
        id TEXT PRIMARY KEY,
        weekly_plan_id TEXT NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_index INTEGER NOT NULL CHECK(day_index >= 0 AND day_index <= 6),
        date_str TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        servings INTEGER NOT NULL CHECK(servings >= 1 AND servings <= 20)
      );

      CREATE TABLE IF NOT EXISTS shopping_lists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        weekly_plan_id TEXT NOT NULL,
        supermarket_id TEXT NOT NULL,
        region_code TEXT NOT NULL DEFAULT 'PL',
        currency_code TEXT NOT NULL DEFAULT 'PLN',
        subtract_pantry INTEGER NOT NULL DEFAULT 0,
        purchased_keys_json TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shopping_items (
        id TEXT PRIMARY KEY,
        shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        canonical_ingredient TEXT NOT NULL,
        name_pl TEXT NOT NULL,
        name_en TEXT NOT NULL,
        name_az TEXT,
        category TEXT NOT NULL,
        icon TEXT NOT NULL,
        required_amount REAL NOT NULL,
        required_unit TEXT NOT NULL,
        package_size_label TEXT NOT NULL,
        line_total_pln REAL NOT NULL,
        is_purchased INTEGER NOT NULL DEFAULT 0,
        is_manual INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS pantry (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        canonical_ingredient TEXT NOT NULL,
        name_pl TEXT NOT NULL,
        name_en TEXT NOT NULL,
        name_az TEXT,
        quantity REAL NOT NULL CHECK(quantity > 0),
        unit TEXT NOT NULL,
        normalized_amount REAL NOT NULL,
        normalized_unit TEXT NOT NULL,
        category TEXT NOT NULL,
        expiry_date TEXT,
        added_at TEXT NOT NULL,
        icon TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS favourites (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        entry_type TEXT NOT NULL DEFAULT 'favourite' CHECK(entry_type IN ('favourite', 'recent')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, recipe_id, entry_type)
      );

      CREATE INDEX IF NOT EXISTS idx_products_canonical ON products(canonical_ingredient);
      CREATE INDEX IF NOT EXISTS idx_product_prices_store ON product_prices(supermarket_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_planned_meals_user_day ON planned_meals(user_id, day_index);
      CREATE INDEX IF NOT EXISTS idx_pantry_user ON pantry(user_id);
      CREATE INDEX IF NOT EXISTS idx_shopping_items_user ON shopping_items(user_id);
      CREATE INDEX IF NOT EXISTS idx_recipes_author ON recipes(author_user_id);
    `);

    // Safe non-destructive migrations for existing SQLite databases on disk
    this.migrateUsersLanguageConstraintIfNeeded();
    this.ensureColumn('users', 'region_code', "TEXT NOT NULL DEFAULT 'PL'");
    this.ensureColumn('users', 'currency_code', "TEXT NOT NULL DEFAULT 'PLN'");
    this.ensureColumn('preferences', 'region_code', "TEXT NOT NULL DEFAULT 'PL'");
    this.ensureColumn('preferences', 'currency_code', "TEXT NOT NULL DEFAULT 'PLN'");
    this.ensureColumn('preferences', 'plan_duration_days', 'INTEGER NOT NULL DEFAULT 7');
    this.ensureColumn('preferences', 'food_vibes_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('preferences', 'custom_food_vibes_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn('supermarkets', 'region_code', "TEXT NOT NULL DEFAULT 'PL'");
    this.ensureColumn('products', 'region_code', "TEXT NOT NULL DEFAULT 'PL'");
    this.ensureColumn('products', 'currency_code', "TEXT NOT NULL DEFAULT 'PLN'");
    this.ensureColumn('products', 'name_az', 'TEXT');
    this.ensureColumn('products', 'package_label_az', 'TEXT');
    this.ensureColumn('product_prices', 'loyalty_condition_az', 'TEXT');
    this.ensureColumn('recipes', 'title_az', 'TEXT');
    this.ensureColumn('recipes', 'description_az', 'TEXT');
    this.ensureColumn('recipes', 'region_suitability_json', 'TEXT NOT NULL DEFAULT \'["PL","AZ"]\'');
    this.ensureColumn('recipes', 'estimated_cost_azn', 'REAL');
    this.ensureColumn('recipes', 'instructions_az_json', 'TEXT');
    this.ensureColumn('ingredients', 'name_az', 'TEXT');
    this.ensureColumn('ingredients', 'display_amount_az', 'TEXT');
    this.ensureColumn('weekly_plans', 'region_code', "TEXT NOT NULL DEFAULT 'PL'");
    this.ensureColumn('weekly_plans', 'currency_code', "TEXT NOT NULL DEFAULT 'PLN'");
    this.ensureColumn('weekly_plans', 'plan_duration_days', 'INTEGER NOT NULL DEFAULT 7');
    this.ensureColumn('weekly_plans', 'week_label_az', 'TEXT');
    this.ensureColumn('weekly_plans', 'ai_notes_az', 'TEXT');
    this.ensureColumn('shopping_lists', 'region_code', "TEXT NOT NULL DEFAULT 'PL'");
    this.ensureColumn('shopping_lists', 'currency_code', "TEXT NOT NULL DEFAULT 'PLN'");
    this.ensureColumn('shopping_items', 'name_az', 'TEXT');
    this.ensureColumn('pantry', 'name_az', 'TEXT');
  }

  private syncReferenceCataloguesAndRecipes(): void {
    // Upsert all Polish and Azerbaijani supermarkets
    const insStore = this.db.prepare(`
      INSERT OR REPLACE INTO supermarkets (id, name, region_code, country, currency, primary_color, loyalty_program_name, website_url, adapter_status, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of SUPERMARKETS) {
      insStore.run(
        s.id,
        s.name,
        s.regionCode,
        s.country,
        s.currency,
        s.primaryColor,
        s.loyaltyProgramName,
        s.websiteUrl,
        s.adapterStatus,
        s.lastSyncedAt
      );
    }

    // Upsert all Polish (PLN) & Azerbaijani (AZN) products & prices
    const insProd = this.db.prepare(`
      INSERT OR REPLACE INTO products (
        id, region_code, currency_code, ean, canonical_ingredient,
        name_pl, name_en, name_az, brand, category,
        package_size, package_unit, package_label_pl, package_label_en, package_label_az, icon, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insPrice = this.db.prepare(`
      INSERT OR REPLACE INTO product_prices (
        id, product_id, supermarket_id, regular_price_pln, promo_price_pln,
        effective_price_pln, unit_price_pln, unit_price_label, loyalty_required,
        loyalty_condition_pl, loyalty_condition_en, loyalty_condition_az,
        promo_valid_until, store_channel, store_location, source_name, verification_status, last_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insHistory = this.db.prepare(`
      INSERT OR REPLACE INTO price_history (id, product_id, supermarket_id, price_pln, recorded_at, source_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const p of ALL_CATALOGUE_PRODUCTS) {
      insProd.run(
        p.id,
        p.regionCode || 'PL',
        p.currencyCode || 'PLN',
        p.ean,
        p.canonicalIngredient,
        p.namePl,
        p.nameEn,
        p.nameAz || p.nameEn,
        p.brand,
        p.category,
        p.packageSize,
        p.packageUnit,
        p.packageLabelPl,
        p.packageLabelEn,
        p.packageLabelAz || p.packageLabelEn,
        p.icon,
        p.imageUrl
      );

      for (const [, priceRec] of Object.entries(p.prices)) {
        if (!priceRec) continue;
        insPrice.run(
          priceRec.id,
          priceRec.productId,
          priceRec.supermarketId,
          priceRec.regularPricePln,
          priceRec.promoPricePln,
          priceRec.effectivePricePln,
          priceRec.unitPricePln,
          priceRec.unitPriceLabel,
          priceRec.loyaltyRequired ? 1 : 0,
          priceRec.loyaltyConditionPl,
          priceRec.loyaltyConditionEn,
          priceRec.loyaltyConditionAz || null,
          priceRec.promoValidUntil,
          priceRec.storeChannel,
          priceRec.storeLocation,
          priceRec.sourceName,
          priceRec.verificationStatus,
          priceRec.lastUpdatedAt
        );
        insHistory.run(
          `hist-${priceRec.id}-1`,
          priceRec.productId,
          priceRec.supermarketId,
          priceRec.regularPricePln,
          '2026-11-01T08:00:00Z',
          'REGULAR_CATALOGUE'
        );
        insHistory.run(
          `hist-${priceRec.id}-2`,
          priceRec.productId,
          priceRec.supermarketId,
          priceRec.effectivePricePln,
          priceRec.lastUpdatedAt,
          priceRec.verificationStatus
        );
      }
    }

    // Upsert all seeded recipes (including Azerbaijani national recipes)
    for (const r of SEED_RECIPES) {
      this.insertRecipeRecord(r);
    }
  }

  public async seedIfEmpty(_options?: { seedDemoUser?: boolean }): Promise<void> {
    const userCountRow = this.db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
    this.syncReferenceCataloguesAndRecipes();

    if (userCountRow.cnt > 0) {
      return;
    }

    // Seed Default User matching Screen 5 of Reference Image: Farhad Isgandarov (farhad@email.com)
    // Default language: English ('en') per Section 4 ("1. English — DEFAULT"), switchable to Polski ('pl') or Azərbaycan dili ('az')
    const defaultUserId = 'user-farhad-1';
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, display_name, avatar_url, language, region_code, currency_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'PL', 'PLN', ?)`
      )
      .run(
        defaultUserId,
        'farhad@email.com',
        hashPassword('MealPlanner2026!'),
        'Farhad Isgandarov',
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
        'en',
        now
      );

    this.db
      .prepare(
        `INSERT INTO households (id, user_id, name, members_count, share_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run('hh-farhad-1', defaultUserId, 'Dom Farhada', 2, 'MP-PL-2026', now);

    const defaultNotifs = {
      enabled: true,
      weeklyMealPlans: true,
      shoppingReminders: true,
      expiringPantryProducts: true,
      mealPrepReminders: true,
    };

    this.db
      .prepare(
        `INSERT INTO preferences (
          user_id, region_code, currency_code, household_size, weekly_budget_pln, preferred_supermarket,
          dietary_restrictions_json, custom_restrictions_json, allergies_json,
          excluded_ingredients_json, dislikes_json, cooking_skill,
          preferred_prep_time_min, kitchen_equipment_json, meals_per_day,
          include_snacks, notifications_json, onboarding_completed, updated_at
        ) VALUES (?, 'PL', 'PLN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        defaultUserId,
        2,
        250.0,
        'biedronka',
        JSON.stringify(['high_protein']),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        'intermediate',
        35,
        JSON.stringify(['Patelnia', 'Garnek', 'Piekarnik']),
        3,
        0,
        JSON.stringify(defaultNotifs),
        1,
        now
      );

    // 5. Seed 12 Pantry items (matching "Pantry: 12 items" in Screen 5 of the Reference Image!)
    const seedPantry: Array<{
      canonical: string;
      namePl: string;
      nameEn: string;
      nameAz: string;
      qty: number;
      unit: 'g' | 'ml' | 'pcs';
      cat: PantryItem['category'];
      expiry: string;
      icon: string;
    }> = [
      { canonical: 'olive_oil', namePl: 'Oliwa z oliwek Extra Virgin', nameEn: 'Olive oil', nameAz: 'Zeytun yağı Extra Virgin', qty: 350, unit: 'ml', cat: 'Other', expiry: '2027-03-15', icon: '🫒' },
      { canonical: 'paprika', namePl: 'Papryka słodka mielona', nameEn: 'Sweet paprika', nameAz: 'Şirin qırmızı bibər', qty: 15, unit: 'g', cat: 'Other', expiry: '2027-06-01', icon: '🌶️' },
      { canonical: 'garlic', namePl: 'Czosnek polski', nameEn: 'Garlic', nameAz: 'Təzə sarımsaq', qty: 50, unit: 'g', cat: 'Fruit & Vegetables', expiry: '2026-11-25', icon: '🧄' },
      { canonical: 'onion', namePl: 'Cebula żółta', nameEn: 'Yellow onion', nameAz: 'Sarı baş soğan', qty: 300, unit: 'g', cat: 'Fruit & Vegetables', expiry: '2026-11-28', icon: '🧅' },
      { canonical: 'carrot', namePl: 'Marchew', nameEn: 'Carrots', nameAz: 'Təzə kök', qty: 250, unit: 'g', cat: 'Fruit & Vegetables', expiry: '2026-11-14', icon: '🥕' },
      { canonical: 'potato', namePl: 'Ziemniaki', nameEn: 'Potatoes', nameAz: 'Kartof', qty: 400, unit: 'g', cat: 'Fruit & Vegetables', expiry: '2026-11-30', icon: '🥔' },
      { canonical: 'eggs', namePl: 'Jaja z wolnego wybiegu', nameEn: 'Free-range eggs', nameAz: 'Kənd yumurtası', qty: 4, unit: 'pcs', cat: 'Dairy', expiry: '2026-11-15', icon: '🥚' },
      { canonical: 'milk', namePl: 'Mleko świeże 2%', nameEn: 'Fresh milk 2%', nameAz: 'Təzə süd 2.5%', qty: 400, unit: 'ml', cat: 'Dairy', expiry: '2026-11-13', icon: '🥛' },
      { canonical: 'apple', namePl: 'Jabłka polskie', nameEn: 'Fresh apples', nameAz: 'Quba alması', qty: 400, unit: 'g', cat: 'Fruit & Vegetables', expiry: '2026-11-22', icon: '🍎' },
      { canonical: 'red_lentils', namePl: 'Soczewica czerwona', nameEn: 'Red lentils', nameAz: 'Qırmızı mərcimək', qty: 150, unit: 'g', cat: 'Dry Products', expiry: '2027-04-10', icon: '🫘' },
      { canonical: 'pasta', namePl: 'Makaron pełnoziarnisty', nameEn: 'Wholegrain pasta', nameAz: 'Bərk buğda makaronu', qty: 200, unit: 'g', cat: 'Dry Products', expiry: '2027-05-20', icon: '🍝' },
      { canonical: 'canned_tomatoes', namePl: 'Pomidory w puszce', nameEn: 'Canned tomatoes', nameAz: 'Doğranmış pomidor (konserv)', qty: 400, unit: 'g', cat: 'Dry Products', expiry: '2027-08-01', icon: '🥫' },
    ];

    const insPantry = this.db.prepare(`
      INSERT INTO pantry (id, user_id, canonical_ingredient, name_pl, name_en, name_az, quantity, unit, normalized_amount, normalized_unit, category, expiry_date, added_at, icon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    seedPantry.forEach((item, idx) => {
      insPantry.run(
        `pantry-${defaultUserId}-${idx + 1}`,
        defaultUserId,
        item.canonical,
        item.namePl,
        item.nameEn,
        item.nameAz,
        item.qty,
        item.unit,
        item.qty,
        item.unit,
        item.cat,
        item.expiry,
        now,
        item.icon
      );
    });

    // 6. Seed Favourites
    this.db
      .prepare(`INSERT INTO favourites (user_id, recipe_id, entry_type, created_at) VALUES (?, ?, 'favourite', ?)`)
      .run(defaultUserId, 'rec-grilled-chicken-rice', now);
    this.db
      .prepare(`INSERT INTO favourites (user_id, recipe_id, entry_type, created_at) VALUES (?, ?, 'favourite', ?)`)
      .run(defaultUserId, 'rec-oatmeal-banana', now);

    // 7. Generate initial 7-day meal plan & shopping list for default user
    await this.generateAndSaveWeeklyPlan(defaultUserId, 0);

    // Mark 'banana' and 'rice' as purchased in default shopping list to match the green checkboxes on Screen 4!
    const defaultPurchased = { banana: true, rice: true };
    this.db
      .prepare(`UPDATE shopping_lists SET purchased_keys_json = ? WHERE user_id = ?`)
      .run(JSON.stringify(defaultPurchased), defaultUserId);
  }

  public insertRecipeRecord(r: Recipe): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO recipes (
          id, slug, author_user_id, title_pl, title_en, title_az,
          description_pl, description_en, description_az,
          meal_type, category, region_suitability_json, image_url,
          prep_time_min, cook_time_min, total_time_min,
          difficulty, base_servings, estimated_cost_pln, estimated_cost_azn,
          nutrition_json, dietary_tags_json, allergens_json, equipment_json,
          instructions_pl_json, instructions_en_json, instructions_az_json, is_custom, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        r.id,
        r.slug,
        r.authorUserId,
        r.titlePl,
        r.titleEn,
        r.titleAz || r.titleEn,
        r.descriptionPl,
        r.descriptionEn,
        r.descriptionAz || r.descriptionEn,
        r.mealType,
        r.category,
        JSON.stringify(r.regionSuitability || ['PL', 'AZ']),
        r.imageUrl,
        r.prepTimeMin,
        r.cookTimeMin,
        r.totalTimeMin,
        r.difficulty,
        r.baseServings,
        r.estimatedCostPln,
        r.estimatedCostAzn ?? Number((r.estimatedCostPln * 0.45).toFixed(2)),
        JSON.stringify(r.nutrition),
        JSON.stringify(r.dietaryTags),
        JSON.stringify(r.allergens),
        JSON.stringify(r.equipment),
        JSON.stringify(r.instructionsPl),
        JSON.stringify(r.instructionsEn),
        JSON.stringify(r.instructionsAz || r.instructionsEn),
        r.isCustom ? 1 : 0,
        now
      );

    this.db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(r.id);
    const insIng = this.db.prepare(`
      INSERT INTO ingredients (
        id, recipe_id, canonical_ingredient, name_pl, name_en, name_az, amount, unit,
        display_amount_pl, display_amount_en, display_amount_az, normalized_base_amount, normalized_base_unit, category, icon
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ing of r.ingredients) {
      insIng.run(
        ing.id,
        r.id,
        ing.canonicalIngredient,
        ing.namePl,
        ing.nameEn,
        ing.nameAz || ing.nameEn,
        ing.amount,
        ing.unit,
        ing.displayAmountPl,
        ing.displayAmountEn,
        ing.displayAmountAz || ing.displayAmountEn,
        ing.normalizedBaseAmount,
        ing.normalizedBaseUnit,
        ing.category,
        ing.icon
      );
    }
  }

  public getUserById(userId: string): User | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as any;
    if (!row) return null;

    const hh = this.db
      .prepare('SELECT * FROM households WHERE user_id = ?')
      .get(userId) as any;

    const preferences = this.getPreferences(userId);
    const regionCode: RegionCode = preferences.regionCode || (row.region_code as RegionCode) || 'PL';
    const currencyCode: CurrencyCode =
      preferences.currencyCode || (row.currency_code as CurrencyCode) || getDefaultCurrencyForRegion(regionCode);

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      language: (row.language as Language) || 'en',
      regionCode,
      currencyCode,
      householdName: hh ? hh.name : 'Dom',
      householdShareCode: hh ? hh.share_code : 'MP-PL-2026',
      createdAt: row.created_at,
      preferences,
    };
  }

  public getUserByEmail(email: string): { user: User; passwordHash: string; resetCode: string | null } | null {
    const row = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email.trim()) as any;
    if (!row) return null;
    const user = this.getUserById(row.id);
    if (!user) return null;
    return {
      user,
      passwordHash: row.password_hash,
      resetCode: row.reset_code ?? null,
    };
  }

  public createUser(params: {
    email: string;
    passwordHash: string;
    displayName: string;
    language?: Language;
    regionCode?: RegionCode;
    currencyCode?: CurrencyCode;
    householdSize?: number;
    weeklyBudgetPln?: number;
    preferredSupermarket?: SupermarketSlug;
  }): User {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const lang: Language = params.language || 'en';
    const regionCode: RegionCode = params.regionCode === 'AZ' ? 'AZ' : 'PL';
    const currencyCode: CurrencyCode =
      params.currencyCode || getDefaultCurrencyForRegion(regionCode);
    const hhSize = params.householdSize || 2;
    const defaultBudget = regionCode === 'AZ' ? 110.0 : 250.0;
    const budget = params.weeklyBudgetPln ?? defaultBudget;
    const store = resolveValidSupermarketForRegion(params.preferredSupermarket, regionCode);

    this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, display_name, avatar_url, language, region_code, currency_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        params.email.trim().toLowerCase(),
        params.passwordHash,
        params.displayName.trim(),
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
        lang,
        regionCode,
        currencyCode,
        now
      );

    this.db
      .prepare(
        `INSERT INTO households (id, user_id, name, members_count, share_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        `hh-${id}`,
        id,
        `Dom ${params.displayName.trim()}`,
        hhSize,
        `MP-${regionCode}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        now
      );

    const defaultNotifs = {
      enabled: true,
      weeklyMealPlans: true,
      shoppingReminders: true,
      expiringPantryProducts: true,
      mealPrepReminders: true,
    };

    this.db
      .prepare(
        `INSERT INTO preferences (
          user_id, region_code, currency_code, household_size, weekly_budget_pln, preferred_supermarket,
          dietary_restrictions_json, custom_restrictions_json, allergies_json,
          excluded_ingredients_json, dislikes_json, cooking_skill,
          preferred_prep_time_min, kitchen_equipment_json, meals_per_day,
          include_snacks, notifications_json, onboarding_completed, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', 'intermediate', 35, '["Patelnia","Garnek"]', 3, 0, ?, 1, ?)`
      )
      .run(id, regionCode, currencyCode, hhSize, budget, store, JSON.stringify(defaultNotifs), now);

    return this.getUserById(id)!;
  }

  public getPreferences(userId: string): UserPreferences {
    const row = this.db
      .prepare('SELECT * FROM preferences WHERE user_id = ?')
      .get(userId) as any;
    if (!row) {
      throw new Error(`Preferences not found for user ${userId}`);
    }
    const regionCode: RegionCode = row.region_code === 'AZ' ? 'AZ' : 'PL';
    const currencyCode: CurrencyCode =
      row.currency_code === 'AZN' || row.currency_code === 'PLN'
        ? row.currency_code
        : getDefaultCurrencyForRegion(regionCode);

    return {
      userId: row.user_id,
      regionCode,
      currencyCode,
      householdSize: row.household_size,
      weeklyBudgetPln: row.weekly_budget_pln,
      planDurationDays: row.plan_duration_days || 7,
      preferredSupermarket: row.preferred_supermarket as SupermarketSlug,
      dietaryRestrictions: JSON.parse(row.dietary_restrictions_json || '[]'),
      customRestrictions: JSON.parse(row.custom_restrictions_json || '[]'),
      allergies: JSON.parse(row.allergies_json || '[]'),
      excludedIngredients: JSON.parse(row.excluded_ingredients_json || '[]'),
      dislikes: JSON.parse(row.dislikes_json || '[]'),
      foodVibes: JSON.parse(row.food_vibes_json || '[]'),
      customFoodVibes: JSON.parse(row.custom_food_vibes_json || '[]'),
      cookingSkill: row.cooking_skill,
      preferredPrepTimeMin: row.preferred_prep_time_min,
      kitchenEquipment: JSON.parse(row.kitchen_equipment_json || '[]'),
      mealsPerDay: row.meals_per_day,
      includeSnacks: Boolean(row.include_snacks),
      notifications: JSON.parse(row.notifications_json),
      onboardingCompleted: Boolean(row.onboarding_completed),
    };
  }

  public updatePreferences(
    userId: string,
    patch: Partial<UserPreferences> & { displayName?: string; language?: Language }
  ): User {
    const current = this.getPreferences(userId);
    const currentRegion: RegionCode = current.regionCode || 'PL';
    const currentCurrency: CurrencyCode =
      current.currencyCode || getDefaultCurrencyForRegion(currentRegion);

    const nextRegion: RegionCode = patch.regionCode
      ? patch.regionCode === 'AZ'
        ? 'AZ'
        : 'PL'
      : currentRegion;

    const regionChanged = nextRegion !== currentRegion;

    // When region changes, automatically select its corresponding default currency unless explicitly overridden
    const nextCurrency: CurrencyCode = patch.currencyCode
      ? patch.currencyCode
      : regionChanged
      ? getDefaultCurrencyForRegion(nextRegion)
      : currentCurrency;

    // Ensure preferred supermarket belongs to the active region
    const candidateStore = patch.preferredSupermarket ?? current.preferredSupermarket;
    const nextSupermarket = resolveValidSupermarketForRegion(candidateStore, nextRegion);

    // If currency changed and user did not pass an explicit weeklyBudgetPln, convert the historical budget target
    // using the reference exchange rate (never 1:1 symbol replacement!)
    let nextBudget = patch.weeklyBudgetPln ?? current.weeklyBudgetPln;
    if (patch.weeklyBudgetPln === undefined && nextCurrency !== currentCurrency) {
      const converted = convertHistoricalMonetaryAmount(
        current.weeklyBudgetPln,
        currentCurrency,
        nextCurrency
      );
      nextBudget = Math.max(20, Math.round(converted.convertedAmount));
    }

    const nextPlanDuration =
      patch.planDurationDays !== undefined
        ? Math.max(1, Math.min(7, Math.round(Number(patch.planDurationDays) || 7)))
        : current.planDurationDays || 7;

    const updated: UserPreferences = {
      ...current,
      ...patch,
      regionCode: nextRegion,
      currencyCode: nextCurrency,
      preferredSupermarket: nextSupermarket,
      weeklyBudgetPln: nextBudget,
      planDurationDays: nextPlanDuration,
      foodVibes: patch.foodVibes ?? current.foodVibes ?? [],
      customFoodVibes: patch.customFoodVibes ?? current.customFoodVibes ?? [],
      notifications: patch.notifications
        ? { ...current.notifications, ...patch.notifications }
        : current.notifications,
    };

    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE preferences SET
          region_code = ?,
          currency_code = ?,
          household_size = ?,
          weekly_budget_pln = ?,
          plan_duration_days = ?,
          preferred_supermarket = ?,
          dietary_restrictions_json = ?,
          custom_restrictions_json = ?,
          allergies_json = ?,
          excluded_ingredients_json = ?,
          dislikes_json = ?,
          food_vibes_json = ?,
          custom_food_vibes_json = ?,
          cooking_skill = ?,
          preferred_prep_time_min = ?,
          kitchen_equipment_json = ?,
          meals_per_day = ?,
          include_snacks = ?,
          notifications_json = ?,
          onboarding_completed = ?,
          updated_at = ?
         WHERE user_id = ?`
      )
      .run(
        updated.regionCode || 'PL',
        updated.currencyCode || 'PLN',
        updated.householdSize,
        updated.weeklyBudgetPln,
        updated.planDurationDays || 7,
        updated.preferredSupermarket,
        JSON.stringify(updated.dietaryRestrictions),
        JSON.stringify(updated.customRestrictions),
        JSON.stringify(updated.allergies),
        JSON.stringify(updated.excludedIngredients),
        JSON.stringify(updated.dislikes),
        JSON.stringify(updated.foodVibes || []),
        JSON.stringify(updated.customFoodVibes || []),
        updated.cookingSkill,
        updated.preferredPrepTimeMin,
        JSON.stringify(updated.kitchenEquipment),
        updated.mealsPerDay,
        updated.includeSnacks ? 1 : 0,
        JSON.stringify(updated.notifications),
        updated.onboardingCompleted ? 1 : 0,
        now,
        userId
      );

    const userRow = this.db
      .prepare('SELECT display_name, language FROM users WHERE id = ?')
      .get(userId) as any;
    if (userRow) {
      this.db
        .prepare(
          'UPDATE users SET display_name = ?, language = ?, region_code = ?, currency_code = ? WHERE id = ?'
        )
        .run(
          patch.displayName?.trim() || userRow.display_name,
          patch.language || userRow.language,
          updated.regionCode || 'PL',
          updated.currencyCode || 'PLN',
          userId
        );
    }

    // Keep shopping_lists and weekly_plans synced with region, currency, supermarket, and budget without deleting existing items
    this.db
      .prepare(
        'UPDATE shopping_lists SET supermarket_id = ?, region_code = ?, currency_code = ?, updated_at = ? WHERE user_id = ?'
      )
      .run(
        updated.preferredSupermarket,
        updated.regionCode || 'PL',
        updated.currencyCode || 'PLN',
        now,
        userId
      );

    this.db
      .prepare(
        'UPDATE weekly_plans SET supermarket_id = ?, region_code = ?, currency_code = ?, target_budget_pln = ?, household_size = ?, updated_at = ? WHERE user_id = ?'
      )
      .run(
        updated.preferredSupermarket,
        updated.regionCode || 'PL',
        updated.currencyCode || 'PLN',
        updated.weeklyBudgetPln,
        updated.householdSize,
        now,
        userId
      );

    return this.getUserById(userId)!;
  }

  public getAllRecipesForUser(userId: string): Recipe[] {
    const rows = this.db
      .prepare('SELECT * FROM recipes WHERE author_user_id IS NULL OR author_user_id = ? ORDER BY is_custom DESC, title_pl ASC')
      .all(userId) as any[];

    const favRows = this.db
      .prepare("SELECT recipe_id FROM favourites WHERE user_id = ? AND entry_type = 'favourite'")
      .all(userId) as Array<{ recipe_id: string }>;
    const favSet = new Set(favRows.map((f) => f.recipe_id));

    return rows.map((row) => {
      const ingRows = this.db
        .prepare('SELECT * FROM ingredients WHERE recipe_id = ?')
        .all(row.id) as any[];

      return {
        id: row.id,
        slug: row.slug,
        authorUserId: row.author_user_id,
        titlePl: row.title_pl,
        titleEn: row.title_en,
        titleAz: row.title_az || row.title_en,
        descriptionPl: row.description_pl,
        descriptionEn: row.description_en,
        descriptionAz: row.description_az || row.description_en,
        mealType: row.meal_type as MealType,
        category: row.category,
        regionSuitability: row.region_suitability_json
          ? JSON.parse(row.region_suitability_json)
          : ['PL', 'AZ'],
        imageUrl: row.image_url,
        prepTimeMin: row.prep_time_min,
        cookTimeMin: row.cook_time_min,
        totalTimeMin: row.total_time_min,
        difficulty: row.difficulty,
        baseServings: row.base_servings,
        estimatedCostPln: row.estimated_cost_pln,
        estimatedCostAzn:
          row.estimated_cost_azn ?? Number((row.estimated_cost_pln * 0.45).toFixed(2)),
        nutrition: JSON.parse(row.nutrition_json),
        dietaryTags: JSON.parse(row.dietary_tags_json),
        allergens: JSON.parse(row.allergens_json),
        equipment: JSON.parse(row.equipment_json),
        ingredients: ingRows.map((i) => ({
          id: i.id,
          canonicalIngredient: i.canonical_ingredient,
          namePl: i.name_pl,
          nameEn: i.name_en,
          nameAz: i.name_az || i.name_en,
          amount: i.amount,
          unit: i.unit,
          displayAmountPl: i.display_amount_pl,
          displayAmountEn: i.display_amount_en,
          displayAmountAz: i.display_amount_az || i.display_amount_en,
          normalizedBaseAmount: i.normalized_base_amount,
          normalizedBaseUnit: i.normalized_base_unit,
          category: i.category,
          icon: i.icon,
        })),
        instructionsPl: JSON.parse(row.instructions_pl_json),
        instructionsEn: JSON.parse(row.instructions_en_json),
        instructionsAz: row.instructions_az_json
          ? JSON.parse(row.instructions_az_json)
          : JSON.parse(row.instructions_en_json),
        isCustom: Boolean(row.is_custom),
        isFavourite: favSet.has(row.id),
      };
    });
  }

  public toggleFavouriteRecipe(userId: string, recipeId: string): boolean {
    const recipeRow = this.db
      .prepare('SELECT id FROM recipes WHERE id = ? AND (author_user_id IS NULL OR author_user_id = ?)')
      .get(recipeId, userId) as any;
    if (!recipeRow) {
      throw new Error('RECIPE_NOT_FOUND');
    }
    const existing = this.db
      .prepare("SELECT 1 FROM favourites WHERE user_id = ? AND recipe_id = ? AND entry_type = 'favourite'")
      .get(userId, recipeId);
    if (existing) {
      this.db
        .prepare("DELETE FROM favourites WHERE user_id = ? AND recipe_id = ? AND entry_type = 'favourite'")
        .run(userId, recipeId);
      return false;
    } else {
      this.db
        .prepare("INSERT INTO favourites (user_id, recipe_id, entry_type, created_at) VALUES (?, ?, 'favourite', ?)")
        .run(userId, recipeId, new Date().toISOString());
      return true;
    }
  }

  public getPantryItems(userId: string): PantryItem[] {
    const rows = this.db
      .prepare('SELECT * FROM pantry WHERE user_id = ? ORDER BY expiry_date ASC, added_at DESC')
      .all(userId) as any[];

    const nowMs = new Date('2026-11-11T12:00:00Z').getTime();

    return rows.map((r) => {
      let daysUntilExpiry: number | null = null;
      let isExpiringSoon = false;
      if (r.expiry_date) {
        const expMs = new Date(r.expiry_date).getTime();
        daysUntilExpiry = Math.ceil((expMs - nowMs) / (1000 * 3600 * 24));
        isExpiringSoon = daysUntilExpiry <= 4;
      }
      return {
        id: r.id,
        userId: r.user_id,
        canonicalIngredient: r.canonical_ingredient,
        namePl: r.name_pl,
        nameEn: r.name_en,
        nameAz: r.name_az || r.name_en,
        quantity: r.quantity,
        unit: r.unit,
        normalizedAmount: r.normalized_amount,
        normalizedUnit: r.normalized_unit,
        category: r.category,
        expiryDate: r.expiry_date,
        daysUntilExpiry,
        isExpiringSoon,
        addedAt: r.added_at,
        icon: r.icon,
      };
    });
  }

  public addPantryItem(
    userId: string,
    input: {
      namePl: string;
      nameEn?: string;
      nameAz?: string;
      canonicalIngredient?: string;
      quantity: number;
      unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
      category?: PantryItem['category'];
      expiryDate?: string | null;
      icon?: string;
    }
  ): PantryItem[] {
    if (!input.namePl?.trim() || input.quantity <= 0) {
      throw new Error('Invalid pantry item name or quantity');
    }
    const resolvedCanonical =
      (input.canonicalIngredient ? resolveCanonicalIngredient(input.canonicalIngredient) : null) ||
      (input.nameEn ? resolveCanonicalIngredient(input.nameEn) : null) ||
      (input.nameAz ? resolveCanonicalIngredient(input.nameAz) : null) ||
      resolveCanonicalIngredient(input.namePl);
    const canonical =
      resolvedCanonical ||
      input.canonicalIngredient?.trim().toLowerCase().replace(/\s+/g, '_') ||
      input.nameEn?.trim().toLowerCase().replace(/\s+/g, '_') ||
      input.namePl.trim().toLowerCase().replace(/\s+/g, '_');

    const matchedProd = ALL_CATALOGUE_PRODUCTS.find((p) => p.canonicalIngredient === canonical);
    const norm = normalizeIngredientQuantity(input.quantity, input.unit, canonical);
    const baseUnit = norm.baseUnit === 'to_taste' ? 'g' : norm.baseUnit;

    this.db
      .prepare(
        `INSERT INTO pantry (id, user_id, canonical_ingredient, name_pl, name_en, name_az, quantity, unit, normalized_amount, normalized_unit, category, expiry_date, added_at, icon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `pantry-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId,
        canonical,
        input.namePl.trim(),
        (input.nameEn || matchedProd?.nameEn || input.namePl).trim(),
        (input.nameAz || matchedProd?.nameAz || input.nameEn || matchedProd?.nameEn || input.namePl).trim(),
        input.quantity,
        input.unit,
        norm.amount || input.quantity,
        baseUnit,
        input.category || matchedProd?.category || 'Other',
        input.expiryDate || null,
        new Date().toISOString(),
        input.icon || matchedProd?.icon || '🥫'
      );

    return this.getPantryItems(userId);
  }

  public deletePantryItem(userId: string, itemId: string): PantryItem[] {
    this.db
      .prepare('DELETE FROM pantry WHERE id = ? AND user_id = ?')
      .run(itemId, userId);
    return this.getPantryItems(userId);
  }

  public async generateAndSaveWeeklyPlan(userId: string, variationSeed = 0): Promise<WeeklyPlan> {
    const preferences = this.getPreferences(userId);
    const regionCode: RegionCode = preferences.regionCode || 'PL';
    const currencyCode: CurrencyCode =
      preferences.currencyCode || getDefaultCurrencyForRegion(regionCode);
    const allRecipes = this.getAllRecipesForUser(userId);
    const pantryItems = this.getPantryItems(userId);
    const planId = `wp-${userId}`;
    const now = new Date().toISOString();

    const aiResult = await generateValidatedWeeklyMealPlan({
      weeklyPlanId: planId,
      weekStartDate: '2026-11-10',
      preferences,
      availableRecipes: allRecipes,
      pantryItems,
      variationSeed,
    });

    const planDurationDays = Math.max(1, Math.min(7, Math.round(preferences.planDurationDays || 7)));

    this.db
      .prepare(
        `INSERT OR REPLACE INTO weekly_plans (
          id, user_id, region_code, currency_code, plan_duration_days, week_start_date,
          week_label_pl, week_label_en, week_label_az,
          target_budget_pln, supermarket_id, household_size,
          ai_notes_pl, ai_notes_en, ai_notes_az, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, '2026-11-10', '10 lis – 16 lis', 'Nov 10 – Nov 16', '10 noy – 16 noy', ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        planId,
        userId,
        regionCode,
        currencyCode,
        planDurationDays,
        preferences.weeklyBudgetPln,
        preferences.preferredSupermarket,
        preferences.householdSize,
        aiResult.notesPl,
        aiResult.notesEn,
        aiResult.notesAz,
        now,
        now
      );

    this.db.prepare('DELETE FROM planned_meals WHERE user_id = ?').run(userId);
    const insMeal = this.db.prepare(`
      INSERT INTO planned_meals (id, weekly_plan_id, user_id, day_index, date_str, meal_type, recipe_id, servings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const m of aiResult.meals) {
      insMeal.run(
        m.id,
        planId,
        userId,
        m.dayIndex,
        m.dateStr,
        m.mealType,
        m.recipe.id,
        m.servings
      );
    }

    // Ensure a shopping_lists record exists for user
    const existingList = this.db
      .prepare('SELECT id FROM shopping_lists WHERE user_id = ?')
      .get(userId) as any;
    if (!existingList) {
      this.db
        .prepare(
          `INSERT INTO shopping_lists (id, user_id, weekly_plan_id, supermarket_id, region_code, currency_code, subtract_pantry, purchased_keys_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, '{}', ?)`
        )
        .run(
          `sl-${userId}`,
          userId,
          planId,
          preferences.preferredSupermarket,
          regionCode,
          currencyCode,
          now
        );
    }

    return this.getWeeklyPlan(userId);
  }

  public getWeeklyPlan(userId: string): WeeklyPlan {
    const planRow = this.db
      .prepare('SELECT * FROM weekly_plans WHERE user_id = ?')
      .get(userId) as any;

    if (!planRow) {
      throw new Error(`Weekly plan not initialized for user ${userId}`);
    }

    const prefs = this.getPreferences(userId);
    const regionCode: RegionCode = prefs.regionCode || (planRow.region_code as RegionCode) || 'PL';
    const currencyCode: CurrencyCode =
      prefs.currencyCode ||
      (planRow.currency_code as CurrencyCode) ||
      getDefaultCurrencyForRegion(regionCode);

    const recipes = this.getAllRecipesForUser(userId);
    const recipeMap = new Map(recipes.map((r) => [r.id, r]));

    const mealRows = this.db
      .prepare('SELECT * FROM planned_meals WHERE user_id = ? ORDER BY day_index ASC')
      .all(userId) as any[];

    const meals: PlannedMeal[] = [];
    for (const row of mealRows) {
      const recipe = recipeMap.get(row.recipe_id);
      if (!recipe) continue;
      const scale = row.servings / Math.max(1, recipe.baseServings);
      const baseCost = getRecipeBaseCostForCurrency(recipe, currencyCode);
      meals.push({
        id: row.id,
        weeklyPlanId: row.weekly_plan_id,
        dayIndex: row.day_index,
        dateStr: row.date_str,
        mealType: row.meal_type as MealType,
        servings: row.servings,
        recipe,
        scaledCostPln: Number((baseCost * scale).toFixed(2)),
        scaledCaloriesKcal: recipe.nutrition.caloriesKcal,
      });
    }

    const shoppingList = this.getShoppingList(userId, meals);
    const totalEstimatedBasketPln = shoppingList.estimatedTotalPln;
    const totalMealPortionsCostPln = Number(
      meals.reduce((acc, m) => acc + m.scaledCostPln, 0).toFixed(2)
    );
    const targetBudgetPln = planRow.target_budget_pln;
    const remainingBudgetPln = Number((targetBudgetPln - totalEstimatedBasketPln).toFixed(2));
    const budgetUsagePercent =
      targetBudgetPln > 0 ? Math.round((totalEstimatedBasketPln / targetBudgetPln) * 100) : 0;

    return {
      id: planRow.id,
      userId,
      regionCode,
      currencyCode,
      planDurationDays: planRow.plan_duration_days || prefs.planDurationDays || 7,
      weekStartDate: planRow.week_start_date,
      weekLabelPl: planRow.week_label_pl,
      weekLabelEn: planRow.week_label_en,
      weekLabelAz: planRow.week_label_az || '10 noy – 16 noy',
      targetBudgetPln,
      supermarketId: planRow.supermarket_id as SupermarketSlug,
      householdSize: planRow.household_size,
      meals,
      totalEstimatedBasketPln,
      totalMealPortionsCostPln,
      remainingBudgetPln,
      budgetUsagePercent,
      aiGenerationNotesPl: planRow.ai_notes_pl,
      aiGenerationNotesEn: planRow.ai_notes_en,
      aiGenerationNotesAz: planRow.ai_notes_az || planRow.ai_notes_en,
      createdAt: planRow.created_at,
      updatedAt: planRow.updated_at,
    };
  }

  public replaceOrAddPlannedMeal(params: {
    userId: string;
    dayIndex: number;
    mealType: MealType;
    recipeId: string;
    servings?: number;
    plannedMealId?: string;
  }): WeeklyPlan {
    const { userId, dayIndex, mealType, recipeId, plannedMealId } = params;
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
      throw new Error('dayIndex must be an integer between 0 (Monday) and 6 (Sunday)');
    }
    const validMealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validMealTypes.includes(mealType)) {
      throw new Error('mealType must be one of breakfast, lunch, dinner, snack');
    }
    const prefs = this.getPreferences(userId);
    const recipes = this.getAllRecipesForUser(userId);
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) {
      throw new Error('Recipe not found');
    }

    // Enforce deterministic allergy & dietary validation!
    const validation = validateRecipeForUser(recipe, prefs, { enforcePrepTime: false });
    if (!validation.valid) {
      throw new Error(`ALLERGY_OR_DIET_BLOCK: ${validation.violations.join(' | ')}`);
    }

    const servings = params.servings ?? prefs.householdSize;
    if (!Number.isFinite(servings) || servings < 1 || servings > 20) {
      throw new Error('Servings must be between 1 and 20');
    }
    const planId = `wp-${userId}`;
    const dateStr = `2026-11-${10 + dayIndex}`;

    if (plannedMealId) {
      this.db
        .prepare('UPDATE planned_meals SET recipe_id = ?, servings = ?, meal_type = ? WHERE id = ? AND user_id = ?')
        .run(recipeId, servings, mealType, plannedMealId, userId);
    } else {
      const existing = this.db
        .prepare('SELECT id FROM planned_meals WHERE user_id = ? AND day_index = ? AND meal_type = ?')
        .get(userId, dayIndex, mealType) as any;

      if (existing) {
        this.db
          .prepare('UPDATE planned_meals SET recipe_id = ?, servings = ? WHERE id = ? AND user_id = ?')
          .run(recipeId, servings, existing.id, userId);
      } else {
        this.db
          .prepare(
            `INSERT INTO planned_meals (id, weekly_plan_id, user_id, day_index, date_str, meal_type, recipe_id, servings)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(`pm-${userId}-${dayIndex}-${mealType}-${Date.now()}`, planId, userId, dayIndex, dateStr, mealType, recipeId, servings);
      }
    }

    return this.getWeeklyPlan(userId);
  }

  public updatePlannedMealServings(userId: string, plannedMealId: string, servings: number): WeeklyPlan {
    if (servings < 1 || servings > 20) {
      throw new Error('Servings must be between 1 and 20');
    }
    this.db
      .prepare('UPDATE planned_meals SET servings = ? WHERE id = ? AND user_id = ?')
      .run(servings, plannedMealId, userId);
    return this.getWeeklyPlan(userId);
  }

  public updatePlannedMealsServingsByRecipe(
    userId: string,
    recipeId: string,
    servings: number,
    dayIndex?: number
  ): WeeklyPlan {
    if (!Number.isFinite(servings) || servings < 1 || servings > 20) {
      throw new Error('Servings must be between 1 and 20');
    }
    if (dayIndex !== undefined) {
      const matchOnDay = this.db
        .prepare('SELECT id FROM planned_meals WHERE user_id = ? AND recipe_id = ? AND day_index = ?')
        .get(userId, recipeId, dayIndex) as any;
      if (matchOnDay) {
        this.db
          .prepare('UPDATE planned_meals SET servings = ? WHERE id = ? AND user_id = ?')
          .run(servings, matchOnDay.id, userId);
        return this.getWeeklyPlan(userId);
      }
    }
    this.db
      .prepare('UPDATE planned_meals SET servings = ? WHERE user_id = ? AND recipe_id = ?')
      .run(servings, userId, recipeId);
    return this.getWeeklyPlan(userId);
  }

  public updateRecipeIngredientAmount(
    userId: string,
    recipeId: string,
    ingredientId: string,
    newAmount: number
  ): WeeklyPlan {
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      throw new Error('Ingredient amount must be positive');
    }
    const ingRow = this.db
      .prepare('SELECT * FROM ingredients WHERE id = ? AND recipe_id = ?')
      .get(ingredientId, recipeId) as any;
    if (!ingRow) {
      throw new Error('Ingredient not found on recipe');
    }
    const rounded = Math.round(newAmount * 10) / 10;
    const norm = normalizeIngredientQuantity(rounded, ingRow.unit, ingRow.canonical_ingredient);
    const displayEn = `${rounded} ${ingRow.unit}`;
    const displayPl = `${rounded} ${ingRow.unit === 'pcs' ? 'szt.' : ingRow.unit}`;
    const displayAz = `${rounded} ${ingRow.unit === 'pcs' ? 'ədəd' : ingRow.unit}`;

    this.db
      .prepare(
        `UPDATE ingredients
         SET amount = ?, display_amount_pl = ?, display_amount_en = ?, display_amount_az = ?, normalized_base_amount = ?
         WHERE id = ? AND recipe_id = ?`
      )
      .run(rounded, displayPl, displayEn, displayAz, norm.amount || rounded, ingredientId, recipeId);

    return this.getWeeklyPlan(userId);
  }

  public removePlannedMeal(userId: string, plannedMealId: string): WeeklyPlan {
    this.db
      .prepare('DELETE FROM planned_meals WHERE id = ? AND user_id = ?')
      .run(plannedMealId, userId);
    return this.getWeeklyPlan(userId);
  }

  public getShoppingList(userId: string, preloadedMeals?: PlannedMeal[]): ShoppingList {
    let listRow = this.db
      .prepare('SELECT * FROM shopping_lists WHERE user_id = ?')
      .get(userId) as any;

    const prefs = this.getPreferences(userId);
    const regionCode: RegionCode = prefs.regionCode || 'PL';
    const currencyCode: CurrencyCode =
      prefs.currencyCode || getDefaultCurrencyForRegion(regionCode);

    if (!listRow) {
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO shopping_lists (id, user_id, weekly_plan_id, supermarket_id, region_code, currency_code, subtract_pantry, purchased_keys_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, '{}', ?)`
        )
        .run(
          `sl-${userId}`,
          userId,
          `wp-${userId}`,
          prefs.preferredSupermarket,
          regionCode,
          currencyCode,
          now
        );
      listRow = this.db.prepare('SELECT * FROM shopping_lists WHERE user_id = ?').get(userId) as any;
    }

    let meals = preloadedMeals;
    if (!meals) {
      const recipes = this.getAllRecipesForUser(userId);
      const recipeMap = new Map(recipes.map((r) => [r.id, r]));
      const mealRows = this.db
        .prepare('SELECT * FROM planned_meals WHERE user_id = ? ORDER BY day_index ASC')
        .all(userId) as any[];

      meals = mealRows
        .map((row) => {
          const recipe = recipeMap.get(row.recipe_id);
          if (!recipe) return null;
          const scale = row.servings / Math.max(1, recipe.baseServings);
          const baseCost = getRecipeBaseCostForCurrency(recipe, currencyCode);
          return {
            id: row.id,
            weeklyPlanId: row.weekly_plan_id,
            dayIndex: row.day_index,
            dateStr: row.date_str,
            mealType: row.meal_type as MealType,
            servings: row.servings,
            recipe,
            scaledCostPln: Number((baseCost * scale).toFixed(2)),
            scaledCaloriesKcal: recipe.nutrition.caloriesKcal,
          };
        })
        .filter((x): x is PlannedMeal => x !== null);
    }

    const purchasedObj = JSON.parse(listRow.purchased_keys_json || '{}') as Record<string, boolean>;
    const purchasedMap = new Map<string, boolean>(Object.entries(purchasedObj));

    const manualRows = this.db
      .prepare('SELECT * FROM shopping_items WHERE user_id = ? AND is_manual = 1')
      .all(userId) as any[];

    const activeStore = resolveValidSupermarketForRegion(
      listRow.supermarket_id as SupermarketSlug,
      regionCode
    );

    const manualItems: ShoppingItem[] = manualRows.map((m) => ({
      id: m.id,
      shoppingListId: m.shopping_list_id,
      canonicalIngredient: m.canonical_ingredient,
      namePl: m.name_pl,
      nameEn: m.name_en,
      nameAz: m.name_az || m.name_en,
      category: m.category,
      icon: m.icon,
      requiredAmount: m.required_amount,
      requiredUnit: m.required_unit,
      requiredDisplayLabel: m.package_size_label,
      pantryDeductedAmount: 0,
      netRequiredAmount: m.required_amount,
      matchedProductId: null,
      matchedProductNamePl: m.name_pl,
      matchedProductNameEn: m.name_en,
      matchedProductNameAz: m.name_az || m.name_en,
      matchedBrand: regionCode === 'AZ' ? 'Əl ilə əlavə edilib' : 'Dodano ręcznie',
      ean: null,
      recommendedPackages: 1,
      packageSizeLabel: m.package_size_label,
      totalPurchasedAmount: m.required_amount,
      leftoverAmount: 0,
      leftoverDisplayLabel: '0 g',
      unitPricePln: m.line_total_pln,
      unitPriceLabel: `${formatMoney(m.line_total_pln, currencyCode)} / pkg`,
      regularLineTotalPln: m.line_total_pln,
      lineTotalPln: m.line_total_pln,
      supermarketId: activeStore,
      priceVerificationStatus: 'ESTIMATED_MARKET_AVG',
      loyaltyRequired: false,
      loyaltyConditionPl: null,
      loyaltyConditionEn: null,
      loyaltyConditionAz: null,
      promoValidUntil: null,
      storeChannel: 'PHYSICAL_STORE',
      lastUpdatedAt: listRow.updated_at,
      matchConfidence: 'HIGH',
      isPurchased: Boolean(m.is_purchased),
      isManual: true,
      alternativeStorePricePln: null,
      alternativeStoreId: null,
    }));

    const pantryItems = this.getPantryItems(userId);

    return buildSmartShoppingList({
      shoppingListId: listRow.id,
      userId,
      weeklyPlanId: listRow.weekly_plan_id,
      supermarketId: activeStore,
      regionCode,
      currencyCode,
      plannedMeals: meals,
      pantryItems,
      subtractPantry: Boolean(listRow.subtract_pantry),
      existingPurchasedMap: purchasedMap,
      manualItems,
    });
  }

  public toggleShoppingItemPurchased(userId: string, canonicalOrId: string): ShoppingList {
    // Check if manual item
    const manual = this.db
      .prepare('SELECT id, is_purchased FROM shopping_items WHERE id = ? AND user_id = ?')
      .get(canonicalOrId, userId) as any;

    if (manual) {
      this.db
        .prepare('UPDATE shopping_items SET is_purchased = ? WHERE id = ? AND user_id = ?')
        .run(manual.is_purchased ? 0 : 1, manual.id, userId);
      return this.getShoppingList(userId);
    }

    const listRow = this.db
      .prepare('SELECT purchased_keys_json FROM shopping_lists WHERE user_id = ?')
      .get(userId) as any;
    const mapObj = JSON.parse(listRow?.purchased_keys_json || '{}') as Record<string, boolean>;
    const key = canonicalOrId.toLowerCase();
    mapObj[key] = !mapObj[key];

    this.db
      .prepare('UPDATE shopping_lists SET purchased_keys_json = ?, updated_at = ? WHERE user_id = ?')
      .run(JSON.stringify(mapObj), new Date().toISOString(), userId);

    return this.getShoppingList(userId);
  }

  public setShoppingListSettings(
    userId: string,
    settings: { supermarketId?: SupermarketSlug; subtractPantry?: boolean }
  ): ShoppingList {
    const row = this.db.prepare('SELECT * FROM shopping_lists WHERE user_id = ?').get(userId) as any;
    if (!row) return this.getShoppingList(userId);

    const prefs = this.getPreferences(userId);
    const regionCode = prefs.regionCode || 'PL';

    const nextStore = settings.supermarketId
      ? resolveValidSupermarketForRegion(settings.supermarketId, regionCode)
      : row.supermarket_id;
    const nextSubtract =
      settings.subtractPantry !== undefined ? (settings.subtractPantry ? 1 : 0) : row.subtract_pantry;

    this.db
      .prepare('UPDATE shopping_lists SET supermarket_id = ?, subtract_pantry = ?, updated_at = ? WHERE user_id = ?')
      .run(nextStore, nextSubtract, new Date().toISOString(), userId);

    if (settings.supermarketId) {
      this.updatePreferences(userId, { preferredSupermarket: nextStore });
    }

    return this.getShoppingList(userId);
  }

  public addManualShoppingItem(
    userId: string,
    input: {
      namePl: string;
      nameEn?: string;
      nameAz?: string;
      packageSizeLabel: string;
      pricePln: number;
      category?: ShoppingItem['category'];
      icon?: string;
    }
  ): ShoppingList {
    if (!input.namePl?.trim() || input.pricePln < 0) {
      throw new Error('Invalid manual shopping item');
    }
    const listRow = this.db.prepare('SELECT id FROM shopping_lists WHERE user_id = ?').get(userId) as any;
    const listId = listRow ? listRow.id : `sl-${userId}`;

    this.db
      .prepare(
        `INSERT INTO shopping_items (
          id, shopping_list_id, user_id, canonical_ingredient, name_pl, name_en, name_az,
          category, icon, required_amount, required_unit, package_size_label, line_total_pln, is_purchased, is_manual
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pcs', ?, ?, 0, 1)`
      )
      .run(
        `manual-${Date.now()}`,
        listId,
        userId,
        input.namePl.trim().toLowerCase().replace(/\s+/g, '_'),
        input.namePl.trim(),
        (input.nameEn || input.namePl).trim(),
        (input.nameAz || input.nameEn || input.namePl).trim(),
        input.category || 'Other',
        input.icon || '🛒',
        input.packageSizeLabel || '1 pkg',
        Number(input.pricePln) || 4.99
      );

    return this.getShoppingList(userId);
  }

  public removeManualShoppingItem(userId: string, itemId: string): ShoppingList {
    this.db
      .prepare('DELETE FROM shopping_items WHERE id = ? AND user_id = ?')
      .run(itemId, userId);
    return this.getShoppingList(userId);
  }

  public deleteUserAccount(userId: string): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }
}
