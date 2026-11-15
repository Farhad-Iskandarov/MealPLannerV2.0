================================================================================
MEALPLANNER — COMPLETE TECHNICAL & ARCHITECTURAL DOCUMENTATION (readme.txt)
================================================================================
Project Directory : C:\Users\farha\.gemini\antigravity\scratch\mealplanner
Package Name      : mealplanner-android (Android appId: pl.mealplanner.app)
Version           : 1.0.0
Last Updated      : 2026-11-11

================================================================================
TABLE OF CONTENTS
================================================================================
1. WHAT IS MEALPLANNER? (HIGH-LEVEL OVERVIEW)
2. HOW EVERYTHING CONNECTS (END-TO-END ARCHITECTURE)
3. DIRECTORY & FILE STRUCTURE EXPLAINED
4. MULTI-REGION, CURRENCY & LANGUAGE ARCHITECTURE
5. CORE BUSINESS LOGIC & HOW EVERY FUNCTION WORKS
   5.1 AI Weekly Meal Planner (src/server/ai/aiMealPlanner.ts)
   5.2 Deterministic Dietary, Allergy & Exclusion Validator (mealValidator.ts)
   5.3 Quantity Intelligence, Unit Conversion & Smart Shopping List (quantityEngine.ts)
   5.4 Regional Supermarket Adapters & Price Comparison (supermarketService.ts)
   5.5 Budget Analysis & Optimiser (budgetOptimizer.ts)
   5.6 Authentication & Cryptographic Security (authService.ts)
6. DATABASE SCHEMA & PERSISTENCE LAYER (src/server/db/database.ts)
7. BACKEND HTTP REST API ENDPOINTS (src/server/app.ts)
8. FRONTEND UI & INTERACTIVE MODALS (src/client/)
9. STANDALONE ANDROID APK & OFFLINE FALLBACK MODE
10. CONFIGURATION, ENVIRONMENT VARIABLES & SCRIPTS
11. HOW TO RUN, TEST & BUILD THE APP
12. KNOWN LIMITATIONS & HONESTY DISCLOSURES

================================================================================
1. WHAT IS MEALPLANNER? (HIGH-LEVEL OVERVIEW)
================================================================================
MealPlanner is an AI-powered weekly meal planning and smart grocery shopping
application designed for both web browsers and Android mobile devices.

Its main purpose is to help households:
  1. Set a weekly grocery budget, household size, region, and preferred store.
  2. Enter dietary preferences (e.g., high-protein, vegan, vegetarian,
     gluten-free, lactose-free), allergies (milk, gluten, eggs, fish, soy,
     peanuts, etc.), and excluded ingredients.
  3. Generate a 7-day personalized meal plan (Breakfast, Lunch, Dinner, and
     optional Snacks) that strictly obeys all allergy/diet rules.
  4. Automatically convert all planned meals into a consolidated Smart
     Shopping List aggregated by canonical ingredient across the whole week.
  5. Deduct ingredients already available at home in the user's Pantry
     ("Spiżarnia" / "Ərzaq Dolabı"), track expiring items, and calculate how
     many whole supermarket packages must be bought (plus pantry leftovers).
  6. Compare total basket cost across regional supermarkets and run an AI
     Budget Optimiser to swap expensive meals, switch to cheaper stores, or
     enable pantry subtraction.

Supported Regions, Currencies & Languages:
  - Regions     : Poland ('PL') and Azerbaijan ('AZ')
  - Currencies  : Polish złoty ('PLN', symbol 'zł') and Azerbaijani manat
                  ('AZN', symbol '₼')
  - Languages   : English ('en' — default), Polish ('pl' — Polski),
                  Azerbaijani ('az' — Azərbaycan dili)

================================================================================
2. HOW EVERYTHING CONNECTS (END-TO-END ARCHITECTURE)
================================================================================
MealPlanner uses a unified TypeScript codebase shared across three runtime layers:

  [1] Shared Core & Pure Engines (src/shared/ + pure functions in src/server/)
      - TypeScript domain models, regional configuration, translations (i18n),
        quantity normalization, package calculation, recipe validation, budget
        optimization, and supermarket reference catalogues.
      - Because these core engines have zero Node-specific I/O dependencies,
        they execute identically both on the Node.js backend AND inside the
        offline Android WebView client bundle.

  [2] Node.js + Express + SQLite Backend Server (src/server/)
      - Entry point: src/server/index.ts -> loads .env, initializes SQLite DB
        (node:sqlite DatabaseSync), seeds initial data, and starts Express HTTP
        server on port 3000.
      - Exposes JSON REST API under /api/* and serves the built frontend
        bundle from dist/public/.

  [3] React 18 Frontend + Android WebView APK (src/client/ + android/)
      - Frontend entry: src/client/main.tsx -> renders <MealPlannerApp />.
      - Built by esbuild (scripts/build-client.mjs) into dist/public/
        (index.html, bundle.js, bundle.css).
      - When accessed from a browser on localhost:3000, clientApi communicates
        over HTTP with the Express + SQLite backend.
      - When running inside the compiled Android APK (MealPlanner.apk) on a
        phone, MainActivity.java loads dist/public/* from Android assets via
        https://appassets.androidplatform.net/index.html, and clientApi
        automatically activates its built-in offline engine + localStorage
        persistence so every feature works without requiring a live server.

================================================================================
3. DIRECTORY & FILE STRUCTURE EXPLAINED
================================================================================
Root files:
  - package.json        : Project metadata, dependencies (express, cors, react,
                          react-dom, lucide-react, typescript, esbuild, tsx,
                          vitest), and npm scripts.
  - tsconfig.json       : TypeScript compiler config (ES2022, strict mode,
                          bundler resolution, react-jsx).
  - .env / .env.example : Server runtime configuration (PORT, DATABASE_PATH,
                          JWT_SECRET, AI_PROVIDER, GEMINI_API_KEY, etc.).
  - MealPlanner.apk     : Ready-to-install, zipaligned and signed Android APK.

Scripts (scripts/):
  - scripts/build-client.mjs : Bundles src/client/main.tsx + theme.css into
                               dist/public/bundle.js, bundle.css, and
                               index.html (with a window.process browser shim).
  - scripts/build-apk.mjs    : Packages dist/public into a standalone Android
                               APK using Android SDK 35 (aapt2, d8, zipalign,
                               apksigner) and OpenJDK (javac, jar, keytool).

Shared Layer (src/shared/):
  - src/shared/types.ts        : All TypeScript interfaces & types (User,
                                 RegionCode, CurrencyCode, Language,
                                 Supermarket, SupermarketProduct, Recipe,
                                 WeeklyPlan, PlannedMeal, ShoppingList,
                                 ShoppingItem, PantryItem, BudgetAnalysis).
  - src/shared/regionConfig.ts : Central multi-region, currency, formatting,
                                 exchange-rate conversion, and localization
                                 helper functions.
  - src/shared/i18n.ts         : Complete UI dictionary for English ('en'),
                                 Polish ('pl'), and Azerbaijani ('az'), plus
                                 formatPln(amount, currencyCode).

Backend Server (src/server/):
  - src/server/index.ts                       : Loads .env, starts SQLite & HTTP
                                                server on port 3000.
  - src/server/app.ts                         : Express app factory createApp(),
                                                rate limiter, JWT auth middleware,
                                                and all /api/* REST routes.
  - src/server/auth/authService.ts            : Password hashing (scrypt), JWT
                                                HS256 signing/verification, and
                                                recovery codes (SHA-256).
  - src/server/db/database.ts                 : MealPlannerDatabase class wrapping
                                                node:sqlite DatabaseSync with
                                                auto-migrations & seeding.
  - src/server/ai/aiMealPlanner.ts            : 7-day weekly meal generator
                                                (Gemini API optional + Smart
                                                Algorithmic Engine fallback).
  - src/server/validation/mealValidator.ts    : Deterministic recipe safety
                                                validator (allergies, diets,
                                                exclusions, measurements).
  - src/server/matching/quantityEngine.ts     : Ingredient canonicalization,
                                                unit normalization, package
                                                math, & buildSmartShoppingList().
  - src/server/supermarkets/catalogueData.ts  : 12 supermarket definitions (6 PL,
                                                6 AZ), 54 regional catalogue
                                                products (27 PL + 27 AZ), and
                                                regional promotional offers.
  - src/server/supermarkets/supermarketService.ts : SupermarketRegistry &
                                                    RegionalSupermarketAdapter
                                                    + unit price normalization.
  - src/server/recipes/recipeSeedData.ts      : 18 trilingual recipes (including
                                                4 authentic Azerbaijani dishes)
                                                with nutrition & macro data.
  - src/server/budget/budgetOptimizer.ts      : Cost breakdown & actionable
                                                budget saving suggestions.

Frontend Client (src/client/):
  - src/client/main.tsx                   : React DOM mount point.
  - src/client/MealPlannerApp.tsx         : Main application component holding
                                            state and rendering all 5 phone
                                            screens (Home, Meal Plan, Recipes,
                                            Shopping List, Profile) in either
                                            5-Screen Showcase or Single Phone
                                            view.
  - src/client/components/BrandAssets.tsx : ChefHatLogo, AndroidStatusBar, and
                                            custom vector SVG SupermarketLogo
                                            components for all 12 chains.
  - src/client/components/Modals.tsx      : 10 interactive modal dialogs
                                            (Price Comparison, Pantry, Budget
                                            Optimiser, Preferences, Region/
                                            Currency/Language Settings, Replace
                                            Meal, Create Recipe, Auth, Privacy,
                                            Notifications).
  - src/client/api/clientApi.ts           : Unified API client that calls
                                            /api/* over HTTP and falls back to
                                            full offline computation +
                                            localStorage inside the APK.
  - src/client/styles/theme.css           : Visual design system (deep forest
                                            green #196431, fresh green #2B8A44,
                                            warm white/cream #F6F5F0, rounded
                                            cards, bottom navigation, 5-phone
                                            showcase responsive grid).

Android Shell (android/):
  - android/app/src/main/AndroidManifest.xml : Permissions (INTERNET,
                                               ACCESS_NETWORK_STATE), SDK 24-35,
                                               launcher Activity declaration.
  - android/app/src/main/java/pl/mealplanner/app/MainActivity.java :
      Native Android Activity hosting full-screen WebView with WebViewClient
      intercepting https://appassets.androidplatform.net/* to stream bundled
      assets/www/* safely.
  - android/app/src/main/assets/www/ : Bundled index.html, bundle.js, bundle.css.
  - android/app/src/main/res/values/strings.xml : App name ("MealPlanner").

Tests & Data:
  - tests/mealplanner.test.ts     : 19 unit & DB business logic tests.
  - tests/api.integration.test.ts : 7 HTTP REST API & E2E persistence tests.
  - data/mealplanner.sqlite       : Default runtime SQLite database on disk.

================================================================================
4. MULTI-REGION, CURRENCY & LANGUAGE ARCHITECTURE
================================================================================
All regional rules live in one authoritative place: src/shared/regionConfig.ts.

1. REGIONS map:
   - 'PL' (🇵🇱 Poland):
       defaultCurrency    : 'PLN'
       defaultSupermarket : 'biedronka'
       supermarketSlugs   : ['biedronka', 'lidl', 'auchan', 'kaufland',
                             'carrefour', 'zabka']
       activeCatalogueSlugs: ['biedronka', 'lidl', 'auchan', 'kaufland']
   - 'AZ' (🇦🇿 Azerbaijan):
       defaultCurrency    : 'AZN'
       defaultSupermarket : 'bravo'
       supermarketSlugs   : ['bravo', 'araz', 'bazarstore', 'rahat',
                             'oba', 'birmarket']
       activeCatalogueSlugs: ['bravo', 'araz', 'bazarstore', 'rahat']

2. CURRENCIES map & Formatting:
   - 'PLN': Polish złoty, symbol 'zł', decimalSeparator ',', suffix position.
            Example: 22.99 -> "22,99 zł"
   - 'AZN': Azerbaijani manat, symbol '₼', decimalSeparator '.', suffix position.
            Example: 10.99 -> "10.99 ₼"
   - formatMoney(amount, currencyCode) guarantees consistent formatting on every
     screen, modal, unit price badge, and budget indicator.

3. CRITICAL PRICING RULE — NO 1:1 SYMBOL SWAPPING:
   - Supermarket products and shopping lists NEVER simply replace "zł" with "₼".
   - Each region has its own dedicated catalogue:
       * PL_CATALOGUE_PRODUCTS (27 products priced in PLN across Polish stores)
       * AZ_CATALOGUE_PRODUCTS (27 products priced in AZN across Baku stores)
   - Example: Chicken breast 1 kg costs 22,99 zł at Biedronka (Poland), whereas
     at Bravo (Azerbaijan) Toyuq döş əti 1 kq costs 10.99 ₼.
   - Only historical user targets (like the user's weekly budget setting when
     switching regions without entering a new number) are converted using
     convertHistoricalMonetaryAmount() with EXCHANGE_RATES_REFERENCE
     (1 PLN = 0.425 AZN; 1 AZN = 2.35 PLN, rounded to nearest integer >= 20).

4. SUPERMARKET ISOLATION & VALIDATION:
   - isSupermarketInRegion(supermarketId, regionCode) validates whether a store
     belongs to the user's active region.
   - resolveValidSupermarketForRegion(supermarketId, regionCode) ensures an
     invalid or foreign store slug automatically falls back to the region's
     default store ('biedronka' in PL, 'bravo' in AZ).
   - Poland users only see Polish stores; Azerbaijan users only see Azerbaijani
     stores.

5. TRILINGUAL LOCALISATION (INDEPENDENT OF REGION):
   - Supported languages: 'en' (English, default for newly created users),
     'pl' (Polish), 'az' (Azerbaijani using ə, ı, ö, ü, ğ, ç, ş).
   - pickLocalizedText(lang, { en, pl, az }) and pickLocalizedList(lang, ...)
     select the matching UI/recipe/ingredient text cleanly.
   - Language can be changed independently of Region (e.g., Azerbaijan + English,
     Poland + Azerbaijani, Azerbaijan + Azerbaijani) without altering currency,
     supermarket catalogue, or product prices, and without restarting the app.

6. NON-DESTRUCTIVE REGION SWITCHING:
   - Switching regions updates regionCode, currencyCode, preferredSupermarket,
     available store catalogues, and recalculated meal/shopping list prices,
     while preserving all saved weekly planned meals, custom recipes, shopping
     list checked items, and pantry inventory.

================================================================================
5. CORE BUSINESS LOGIC & HOW EVERY FUNCTION WORKS
================================================================================

--------------------------------------------------------------------------------
5.1 AI Weekly Meal Planner (src/server/ai/aiMealPlanner.ts)
--------------------------------------------------------------------------------
Function: generateValidatedWeeklyMealPlan(input: AIPlannerInput): Promise<AIPlannerOutput>
How it works step by step:
  1. Reads user preferences (regionCode, currencyCode, allergies, diets,
     excluded ingredients, dislikes, householdSize, weeklyBudgetPln,
     preferredPrepTimeMin).
  2. Step 1 — Hard Deterministic Pre-Filter:
     Calls validateRecipeForUser(recipe, preferences, { enforcePrepTime: true })
     on all available recipes. If fewer than 3 recipes match, relaxes ONLY the
     prep-time limit — NEVER relaxing allergies, exclusions, or dietary rules.
  3. Step 2 — Optional External LLM Selection (tryExternalGeminiSelection):
     If GEMINI_API_KEY is set on the server environment, sends only the safe
     validated recipe IDs to Gemini REST API and asks for a 7-day assignment.
     In offline APK or when no key is set, providerUsed becomes
     'SMART_ALGORITHMIC_ENGINE'.
  4. Step 3 — Smart Scoring Engine (scoreRecipeForPlan):
     For each of the 7 days (dayIndex 0..6, Nov 10–16) and each meal slot
     (breakfast, lunch, dinner, plus snack if includeSnacks or mealsPerDay>=4):
     - Starts with score = 100.
     - Regional Culinary Fit: -55 penalty if recipe.regionSuitability excludes
       the user's active region; +24 bonus for Azerbaijani national recipes
       (ids starting with 'rec-az-') when regionCode === 'AZ'.
     - Variety Guard: -65 if used in the last 2 days for the same meal type.
     - Ingredient Reuse & Anti-Waste: +8 per ingredient already used earlier in
       the week; +12 if ingredient is in Pantry (+25 if isExpiringSoon).
     - Dislikes Penalty: -40 for soft dislikes.
     - Budget Alignment: subtracts scaledCost * 2.5 when budget <= threshold
       (95 AZN / 200 PLN) or scaledCost * 0.8 otherwise.
     - Variation Seed: deterministic hash offset so clicking "Regenerate"
       produces varied plans.
     - On Monday (dayIndex === 0) with variationSeed === 0, prioritizes the
       4 showcase meals (Oatmeal with banana, Grilled chicken with rice,
       Vegetable soup, Skyr snack) if safe for the user's allergies/diet.
  5. Step 4 — Final Safety Gate:
     Before pushing any meal, runs validateRecipeForUser() one more time as an
     invariant guard. Scales cost by (householdSize / recipe.baseServings) using
     getRecipeBaseCostForCurrency(recipe, currencyCode).
  6. Returns 21 planned meals (or 28 with snacks) + trilingual notesPl/En/Az.

--------------------------------------------------------------------------------
5.2 Deterministic Dietary, Allergy & Exclusion Validator (mealValidator.ts)
--------------------------------------------------------------------------------
Function: validateRecipeForUser(recipe, preferences, options?): ValidationResult
Why it exists: Never trust AI text output blindly. Every generated, added,
replaced, or custom recipe passes through deterministic code checks:
  1. Structural check: requires titlePl/titleEn, non-empty ingredients and
     instructions, servings 1..20, totalTimeMin 1..480, positive amounts, and
     realistic caps (<= 10 kg / 10 L per ingredient per recipe).
  2. Allergies check: checks declared recipe.allergens AND inspects every
     ingredient's canonical key and PL/EN/AZ names against dairy/lactose
     ('milk', 'laktoza', 'süd', 'qatıq'), gluten ('gluten', 'pszenica',
     'qlüten'), eggs ('jajka', 'yumurta'), fish ('ryby', 'balıq'), soy.
  3. Exclusions & custom restrictions: substring checks against ingredient names
     in all three languages.
  4. Dietary rules: enforces vegetarian (no meat/fish), vegan (no meat, fish,
     dairy, or eggs), pescatarian (no land meat), gluten_free, and lactose_free.
  5. Returns { valid: boolean, violations: string[] }. Violating requests
     return HTTP 400 with descriptive violation codes (e.g., ALLERGY_VIOLATION).

--------------------------------------------------------------------------------
5.3 Quantity Intelligence & Smart Shopping List (quantityEngine.ts)
--------------------------------------------------------------------------------
Key Functions:
  a) normalizeText(s):
     Converts strings to lowercase ASCII by folding Azerbaijani 'ə' -> 'e',
     'ı' -> 'i', Polish 'ł' -> 'l', and NFD diacritics stripping.
  b) resolveCanonicalIngredient(name):
     Maps free-text ingredient names in English, Polish, or Azerbaijani
     (e.g., "Ryż", "Düyü", "Toyuq döş əti", "Pierś z kurczaka", "Qatıq")
     to canonical product keys ('rice', 'chicken_breast', 'greek_yogurt', etc.)
     via INGREDIENT_ALIASES and catalogue product matching.
  c) normalizeIngredientQuantity(amount, unit, canonicalIngredient?):
     Converts household/metric units across all 3 languages into canonical base
     units ('g', 'ml', 'pcs', 'to_taste'):
       - 'g', 'qr', 'qram' -> g
       - 'kg', 'kq' -> *1000 g
       - 'ml', 'l'/'litr' -> ml / *1000 ml
       - 'cloves', 'ząbek', 'diş' -> *5 g (garlic cloves)
       - 'tbsp', 'łyżka', 'x.q.' -> 15 ml (for liquids) or 15 g (solid approx)
       - 'tsp', 'łyżeczka', 'ç.q.' -> 5 ml (liquids) or 5 g (solid approx)
       - 'pcs', 'szt.', 'ədəd' -> pcs
     Flags density-dependent solid spoon conversions as isReliable: false.
  d) calculateSupermarketPackages(netRequiredAmount, packageSize):
     Computes Math.ceil(netRequiredAmount / packageSize) to tell the user
     the realistic whole packages to buy (e.g., 450g rice need -> 1 x 1kg bag,
     leaving 550g leftover for the pantry).
  e) buildSmartShoppingList(params):
     1. Iterates over all planned meals, scaling each ingredient by
        (meal.servings / recipe.baseServings) and ignoring 'to_taste' staples.
     2. Aggregates identical canonical ingredients across all 21–28 weekly meals.
     3. When subtractPantry is true, deducts available home pantry quantities
        (matching base unit) from requiredAmount -> netRequiredAmount.
     4. Matches each net need against the active region's catalogue products
        (PL_CATALOGUE_PRODUCTS or AZ_CATALOGUE_PRODUCTS) to resolve EAN barcode,
        package size, regular & promo price, loyalty conditions, and match
        confidence ('HIGH' | 'MEDIUM' | 'UNCERTAIN').
     5. Preserves manual items added by the user and purchased checkboxes.
     6. Computes store-wide basket comparison across all 4 active supermarkets
        in the current region (comparisonByStore), plus totalSavingsPln.

--------------------------------------------------------------------------------
5.4 Regional Supermarket Adapters & Prices (catalogueData.ts & supermarketService.ts)
--------------------------------------------------------------------------------
Catalogues (12 Supermarkets total, 6 per region):
  - Poland ('PL'):
      * Active Reference Catalogues (PLN):
          1. biedronka — Biedronka (Loyalty: Karta Moja Biedronka)
          2. lidl      — Lidl (Loyalty: Aplikacja Lidl Plus)
          3. auchan    — Auchan (Loyalty: Karta Skarbonka)
          4. kaufland  — Kaufland (Loyalty: Kaufland Card)
      * Coming Soon / Unavailable (honestly marked COMING_SOON_UNAVAILABLE):
          5. carrefour — Carrefour
          6. zabka     — Żabka
  - Azerbaijan ('AZ'):
      * Active Reference Catalogues (AZN):
          1. bravo      — Bravo (Loyalty: Bravo Club)
          2. araz       — Araz (Loyalty: Araz Kart)
          3. bazarstore — Bazarstore (Loyalty: Super Kart)
          4. rahat      — Rahat (Loyalty: Rahat Bonus)
      * Coming Soon / Unavailable (honestly marked COMING_SOON_UNAVAILABLE):
          5. oba       — OBA Market
          6. birmarket — Birmarket

Products & Verification Statuses:
  - 27 Polish products (prod-chicken, prod-rice, prod-banana, etc.) with PLN
    prices across Biedronka, Lidl, Auchan, Kaufland.
  - 27 Azerbaijani products (az-prod-chicken, az-prod-rice, az-prod-herbs, etc.)
    with AZN prices across Bravo, Araz, Bazarstore, Rahat (using Azerbaijani
    brands like Siyəzən Toyuq, Milla, AzərSüd, Final, Xəzər, Bismak).
  - Every price record carries priceVerificationStatus:
      'VERIFIED_LEAFLET_PROMO' | 'DEMONSTRATION_CATALOGUE' |
      'ESTIMATED_MARKET_AVG' | 'UNAVAILABLE'.
  - calculateNormalizedUnitPrice(price, size, unit, currencyCode) normalizes
    every product to PLN/kg, PLN/L, PLN/szt. or AZN/kq, AZN/L, AZN/ədəd so
    different package sizes can be compared fairly.

--------------------------------------------------------------------------------
5.5 Budget Analysis & Optimiser (src/server/budget/budgetOptimizer.ts)
--------------------------------------------------------------------------------
Function: analyzeAndOptimizeBudget(params): BudgetAnalysis
How it works:
  1. Compares shoppingList.estimatedTotalPln against user's weeklyBudgetPln
     (in the active currency, PLN or AZN) and calculates usagePercent and
     remaining/over-budget difference.
  2. Lists the top 4 most expensive items in the basket and their % share.
  3. Generates up to 3 types of one-click actionable suggestions:
     - STORE_SWITCH: Checks comparisonByStore for the active region and
       suggests switching if another regional store saves >= 1.50 PLN (or
       >= 0.80 AZN).
     - RECIPE_SWAP: Inspects the top 3 costliest meals and finds cheaper
       diet/allergy-validated recipes of the same mealType saving >= 2.00 PLN
       (or >= 0.90 AZN).
     - PANTRY_UTILIZATION: If subtractPantry is false, suggests enabling pantry
       subtraction to cut duplicate purchases.
  4. Includes trilingual disclaimers explaining that package estimates are based
     on reference/promotional catalogues.

--------------------------------------------------------------------------------
5.6 Authentication & Cryptographic Security (src/server/auth/authService.ts)
--------------------------------------------------------------------------------
  - Password Hashing: hashPassword() uses crypto.randomBytes(16) salt +
    scryptSync(password, salt, 64). verifyPassword() uses timingSafeEqual().
  - JWT Tokens: signToken() creates HS256 HMAC-SHA256 signed tokens with 7-day
    expiry; verifyToken() checks signature with timingSafeEqual() and exp claim.
    In production (NODE_ENV=production), JWT_SECRET < 32 chars throws an error.
  - Password Recovery: generateRecoveryCode() creates an 8-digit crypto-random
    numeric code stored hashed with SHA-256 (hashRecoveryCode) in users.reset_code.

================================================================================
6. DATABASE SCHEMA & PERSISTENCE LAYER (src/server/db/database.ts)
================================================================================
Class: MealPlannerDatabase (uses Node.js built-in node:sqlite DatabaseSync
with PRAGMA foreign_keys = ON). Default path: ./data/mealplanner.sqlite.

Tables (13 tables total):
  1. users          : id, email (UNIQUE), password_hash, display_name,
                      avatar_url, language ('en'|'pl'|'az'), region_code
                      ('PL'|'AZ'), currency_code ('PLN'|'AZN'), reset_code,
                      created_at.
  2. households     : id, user_id (FK users), name, members_count, share_code,
                      created_at.
  3. preferences    : user_id (PK, FK users), region_code, currency_code,
                      household_size, weekly_budget_pln, preferred_supermarket,
                      dietary_restrictions_json, custom_restrictions_json,
                      allergies_json, excluded_ingredients_json, dislikes_json,
                      cooking_skill, preferred_prep_time_min,
                      kitchen_equipment_json, meals_per_day, include_snacks,
                      notifications_json, onboarding_completed, updated_at.
  4. supermarkets   : id, name, region_code, country, currency, primary_color,
                      loyalty_program_name, website_url, adapter_status,
                      last_synced_at.
  5. products       : id, region_code, currency_code, ean, canonical_ingredient,
                      name_pl, name_en, name_az, brand, category, package_size,
                      package_unit, package_label_pl/en/az, icon, image_url.
  6. product_prices : id, product_id (FK products), supermarket_id (FK),
                      regular_price_pln, promo_price_pln, effective_price_pln,
                      unit_price_pln, unit_price_label, loyalty_required,
                      loyalty_condition_pl/en/az, promo_valid_until,
                      store_channel, store_location, source_name,
                      verification_status, last_updated_at.
  7. price_history  : Historical recorded price snapshots per product/store.
  8. recipes        : id, slug, author_user_id (NULL for global seeds),
                      title_pl/en/az, description_pl/en/az, meal_type,
                      category, region_suitability_json, image_url,
                      prep_time_min, cook_time_min, total_time_min, difficulty,
                      base_servings, estimated_cost_pln, estimated_cost_azn,
                      nutrition_json, dietary_tags_json, allergens_json,
                      equipment_json, instructions_pl/en/az_json, is_custom.
  9. ingredients    : Recipe ingredients normalized with amount, unit,
                      canonical_ingredient, display_amount_pl/en/az,
                      normalized_base_amount/unit, category, icon.
 10. weekly_plans   : One active plan header per user (region_code,
                      currency_code, week_start_date, week_label_pl/en/az,
                      target_budget_pln, supermarket_id, household_size,
                      ai_notes_pl/en/az).
 11. planned_meals  : Day index (0..6), date_str, meal_type, recipe_id, servings.
 12. shopping_lists : Per-user list state (supermarket_id, region_code,
                      currency_code, subtract_pantry, purchased_keys_json).
 13. shopping_items : Manually added user shopping items (is_manual = 1).
 14. pantry         : Home inventory items (quantity, unit, normalized_amount/
                      unit, expiry_date, icon, name_pl/en/az).
 15. favourites     : User favourite & recently viewed recipe entries.

Schema Migrations & Seeding:
  - initSchema() automatically runs non-destructive migrations
    (migrateUsersLanguageConstraintIfNeeded() and ensureColumn()) so older
    SQLite databases are safely upgraded without losing user data.
  - seedIfEmpty() upserts all 12 supermarkets, 54 regional products, 18 recipes,
    and seeds the default demo account (farhad@email.com / user-farhad-1 with
    12 pantry items and a 21-meal weekly plan).

================================================================================
7. BACKEND HTTP REST API ENDPOINTS (src/server/app.ts)
================================================================================
Rate Limit: 300 requests / minute per IP.
Auth: Optional Bearer JWT token (defaults to 'user-farhad-1' for instant demo
      access; custom users authenticate via Bearer JWT with strict 403 isolation).

Endpoints:
  GET    /api/health                      -> Service health, supported regions,
                                             currencies, languages, AI status.
  POST   /api/auth/register               -> Register user (default lang 'en'),
                                             validate region/currency/store,
                                             generate initial meal plan & JWT.
  POST   /api/auth/login                  -> Verify password, return JWT + state.
  POST   /api/auth/recover-password       -> Issue hashed 8-digit reset code.
  POST   /api/auth/reset-password         -> Verify reset code, update password.
  DELETE /api/auth/account                -> Delete non-demo user account.

  GET    /api/bootstrap                   -> Full AppStatePayload (user, plan,
                                             shoppingList, recipes, pantry,
                                             regional supermarkets, offers,
                                             comparisons, budgetAnalysis).
  GET    /api/users/:targetUserId/profile -> User-isolated profile check (403 if
                                             targetUserId != authenticated user).

  PUT    /api/preferences                 -> Update region, currency, language,
                                             budget, householdSize, supermarket,
                                             diets, allergies, exclusions,
                                             notifications; optional regenPlan.

  POST   /api/meal-plan/generate          -> Generate new 7-day AI meal plan.
  POST   /api/meal-plan/meal              -> Replace or add meal (validates
                                             dayIndex 0..6, mealType, allergies).
  PATCH  /api/meal-plan/meal/:id/servings -> Update meal servings (1..20).
  DELETE /api/meal-plan/meal/:id          -> Remove meal from day.

  POST   /api/recipes/:id/favourite       -> Toggle favourite recipe star.
  POST   /api/recipes                     -> Create custom trilingual recipe
                                             (validated against allergies/diet).

  POST   /api/shopping-list/toggle        -> Toggle purchased state of item.
  PUT    /api/shopping-list/settings      -> Change supermarket (must belong to
                                             active region) or subtractPantry.
  POST   /api/shopping-list/manual        -> Add custom manual shopping item.
  DELETE /api/shopping-list/manual/:id    -> Remove manual shopping item.

  POST   /api/pantry                      -> Add ingredient to home Pantry.
  DELETE /api/pantry/:id                  -> Remove item from home Pantry.

  GET    /api/supermarkets/compare        -> Query ?q=&region= for store price
                                             comparisons across active region.
  POST   /api/budget/apply-suggestion     -> Apply STORE_SWITCH, RECIPE_SWAP, or
                                             PANTRY_UTILIZATION suggestion.

================================================================================
8. FRONTEND UI & INTERACTIVE MODALS (src/client/)
================================================================================
Top Showcase Header & View Modes (MealPlannerApp.tsx):
  - Displays the MealPlanner brand cluster, 5 feature badges, quick Region pill
    (🇵🇱 PL • zł / 🇦🇿 AZ • ₼), Language cycler (EN / PL / AZ), and view toggle:
      * 5-Screen View: Displays all 5 Android phone frames side by side (default
        on desktop viewports >= 1150px).
      * Android Phone  : Displays one active phone screen with bottom tab nav
        (default on mobile phones and inside the Android APK).

The 5 Main Screens:
  1. Home (renderHomeScreen):
     - Header with chef hat logo, Region/Currency quick pill, and Notification
       bell toggle.
     - Deep-green AI Hero Card ("Plan your weekly meals with AI!" + CTA button).
     - 4 Quick Action cards (Meal Plan, Price Comparison, Shopping List, Pantry).
     - Current Offers carousel (Biedronka/Lidl/Auchan in PL; Bravo/Araz/
       Bazarstore in AZ).
     - Select Supermarket 4-card grid for the active region.
     - Personal Budget & Progress Dashboard card in the active currency.
  2. Meal Plan (renderMealPlanScreen):
     - Week selector bar + 7-day horizontal pill strip (Mon 10 .. Sun 16)
       localized in EN, PL, and AZ.
     - Daily calorie & estimated cost summary + breakfast/lunch/dinner/snack
       cards (tapping a card opens Recipe Detail; menu icon opens Replace Meal).
     - "Replace Meal" and "+ Add Meal" buttons.
     - Week Summary card (Total Cost vs Budget + circular % badge).
  3. Recipes (renderRecipeScreen):
     - Recipe Detail view: Full-bleed food photo, back/favourite/share buttons,
       4-metric strip (Total Time, Difficulty, tappable Servings scaler 1–6,
       scaled Cost in PLN or AZN), and segmented tabs (Ingredients, Instructions,
       Nutrition + Allergens) + "Add to Meal Plan" CTA.
     - Discovery view: Live search bar across EN/PL/AZ titles & ingredients,
       category filter chips (All, Budget, Quick, High-protein, Vegetarian,
       Favourites), and "Create" custom recipe button.
  4. Shopping List (renderShoppingListScreen):
     - Filter pills: All Items, To Buy, Bought (with live counts).
     - Supermarket dropdown switcher cycling through active regional stores.
     - Collapsible category groups (Fruit & Vegetables, Meat & Fish, Dairy,
       Dry Products, etc.) showing checkboxes, package labels, pantry leftover
       badges, loyalty badges (Moja Biedronka, Lidl Plus, Bravo Club, Araz
       Kart), normalized unit price, and line total in PLN or AZN.
     - Quick manual-add bar (+) and sticky Estimated Total footer CTA.
  5. Profile & Settings (renderProfileScreen):
     - User card (opens Auth / Account modal).
     - Dedicated rows for Region (🇵🇱 Poland / 🇦🇿 Azerbaijan), Currency (PLN zł
       / AZN ₼), Language (English / Polski / Azərbaycan dili), My Preferences
       (diets, allergies, exclusions), Household Size, Weekly Budget, Preferred
       Supermarket, Pantry (home item count), Notifications toggle switch, and
       Privacy & Terms.

Interactive Modals (src/client/components/Modals.tsx):
  - 'region_settings'  : Dedicated 3-section modal for Region, Currency, and
                         Language with informational banner confirming user
                         meal plans & pantry are preserved.
  - 'price_comparison' : Live search across all regional products, side-by-side
                         unit prices, store basket totals, and honest badges
                         for active vs coming-soon chains.
  - 'budget_optimizer' : Edit weekly budget target, view top cost drivers, and
                         apply 1-click savings suggestions.
  - 'pantry'           : Toggle "Subtract Pantry from Shopping List", inspect
                         expiry warnings, add/delete home ingredients.
  - 'preferences'      : Household size (1–20), dietary tags, allergy chips,
                         excluded ingredients, and "Save & Regenerate Plan".
  - 'replace_meal'     : Pick any safe replacement recipe (violating recipes are
                         visually marked with exact violation reasons).
  - 'create_recipe'    : Custom recipe form with ingredient/macro inputs.
  - 'auth'             : Login, Register (with Region/Currency/Language/Store
                         selection), Password Recovery, and Reset Password.
  - 'privacy'          : GDPR / Data protection / pricing source transparency.

================================================================================
9. STANDALONE ANDROID APK & OFFLINE FALLBACK MODE
================================================================================
How the Android APK works:
  1. MainActivity.java creates a native Android WebView with JavaScript,
     DOM Storage, and Database Storage enabled.
  2. A custom WebViewClient intercepts requests to host
     "appassets.androidplatform.net" and streams files directly from APK
     assets/www/ (index.html, bundle.js, bundle.css).
  3. Notice why build-apk.mjs uses JDK's jar.exe instead of aapt2 -A:
     On Windows, aapt2 -A embeds backslashes ("assets/www\index.html"), causing
     net::ERR_FILE_NOT_FOUND on Android. Using jar.exe guarantees POSIX "/"
     paths inside the ZIP archive.
  4. Notice why index.html includes window.process shim and clientApi checks
     isStandaloneApkEnvironment():
     Inside the Android WebView (hostname === "appassets.androidplatform.net"),
     there is no localhost Node server. isStandaloneApkEnvironment() detects
     this immediately so clientApi skips slow network fetches and runs all
     meal generation, recipe validation, shopping list package math, regional
     store catalogues, and budget optimization locally in TypeScript, saving
     all state to localStorage ("mealplanner_offline_state_v2").

================================================================================
10. CONFIGURATION, ENVIRONMENT VARIABLES & SCRIPTS
================================================================================
Environment Variables (.env / .env.example):
  PORT=3000                         # Express HTTP server port
  DATABASE_PATH=./data/mealplanner.sqlite
  JWT_SECRET=...                    # >= 32 chars in production
  AI_PROVIDER=auto                  # 'gemini' | 'openai' | 'auto'
  GEMINI_API_KEY=                   # Optional server-side Gemini API key
  GEMINI_MODEL=gemini-2.5-flash
  OPENAI_API_KEY=                   # Optional server-side OpenAI API key
  OPENAI_MODEL=gpt-4o-mini
  ENABLE_LIVE_SUPERMARKET_PROBE=true

NPM Scripts (package.json):
  npm run dev          -> Starts backend server with tsx (src/server/index.ts)
  npm run build:client -> Bundles React app into dist/public/ via esbuild
  npm run typecheck    -> Runs TypeScript compiler check (tsc --noEmit)
  npm run build        -> Runs build:client + typecheck
  npm test             -> Runs all Vitest suites (tests/*.test.ts)

================================================================================
11. HOW TO RUN, TEST & BUILD THE APP
================================================================================
(Paths below assume the bundled workspace toolchains under ..\.tools\ and
Android SDK 35 in %LOCALAPPDATA%\Android\Sdk.)

1. Install dependencies:
     npm install
2. Run TypeScript type check:
     npm run typecheck
3. Run all automated tests (26 unit + HTTP + DB persistence tests):
     npm test
4. Build the production frontend bundle (dist/public):
     npm run build:client
5. Start the web + API server:
     npm run dev
   Then open http://localhost:3000 in a desktop or mobile browser.
6. Build & sign the Android APK (produces MealPlanner.apk):
     npm run build:client
     node scripts/build-apk.mjs
   Install MealPlanner.apk directly on an Android device (API 24 / Android 7.0+).

================================================================================
12. KNOWN LIMITATIONS & HONESTY DISCLOSURES
================================================================================
  - Live Supermarket APIs:
      Neither Polish supermarket chains (Biedronka, Lidl, Auchan, Kaufland,
      Carrefour, Żabka) nor Azerbaijani chains (Bravo, Araz, Bazarstore,
      Rahat, OBA, Birmarket) expose an open, unauthenticated public live price
      JSON API. Therefore, active catalogues use clearly labelled regional
      reference & promotional leaflet prices (PLN / AZN), while Carrefour,
      Żabka, OBA Market, and Birmarket are transparently marked as
      COMING_SOON_UNAVAILABLE. No prices are fetched by bypassing logins or
      anti-bot gates.
  - Estimated Totals vs In-Store Checkout:
      Displayed basket totals estimate whole-package retail prices from
      reference catalogues and cannot guarantee exact in-store checkout prices
      or local stock availability.
  - Nutritional & Allergy Data:
      While MealPlanner enforces deterministic allergy/exclusion checks on
      ingredient lists and declared tags, users with severe medical allergies
      must always verify physical product packaging before consumption.
================================================================================
