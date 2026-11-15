import {
  BudgetAnalysis,
  BudgetOptimizationSuggestion,
  CurrencyCode,
  PlannedMeal,
  Recipe,
  RegionCode,
  ShoppingList,
  SupermarketSlug,
  UserPreferences,
} from '../../shared/types';
import { validateRecipeForUser } from '../validation/mealValidator';
import { getDefaultCurrencyForRegion, formatMoney } from '../../shared/regionConfig';
import { getRecipeBaseCostForCurrency } from '../ai/aiMealPlanner';

export function analyzeAndOptimizeBudget(params: {
  preferences: UserPreferences;
  plannedMeals: PlannedMeal[];
  shoppingList: ShoppingList;
  allRecipes: Recipe[];
}): BudgetAnalysis {
  const { preferences, plannedMeals, shoppingList, allRecipes } = params;
  const regionCode: RegionCode = preferences.regionCode || shoppingList.regionCode || 'PL';
  const currencyCode: CurrencyCode =
    preferences.currencyCode || shoppingList.currencyCode || getDefaultCurrencyForRegion(regionCode);

  const weeklyBudgetPln = preferences.weeklyBudgetPln;
  const estimatedBasketPln = shoppingList.estimatedTotalPln;
  const mealPortionsCostPln = Number(
    plannedMeals.reduce((acc, m) => acc + m.scaledCostPln, 0).toFixed(2)
  );
  const differencePln = Number((weeklyBudgetPln - estimatedBasketPln).toFixed(2));
  const isOverBudget = estimatedBasketPln > weeklyBudgetPln;
  const usagePercent =
    weeklyBudgetPln > 0 ? Math.round((estimatedBasketPln / weeklyBudgetPln) * 100) : 0;

  // 1. Identify top expensive ingredients in the basket
  const sortedItems = [...shoppingList.items].sort((a, b) => b.lineTotalPln - a.lineTotalPln);
  const expensiveItems = sortedItems.slice(0, 4).map((item) => ({
    canonicalIngredient: item.canonicalIngredient,
    namePl: item.namePl,
    nameEn: item.nameEn,
    nameAz: item.nameAz || item.nameEn,
    lineTotalPln: item.lineTotalPln,
    shareOfBasketPercent:
      estimatedBasketPln > 0 ? Math.round((item.lineTotalPln / estimatedBasketPln) * 100) : 0,
  }));

  const suggestions: BudgetOptimizationSuggestion[] = [];

  // 2. Check if another supermarket in the same region offers a lower total basket cost
  const minSwitchThreshold = currencyCode === 'AZN' ? 0.8 : 1.5;
  const storeEntries = Object.entries(shoppingList.comparisonByStore) as Array<
    [SupermarketSlug, { totalBasketPln: number }]
  >;
  storeEntries.sort((a, b) => a[1].totalBasketPln - b[1].totalBasketPln);
  const cheapestStore = storeEntries[0];
  if (
    cheapestStore &&
    cheapestStore[0] !== shoppingList.supermarketId &&
    estimatedBasketPln - cheapestStore[1].totalBasketPln >= minSwitchThreshold
  ) {
    const savings = Number((estimatedBasketPln - cheapestStore[1].totalBasketPln).toFixed(2));
    const storeName = cheapestStore[0].charAt(0).toUpperCase() + cheapestStore[0].slice(1);
    const savingsLabel = formatMoney(savings, currencyCode);
    const totalLabel = formatMoney(cheapestStore[1].totalBasketPln, currencyCode);
    suggestions.push({
      id: `sug-store-${cheapestStore[0]}`,
      type: 'STORE_SWITCH',
      titlePl: `Zmień sklep na ${storeName} i zaoszczędź ${savingsLabel}`,
      titleEn: `Switch store to ${storeName} and save ${savingsLabel}`,
      titleAz: `Mağazanı ${storeName} olaraq dəyişin və ${savingsLabel} qənaət edin`,
      descriptionPl: `Ten sam koszyk produktów kosztuje w ${storeName} ${totalLabel} dzięki aktualnym promocjom.`,
      descriptionEn: `The exact same shopping basket costs ${totalLabel} at ${storeName} with current promotions.`,
      descriptionAz: `Eyni alış-veriş səbəti cari endirimlərlə ${storeName} şəbəkəsində ${totalLabel} təşkil edir.`,
      estimatedSavingsPln: savings,
      targetSupermarketId: cheapestStore[0],
    });
  }

  // 3. Find expensive planned meals and suggest validated cheaper alternatives of the same mealType
  const validAlternatives = allRecipes.filter(
    (r) => validateRecipeForUser(r, preferences, { enforcePrepTime: false }).valid
  );

  const minMealSavingsThreshold = currencyCode === 'AZN' ? 0.9 : 2.0;
  const sortedMeals = [...plannedMeals].sort((a, b) => b.scaledCostPln - a.scaledCostPln);
  for (const expensiveMeal of sortedMeals.slice(0, 3)) {
    const cheaperCandidates = validAlternatives
      .filter((r) => r.mealType === expensiveMeal.mealType && r.id !== expensiveMeal.recipe.id)
      .sort(
        (a, b) =>
          getRecipeBaseCostForCurrency(a, currencyCode) -
          getRecipeBaseCostForCurrency(b, currencyCode)
      );

    const bestAlt = cheaperCandidates[0];
    if (bestAlt) {
      const altBaseCost = getRecipeBaseCostForCurrency(bestAlt, currencyCode);
      const altScaledCost = Number(
        ((altBaseCost * expensiveMeal.servings) / Math.max(1, bestAlt.baseServings)).toFixed(2)
      );
      const mealSavings = Number((expensiveMeal.scaledCostPln - altScaledCost).toFixed(2));
      if (mealSavings >= minMealSavingsThreshold) {
        const mealSavingsLabel = formatMoney(mealSavings, currencyCode);
        suggestions.push({
          id: `sug-swap-${expensiveMeal.id}`,
          type: 'RECIPE_SWAP',
          titlePl: `Zamień „${expensiveMeal.recipe.titlePl}” na „${bestAlt.titlePl}”`,
          titleEn: `Swap "${expensiveMeal.recipe.titleEn}" for "${bestAlt.titleEn}"`,
          titleAz: `“${expensiveMeal.recipe.titleAz || expensiveMeal.recipe.titleEn}” yeməyini “${bestAlt.titleAz || bestAlt.titleEn}” ilə əvəz edin`,
          descriptionPl: `Tańszy posiłek zgodny z Twoją dietą i alergiami – oszczędność ok. ${mealSavingsLabel} na porcjach.`,
          descriptionEn: `More affordable meal matching all your dietary & allergy rules – saves approx. ${mealSavingsLabel}.`,
          descriptionAz: `Pəhriz və allergiya qaydalarınıza tam uyğun daha sərfəli yemək – təxm. ${mealSavingsLabel} qənaət.`,
          estimatedSavingsPln: mealSavings,
          targetPlannedMealId: expensiveMeal.id,
          replacementRecipeId: bestAlt.id,
        });
      }
    }
  }

  // 4. Suggest pantry subtraction if currently disabled
  if (!shoppingList.subtractPantry) {
    const pantrySavings = currencyCode === 'AZN' ? 8.50 : 18.50;
    suggestions.push({
      id: 'sug-enable-pantry',
      type: 'PANTRY_UTILIZATION',
      titlePl: 'Włącz odliczanie produktów ze Spiżarni',
      titleEn: 'Enable Pantry & Leftovers deduction',
      titleAz: 'Evdəki ərzaqların (Anbarın) çıxılmasını aktivləşdirin',
      descriptionPl: 'Wykorzystaj składniki, które masz już w domu, aby nie kupować zdublowanych opakowań.',
      descriptionEn: 'Subtract ingredients already stored in your home Pantry to avoid buying duplicate packages.',
      descriptionAz: 'Təkrar qablaşdırma almamaq üçün evdə artıq mövcud olan ərzaqları siyahıdan çıxın.',
      estimatedSavingsPln: pantrySavings,
    });
  }

  return {
    regionCode,
    currencyCode,
    weeklyBudgetPln,
    estimatedBasketPln,
    mealPortionsCostPln,
    differencePln,
    isOverBudget,
    usagePercent,
    expensiveItems,
    suggestions,
    disclaimerPl:
      'Uwaga: Podane kwoty są szacunkami opartymi na cenach katalogowych/promocyjnych całych opakowań i nie stanowią gwarancji ostatecznej ceny przy kasie w sklepie stacjonarnym.',
    disclaimerEn:
      'Note: Displayed totals are estimates based on package catalogue/promotional prices and never guarantee the final in-store checkout price.',
    disclaimerAz:
      'Qeyd: Göstərilən məbləğlər tam qablaşdırmaların kataloq/endirim qiymətlərinə əsaslanan təxminlərdir və mağaza kassasındakı yekun qiymətə zəmanət vermir.',
  };
}
