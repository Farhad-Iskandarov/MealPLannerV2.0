# Graph Report - MealPLannerV2.0  (2026-11-23)

## Corpus Check
- 43 files · ~159,295 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: .xml 7, (none) 3, .css 2)

## Summary
- 942 nodes · 2817 edges · 44 communities (37 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 111 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- ny
- Xl
- MealPlannerApp.tsx
- be
- bazarstoreMonitor.ts
- bundle.js
- types.ts
- MainActivity.java
- package.json
- PriceSyncRunRecord
- wc
- M
- RegionCode
- clientApi.ts
- build-apk.mjs
- createApp
- compilerOptions
- sg
- Rl
- app.ts
- database.ts
- ff
- Quick Start & Installation
- ep
- cn
- mc
- Vn
- $r
- Ji
- xa
- quantityEngine.ts
- aiMealPlanner.ts
- regionConfig.ts
- mp
- poland-rollout.test.ts
- recipeSeedData.ts
- gl
- Wi
- lc
- getAllStores
- ig

## God Nodes (most connected - your core abstractions)
1. `createApp()` - 57 edges
2. `MealPlannerDatabase` - 54 edges
3. `M()` - 46 edges
4. `ny()` - 39 edges
5. `RegionCode` - 29 edges
6. `SupermarketSlug` - 29 edges
7. `be()` - 28 edges
8. `getDefaultCurrencyForRegion()` - 27 edges
9. `Fe()` - 27 edges
10. `MealPlannerApp()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `HIGH PRIORITY ISSUES (All Resolved)` --references--> `sanitizePromptToken()`  [INFERRED]
  mealplanner/GOOGLE_PLAY_COMPLIANCE.md → mealplanner/src/server/ai/aiMealPlanner.ts
- `getCachedBiedronkaProductDetail()` --calls--> `resolvePolicyEffectivePrice()`  [EXTRACTED]
  mealplanner/src/client/api/clientApi.ts → mealplanner/src/shared/pricingPolicy.ts
- `AppStatePayload` --references--> `VerifiedBiedronkaSnapshotItem`  [EXTRACTED]
  mealplanner/src/client/api/clientApi.ts → mealplanner/src/server/monitoring/biedronkaGlovoMonitor.ts
- `AppStatePayload` --references--> `PromotionalBannerOffer`  [EXTRACTED]
  mealplanner/src/client/api/clientApi.ts → mealplanner/src/server/supermarkets/catalogueData.ts
- `AppStatePayload` --references--> `NormalizedProductComparison`  [EXTRACTED]
  mealplanner/src/client/api/clientApi.ts → mealplanner/src/server/supermarkets/supermarketService.ts

## Import Cycles
- None detected.

## Communities (44 total, 7 thin omitted)

### Community 0 - "ny"
Cohesion: 0.10
Nodes (36): al(), ar(), Dc(), Di(), ef(), fn(), Gu(), ho() (+28 more)

### Community 1 - "Xl"
Cohesion: 0.13
Nodes (44): Ad(), bc(), Bg(), cd(), Ea(), Ec(), Fd(), Fr() (+36 more)

### Community 2 - "MealPlannerApp.tsx"
Cohesion: 0.11
Nodes (41): setAuthToken(), AiPlanWizardModal(), AndroidStatusBar(), ChefHatLogo(), SupermarketLogo(), ActiveModalType, AppModals(), BiedronkaProductDetailModal() (+33 more)

### Community 3 - "be"
Cohesion: 0.10
Nodes (48): addManualShoppingItem(), addPantryItem(), applyBudgetSuggestion(), au(), be(), bootstrap(), Ce(), Ch() (+40 more)

### Community 4 - "bazarstoreMonitor.ts"
Cohesion: 0.14
Nodes (21): BAZARSTORE_ALTERNATIVE_URL, BAZARSTORE_PRIMARY_URL, BAZARSTORE_SHOPIFY_COLLECTION_URL, BAZARSTORE_SHOPIFY_PRODUCTS_URL, decodeHtmlEntities(), extractPackageQuantityFromTitle(), extractVariantSpecifier(), fetchLiveBazarstoreCatalogue() (+13 more)

### Community 5 - "bundle.js"
Cohesion: 0.06
Nodes (6): dy(), getMetadata(), go(), nc(), probePublicCatalogueStatus(), Rr()

### Community 6 - "types.ts"
Cohesion: 0.09
Nodes (34): AppStatePayload, AiPlanWizardModalProps, COMMON_ALLERGENS, DIETARY_OPTIONS, FOOD_VIBE_OPTIONS, KITCHEN_EQUIPMENT_OPTIONS, mapExistingEquipmentToKeys(), BiedronkaProductDetailModalProps (+26 more)

### Community 7 - "MainActivity.java"
Cohesion: 0.07
Nodes (13): MainActivity, ValueCallback<String>, WebViewClient, 1. Architecture & Project Overview (Part 1), 2. Structured Compliance Audit Report (Parts 2, 3 & 4), 3. Google Play Console Declarations Guide, A. Data Safety Section Declarations, B. App Access Instructions for Google Play Reviewers (+5 more)

### Community 8 - "package.json"
Cohesion: 0.07
Nodes (39): dependencies, cors@^2.8.5, express@^4.21.2, lucide-react@^0.468.0, react@^18.3.1, react-dom@^18.3.1, description, devDependencies (+31 more)

### Community 9 - "PriceSyncRunRecord"
Cohesion: 0.47
Nodes (4): main(), parseArgs(), GlovoFetchSnapshotResult, PriceSyncRunRecord

### Community 10 - "wc"
Cohesion: 0.08
Nodes (39): ah(), ap(), Ay(), cl(), Ct(), _d(), dd(), dg() (+31 more)

### Community 11 - "M"
Cohesion: 0.11
Nodes (29): Ac(), Bs(), cp(), Da(), dp(), Ed(), fi(), hs() (+21 more)

### Community 12 - "RegionCode"
Cohesion: 0.15
Nodes (15): NormalizedMonitoredCandidate, getCatalogueProductsForRegion(), PromotionalBannerOffer, ISupermarketAdapter, NormalizedProductComparison, RegionalSupermarketAdapter, SupermarketRegistry, getDefaultSupermarketForRegion() (+7 more)

### Community 13 - "clientApi.ts"
Cohesion: 0.19
Nodes (16): apiRequest(), ApiResponseError, cacheVerifiedBiedronkaSnapshotForOffline(), clientApi, getAuthToken(), getCachedBiedronkaProductDetail(), getOrInitOfflineState(), hydrateVerifiedBiedronkaSnapshotFromCache() (+8 more)

### Community 14 - "build-apk.mjs"
Cohesion: 0.08
Nodes (20): aapt2, alignedApk, apkOutDir, apksigner, assetsWww, buildToolsDir, buildWork, d8 (+12 more)

### Community 15 - "createApp"
Cohesion: 0.11
Nodes (12): AIPlannerInput, createApp(), MealPlannerDatabase, computePriceStaleness(), isValidCuisinePreference(), getDefaultCurrencyForRegion(), MonitoredProductRecord, PantryItem (+4 more)

### Community 17 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, jsx, module, moduleResolution, noEmit (+6 more)

### Community 18 - "sg"
Cohesion: 0.67
Nodes (4): sg(), Wl(), Wo(), xo()

### Community 19 - "Rl"
Cohesion: 0.33
Nodes (10): Kn(), $n(), Nl(), Ol(), ql(), Rl(), Ru(), Tl() (+2 more)

### Community 20 - "app.ts"
Cohesion: 0.12
Nodes (24): outDir, publicAssetsDir, AuthenticatedRequest, buildFullStatePayload(), resolveUser(), VALID_CURRENCIES, VALID_LANGUAGES, VALID_REGIONS (+16 more)

### Community 21 - "database.ts"
Cohesion: 0.11
Nodes (26): { DatabaseSync }, BIEDRONKA_REFRESH_CADENCE_DAYS, BIEDRONKA_REFRESH_INTERVAL_MS, BIEDRONKA_STALE_THRESHOLD_HOURS, BiedronkaProductIdentity, CONSERVATIVE_POLISH_ALIAS_RULES, DEFAULT_BIEDRONKA_INITIAL_BACKOFF_MS, DEFAULT_BIEDRONKA_MAX_BACKOFF_MS (+18 more)

### Community 23 - "ff"
Cohesion: 0.11
Nodes (22): cf(), df(), dl(), eg(), ff(), Fg(), hg(), hi() (+14 more)

### Community 24 - "Quick Start & Installation"
Cohesion: 0.22
Nodes (8): 1. Environment Configuration, 2. Install & Build, 3. Run Automated Tests, 4. Start the Server & Application, 5. Build the Android APK, Architecture Overview, MealPlanner — AI Meal Planning & Smart Grocery Shopping for Poland, Quick Start & Installation

### Community 25 - "ep"
Cohesion: 0.09
Nodes (31): Ae(), Bf(), bp(), _c(), Cc(), ep(), fp(), gs() (+23 more)

### Community 26 - "cn"
Cohesion: 0.33
Nodes (6): am(), cn(), f(), om(), rm(), Yl()

### Community 27 - "mc"
Cohesion: 0.19
Nodes (18): ci(), fa(), hc(), he(), kc(), Kf(), Ma(), mc() (+10 more)

### Community 28 - "Vn"
Cohesion: 0.33
Nodes (6): El(), Il(), Jm(), Vn(), Xm(), Ym()

### Community 31 - "Ji"
Cohesion: 0.25
Nodes (8): ao(), cy(), fy(), Ji(), Jn(), Qc(), ug(), Yc()

### Community 33 - "quantityEngine.ts"
Cohesion: 0.08
Nodes (33): AggregatedNeed, buildSmartShoppingList(), calculateSupermarketPackages(), formatBaseQuantity(), INGREDIENT_ALIASES, LIQUID_CANONICALS, NormalizedQuantityResult, normalizeText() (+25 more)

### Community 36 - "aiMealPlanner.ts"
Cohesion: 0.07
Nodes (44): AIPlannerOutput, BudgetTier, classifyBudgetTier(), COMFORT_FOOD_RECIPE_IDS, describeActiveConstraints(), evaluateRealBasket(), FAKEAWAY_RECIPE_IDS, generateValidatedWeeklyMealPlan() (+36 more)

### Community 37 - "regionConfig.ts"
Cohesion: 0.15
Nodes (9): AZERBAIJANI_SUPERMARKET_SLUGS, CURRENCIES, CurrencyDefinition, EXCHANGE_RATES_REFERENCE, FALLBACK_MEAL_IMAGE_DATA_URI, formatMoney(), formatUnitPriceLabel(), LEGACY_POLISH_SUPERMARKET_SLUGS (+1 more)

### Community 38 - "mp"
Cohesion: 0.15
Nodes (20): bd(), Ei(), Gy(), hf(), Hy(), Jc(), jf(), Jo() (+12 more)

### Community 39 - "poland-rollout.test.ts"
Cohesion: 0.18
Nodes (17): buildGlovoProductUrl(), discoverGlovoBiedronkaSections(), extractGlovoSectionsFromHtml(), extractGlovoStoreIdsFromPath(), extractPolishPackSize(), fetchGlovoBiedronkaProductDetail(), fetchGlovoBiedronkaWarsawSnapshot(), fetchGlovoSectionsBatch() (+9 more)

### Community 40 - "recipeSeedData.ts"
Cohesion: 0.20
Nodes (12): normalizeIngredientQuantity(), CANONICAL_AZ_NAMES, CUISINE_SEED_RECIPES, IMG, ing(), toAzDisplayAmount(), CANONICAL_AZ_NAMES, ing() (+4 more)

### Community 41 - "gl"
Cohesion: 0.67
Nodes (3): compareProductsAcrossStores(), getAdapter(), gl()

### Community 42 - "Wi"
Cohesion: 0.33
Nodes (6): qs(), sp(), Tc(), Ud(), Wi(), Yy()

### Community 43 - "lc"
Cohesion: 0.50
Nodes (4): ic(), lc(), lt(), zi()

## Knowledge Gaps
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `sanitizePromptToken()` connect `aiMealPlanner.ts` to `MainActivity.java`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `createApp()` (e.g. with `resolveUser()` and `.addManualShoppingItem()`) actually correct?**
  _`createApp()` has 35 INFERRED edges - model-reasoned connections that need verification._
- **Should `ny` be split into smaller, more focused modules?**
  _Cohesion score 0.09841269841269841 - nodes in this community are weakly interconnected._
- **Why does `HIGH PRIORITY ISSUES (All Resolved)` connect `MainActivity.java` to `aiMealPlanner.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `Xl` be split into smaller, more focused modules?**
  _Cohesion score 0.13424947145877378 - nodes in this community are weakly interconnected._
- **Should `MealPlannerApp.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11139455782312925 - nodes in this community are weakly interconnected._
- **Should `be` be split into smaller, more focused modules?**
  _Cohesion score 0.10372340425531915 - nodes in this community are weakly interconnected._