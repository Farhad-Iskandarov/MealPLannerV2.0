# Graph Report - MealPLannerV2.0  (2026-11-23)

## Corpus Check
- 35 files · ~100,530 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 17 file(s) not represented in the graph (top: .xml 7, (none) 3, .css 2)

## Summary
- 814 nodes · 2330 edges · 36 communities (30 shown, 6 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 104 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `28888953`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- M
- Xl
- MealPlannerApp.tsx
- be
- createApp
- bundle.js
- clientApi.ts
- MainActivity.java
- package.json
- bazarstoreMonitor.ts
- ep
- app.ts
- catalogueData.ts
- database.ts
- build-apk.mjs
- jp
- mp
- compilerOptions
- getCatalogueProductsForRegion
- dp
- uy
- quantityEngine.ts
- Rl
- hi
- Quick Start & Installation
- Ji
- cn
- ff
- Vn
- $r
- gl
- xa
- ig

## God Nodes (most connected - your core abstractions)
1. `createApp()` - 47 edges
2. `M()` - 46 edges
3. `MealPlannerDatabase` - 44 edges
4. `ny()` - 39 edges
5. `be()` - 28 edges
6. `RegionCode` - 28 edges
7. `SupermarketSlug` - 28 edges
8. `Fe()` - 27 edges
9. `getDefaultCurrencyForRegion()` - 27 edges
10. `Se()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `HIGH PRIORITY ISSUES (All Resolved)` --references--> `sanitizePromptToken()`  [INFERRED]
  mealplanner/GOOGLE_PLAY_COMPLIANCE.md → mealplanner/src/server/ai/aiMealPlanner.ts
- `MealPlannerApp()` --calls--> `getDefaultCurrencyForRegion()`  [EXTRACTED]
  mealplanner/src/client/MealPlannerApp.tsx → mealplanner/src/shared/regionConfig.ts
- `AppStatePayload` --references--> `PromotionalBannerOffer`  [EXTRACTED]
  mealplanner/src/client/api/clientApi.ts → mealplanner/src/server/supermarkets/catalogueData.ts
- `AppStatePayload` --references--> `NormalizedProductComparison`  [EXTRACTED]
  mealplanner/src/client/api/clientApi.ts → mealplanner/src/server/supermarkets/supermarketService.ts
- `AppStatePayload` --references--> `PantryItem`  [EXTRACTED]
  mealplanner/src/client/api/clientApi.ts → mealplanner/src/shared/types.ts

## Import Cycles
- None detected.

## Communities (36 total, 6 thin omitted)

### Community 0 - "M"
Cohesion: 0.06
Nodes (69): ar(), bp(), Bs(), ci(), Da(), Dc(), dg(), dl() (+61 more)

### Community 1 - "Xl"
Cohesion: 0.08
Nodes (67): Ad(), bc(), Bg(), cd(), cp(), Di(), Ea(), Ec() (+59 more)

### Community 2 - "MealPlannerApp.tsx"
Cohesion: 0.08
Nodes (50): clientApi, setAuthToken(), AiPlanWizardModal(), COMMON_ALLERGENS, DIETARY_OPTIONS, FOOD_VIBE_OPTIONS, KITCHEN_EQUIPMENT_OPTIONS, mapExistingEquipmentToKeys() (+42 more)

### Community 3 - "be"
Cohesion: 0.10
Nodes (48): addManualShoppingItem(), addPantryItem(), applyBudgetSuggestion(), au(), be(), bootstrap(), Ce(), Ch() (+40 more)

### Community 4 - "createApp"
Cohesion: 0.15
Nodes (9): createApp(), MealPlannerDatabase, getDefaultCurrencyForRegion(), resolveValidSupermarketForRegion(), Language, PantryItem, ShoppingList, User (+1 more)

### Community 5 - "bundle.js"
Cohesion: 0.05
Nodes (10): dy(), getAllStores(), getAllSupermarkets(), getMetadata(), go(), nc(), probePublicCatalogueStatus(), Rr() (+2 more)

### Community 6 - "clientApi.ts"
Cohesion: 0.10
Nodes (36): apiRequest(), getAuthToken(), getOrInitOfflineState(), isStandaloneApkEnvironment(), recomputeOfflineDerived(), saveOfflineState(), AIPlannerOutput, COMFORT_FOOD_RECIPE_IDS (+28 more)

### Community 7 - "MainActivity.java"
Cohesion: 0.07
Nodes (13): MainActivity, ValueCallback<String>, WebViewClient, 1. Architecture & Project Overview (Part 1), 2. Structured Compliance Audit Report (Parts 2, 3 & 4), 3. Google Play Console Declarations Guide, A. Data Safety Section Declarations, B. App Access Instructions for Google Play Reviewers (+5 more)

### Community 8 - "package.json"
Cohesion: 0.07
Nodes (37): dependencies, cors@^2.8.5, express@^4.21.2, lucide-react@^0.468.0, react@^18.3.1, react-dom@^18.3.1, description, devDependencies (+29 more)

### Community 9 - "bazarstoreMonitor.ts"
Cohesion: 0.09
Nodes (31): AggregatedNeed, BAZARSTORE_ALTERNATIVE_URL, BAZARSTORE_PRIMARY_URL, BAZARSTORE_SHOPIFY_COLLECTION_URL, BAZARSTORE_SHOPIFY_PRODUCTS_URL, computePriceStaleness(), decodeHtmlEntities(), extractPackageQuantityFromTitle() (+23 more)

### Community 10 - "ep"
Cohesion: 0.08
Nodes (35): Ae(), ap(), _c(), Cc(), Ct(), ep(), fc(), fp() (+27 more)

### Community 11 - "app.ts"
Cohesion: 0.13
Nodes (21): outDir, AuthenticatedRequest, resolveUser(), VALID_CURRENCIES, VALID_LANGUAGES, VALID_REGIONS, assertAuthConfiguration(), generateRecoveryCode() (+13 more)

### Community 12 - "catalogueData.ts"
Cohesion: 0.14
Nodes (22): ALL_CATALOGUE_PRODUCTS, applyMonitoredPricesToCatalogue(), AZ_CATALOGUE_PRODUCTS, CATALOGUE_PRODUCTS, CURRENT_OFFERS, CURRENT_OFFERS_AZ, CURRENT_OFFERS_PL, makePrice() (+14 more)

### Community 13 - "database.ts"
Cohesion: 0.12
Nodes (23): AppStatePayload, AiPlanWizardModalProps, ModalProps, AIPlannerInput, { DatabaseSync }, normalizeIngredientQuantity(), CANONICAL_AZ_NAMES, ing() (+15 more)

### Community 14 - "build-apk.mjs"
Cohesion: 0.08
Nodes (20): aapt2, alignedApk, apkOutDir, apksigner, assetsWww, buildToolsDir, buildWork, d8 (+12 more)

### Community 15 - "jp"
Cohesion: 0.15
Nodes (22): ah(), Ay(), cl(), _d(), dd(), gp(), jp(), Ka() (+14 more)

### Community 16 - "mp"
Cohesion: 0.15
Nodes (20): bd(), Ei(), Gy(), hf(), Hy(), Jc(), jf(), Jo() (+12 more)

### Community 17 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, jsx, module, moduleResolution, noEmit (+6 more)

### Community 18 - "getCatalogueProductsForRegion"
Cohesion: 0.20
Nodes (4): getCatalogueProductsForRegion(), ISupermarketAdapter, RegionalSupermarketAdapter, SupermarketProduct

### Community 19 - "dp"
Cohesion: 0.18
Nodes (12): Ac(), dp(), mi(), Od(), Pd(), sg(), up(), vd() (+4 more)

### Community 20 - "uy"
Cohesion: 0.20
Nodes (11): Bf(), ic(), Ii(), lc(), lt(), my(), uy(), Va() (+3 more)

### Community 21 - "quantityEngine.ts"
Cohesion: 0.27
Nodes (10): buildSmartShoppingList(), calculateSupermarketPackages(), formatBaseQuantity(), INGREDIENT_ALIASES, LIQUID_CANONICALS, NormalizedQuantityResult, normalizeText(), PackageCalculation (+2 more)

### Community 22 - "Rl"
Cohesion: 0.33
Nodes (10): Kn(), $n(), Nl(), Ol(), ql(), Rl(), Ru(), Tl() (+2 more)

### Community 23 - "hi"
Cohesion: 0.25
Nodes (9): al(), eg(), Fg(), hi(), nf(), Ro(), $u(), Yu() (+1 more)

### Community 24 - "Quick Start & Installation"
Cohesion: 0.22
Nodes (8): 1. Environment Configuration, 2. Install & Build, 3. Run Automated Tests, 4. Start the Server & Application, 5. Build the Android APK, Architecture Overview, MealPlanner — AI Meal Planning & Smart Grocery Shopping for Poland, Quick Start & Installation

### Community 25 - "Ji"
Cohesion: 0.25
Nodes (8): ao(), cy(), fy(), Ji(), Jn(), Qc(), ug(), Yc()

### Community 26 - "cn"
Cohesion: 0.33
Nodes (6): am(), cn(), f(), om(), rm(), Yl()

### Community 27 - "ff"
Cohesion: 0.33
Nodes (6): cf(), df(), ff(), lf(), ly(), sf()

### Community 28 - "Vn"
Cohesion: 0.33
Nodes (6): El(), Il(), Jm(), Vn(), Xm(), Ym()

### Community 31 - "gl"
Cohesion: 0.67
Nodes (3): compareProductsAcrossStores(), getAdapter(), gl()

## Knowledge Gaps
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `sanitizePromptToken()` connect `clientApi.ts` to `MainActivity.java`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 30 inferred relationships involving `createApp()` (e.g. with `resolveUser()` and `.addManualShoppingItem()`) actually correct?**
  _`createApp()` has 30 INFERRED edges - model-reasoned connections that need verification._
- **Should `M` be split into smaller, more focused modules?**
  _Cohesion score 0.05548654244306418 - nodes in this community are weakly interconnected._
- **Why does `HIGH PRIORITY ISSUES (All Resolved)` connect `MainActivity.java` to `clientApi.ts`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Should `Xl` be split into smaller, more focused modules?**
  _Cohesion score 0.0777928539122569 - nodes in this community are weakly interconnected._
- **Should `MealPlannerApp.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07731694828469023 - nodes in this community are weakly interconnected._
- **Should `be` be split into smaller, more focused modules?**
  _Cohesion score 0.10372340425531915 - nodes in this community are weakly interconnected._