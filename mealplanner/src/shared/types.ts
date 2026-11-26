export type RegionCode = 'PL' | 'AZ';

export type CurrencyCode = 'PLN' | 'AZN';

export type Language = 'en' | 'pl' | 'az';

export type PolishSupermarketSlug =
  | 'biedronka'
  | 'lidl'
  | 'auchan'
  | 'kaufland'
  | 'carrefour'
  | 'zabka';

export type AzerbaijaniSupermarketSlug =
  | 'bravo'
  | 'araz'
  | 'bazarstore'
  | 'rahat'
  | 'oba'
  | 'birmarket';

export type SupermarketSlug = PolishSupermarketSlug | AzerbaijaniSupermarketSlug;

export type DietaryOption =
  | 'none'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'high_protein'
  | 'low_carb'
  | 'keto'
  | 'gluten_free'
  | 'lactose_free';

export type FoodVibeOption =
  | 'quick_easy'
  | 'high_protein'
  | 'low_calorie'
  | 'fakeaway'
  | 'budget_friendly'
  | 'healthy_balanced'
  | 'comfort_food'
  | 'traditional'
  | 'meal_prep'
  | 'family_friendly'
  | 'mediterranean';

export type KitchenEquipmentOption =
  | 'oven'
  | 'hob'
  | 'air_fryer'
  | 'microwave'
  | 'toaster'
  | 'kettle'
  | 'blender'
  | 'food_processor'
  | 'rice_cooker'
  | 'slow_cooker'
  | 'grill'
  | 'other';

export type CookingSkill = 'beginner' | 'intermediate' | 'advanced';

export type CuisineSlug =
  | 'italian'
  | 'french'
  | 'polish'
  | 'greek'
  | 'azerbaijani'
  | 'spanish';

export type CuisinePreference = 'any' | CuisineSlug;

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard';

export type ShoppingCategory =
  | 'Fruit & Vegetables'
  | 'Meat & Fish'
  | 'Dairy'
  | 'Bakery'
  | 'Dry Products'
  | 'Frozen Products'
  | 'Drinks'
  | 'Other';

export type PriceVerificationStatus =
  | 'LIVE_MONITORED_CATALOGUE'
  | 'VERIFIED_LEAFLET_PROMO'
  | 'DEMONSTRATION_CATALOGUE'
  | 'ESTIMATED_MARKET_AVG'
  | 'OUTDATED_PRICE'
  | 'UNAVAILABLE';

export type StoreChannel = 'PHYSICAL_STORE' | 'ONLINE_AND_STORE' | 'ONLINE_ONLY';

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'UNCERTAIN';

export interface NotificationSettings {
  enabled: boolean;
  weeklyMealPlans: boolean;
  shoppingReminders: boolean;
  expiringPantryProducts: boolean;
  mealPrepReminders: boolean;
}

export interface UserPreferences {
  userId: string;
  regionCode?: RegionCode;
  currencyCode?: CurrencyCode;
  householdSize: number;
  weeklyBudgetPln: number; // Active weekly budget in the user's selected currency (PLN for PL, AZN for AZ)
  weeklyBudgetAzn?: number;
  preferredSupermarket: SupermarketSlug;
  dietaryRestrictions: DietaryOption[];
  customRestrictions: string[];
  allergies: string[];
  excludedIngredients: string[];
  dislikes: string[];
  likes?: string[];
  cookingSkill: CookingSkill;
  preferredPrepTimeMin: number;
  kitchenEquipment: string[];
  planDurationDays?: number;
  preferredCuisine?: CuisinePreference;
  foodVibes?: FoodVibeOption[];
  customFoodVibes?: string[];
  mealsPerDay: number;
  includeSnacks: boolean;
  notifications: NotificationSettings;
  onboardingCompleted: boolean;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  language: Language;
  regionCode: RegionCode;
  currencyCode: CurrencyCode;
  householdName: string;
  householdShareCode: string;
  createdAt: string;
  preferences: UserPreferences;
}

export interface Supermarket {
  id: SupermarketSlug;
  name: string;
  regionCode: RegionCode;
  country: 'Poland' | 'Azerbaijan';
  currency: CurrencyCode;
  primaryColor: string;
  secondaryColor: string;
  loyaltyProgramName: string;
  websiteUrl: string;
  adapterStatus: 'DEMO_FALLBACK_ACTIVE' | 'PUBLIC_CATALOGUE_CONNECTED' | 'COMING_SOON_UNAVAILABLE';
  isCatalogueAvailable?: boolean;
  lastSyncedAt: string;
  priceDisclaimerPl: string;
  priceDisclaimerEn: string;
  priceDisclaimerAz?: string;
}

export interface ProductPriceRecord {
  id: string;
  productId: string;
  supermarketId: SupermarketSlug;
  regionCode?: RegionCode;
  country?: string;
  currencyCode?: CurrencyCode;
  regularPricePln: number; // Monetary amount in the record's currencyCode (PLN or AZN)
  promoPricePln: number | null;
  effectivePricePln: number;
  unitPricePln: number;
  unitPriceLabel: string; // e.g., "22,99 zł / kg" or "10.99 ₼ / kq"
  loyaltyRequired: boolean;
  loyaltyConditionPl: string | null;
  loyaltyConditionEn: string | null;
  loyaltyConditionAz?: string | null;
  promoValidUntil: string | null;
  discountPercent: number | null;
  storeChannel: StoreChannel;
  storeLocation: string;
  sourceName: string;
  sourceUrl: string;
  verificationStatus: PriceVerificationStatus;
  lastUpdatedAt: string;
  isAvailable?: boolean;
  isOutdated?: boolean;
  priceAgeHours?: number;
}

export interface SupermarketProduct {
  id: string;
  ean: string;
  canonicalIngredient: string;
  regionCode?: RegionCode;
  currencyCode?: CurrencyCode;
  namePl: string;
  nameEn: string;
  nameAz?: string;
  brand: string;
  category: ShoppingCategory;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'pcs';
  packageLabelPl: string;
  packageLabelEn: string;
  packageLabelAz?: string;
  icon: string;
  imageUrl: string;
  prices: Partial<Record<SupermarketSlug, ProductPriceRecord | undefined>>;
}

export interface RecipeIngredient {
  id: string;
  canonicalIngredient: string;
  namePl: string;
  nameEn: string;
  nameAz?: string;
  amount: number;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'tbsp' | 'tsp' | 'cloves' | 'pcs' | 'to_taste';
  displayAmountPl: string;
  displayAmountEn: string;
  displayAmountAz?: string;
  normalizedBaseAmount: number;
  normalizedBaseUnit: 'g' | 'ml' | 'pcs' | 'to_taste';
  category: ShoppingCategory;
  icon: string;
  optional?: boolean;
}

export interface NutritionInfo {
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface Recipe {
  id: string;
  slug: string;
  authorUserId: string | null;
  titlePl: string;
  titleEn: string;
  titleAz?: string;
  descriptionPl: string;
  descriptionEn: string;
  descriptionAz?: string;
  mealType: MealType;
  category: string;
  cuisine?: CuisineSlug | null;
  regionSuitability?: RegionCode[];
  imageUrl: string;
  prepTimeMin: number;
  cookTimeMin: number;
  totalTimeMin: number;
  difficulty: DifficultyLevel;
  baseServings: number;
  estimatedCostPln: number;
  estimatedCostAzn?: number;
  nutrition: NutritionInfo;
  dietaryTags: DietaryOption[];
  allergens: string[];
  equipment: string[];
  ingredients: RecipeIngredient[];
  instructionsPl: string[];
  instructionsEn: string[];
  instructionsAz?: string[];
  isCustom: boolean;
  isFavourite?: boolean;
}

export interface PlannedMeal {
  id: string;
  weeklyPlanId: string;
  dayIndex: number; // 0 = Mon .. 6 = Sun
  dateStr: string;
  mealType: MealType;
  servings: number;
  recipe: Recipe;
  scaledCostPln: number;
  scaledCaloriesKcal: number;
}

export interface WeeklyPlan {
  id: string;
  userId: string;
  regionCode?: RegionCode;
  currencyCode?: CurrencyCode;
  weekStartDate: string;
  weekLabelPl: string;
  weekLabelEn: string;
  weekLabelAz?: string;
  targetBudgetPln: number;
  supermarketId: SupermarketSlug;
  householdSize: number;
  planDurationDays?: number;
  meals: PlannedMeal[];
  totalEstimatedBasketPln: number;
  totalMealPortionsCostPln: number;
  remainingBudgetPln: number;
  budgetUsagePercent: number;
  hasIncompleteTotal?: boolean;
  unpricedItemsCount?: number;
  isRemainingBudgetVerified?: boolean;
  aiGenerationNotesPl: string;
  aiGenerationNotesEn: string;
  aiGenerationNotesAz?: string;
  hasNoSafeRecipes?: boolean;
  noSafeRecipeSlots?: Array<{ dayIndex: number; mealType: MealType; reason: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  shoppingListId: string;
  canonicalIngredient: string;
  regionCode?: RegionCode;
  currencyCode?: CurrencyCode;
  namePl: string;
  nameEn: string;
  nameAz?: string;
  category: ShoppingCategory;
  icon: string;
  requiredAmount: number;
  requiredUnit: 'g' | 'ml' | 'pcs';
  requiredDisplayLabel: string;
  pantryDeductedAmount: number;
  netRequiredAmount: number;
  matchedProductId: string | null;
  matchedProductNamePl: string;
  matchedProductNameEn: string;
  matchedProductNameAz?: string;
  matchedBrand: string;
  ean: string | null;
  sku?: string | null;
  glovoProductId?: string | null;
  externalProductId?: string | null;
  storeProductId?: string | null;
  glovoProductUrl?: string | null;
  priceObservedAt?: string | null;
  recommendedPackages: number;
  packageSizeLabel: string;
  totalPurchasedAmount: number;
  leftoverAmount: number;
  leftoverDisplayLabel: string;
  unitPricePln: number;
  unitPriceLabel: string;
  regularLineTotalPln: number;
  lineTotalPln: number;
  isPriced?: boolean;
  sourceName?: string;
  storeLocation?: string;
  sourceUrl?: string;
  snapshotId?: string | null;
  supermarketId: SupermarketSlug;
  priceVerificationStatus: PriceVerificationStatus;
  loyaltyRequired: boolean;
  loyaltyConditionPl: string | null;
  loyaltyConditionEn: string | null;
  loyaltyConditionAz?: string | null;
  promoValidUntil: string | null;
  storeChannel: StoreChannel;
  lastUpdatedAt: string;
  isAvailable?: boolean;
  isOutdated?: boolean;
  priceAgeHours?: number;
  matchConfidence: MatchConfidence;
  isPurchased: boolean;
  isManual: boolean;
  alternativeStorePricePln: number | null;
  alternativeStoreId: SupermarketSlug | null;
}

export interface ShoppingList {
  id: string;
  userId: string;
  weeklyPlanId: string;
  regionCode?: RegionCode;
  currencyCode?: CurrencyCode;
  supermarketId: SupermarketSlug;
  subtractPantry: boolean;
  items: ShoppingItem[];
  totalItemsCount: number;
  toBuyCount: number;
  boughtCount: number;
  estimatedTotalPln: number;
  regularTotalWithoutPromosPln: number;
  totalSavingsPln: number;
  hasIncompleteTotal?: boolean;
  unpricedItemsCount?: number;
  comparisonByStore: Partial<
    Record<
      SupermarketSlug,
      {
        totalBasketPln: number;
        availableItemsCount: number;
        missingItemsCount: number;
        savingsVsRegularPln: number;
      }
    >
  >;
  updatedAt: string;
}

export interface PantryItem {
  id: string;
  userId: string;
  canonicalIngredient: string;
  namePl: string;
  nameEn: string;
  nameAz?: string;
  quantity: number;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
  normalizedAmount: number;
  normalizedUnit: 'g' | 'ml' | 'pcs';
  category: ShoppingCategory;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  isExpiringSoon: boolean;
  addedAt: string;
  icon: string;
}

export interface BudgetOptimizationSuggestion {
  id: string;
  type: 'RECIPE_SWAP' | 'STORE_SWITCH' | 'PRODUCT_SUBSTITUTION' | 'PANTRY_UTILIZATION';
  titlePl: string;
  titleEn: string;
  titleAz?: string;
  descriptionPl: string;
  descriptionEn: string;
  descriptionAz?: string;
  estimatedSavingsPln: number;
  targetPlannedMealId?: string;
  replacementRecipeId?: string;
  targetSupermarketId?: SupermarketSlug;
}

export interface BudgetAnalysis {
  regionCode?: RegionCode;
  currencyCode?: CurrencyCode;
  weeklyBudgetPln: number;
  estimatedBasketPln: number;
  mealPortionsCostPln: number;
  differencePln: number;
  isOverBudget: boolean;
  usagePercent: number;
  hasIncompleteTotal?: boolean;
  unpricedItemsCount?: number;
  isRemainingBudgetVerified?: boolean;
  expensiveItems: Array<{
    canonicalIngredient: string;
    namePl: string;
    nameEn: string;
    nameAz?: string;
    lineTotalPln: number;
    shareOfBasketPercent: number;
  }>;
  suggestions: BudgetOptimizationSuggestion[];
  disclaimerPl: string;
  disclaimerEn: string;
  disclaimerAz?: string;
}

export interface MonitoredProductRecord {
  id: string;
  supermarketId: SupermarketSlug;
  regionCode: RegionCode;
  currencyCode: CurrencyCode;
  externalId: string | null;
  variantKey: string;
  ean: string | null;
  canonicalIngredient: string | null;
  nameAz: string;
  nameEn: string;
  namePl: string;
  brand: string;
  category: ShoppingCategory;
  packageSize: number;
  packageUnit: 'g' | 'ml' | 'pcs';
  packageLabelAz: string;
  imageUrl: string;
  productUrl: string;
  regularPrice: number;
  discountedPrice: number | null;
  effectivePrice: number;
  unitPrice: number;
  unitPriceLabel: string;
  isAvailable: boolean;
  verificationStatus: PriceVerificationStatus;
  matchConfidence: MatchConfidence;
  lastCheckedAt: string;
  lastPriceChangedAt: string;
  priceAgeHours: number;
  isOutdated: boolean;
}

export interface PriceHistoryEntry {
  id: string;
  monitoredProductId: string;
  supermarketId: SupermarketSlug;
  canonicalIngredient: string | null;
  productNameAz?: string;
  productNameEn?: string;
  packageLabelAz?: string;
  regularPrice: number;
  discountedPrice: number | null;
  effectivePrice: number;
  previousEffectivePrice: number | null;
  priceDelta: number | null;
  isAvailable: boolean;
  recordedAt: string;
  syncRunId: string | null;
}

export interface PriceSyncRunRecord {
  id: string;
  supermarketId: SupermarketSlug;
  sourceUrl: string;
  triggerType: 'SCHEDULED_24H' | 'SCHEDULED_5D' | 'STARTUP_CHECK' | 'MANUAL_API' | 'CLI_COMMAND' | 'SEED_BASELINE';
  status: 'SUCCESS' | 'PARTIAL_FALLBACK' | 'PARTIAL_REJECTED' | 'RATE_LIMITED' | 'FAILED';
  productsChecked: number;
  productsUpdated: number;
  priceChangesRecorded: number;
  errorsCount: number;
  errorSummary: string | null;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface BiedronkaSnapshotSummary {
  activeSnapshotId: string | null;
  sourceName: string;
  storeLocation: string;
  sourceUrl: string;
  refreshCadenceDays: number;
  lastActivatedAt: string | null;
  lastAttemptedAt: string | null;
  lastRunStatus: 'SUCCESS' | 'PARTIAL_REJECTED' | 'RATE_LIMITED' | 'FAILED' | 'NEVER_RUN';
  nextScheduledRefreshAt: string | null;
  isStale: boolean;
  activeItemsCount: number;
  matchedItemsCount: number;
  totalSections: number;
  succeededSections: number;
  stagingSnapshotId?: string | null;
  stagingCompletedSections?: number;
  stagingTotalSections?: number;
  stagingNextRetryAt?: string | null;
  recentRuns: PriceSyncRunRecord[];
}

export interface BiedronkaNutritionRow {
  label: string;
  value: string;
  isSubRow?: boolean;
}

export type BiedronkaDetailStatus =
  | 'OK'
  | 'CACHED'
  | 'MISSING_IDENTITY'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'OFFLINE_UNAVAILABLE';

export interface BiedronkaProductDetail {
  sku: string;
  productId: string | null;
  externalProductId: string | null;
  storeProductId: string | null;
  storeId: string | null;
  storeAddressId: string | null;
  storeSlug: 'biedronka-waw';
  sourceName: string;
  storeLocation: string;
  namePl: string;
  packageLabelPl: string | null;
  regularPricePln: number;
  promoPricePln: number | null;
  effectivePricePln: number;
  priceObservedAt: string | null;
  imageUrl: string | null;
  glovoProductUrl: string | null;
  description: string | null;
  ingredients: string | null;
  nutritionBasis: string | null;
  nutritionRows: BiedronkaNutritionRow[];
  countryOfOrigin: string | null;
  detailStatus: BiedronkaDetailStatus;
  detailError: string | null;
  retryAfterAt: string | null;
  detailFetchedAt: string | null;
  fromCache: boolean;
}

export interface PriceMonitoringSummary {
  supermarketId: SupermarketSlug;
  supermarketName: string;
  primaryUrl: string;
  alternativeUrl: string;
  scheduleIntervalHours: number;
  outdatedThresholdHours: number;
  lastSuccessfulSyncAt: string | null;
  lastAttemptedSyncAt: string | null;
  lastSyncStatus: 'SUCCESS' | 'PARTIAL_FALLBACK' | 'PARTIAL_REJECTED' | 'RATE_LIMITED' | 'FAILED' | 'NEVER_RUN';
  nextScheduledSyncAt: string;
  isStale: boolean;
  totalMonitoredProducts: number;
  availableProductsCount: number;
  unavailableProductsCount: number;
  outdatedProductsCount: number;
  recentPriceChanges: PriceHistoryEntry[];
  recentSyncRuns: PriceSyncRunRecord[];
}
