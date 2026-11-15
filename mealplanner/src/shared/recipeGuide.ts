import { Language, Recipe, RecipeIngredient } from './types';
import { pickLocalizedText, pickLocalizedList } from './regionConfig';

export interface CookingMetadata {
  temperatureLabel: string;
  heatMethodLabel: string;
  equipmentLabels: string[];
  prepTimeMin: number;
  cookTimeMin: number;
  totalTimeMin: number;
}

export interface DetailedCookingStep {
  stepNumber: number;
  title: string;
  instruction: string;
  durationLabel: string | null;
  temperatureHint: string | null;
  stepIngredients: Array<{
    id: string;
    icon: string;
    name: string;
    scaledAmountLabel: string;
  }>;
}

const EQUIPMENT_TRANSLATIONS: Record<string, { en: string; pl: string; az: string }> = {
  garnek: { en: 'Cooking Pot / Saucepan', pl: 'Garnek', az: 'Qazan' },
  'qazan / garnek': { en: 'Cooking Pot (Qazan)', pl: 'Garnek', az: 'Qazan' },
  patelnia: { en: 'Frying Pan / Skillet', pl: 'Patelnia', az: 'Tava' },
  'tava / patelnia': { en: 'Skillet / Frying Pan (Tava)', pl: 'Patelnia', az: 'Tava' },
  'patelnia grillowa / piekarnik': {
    en: 'Grill Pan, Skillet, or Oven',
    pl: 'Patelnia grillowa, patelnia lub piekarnik',
    az: 'Qril tavası, tava və ya soba',
  },
  piekarnik: { en: 'Oven & Baking Tray', pl: 'Piekarnik i blacha do pieczenia', az: 'Soba və soba listi' },
  miska: { en: 'Mixing Bowl', pl: 'Miska', az: 'Qab / Kasa' },
  hob: { en: 'Stovetop / Hob', pl: 'Kuchenka / Palnik', az: 'Qaz plitəsi / Ocaq' },
  oven: { en: 'Oven', pl: 'Piekarnik', az: 'Soba' },
  air_fryer: { en: 'Air Fryer', pl: 'Air Fryer', az: 'Aerofritür (Air Fryer)' },
  microwave: { en: 'Microwave', pl: 'Mikrofalówka', az: 'Mikrodalğalı soba' },
  kettle: { en: 'Kettle', pl: 'Czajnik', az: 'Çaydan' },
  toaster: { en: 'Toaster', pl: 'Toster', az: 'Toster' },
  blender: { en: 'Blender', pl: 'Blender', az: 'Blender' },
  food_processor: { en: 'Food Processor', pl: 'Malakser / Robot kuchenny', az: 'Mətbəx kombaynı' },
  rice_cooker: { en: 'Rice Cooker', pl: 'Ryżowar', az: 'Düyü bişirən' },
  slow_cooker: { en: 'Slow Cooker', pl: 'Wolnowar', az: 'Multivarka' },
  grill: { en: 'Grill / Grill Pan', pl: 'Grill', az: 'Qril' },
};

export function formatScaledIngredientAmount(
  ing: RecipeIngredient,
  scale: number,
  lang: Language
): string {
  if (ing.unit === 'to_taste') {
    return pickLocalizedText(lang, {
      en: ing.displayAmountEn || 'to taste',
      pl: ing.displayAmountPl || 'do smaku',
      az: ing.displayAmountAz || 'zövqə görə',
    });
  }
  const rawScaled = ing.amount * scale;
  const rounded =
    rawScaled >= 10
      ? Math.round(rawScaled)
      : Math.round(rawScaled * 10) / 10;

  const unitLabels: Record<string, { en: string; pl: string; az: string }> = {
    g: { en: 'g', pl: 'g', az: 'q' },
    kg: { en: 'kg', pl: 'kg', az: 'kq' },
    ml: { en: 'ml', pl: 'ml', az: 'ml' },
    l: { en: 'L', pl: 'l', az: 'l' },
    pcs: { en: 'pcs', pl: 'szt.', az: 'ədəd' },
    tbsp: { en: 'tbsp', pl: 'łyżka/i', az: 'x.q.' },
    tsp: { en: 'tsp', pl: 'łyżeczka/i', az: 'ç.q.' },
    cloves: { en: 'cloves', pl: 'ząbki', az: 'diş' },
  };

  const u = unitLabels[ing.unit]
    ? pickLocalizedText(lang, unitLabels[ing.unit])
    : ing.unit;
  return `${rounded} ${u}`;
}

export function getRecipeCookingMetadata(
  recipe: Recipe,
  lang: Language,
  userEquipment?: string[]
): CookingMetadata {
  const equipJoined = (recipe.equipment || []).join(' ').toLowerCase();
  const userEquipJoined = (userEquipment || []).join(' ').toLowerCase();
  const hasUserOven =
    !userEquipment ||
    userEquipment.length === 0 ||
    userEquipJoined.includes('oven') ||
    userEquipJoined.includes('piekarnik') ||
    userEquipJoined.includes('soba');

  let temperatureLabel = '';
  let heatMethodLabel = '';

  if (recipe.cookTimeMin === 0 || equipJoined.includes('miska')) {
    temperatureLabel = pickLocalizedText(lang, {
      en: 'No heat required (Room temp / Chilled)',
      pl: 'Bez obróbki cieplnej (Na zimno)',
      az: 'İstilik tələb olunmur (Soyuq / Otaq temperaturu)',
    });
    heatMethodLabel = pickLocalizedText(lang, {
      en: 'Fresh assembly & mixing',
      pl: 'Świeże łączenie składników',
      az: 'Təzə ərzaqların qarışdırılması',
    });
  } else if (
    equipJoined.includes('piekarnik') &&
    !equipJoined.includes('patelnia grillowa')
  ) {
    temperatureLabel = pickLocalizedText(lang, {
      en: '190°C (375°F) — Preheated Oven',
      pl: '190°C (góra-dół / termoobieg) — Rozgrzany piekarnik',
      az: '190°C — Qabaqcadan qızdırılmış soba',
    });
    heatMethodLabel = pickLocalizedText(lang, {
      en: 'Oven roasting & boiling',
      pl: 'Pieczenie w piekarniku i gotowanie',
      az: 'Sobada bişirmə və qaynatma',
    });
  } else if (equipJoined.includes('patelnia grillowa / piekarnik')) {
    temperatureLabel = hasUserOven
      ? pickLocalizedText(lang, {
          en: '180°C–190°C — Medium-High Grill Pan or Oven',
          pl: '180°C–190°C — Średnio-wysoki ogień lub piekarnik',
          az: '180°C–190°C — Orta-yüksək ocaq və ya soba',
        })
      : pickLocalizedText(lang, {
          en: '180°C — Medium-High Stovetop Heat',
          pl: '180°C — Średnio-wysoki ogień na patelni',
          az: '180°C — Tavada orta-yüksək od',
        });
    heatMethodLabel = pickLocalizedText(lang, {
      en: 'Pan searing & simmering in salted water',
      pl: 'Smażenie na patelni i gotowanie w wodzie',
      az: 'Tavada qızartma və suda qaynatma',
    });
  } else if (equipJoined.includes('patelnia') || equipJoined.includes('tava')) {
    temperatureLabel = pickLocalizedText(lang, {
      en: '160°C–180°C — Medium Stovetop Heat',
      pl: '160°C–180°C — Średni płomień / moc palnika',
      az: '160°C–180°C — Orta ocaq istiliyi',
    });
    heatMethodLabel = pickLocalizedText(lang, {
      en: 'Pan searing & gentle sautéing',
      pl: 'Smażenie i duszenie na patelni',
      az: 'Tavada qovurma və bişirmə',
    });
  } else {
    temperatureLabel = pickLocalizedText(lang, {
      en: '95°C–100°C — Gentle Boil then Low Simmer',
      pl: '95°C–100°C — Zagotowanie i gotowanie na wolnym ogniu',
      az: '95°C–100°C — Qaynama və vam odda bişirmə',
    });
    heatMethodLabel = pickLocalizedText(lang, {
      en: 'Stovetop simmering in pot',
      pl: 'Gotowanie w garnku pod przykryciem',
      az: 'Qazanda vam odda bişirmə',
    });
  }

  const equipmentLabels = (recipe.equipment || []).map((raw) => {
    const key = raw.trim().toLowerCase();
    if (key === 'patelnia grillowa / piekarnik' && !hasUserOven) {
      return pickLocalizedText(lang, {
        en: 'Frying Pan / Grill Pan (Stovetop)',
        pl: 'Patelnia / Patelnia grillowa',
        az: 'Tava / Qril tavası',
      });
    }
    const found = EQUIPMENT_TRANSLATIONS[key];
    if (found) return pickLocalizedText(lang, found);
    return raw;
  });

  // Always include basic cutting board & knife for beginner clarity
  const essentials = pickLocalizedText(lang, {
    en: 'Cutting board & sharp knife',
    pl: 'Deska do krojenia i nóż',
    az: 'Doğrama taxtası və bıçaq',
  });
  if (!equipmentLabels.includes(essentials)) {
    equipmentLabels.push(essentials);
  }

  return {
    temperatureLabel,
    heatMethodLabel,
    equipmentLabels,
    prepTimeMin: recipe.prepTimeMin,
    cookTimeMin: recipe.cookTimeMin,
    totalTimeMin: recipe.totalTimeMin,
  };
}

/**
 * Builds complete, beginner-friendly step-by-step instructions that reference
 * the actual ingredients and scaled quantities for the active servings count.
 */
export function buildDetailedCookingSteps(
  recipe: Recipe,
  servings: number,
  lang: Language
): DetailedCookingStep[] {
  const scale = servings / Math.max(1, recipe.baseServings);
  const rawSteps = pickLocalizedList(lang, {
    en: recipe.instructionsEn,
    pl: recipe.instructionsPl,
    az: recipe.instructionsAz,
  });

  const nonSeasoningIngs = recipe.ingredients.filter((i) => i.unit !== 'to_taste');
  const seasoningIngs = recipe.ingredients.filter((i) => i.unit === 'to_taste');

  const formatIngSummary = (ing: RecipeIngredient) => ({
    id: ing.id,
    icon: ing.icon,
    name: pickLocalizedText(lang, {
      en: ing.nameEn,
      pl: ing.namePl,
      az: ing.nameAz,
    }),
    scaledAmountLabel: formatScaledIngredientAmount(ing, scale, lang),
  });

  // Match ingredients mentioned in each step (or distribute them logically across steps so every ingredient is accounted for)
  const usedIngIds = new Set<string>();

  const matchStepIngredients = (stepText: string) => {
    const lower = stepText.toLowerCase();
    const matched: RecipeIngredient[] = [];
    for (const ing of recipe.ingredients) {
      const keywords = [
        ing.nameEn.toLowerCase(),
        ing.namePl.toLowerCase(),
        (ing.nameAz || '').toLowerCase(),
        ing.canonicalIngredient.replace(/_/g, ' ').toLowerCase(),
        ...ing.nameEn.toLowerCase().split(/\s+/).filter((w) => w.length >= 4),
        ...ing.namePl.toLowerCase().split(/\s+/).filter((w) => w.length >= 4),
        ...(ing.nameAz || '').toLowerCase().split(/\s+/).filter((w) => w.length >= 4),
      ].filter(Boolean);

      if (keywords.some((kw) => lower.includes(kw))) {
        matched.push(ing);
        usedIngIds.add(ing.id);
      }
    }
    return matched.map(formatIngSummary);
  };

  // If a recipe has fewer than 4 steps (e.g., a custom user-created recipe or a concise recipe),
  // we prepend a structured Prep Step and append a Plating/Serving Step so beginners always get a complete guide.
  const enrichedSteps: DetailedCookingStep[] = [];

  if (rawSteps.length < 4) {
    const prepIngList = nonSeasoningIngs
      .map((i) => `${pickLocalizedText(lang, { en: i.nameEn, pl: i.namePl, az: i.nameAz })} (${formatScaledIngredientAmount(i, scale, lang)})`)
      .join(', ');

    enrichedSteps.push({
      stepNumber: 1,
      title: pickLocalizedText(lang, {
        en: 'Measure & Prepare Ingredients',
        pl: 'Odmierz i przygotuj składniki',
        az: 'Ərzaqları ölçün və hazırlayın',
      }),
      instruction: pickLocalizedText(lang, {
        en: `Wash and measure all ingredients for ${servings} ${servings === 1 ? 'serving' : 'servings'}: ${prepIngList}. Have your cooking equipment ready on the counter before turning on the heat.`,
        pl: `Umyj i odmierz wszystkie składniki na ${servings} ${servings === 1 ? 'porcję' : 'porcje/porcji'}: ${prepIngList}. Przygotuj potrzebne naczynia przed włączeniem palnika.`,
        az: `${servings} porsiya üçün bütün ərzaqları yuyun və ölçün: ${prepIngList}. Ocağı yandırmazdan əvvəl mətbəx qablarını hazır saxlayın.`,
      }),
      durationLabel: `${Math.max(2, recipe.prepTimeMin)} min`,
      temperatureHint: null,
      stepIngredients: nonSeasoningIngs.slice(0, 4).map(formatIngSummary),
    });
  }

  rawSteps.forEach((stepText, idx) => {
    const stepIngs = matchStepIngredients(stepText);
    const timeMatch = stepText.match(/(\d+(?:[–-]\d+)?\s*(?:min(?:ut|uty|utes)?|dəqiqə))/i);
    const tempMatch = stepText.match(/(\d+\s*°C)/i);

    const stepTitlesEn = [
      'Prepare & Base Cooking',
      'Main Cooking Stage',
      'Combine & Simmer',
      'Finish & Serve',
      'Final Touch',
    ];
    const stepTitlesPl = [
      'Przygotowanie bazy',
      'Główne gotowanie / smażenie',
      'Łączenie składników',
      'Wykończenie i podanie',
      'Ostatni szlif',
    ];
    const stepTitlesAz = [
      'İlkin hazırlıq',
      'Əsas bişirmə mərhələsi',
      'Ərzaqların birləşdirilməsi',
      'Tamamlama və süfrəyə vermə',
      'Son toxunuş',
    ];

    // Append exact scaled quantities reminder at the end of the step if ingredients are matched
    const ingAmountsInline =
      stepIngs.length > 0
        ? ` [${stepIngs.map((si) => `${si.name}: ${si.scaledAmountLabel}`).join(' • ')}]`
        : '';

    enrichedSteps.push({
      stepNumber: enrichedSteps.length + 1,
      title: pickLocalizedText(lang, {
        en: stepTitlesEn[idx % stepTitlesEn.length],
        pl: stepTitlesPl[idx % stepTitlesPl.length],
        az: stepTitlesAz[idx % stepTitlesAz.length],
      }),
      instruction: `${stepText}${ingAmountsInline}`,
      durationLabel: timeMatch ? timeMatch[1] : null,
      temperatureHint: tempMatch ? tempMatch[1] : null,
      stepIngredients: stepIngs,
    });
  });

  if (enrichedSteps.length < 3) {
    const seasoningList =
      seasoningIngs.length > 0
        ? seasoningIngs
            .map((s) => pickLocalizedText(lang, { en: s.nameEn, pl: s.namePl, az: s.nameAz }))
            .join(', ')
        : '';
    enrichedSteps.push({
      stepNumber: enrichedSteps.length + 1,
      title: pickLocalizedText(lang, {
        en: 'Portion, Season & Serve',
        pl: 'Porcjowanie i podanie',
        az: 'Porsiyalara bölmə və süfrəyə vermə',
      }),
      instruction: pickLocalizedText(lang, {
        en: `Divide evenly into ${servings} ${servings === 1 ? 'portion' : 'portions'} (${recipe.nutrition.caloriesKcal} kcal, ${recipe.nutrition.proteinG}g protein per serving)${seasoningList ? `, finish with ${seasoningList} to taste` : ''}, and serve immediately.`,
        pl: `Podziel równo na ${servings} ${servings === 1 ? 'porcję' : 'porcje/porcji'} (${recipe.nutrition.caloriesKcal} kcal, ${recipe.nutrition.proteinG}g białka na porcję)${seasoningList ? `, dopraw do smaku (${seasoningList})` : ''} i podawaj od razu.`,
        az: `${servings} bərabər porsiyaya bölün (hər porsiyada ${recipe.nutrition.caloriesKcal} kkal, ${recipe.nutrition.proteinG}q zülal)${seasoningList ? `, zövqə görə ${seasoningList} əlavə edin` : ''} və süfrəyə verin.`,
      }),
      durationLabel: '1 min',
      temperatureHint: null,
      stepIngredients: seasoningIngs.map(formatIngSummary),
    });
  }

  // Ensure any remaining unreferenced ingredients are included in the final step
  const remainingIngs = [...nonSeasoningIngs, ...seasoningIngs].filter(
    (i) => !usedIngIds.has(i.id)
  );
  if (remainingIngs.length > 0 && enrichedSteps.length > 0) {
    const lastStep = enrichedSteps[enrichedSteps.length - 1];
    const existingIds = new Set(lastStep.stepIngredients.map((s) => s.id));
    for (const rem of remainingIngs) {
      if (!existingIds.has(rem.id)) {
        lastStep.stepIngredients.push(formatIngSummary(rem));
      }
    }
  }

  return enrichedSteps;
}
