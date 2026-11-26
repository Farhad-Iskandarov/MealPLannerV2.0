import React, { useMemo, useState } from 'react';
import {
  X,
  Check,
  Sparkles,
  Store,
  ShieldCheck,
  Search,
  Users,
  Wallet,
  Calendar,
  Flame,
  Utensils,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ShoppingBag,
  Clock,
  Plus,
} from 'lucide-react';
import {
  Language,
  RegionCode,
  CurrencyCode,
  SupermarketSlug,
  CuisinePreference,
  DietaryOption,
  FoodVibeOption,
  KitchenEquipmentOption,
  UserPreferences,
  Recipe,
} from '../../shared/types';
import {
  CUISINE_OPTIONS,
  getCuisineLabel,
  normalizeCuisinePreference,
} from '../../shared/cuisineConfig';
import { AppStatePayload } from '../api/clientApi';
import { formatPln, translations } from '../../shared/i18n';
import {
  REGIONS,
  pickLocalizedText,
  getDefaultCurrencyForRegion,
  resolveValidSupermarketForRegion,
  toLocaleUpper,
  formatMinutes,
} from '../../shared/regionConfig';
import { getCatalogueProductsForRegion } from '../../server/supermarkets/catalogueData';
import { validateRecipeForUser } from '../../server/validation/mealValidator';
import { SupermarketLogo } from './BrandAssets';

interface AiPlanWizardModalProps {
  state: AppStatePayload;
  lang: Language;
  onClose: () => void;
  onGenerateWizardPlan: (preferencesPatch: Partial<UserPreferences>, variationSeed?: number) => Promise<AppStatePayload>;
  onApplyBudgetSuggestion: (suggestion: any) => Promise<void>;
  onOpenRecipeDetail: (recipe: Recipe) => void;
  onNavigateTab: (tab: 'home' | 'mealplan' | 'recipes' | 'shopping' | 'profile') => void;
}

const DIETARY_OPTIONS: Array<{
  key: DietaryOption;
  icon: string;
  label: { en: string; pl: string; az: string };
}> = [
  { key: 'vegan', icon: '🌱', label: { en: 'Vegan', pl: 'Wegańska', az: 'Veqan' } },
  { key: 'vegetarian', icon: '🥗', label: { en: 'Vegetarian', pl: 'Wegetariańska', az: 'Vegetarian' } },
  { key: 'gluten_free', icon: '🌾', label: { en: 'Gluten-free', pl: 'Bezglutenowa', az: 'Qlutensiz' } },
  { key: 'lactose_free', icon: '🥛', label: { en: 'Lactose-free', pl: 'Bez laktozy', az: 'Laktozasız' } },
  { key: 'high_protein', icon: '💪', label: { en: 'High-protein', pl: 'Wysokobiałkowa', az: 'Yüksək zülallı' } },
  { key: 'keto', icon: '🥑', label: { en: 'Keto', pl: 'Keto', az: 'Keto' } },
  { key: 'low_carb', icon: '🥦', label: { en: 'Low-carb', pl: 'Niskowęglowodanowa', az: 'Az karbohidratlı' } },
  { key: 'pescatarian', icon: '🐟', label: { en: 'Pescatarian', pl: 'Peskowegetariańska', az: 'Peskovegetarian' } },
];

const COMMON_ALLERGENS: Array<{
  key: string;
  label: { en: string; pl: string; az: string };
}> = [
  { key: 'milk', label: { en: 'Dairy / Milk', pl: 'Nabiał / Mleko', az: 'Süd məhsulları' } },
  { key: 'eggs', label: { en: 'Eggs', pl: 'Jajka', az: 'Yumurta' } },
  { key: 'gluten', label: { en: 'Gluten / Wheat', pl: 'Gluten / Pszenica', az: 'Qluten / Buğda' } },
  { key: 'fish', label: { en: 'Fish & Seafood', pl: 'Ryby i owoce morza', az: 'Balıq və dəniz məhsulları' } },
  { key: 'nuts', label: { en: 'Nuts & Peanuts', pl: 'Orzechy', az: 'Qoz-fındıq' } },
  { key: 'soy', label: { en: 'Soy', pl: 'Soja', az: 'Soya' } },
];

const FOOD_VIBE_OPTIONS: Array<{
  key: FoodVibeOption;
  icon: string;
  label: { en: string; pl: string; az: string };
  desc: { en: string; pl: string; az: string };
}> = [
  {
    key: 'quick_easy',
    icon: '⚡',
    label: { en: 'Quick & Easy', pl: 'Szybko i prosto', az: 'Sürətli və Asan' },
    desc: { en: 'Under 20 mins prep', pl: 'Do 20 min przygotowania', az: '20 dəqiqədən az hazırlıq' },
  },
  {
    key: 'high_protein',
    icon: '💪',
    label: { en: 'High Protein', pl: 'Dużo białka', az: 'Yüksək Zülal' },
    desc: { en: '25g+ protein per meal', pl: 'Ponad 25g białka w porcji', az: 'Hər yeməkdə 25q+ zülal' },
  },
  {
    key: 'low_calorie',
    icon: '🥗',
    label: { en: 'Low Calories', pl: 'Niskokaloryczne', az: 'Az Kalorili' },
    desc: { en: 'Light & lean portions', pl: 'Lekkie i fit posiłki', az: 'Yüngül və pəhriz porsiyaları' },
  },
  {
    key: 'fakeaway',
    icon: '🍔',
    label: { en: 'Fakeaway', pl: 'Domowy Fast-Food (Fakeaway)', az: 'Evsayağı Fast-Food' },
    desc: { en: 'Homemade takeaway favourites', pl: 'Ulubione dania na wynos w wersji fit', az: 'Sevimli restoran yeməkləri evdə' },
  },
  {
    key: 'budget_friendly',
    icon: '🪙',
    label: { en: 'Budget Friendly', pl: 'Maksymalna oszczędność', az: 'Qənaətcil Seçim' },
    desc: { en: 'Lowest cost per portion', pl: 'Najniższy koszt za porcję', az: 'Hər porsiya üçün ən sərfəli qiymət' },
  },
  {
    key: 'healthy_balanced',
    icon: '🥑',
    label: { en: 'Healthy & Balanced', pl: 'Zdrowe i zbilansowane', az: 'Sağlam və Balanslı' },
    desc: { en: 'Whole foods & fiber', pl: 'Bogate w błonnik i witaminy', az: 'Lif və vitaminlərlə zəngin' },
  },
  {
    key: 'comfort_food',
    icon: '🍲',
    label: { en: 'Comfort Food', pl: 'Domowe Comfort Food', az: 'Doyurucu Ev Yeməkləri' },
    desc: { en: 'Warm, hearty classics', pl: 'Rozgrzewające i sycące dania', az: 'İsti və ləzzətli klassiklər' },
  },
  {
    key: 'traditional',
    icon: '🥟',
    label: { en: 'Traditional Cuisine', pl: 'Kuchnia tradycyjna', az: 'Ənənəvi Milli Mətbəx' },
    desc: { en: 'Local Polish & Azerbaijani dishes', pl: 'Tradycyjne smaki regionalne', az: 'Yerli Polşa və Azərbaycan dadları' },
  },
  {
    key: 'meal_prep',
    icon: '🍱',
    label: { en: 'Meal Prep', pl: 'Meal Prep (Do pudełka)', az: 'Öncədən Hazırlıq (Meal Prep)' },
    desc: { en: 'Batch-cook friendly', pl: 'Idealne do gotowania na zapas', az: 'Qabaqcadan bişirmək üçün ideal' },
  },
  {
    key: 'family_friendly',
    icon: '👨‍👩‍👧‍👦',
    label: { en: 'Family Friendly', pl: 'Dla całej rodziny', az: 'Ailəvi Yeməklər' },
    desc: { en: 'Loved by kids & adults', pl: 'Lubiane przez dzieci i dorosłych', az: 'Böyüklər və uşaqlar üçün uyğun' },
  },
  {
    key: 'mediterranean',
    icon: '🫒',
    label: { en: 'Mediterranean', pl: 'Śródziemnomorskie', az: 'Aralıq Dənizi Mətbəxi' },
    desc: { en: 'Olive oil, fish, fresh veggies', pl: 'Oliwa, ryby i świeże warzywa', az: 'Zeytun yağı, balıq və təzə tərəvəz' },
  },
];

const KITCHEN_EQUIPMENT_OPTIONS: Array<{
  key: KitchenEquipmentOption;
  icon: string;
  label: { en: string; pl: string; az: string };
}> = [
  { key: 'hob', icon: '🍳', label: { en: 'Hob / Stovetop', pl: 'Kuchenka / Palnik (Garnek, Patelnia)', az: 'Qaz plitəsi / Ocaq (Qazan, Tava)' } },
  { key: 'oven', icon: '🔥', label: { en: 'Oven', pl: 'Piekarnik', az: 'Soba (Duxovka)' } },
  { key: 'air_fryer', icon: '🍟', label: { en: 'Air fryer', pl: 'Air fryer (Frytkownica beztłuszczowa)', az: 'Air fryer (Aerofritür)' } },
  { key: 'microwave', icon: '📟', label: { en: 'Microwave', pl: 'Mikrofalówka', az: 'Mikrodalğalı soba' } },
  { key: 'kettle', icon: '🫖', label: { en: 'Kettle', pl: 'Czajnik', az: 'Çaydan' } },
  { key: 'toaster', icon: '🍞', label: { en: 'Toaster', pl: 'Toster / Opiekacz', az: 'Toster' } },
  { key: 'blender', icon: '🥤', label: { en: 'Blender', pl: 'Blender', az: 'Blender' } },
  { key: 'food_processor', icon: '⚙️', label: { en: 'Food processor', pl: 'Robot kuchenny / Malakser', az: 'Mətbəx kombaynı' } },
  { key: 'rice_cooker', icon: '🍚', label: { en: 'Rice cooker', pl: 'Ryżowar', az: 'Düyü bişirən' } },
  { key: 'slow_cooker', icon: '🍲', label: { en: 'Slow cooker', pl: 'Wolnowar', az: 'Yavaş bişirici (Multivarka)' } },
  { key: 'grill', icon: '🥩', label: { en: 'Grill', pl: 'Grill / Patelnia grillowa', az: 'Qril / Manqal tavası' } },
  { key: 'other', icon: '🔧', label: { en: 'Other', pl: 'Inne wyposażenie', az: 'Digər avadanlıq' } },
];

function mapExistingEquipmentToKeys(raw: string[]): KitchenEquipmentOption[] {
  const joined = (raw || []).join(' ').toLowerCase();
  const out = new Set<KitchenEquipmentOption>();
  for (const item of raw || []) {
    const k = item.trim().toLowerCase() as KitchenEquipmentOption;
    if (KITCHEN_EQUIPMENT_OPTIONS.some((o) => o.key === k)) {
      out.add(k);
    }
  }
  if (joined.includes('patelnia') || joined.includes('garnek') || joined.includes('tava') || joined.includes('qazan')) {
    out.add('hob');
  }
  if (joined.includes('piekarnik') || joined.includes('soba') || joined.includes('oven')) {
    out.add('oven');
  }
  if (out.size === 0) {
    out.add('hob');
    out.add('oven');
    out.add('kettle');
  }
  return Array.from(out);
}

export const AiPlanWizardModal: React.FC<AiPlanWizardModalProps> = ({
  state,
  lang,
  onClose,
  onGenerateWizardPlan,
  onApplyBudgetSuggestion,
  onOpenRecipeDetail,
  onNavigateTab,
}) => {
  const t = translations[lang];
  const prefs = state.user.preferences;

  // Step 1..6 + Step 7 (Summary & Generate) + Step 8 (Generated Result View)
  const [step, setStep] = useState<number>(1);
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedState, setGeneratedState] = useState<AppStatePayload | null>(null);

  // Step 1 state: Read-only Settings Region & Currency + Filtered Supermarket
  const wizRegion: RegionCode = state.user.regionCode || prefs.regionCode || 'PL';
  const wizCurrency: CurrencyCode =
    state.user.currencyCode || prefs.currencyCode || getDefaultCurrencyForRegion(wizRegion);
  const [wizStore, setWizStore] = useState<SupermarketSlug>(
    resolveValidSupermarketForRegion(prefs.preferredSupermarket, wizRegion)
  );

  // Step 2 state: Dietary Preferences & Excluded Ingredients
  const [wizDiets, setWizDiets] = useState<DietaryOption[]>(
    (prefs.dietaryRestrictions || []).filter((d) => d !== 'none')
  );
  const [wizAllergies, setWizAllergies] = useState<string[]>(prefs.allergies || []);
  const [wizExcluded, setWizExcluded] = useState<string[]>(prefs.excludedIngredients || []);
  const [ingSearch, setIngSearch] = useState<string>('');
  const [customExclusionInput, setCustomExclusionInput] = useState<string>('');

  // Step 3 state: Number of People (1-12)
  const [wizPeople, setWizPeople] = useState<number>(
    Math.max(1, Math.min(12, prefs.householdSize || 2))
  );

  // Step 4 state: Budget & Duration (1-7 days)
  const [wizBudget, setWizBudget] = useState<string>(String(prefs.weeklyBudgetPln || (wizRegion === 'AZ' ? 120 : 250)));
  const [wizDurationDays, setWizDurationDays] = useState<number>(
    Math.max(1, Math.min(7, prefs.planDurationDays || 7))
  );

  // Step 5 state: Single Cuisine choice + Food Vibe
  const [wizCuisine, setWizCuisine] = useState<CuisinePreference>(() =>
    normalizeCuisinePreference(prefs.preferredCuisine)
  );
  const [wizVibes, setWizVibes] = useState<FoodVibeOption[]>(
    prefs.foodVibes && prefs.foodVibes.length > 0
      ? prefs.foodVibes
      : ['quick_easy', 'high_protein', 'budget_friendly']
  );
  const [wizCustomVibes, setWizCustomVibes] = useState<string[]>(prefs.customFoodVibes || []);
  const [customVibeInput, setCustomVibeInput] = useState<string>('');

  // Step 6 state: Kitchen Equipment
  const [wizEquipment, setWizEquipment] = useState<KitchenEquipmentOption[]>(() =>
    mapExistingEquipmentToKeys(prefs.kitchenEquipment || [])
  );
  const [customEquipInput, setCustomEquipInput] = useState<string>('');
  const [wizCustomEquip, setWizCustomEquip] = useState<string[]>([]);

  // Regional supermarkets for Step 1
  const regionalSupermarkets = useMemo(() => {
    const slugs = REGIONS[wizRegion].supermarketSlugs;
    return slugs.map((slug) => {
      const found = state.supermarkets.find((s) => s.id === slug);
      const isCatalogueActive = REGIONS[wizRegion].activeCatalogueSlugs.includes(slug);
      return {
        slug,
        name:
          found?.name ||
          (slug === 'zabka'
            ? 'Żabka'
            : slug === 'oba'
            ? 'OBA Market'
            : slug.charAt(0).toUpperCase() + slug.slice(1)),
        loyalty: found?.loyaltyProgramName || null,
        isCatalogueActive,
      };
    });
  }, [wizRegion, state.supermarkets]);

  // Searchable ingredient list for Step 2
  const searchableIngredients = useMemo(() => {
    const catalogueProds = getCatalogueProductsForRegion(wizRegion);
    const map = new Map<
      string,
      { canonical: string; nameEn: string; namePl: string; nameAz: string; icon: string }
    >();
    for (const p of catalogueProds) {
      map.set(p.canonicalIngredient, {
        canonical: p.canonicalIngredient,
        nameEn: p.nameEn,
        namePl: p.namePl,
        nameAz: p.nameAz || p.nameEn,
        icon: p.icon,
      });
    }
    for (const r of state.recipes) {
      for (const ing of r.ingredients) {
        if (ing.unit === 'to_taste') continue;
        if (!map.has(ing.canonicalIngredient)) {
          map.set(ing.canonicalIngredient, {
            canonical: ing.canonicalIngredient,
            nameEn: ing.nameEn,
            namePl: ing.namePl,
            nameAz: ing.nameAz || ing.nameEn,
            icon: ing.icon,
          });
        }
      }
    }
    const all = Array.from(map.values());
    if (!ingSearch.trim()) return all;
    const q = ingSearch.trim().toLowerCase();
    return all.filter(
      (item) =>
        item.canonical.toLowerCase().includes(q) ||
        item.nameEn.toLowerCase().includes(q) ||
        item.namePl.toLowerCase().includes(q) ||
        item.nameAz.toLowerCase().includes(q)
    );
  }, [wizRegion, state.recipes, ingSearch]);

  // Compatible recipe count preview for Step 2, Step 5 & Step 6
  const compatibleRecipesCount = useMemo(() => {
    const candidatePrefs: UserPreferences = {
      ...prefs,
      regionCode: wizRegion,
      currencyCode: wizCurrency,
      preferredSupermarket: wizStore,
      preferredCuisine: wizCuisine,
      dietaryRestrictions: wizDiets,
      allergies: wizAllergies,
      excludedIngredients: wizExcluded,
      kitchenEquipment: [...wizEquipment, ...wizCustomEquip],
    };
    return state.recipes.filter(
      (r) =>
        validateRecipeForUser(r, candidatePrefs, {
          enforcePrepTime: false,
          enforceEquipment: true,
          enforceCuisine: true,
        }).valid
    ).length;
  }, [prefs, wizRegion, wizCurrency, wizStore, wizCuisine, wizDiets, wizAllergies, wizExcluded, wizEquipment, wizCustomEquip, state.recipes]);

  const toggleDietOption = (d: DietaryOption) => {
    if (wizDiets.includes(d)) {
      setWizDiets(wizDiets.filter((x) => x !== d));
    } else {
      setWizDiets([...wizDiets, d]);
    }
  };

  const toggleAllergyOption = (a: string) => {
    if (wizAllergies.includes(a)) {
      setWizAllergies(wizAllergies.filter((x) => x !== a));
    } else {
      setWizAllergies([...wizAllergies, a]);
    }
  };

  const toggleExcludedIngredient = (canonical: string) => {
    if (wizExcluded.includes(canonical)) {
      setWizExcluded(wizExcluded.filter((x) => x !== canonical));
    } else {
      setWizExcluded([...wizExcluded, canonical]);
    }
  };

  const addCustomExclusion = () => {
    const val = customExclusionInput.trim();
    if (!val) return;
    if (!wizExcluded.includes(val)) {
      setWizExcluded([...wizExcluded, val]);
    }
    setCustomExclusionInput('');
  };

  const toggleVibe = (v: FoodVibeOption) => {
    if (wizVibes.includes(v)) {
      setWizVibes(wizVibes.filter((x) => x !== v));
    } else {
      setWizVibes([...wizVibes, v]);
    }
  };

  const addCustomVibe = () => {
    const val = customVibeInput.trim();
    if (!val) return;
    if (!wizCustomVibes.includes(val)) {
      setWizCustomVibes([...wizCustomVibes, val]);
    }
    setCustomVibeInput('');
  };

  const toggleEquipment = (eq: KitchenEquipmentOption) => {
    if (wizEquipment.includes(eq)) {
      if (wizEquipment.length > 1) {
        setWizEquipment(wizEquipment.filter((x) => x !== eq));
      }
    } else {
      setWizEquipment([...wizEquipment, eq]);
    }
  };

  const addCustomEquipment = () => {
    const val = customEquipInput.trim();
    if (!val) return;
    if (!wizCustomEquip.includes(val)) {
      setWizCustomEquip([...wizCustomEquip, val]);
    }
    if (!wizEquipment.includes('other')) {
      setWizEquipment([...wizEquipment, 'other']);
    }
    setCustomEquipInput('');
  };

  const buildWizardPreferencesPatch = (): Partial<UserPreferences> => {
    const numericBudget = Math.max(
      wizCurrency === 'AZN' ? 15 : 20,
      Number(wizBudget) || (wizRegion === 'AZ' ? 120 : 250)
    );
    const preferredPrepTimeMin = wizVibes.includes('quick_easy') ? 25 : 45;
    // Never include regionCode or currencyCode: region & currency are controlled exclusively in Settings
    return {
      preferredSupermarket: wizStore,
      preferredCuisine: wizCuisine,
      dietaryRestrictions: wizDiets,
      allergies: wizAllergies,
      excludedIngredients: wizExcluded,
      householdSize: wizPeople,
      weeklyBudgetPln: numericBudget,
      planDurationDays: wizDurationDays,
      foodVibes: wizVibes,
      customFoodVibes: wizCustomVibes,
      kitchenEquipment: [...wizEquipment, ...wizCustomEquip],
      preferredPrepTimeMin,
    };
  };

  const handleGenerateMealPlan = async (variationSeed?: number) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const patch = buildWizardPreferencesPatch();
      const updated = await onGenerateWizardPlan(patch, variationSeed);
      setGeneratedState(updated);
      setStep(8);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate AI Meal Plan');
    } finally {
      setBusy(false);
    }
  };

  const stepTitles: Record<number, { en: string; pl: string; az: string }> = {
    1: {
      en: 'Step 1 – Choose Your Supermarket',
      pl: 'Krok 1 – Wybierz Swój Supermarket',
      az: 'Addım 1 – Supermarketinizi Seçin',
    },
    2: {
      en: 'Step 2 – Dietary Preferences & Excluded Ingredients',
      pl: 'Krok 2 – Dieta i Wykluczone Składniki',
      az: 'Addım 2 – Pəhriz Seçimləri və İstisna Ərzaqlar',
    },
    3: {
      en: 'Step 3 – Number of People',
      pl: 'Krok 3 – Liczba Osób',
      az: 'Addım 3 – Adam Sayı',
    },
    4: {
      en: 'Step 4 – Budget & Duration',
      pl: 'Krok 4 – Budżet i Czas Trwania Planu',
      az: 'Addım 4 – Büdcə və Müddət',
    },
    5: {
      en: 'Step 5 – Cuisine & Food Vibe',
      pl: 'Krok 5 – Kuchnia i Styl Jedzenia',
      az: 'Addım 5 – Mətbəx və Yemək Tərzi',
    },
    6: {
      en: "Step 6 – What's in Your Kitchen?",
      pl: 'Krok 6 – Co masz w swojej kuchni?',
      az: 'Addım 6 – Mətbəxinizdə Nə Var?',
    },
    7: {
      en: 'Summary – Ready to Generate Your AI Plan',
      pl: 'Podsumowanie – Gotowy do Wygenerowania Planu AI',
      az: 'Xülasə – AI Yemək Planınızı Yaratmağa Hazırdır',
    },
    8: {
      en: 'Your Personalised AI Meal Plan is Ready!',
      pl: 'Twój Spersonalizowany Plan Posiłków AI jest Gotowy!',
      az: 'Fərdi Süni İntellekt Yemək Planınız Hazırdır!',
    },
  };

  const activeResult = generatedState || state;

  return (
    <>
      <div className="mp-modal-header" style={{ borderBottom: '1px solid #E5ECE7', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #1E7A3B 0%, #145328 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#196431', letterSpacing: 0.35 }}>
              {toLocaleUpper(
                step <= 6
                  ? pickLocalizedText(lang, {
                      en: `AI Meal Planner Wizard • Step ${step} of 6`,
                      pl: `Kreator Planu AI • Krok ${step} z 6`,
                      az: `AI Yemək Planı Bələdçisi • Addım ${step} / 6`,
                    })
                  : step === 7
                  ? pickLocalizedText(lang, {
                      en: 'AI Meal Planner Wizard • Final Review',
                      pl: 'Kreator Planu AI • Podsumowanie',
                      az: 'AI Yemək Planı Bələdçisi • Yekun Xülasə',
                    })
                  : pickLocalizedText(lang, {
                      en: 'AI Meal Plan & Smart Basket Generated',
                      pl: 'Plan Posiłków AI i Koszyk Wygenerowane',
                      az: 'AI Yemək Planı və Alış-Veriş Səbəti Yaradıldı',
                    }),
                lang
              )}
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#132A19', marginTop: 2, lineHeight: 1.3 }}>
              {pickLocalizedText(lang, stepTitles[step])}
            </h3>
          </div>
        </div>
        <button className="mp-icon-btn" onClick={onClose} data-testid="btn-close-wizard">
          <X size={18} />
        </button>
      </div>

      {/* Interactive 6-Step Progress Bar */}
      {step <= 7 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 16px',
            background: '#F6FAF7',
            borderBottom: '1px solid #E5ECE7',
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((idx) => {
            const isActive = step === idx;
            const isCompleted = step > idx;
            return (
              <button
                key={idx}
                onClick={() => setStep(idx)}
                data-testid={`wizard-step-pill-${idx}`}
                style={{
                  flex: 1,
                  height: 26,
                  borderRadius: 999,
                  border: isActive ? '1.5px solid #196431' : '1px solid #D5E2D8',
                  background: isCompleted ? '#196431' : isActive ? '#E7F5EC' : '#FFFFFF',
                  color: isCompleted ? '#FFFFFF' : isActive ? '#196431' : '#647067',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  transition: 'all 0.15s ease',
                }}
              >
                {isCompleted ? <Check size={12} /> : idx}
              </button>
            );
          })}
          <button
            onClick={() => setStep(7)}
            data-testid="wizard-step-pill-summary"
            style={{
              padding: '0 10px',
              height: 26,
              borderRadius: 999,
              border: step === 7 ? '1.5px solid #196431' : '1px solid #D5E2D8',
              background: step === 7 ? '#196431' : '#FFFFFF',
              color: step === 7 ? '#FFFFFF' : '#4B5563',
              fontSize: 10.5,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {pickLocalizedText(lang, { en: 'Summary', pl: 'Finał', az: 'Xülasə' })}
          </button>
        </div>
      )}

      <div className="mp-modal-body" style={{ paddingTop: 12 }}>
        {errorMsg && (
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#B91C1C',
              padding: 10,
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ==================== STEP 1: CHOOSE YOUR SUPERMARKET ==================== */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 10 }}>
              {pickLocalizedText(lang, {
                en: 'Select your preferred supermarket. MealPlanner will match recipe ingredients with realistic store packages and prices.',
                pl: 'Wybierz preferowany supermarket. MealPlanner dopasuje składniki do rzeczywistych opakowań i cen w wybranej sieci.',
                az: 'Üstünlük verdiyiniz supermarketi seçin. MealPlanner resept ərzaqlarını real market qablaşdırmaları və qiymətləri ilə uyğunlaşdıracaq.',
              })}
            </div>

            {/* Read-only Settings Region Notice (region/currency are changed only in Settings) */}
            <div
              data-testid="wizard-region-readonly-note"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 12px',
                borderRadius: 11,
                border: '1px solid #CBE4D2',
                background: '#F2F9F4',
                color: '#164A26',
                fontSize: 11.5,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              <span style={{ fontSize: 16 }}>{REGIONS[wizRegion].flag}</span>
              <span>
                {pickLocalizedText(lang, {
                  en: `Your region is ${REGIONS[wizRegion].countryNameEn}. To change it, go to Settings.`,
                  pl: `Twój region to ${REGIONS[wizRegion].countryNamePl}. Aby go zmienić, przejdź do Ustawień.`,
                  az: `Bölgəniz ${REGIONS[wizRegion].countryNameAz}. Dəyişmək üçün Ayarlara keçin.`,
                })}
              </span>
            </div>

            {/* Supermarkets Grid */}
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1B241E', marginBottom: 8 }}>
              {wizRegion === 'AZ'
                ? pickLocalizedText(lang, {
                    en: 'Supermarkets in Azerbaijan (AZN — ₼):',
                    pl: 'Supermarkety w Azerbejdżanie (AZN — ₼):',
                    az: 'Azərbaycan Supermarketləri (AZN — ₼):',
                  })
                : pickLocalizedText(lang, {
                    en: 'Supermarkets in Poland (PLN — zł):',
                    pl: 'Supermarkety w Polsce (PLN — zł):',
                    az: 'Polşa Supermarketləri (PLN — zł):',
                  })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {regionalSupermarkets.map((st) => {
                const isSelected = wizStore === st.slug;
                return (
                  <div
                    key={st.slug}
                    data-testid={`wizard-store-${st.slug}`}
                    onClick={() => setWizStore(st.slug)}
                    style={{
                      padding: '12px',
                      borderRadius: 14,
                      border: isSelected ? '2px solid #196431' : '1px solid #D5E2D8',
                      background: isSelected ? '#ECF8F0' : '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      position: 'relative',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SupermarketLogo store={st.slug} size={32} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#132A19' }}>{st.name}</div>
                          {st.loyalty && (
                            <div style={{ fontSize: 10, color: '#4B5563' }}>{st.loyalty}</div>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            background: '#196431',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Check size={12} />
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 999,
                        alignSelf: 'flex-start',
                        background: st.isCatalogueActive ? '#DCFCE7' : '#FEF3C7',
                        color: st.isCatalogueActive ? '#166534' : '#92400E',
                      }}
                    >
                      {st.isCatalogueActive
                        ? pickLocalizedText(lang, {
                            en: '✓ Full Regional Catalogue',
                            pl: '✓ Pełny katalog cen',
                            az: '✓ Tam qiymət kataloqu',
                          })
                        : pickLocalizedText(lang, {
                            en: 'Regional Reference Estimate',
                            pl: 'Szacunek regionalny',
                            az: 'Regional təxmini qiymət',
                          })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== STEP 2: DIETARY PREFERENCES & EXCLUDED INGREDIENTS ==================== */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1B241E', marginBottom: 6 }}>
              {pickLocalizedText(lang, {
                en: 'Dietary Preferences (Select any that apply):',
                pl: 'Preferencje żywieniowe (Wybierz dowolne):',
                az: 'Pəhriz Seçimləri (Uyğun olanları seçin):',
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 14 }}>
              {DIETARY_OPTIONS.map((d) => {
                const active = wizDiets.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    data-testid={`wizard-diet-${d.key}`}
                    onClick={() => toggleDietOption(d.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: active ? '2px solid #196431' : '1px solid #D5E2D8',
                      background: active ? '#ECF8F0' : '#FFFFFF',
                      color: active ? '#145328' : '#1F2937',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <span>
                      {d.icon} {pickLocalizedText(lang, d.label)}
                    </span>
                    {active && <Check size={14} color="#196431" />}
                  </button>
                );
              })}
            </div>

            {/* Allergies Quick Selection */}
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1B241E', marginBottom: 6 }}>
              {pickLocalizedText(lang, {
                en: 'Strict Allergies (Never included in any generated recipe):',
                pl: 'Alergie pokarmowe (Całkowita blokada w przepisach):',
                az: 'Qida Allergiyaları (Heç bir reseptə daxil edilmir):',
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {COMMON_ALLERGENS.map((al) => {
                const isAl = wizAllergies.includes(al.key);
                return (
                  <button
                    key={al.key}
                    type="button"
                    data-testid={`wizard-allergy-${al.key}`}
                    onClick={() => toggleAllergyOption(al.key)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      border: isAl ? '1.5px solid #DC2626' : '1px solid #D5E2D8',
                      background: isAl ? '#FEF2F2' : '#FFFFFF',
                      color: isAl ? '#B91C1C' : '#374151',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isAl ? '🚫 ' : ''}
                    {pickLocalizedText(lang, al.label)}
                  </button>
                );
              })}
            </div>

            {/* Searchable Ingredient Exclusion List */}
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#1B241E', marginBottom: 6 }}>
              {pickLocalizedText(lang, {
                en: 'Exclude Specific Ingredients (Search or add custom):',
                pl: 'Wyklucz konkretne składniki (Wyszukaj lub dodaj własne):',
                az: 'İstisna Edilən Ərzaqlar (Axtarın və ya əlavə edin):',
              })}
            </div>

            {/* Active Exclusions Pills */}
            {wizExcluded.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {wizExcluded.map((ex) => (
                  <span
                    key={ex}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      background: '#FEE2E2',
                      color: '#991B1B',
                      padding: '4px 9px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    🚫 {ex}
                    <button
                      type="button"
                      onClick={() => toggleExcludedIngredient(ex)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#991B1B',
                        cursor: 'pointer',
                        fontWeight: 900,
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Searchable Ingredient Catalogue Box */}
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search
                size={14}
                color="#647067"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                className="mp-input"
                data-testid="wizard-ingredient-search"
                style={{ paddingLeft: 30, fontSize: 12 }}
                placeholder={pickLocalizedText(lang, {
                  en: 'Search ingredients to exclude (e.g., salmon, pork,broccoli, milk)...',
                  pl: 'Szukaj składników do wykluczenia (np. łosoś, schab, brokuł)...',
                  az: 'İstisna ediləcək ərzağı axtarın (məs. qızılbalıq, brokkoli, süd)...',
                })}
                value={ingSearch}
                onChange={(e) => setIngSearch(e.target.value)}
              />
            </div>

            <div
              style={{
                maxHeight: 135,
                overflowY: 'auto',
                border: '1px solid #E2ECE4',
                borderRadius: 10,
                padding: 8,
                background: '#FAFDFB',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 10,
              }}
            >
              {searchableIngredients.map((ing) => {
                const isEx = wizExcluded.includes(ing.canonical);
                const label = pickLocalizedText(lang, {
                  en: ing.nameEn,
                  pl: ing.namePl,
                  az: ing.nameAz,
                });
                return (
                  <button
                    key={ing.canonical}
                    type="button"
                    data-testid={`wizard-exclude-ing-${ing.canonical}`}
                    onClick={() => toggleExcludedIngredient(ing.canonical)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      border: isEx ? '1.5px solid #DC2626' : '1px solid #D5E2D8',
                      background: isEx ? '#FEE2E2' : '#FFFFFF',
                      color: isEx ? '#991B1B' : '#1F2937',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {isEx ? '🚫 ' : `${ing.icon} `}
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Custom Exclusion Input */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="mp-input"
                data-testid="wizard-custom-exclusion-input"
                style={{ fontSize: 12 }}
                placeholder={pickLocalizedText(lang, {
                  en: 'Add custom ingredient or food to exclude...',
                  pl: 'Dodaj własny składnik do wykluczenia...',
                  az: 'Fərdi istisna ərzaq əlavə edin...',
                })}
                value={customExclusionInput}
                onChange={(e) => setCustomExclusionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomExclusion();
                  }
                }}
              />
              <button
                type="button"
                data-testid="wizard-add-custom-exclusion"
                onClick={addCustomExclusion}
                style={{
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #196431',
                  background: '#196431',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                <Plus size={14} />
                {pickLocalizedText(lang, { en: 'Exclude', pl: 'Wyklucz', az: 'Əlavə et' })}
              </button>
            </div>
          </div>
        )}

        {/* ==================== STEP 3: NUMBER OF PEOPLE (1-12) ==================== */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 12 }}>
              {pickLocalizedText(lang, {
                en: 'How many people are the meals for? Every recipe and shopping list quantity is automatically scaled to match your exact household servings.',
                pl: 'Dla ilu osób planujemy posiłki? Ilości składników w przepisach i na liście zakupów zostaną automatycznie przeliczone.',
                az: 'Yeməklər neçə nəfər üçündür? Bütün resept porsiyaları və alış-veriş siyahısı miqdarları avtomatik olaraq seçilmiş adam sayına görə hesablanır.',
              })}
            </div>

            {/* Large Counter Card */}
            <div
              style={{
                background: '#F2F9F4',
                border: '1.5px solid #CBE4D2',
                borderRadius: 16,
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <button
                type="button"
                data-testid="wizard-people-decrement"
                onClick={() => setWizPeople((p) => Math.max(1, p - 1))}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: '1px solid #196431',
                  background: '#FFFFFF',
                  color: '#196431',
                  fontSize: 20,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                −
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Users size={22} color="#196431" />
                  <span
                    data-testid="wizard-people-display"
                    style={{ fontSize: 28, fontWeight: 900, color: '#132A19' }}
                  >
                    {wizPeople}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#196431' }}>
                  {wizPeople === 1
                    ? pickLocalizedText(lang, { en: '1 Person (Solo)', pl: '1 Osoba (Solo)', az: '1 Nəfər (Tək)' })
                    : pickLocalizedText(lang, {
                        en: `${wizPeople} People (${wizPeople} servings per meal)`,
                        pl: `${wizPeople} Osób (${wizPeople} porcje na posiłek)`,
                        az: `${wizPeople} Nəfər (hər yeməkdə ${wizPeople} porsiya)`,
                      })}
                </div>
              </div>
              <button
                type="button"
                data-testid="wizard-people-increment"
                onClick={() => setWizPeople((p) => Math.min(12, p + 1))}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: '1px solid #196431',
                  background: '#196431',
                  color: '#FFFFFF',
                  fontSize: 20,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>

            {/* 1 to 12 Quick Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
                const selected = wizPeople === num;
                return (
                  <button
                    key={num}
                    type="button"
                    data-testid={`wizard-people-${num}`}
                    onClick={() => setWizPeople(num)}
                    style={{
                      padding: '10px 0',
                      borderRadius: 10,
                      border: selected ? '2px solid #196431' : '1px solid #D5E2D8',
                      background: selected ? '#196431' : '#FFFFFF',
                      color: selected ? '#FFFFFF' : '#1F2937',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== STEP 4: BUDGET & DURATION (1-7 DAYS) ==================== */}
        {step === 4 && (
          <div>
            {/* Duration 1-7 Days */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Calendar size={16} color="#196431" />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1B241E' }}>
                {pickLocalizedText(lang, {
                  en: 'Plan Duration (1–7 Days):',
                  pl: 'Czas trwania planu (1–7 dni):',
                  az: 'Plan Müddəti (1–7 Gün):',
                })}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 10 }}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const active = wizDurationDays === d;
                return (
                  <button
                    key={d}
                    type="button"
                    data-testid={`wizard-duration-${d}`}
                    onClick={() => setWizDurationDays(d)}
                    style={{
                      padding: '10px 4px',
                      borderRadius: 10,
                      border: active ? '2px solid #196431' : '1px solid #D5E2D8',
                      background: active ? '#196431' : '#FFFFFF',
                      color: active ? '#FFFFFF' : '#1F2937',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 900 }}>{d}</div>
                    <div style={{ fontSize: 9.5, opacity: 0.9 }}>
                      {d === 1
                        ? pickLocalizedText(lang, { en: 'day', pl: 'dzień', az: 'gün' })
                        : pickLocalizedText(lang, { en: 'days', pl: 'dni', az: 'gün' })}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                fontSize: 11,
                color: '#166534',
                background: '#ECF8F0',
                padding: '7px 10px',
                borderRadius: 8,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              {pickLocalizedText(lang, {
                en: `✓ Will generate ${wizDurationDays * 3} meals (${wizDurationDays} breakfasts, ${wizDurationDays} lunches, ${wizDurationDays} dinners) for ${wizPeople} ${wizPeople === 1 ? 'person' : 'people'}.`,
                pl: `✓ Wygeneruje ${wizDurationDays * 3} posiłków (${wizDurationDays} śniadań, ${wizDurationDays} obiadów, ${wizDurationDays} kolacji) dla ${wizPeople} os.`,
                az: `✓ ${wizPeople} nəfər üçün ${wizDurationDays * 3} yemək (${wizDurationDays} səhər, ${wizDurationDays} nahar, ${wizDurationDays} şam yeməyi) yaradılacaq.`,
              })}
            </div>

            {/* Shopping Budget Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Wallet size={16} color="#196431" />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1B241E' }}>
                {wizCurrency === 'AZN'
                  ? pickLocalizedText(lang, {
                      en: 'Total Shopping Budget (AZN — ₼):',
                      pl: 'Całkowity budżet na zakupy (AZN — ₼):',
                      az: 'Ümumi Alış-Veriş Büdcəsi (AZN — ₼):',
                    })
                  : pickLocalizedText(lang, {
                      en: 'Total Shopping Budget (PLN — zł):',
                      pl: 'Całkowity budżet na zakupy (PLN — zł):',
                      az: 'Ümumi Alış-Veriş Büdcəsi (PLN — zł):',
                    })}
              </span>
            </div>

            <input
              className="mp-input"
              type="number"
              data-testid="wizard-budget-input"
              style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}
              value={wizBudget}
              onChange={(e) => setWizBudget(e.target.value)}
            />

            {/* Quick Budget Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(wizCurrency === 'AZN' ? [60, 90, 120, 160, 220, 300] : [120, 180, 250, 320, 450, 600]).map(
                (preset) => {
                  const isSelected = Number(wizBudget) === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      data-testid={`wizard-budget-preset-${preset}`}
                      onClick={() => setWizBudget(String(preset))}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: isSelected ? '1.5px solid #196431' : '1px solid #D5E2D8',
                        background: isSelected ? '#ECF8F0' : '#FFFFFF',
                        color: isSelected ? '#196431' : '#374151',
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {formatPln(preset, wizCurrency)}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}

        {/* ==================== STEP 5: CUISINE & FOOD VIBE ==================== */}
        {step === 5 && (
          <div>
            {/* Single-Select Cuisine Section (independent of Settings region, store, language, and currency) */}
            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#132A19', marginBottom: 6 }}>
              {pickLocalizedText(lang, {
                en: 'Preferred Cuisine (choose one):',
                pl: 'Preferowana kuchnia (wybierz jedną):',
                az: 'Üstünlük verdiyiniz mətbəx (birini seçin):',
              })}
            </div>
            <div
              role="radiogroup"
              aria-label={pickLocalizedText(lang, {
                en: 'Preferred Cuisine',
                pl: 'Preferowana kuchnia',
                az: 'Üstünlük verdiyiniz mətbəx',
              })}
              data-testid="wizard-cuisine-group"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 12,
              }}
            >
              {CUISINE_OPTIONS.map((c) => {
                const active = wizCuisine === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`wizard-cuisine-${c.key}`}
                    onClick={() => setWizCuisine(c.key)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: active ? '2px solid #196431' : '1px solid #D5E2D8',
                      background: active ? '#ECF8F0' : '#FFFFFF',
                      color: active ? '#132A19' : '#374151',
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span>{c.icon}</span>
                    <span>{c.label[lang]}</span>
                    {active && <Check size={12} color="#196431" />}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#132A19', marginBottom: 6 }}>
              {pickLocalizedText(lang, {
                en: 'Food Vibe (pick one or more):',
                pl: 'Styl kulinarny — Food Vibe (wybierz jeden lub więcej):',
                az: 'Yemək Tərzi — Food Vibe (bir və ya bir neçə seçin):',
              })}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                maxHeight: 280,
                overflowY: 'auto',
                paddingRight: 2,
                marginBottom: 10,
              }}
            >
              {FOOD_VIBE_OPTIONS.map((v) => {
                const active = wizVibes.includes(v.key);
                return (
                  <div
                    key={v.key}
                    data-testid={`wizard-vibe-${v.key}`}
                    onClick={() => toggleVibe(v.key)}
                    style={{
                      padding: '9px 10px',
                      borderRadius: 12,
                      border: active ? '2px solid #196431' : '1px solid #D5E2D8',
                      background: active ? '#ECF8F0' : '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#132A19' }}>
                        {v.icon} {pickLocalizedText(lang, v.label)}
                      </span>
                      {active && <Check size={14} color="#196431" />}
                    </div>
                    <div style={{ fontSize: 10, color: '#647067' }}>{pickLocalizedText(lang, v.desc)}</div>
                  </div>
                );
              })}
            </div>

            {/* Custom Food Vibes */}
            {wizCustomVibes.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {wizCustomVibes.map((cv) => (
                  <span
                    key={cv}
                    style={{
                      background: '#E7F5EC',
                      color: '#196431',
                      padding: '4px 9px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    ✨ {cv}
                    <button
                      type="button"
                      onClick={() => setWizCustomVibes(wizCustomVibes.filter((x) => x !== cv))}
                      style={{ border: 'none', background: 'transparent', color: '#196431', cursor: 'pointer', fontWeight: 900 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="mp-input"
                data-testid="wizard-custom-vibe-input"
                style={{ fontSize: 12 }}
                placeholder={pickLocalizedText(lang, {
                  en: 'Add custom preference (e.g., spicy, soups, pasta)...',
                  pl: 'Dodaj własną preferencję (np. zupy, makarony)...',
                  az: 'Fərdi istək əlavə edin (məs. şorbalar, plov)...',
                })}
                value={customVibeInput}
                onChange={(e) => setCustomVibeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomVibe();
                  }
                }}
              />
              <button
                type="button"
                onClick={addCustomVibe}
                style={{
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #196431',
                  background: '#196431',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* ==================== STEP 6: WHAT'S IN YOUR KITCHEN? ==================== */}
        {step === 6 && (
          <div>
            <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 10 }}>
              {pickLocalizedText(lang, {
                en: "Select your available kitchen appliances. MealPlanner will ONLY recommend recipes that can realistically be prepared with your equipment.",
                pl: 'Zaznacz dostępne sprzęty kuchenne. MealPlanner poleci TYLKO te przepisy, które można przygotować przy użyciu Twojego wyposażenia.',
                az: 'Mətbəxinizdə olan avadanlıqları seçin. MealPlanner YALNIZ mövcud avadanlığınızla hazırlana bilən reseptləri tövsiyə edəcək.',
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              {KITCHEN_EQUIPMENT_OPTIONS.map((eq) => {
                const active = wizEquipment.includes(eq.key);
                return (
                  <button
                    key={eq.key}
                    type="button"
                    data-testid={`wizard-equip-${eq.key}`}
                    onClick={() => toggleEquipment(eq.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 10px',
                      borderRadius: 11,
                      border: active ? '2px solid #196431' : '1px solid #D5E2D8',
                      background: active ? '#ECF8F0' : '#FFFFFF',
                      color: active ? '#132A19' : '#374151',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>
                      {eq.icon} {pickLocalizedText(lang, eq.label)}
                    </span>
                    {active && <Check size={14} color="#196431" />}
                  </button>
                );
              })}
            </div>

            {/* Other / Custom Equipment Input */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input
                className="mp-input"
                data-testid="wizard-custom-equip-input"
                style={{ fontSize: 12 }}
                placeholder={pickLocalizedText(lang, {
                  en: 'Other kitchen tool (e.g., waffle iron, wok)...',
                  pl: 'Inny sprzęt kuchenny (np. wok, gofrownica)...',
                  az: 'Digər mətbəx aləti (məs. vok tava, sac)...',
                })}
                value={customEquipInput}
                onChange={(e) => setCustomEquipInput(e.target.value)}
              />
              <button
                type="button"
                onClick={addCustomEquipment}
                style={{
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #196431',
                  background: '#196431',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>

            {/* Live Equipment & Safety Compatibility Badge */}
            <div
              style={{
                background: '#F2F9F4',
                border: '1px solid #CBE4D2',
                borderRadius: 10,
                padding: '8px 10px',
                fontSize: 11.5,
                color: '#145328',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Utensils size={15} color="#196431" />
              <span>
                {pickLocalizedText(lang, {
                  en: `${compatibleRecipesCount} verified recipes match your kitchen equipment & dietary rules.`,
                  pl: `${compatibleRecipesCount} zweryfikowanych przepisów pasuje do Twojego sprzętu i diety.`,
                  az: `${compatibleRecipesCount} təsdiqlənmiş resept mətbəx avadanlığınıza və pəhrizinizə uyğundur.`,
                })}
              </span>
            </div>
          </div>
        )}

        {/* ==================== STEP 7: SUMMARY & GENERATE MY MEAL PLAN ==================== */}
        {step === 7 && (
          <div>
            <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 10 }}>
              {pickLocalizedText(lang, {
                en: 'Review your selections below. Tap any section to edit, or click Generate My Meal Plan to build your personalised recipes and supermarket basket.',
                pl: 'Sprawdź podsumowanie swoich wyborów. Kliknij dowolny krok, aby edytować, lub wygeneruj spersonalizowany plan posiłków i listę zakupów.',
                az: 'Seçimlərinizi nəzərdən keçirin. Dəyişmək üçün istənilən addıma toxunun və ya Fərdi Yemək Planımı Yarat düyməsini sıxın.',
              })}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 14,
              }}
            >
              {/* 1. Supermarket */}
              <div
                onClick={() => setStep(1)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 11,
                  border: '1px solid #D5E2D8',
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SupermarketLogo store={wizStore} size={24} />
                  <div>
                    <div style={{ fontSize: 10, color: '#647067', fontWeight: 700 }}>
                      {pickLocalizedText(lang, { en: '1. Supermarket & Region', pl: '1. Supermarket i Region', az: '1. Supermarket və Region' })}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, textTransform: 'capitalize' }}>
                      {REGIONS[wizRegion].flag} {wizStore} ({wizCurrency})
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#196431', fontWeight: 800 }}>
                  {pickLocalizedText(lang, { en: 'Edit', pl: 'Zmień', az: 'Dəyiş' })}
                </span>
              </div>

              {/* 2. Diet & Exclusions */}
              <div
                onClick={() => setStep(2)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 11,
                  border: '1px solid #D5E2D8',
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: '#647067', fontWeight: 700 }}>
                    {pickLocalizedText(lang, { en: '2. Diet & Excluded Ingredients', pl: '2. Dieta i wykluczenia', az: '2. Pəhriz və İstisnalar' })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>
                    {wizDiets.length > 0 ? wizDiets.map((d) => t.dietNames[d] || d).join(', ') : t.dietNames.none}
                    {wizAllergies.length + wizExcluded.length > 0 &&
                      ` • 🚫 ${[...wizAllergies, ...wizExcluded].join(', ')}`}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#196431', fontWeight: 800 }}>
                  {pickLocalizedText(lang, { en: 'Edit', pl: 'Zmień', az: 'Dəyiş' })}
                </span>
              </div>

              {/* 3 & 4. People, Budget & Duration */}
              <div
                onClick={() => setStep(4)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 11,
                  border: '1px solid #D5E2D8',
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: '#647067', fontWeight: 700 }}>
                    {pickLocalizedText(lang, {
                      en: '3 & 4. Household, Budget & Duration',
                      pl: '3 i 4. Liczba osób, Budżet i Czas trwania',
                      az: '3 və 4. Adam sayı, Büdcə və Müddət',
                    })}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>
                    👥 {wizPeople} • 📅 {wizDurationDays}{' '}
                    {pickLocalizedText(lang, { en: 'days', pl: 'dni', az: 'gün' })} ({wizDurationDays * 3}{' '}
                    {pickLocalizedText(lang, { en: 'meals', pl: 'posiłków', az: 'yemək' })}) • 💰{' '}
                    {formatPln(Number(wizBudget) || 250, wizCurrency)}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#196431', fontWeight: 800 }}>
                  {pickLocalizedText(lang, { en: 'Edit', pl: 'Zmień', az: 'Dəyiş' })}
                </span>
              </div>

              {/* 5 & 6. Cuisine, Food Vibe & Kitchen Equipment */}
              <div
                onClick={() => setStep(5)}
                data-testid="wizard-summary-cuisine-card"
                style={{
                  padding: '9px 12px',
                  borderRadius: 11,
                  border: '1px solid #D5E2D8',
                  background: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: '#647067', fontWeight: 700 }}>
                    {pickLocalizedText(lang, {
                      en: '5 & 6. Cuisine, Food Vibe & Kitchen Equipment',
                      pl: '5 i 6. Kuchnia, Styl kulinarny i Sprzęt kuchenny',
                      az: '5 və 6. Mətbəx, Yemək Tərzi və Mətbəx Avadanlığı',
                    })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>
                    <span data-testid="wizard-summary-cuisine">
                      🍽️ {getCuisineLabel(wizCuisine, lang)}
                    </span>{' '}
                    • 🔥 {wizVibes.length + wizCustomVibes.length}{' '}
                    {pickLocalizedText(lang, { en: 'vibes', pl: 'stylów', az: 'tərz' })} • 🍳{' '}
                    {wizEquipment.join(', ')}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#196431', fontWeight: 800 }}>
                  {pickLocalizedText(lang, { en: 'Edit', pl: 'Zmień', az: 'Dəyiş' })}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="mp-primary-cta-btn"
              data-testid="btn-wizard-generate-plan"
              disabled={busy}
              onClick={() => handleGenerateMealPlan()}
              style={{
                width: '100%',
                padding: '13px 16px',
                fontSize: 14,
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Sparkles size={18} />
              <span>
                {busy
                  ? t.regeneratingBtn
                  : pickLocalizedText(lang, {
                      en: 'Generate My Meal Plan',
                      pl: 'Wygeneruj Mój Plan Posiłków',
                      az: 'Yemək Planımı Yarat',
                    })}
              </span>
            </button>
          </div>
        )}

        {/* ==================== STEP 8: GENERATED PLAN & SHOPPING BASKET RESULT ==================== */}
        {step === 8 && (
          <div>
            {/* Budget & Shopping Basket Summary Banner */}
            <div
              style={{
                background:
                  activeResult.weeklyPlan.remainingBudgetPln >= 0 ? '#ECF8F0' : '#FEF2F2',
                border: `1.5px solid ${
                  activeResult.weeklyPlan.remainingBudgetPln >= 0 ? '#A7F3D0' : '#FECACA'
                }`,
                borderRadius: 14,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SupermarketLogo store={activeResult.weeklyPlan.supermarketId} size={24} />
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: '#132A19', textTransform: 'capitalize' }}>
                    {activeResult.weeklyPlan.supermarketId} •{' '}
                    {activeResult.weeklyPlan.planDurationDays || wizDurationDays}{' '}
                    {pickLocalizedText(lang, { en: 'Days', pl: 'Dni', az: 'Gün' })} (
                    {activeResult.weeklyPlan.meals.length}{' '}
                    {pickLocalizedText(lang, { en: 'Meals', pl: 'Posiłków', az: 'Yemək' })})
                    {wizCuisine !== 'any' && (
                      <span data-testid="wizard-result-cuisine">
                        {' '}
                        • 🍽️ {getCuisineLabel(wizCuisine, lang)}
                      </span>
                    )}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background:
                      activeResult.weeklyPlan.remainingBudgetPln >= 0 ? '#196431' : '#DC2626',
                    color: '#FFFFFF',
                  }}
                >
                  {activeResult.weeklyPlan.budgetUsagePercent}% {t.budget}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div style={{ background: '#FFFFFF', padding: '7px 8px', borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: '#647067' }}>
                    {pickLocalizedText(lang, {
                      en: 'Est. Basket Cost',
                      pl: 'Koszt koszyka',
                      az: 'Təxmini Səbət',
                    })}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#132A19' }}>
                    {formatPln(activeResult.weeklyPlan.totalEstimatedBasketPln, wizCurrency)}
                  </div>
                </div>
                <div style={{ background: '#FFFFFF', padding: '7px 8px', borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: '#647067' }}>{t.budget}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#132A19' }}>
                    {formatPln(activeResult.weeklyPlan.targetBudgetPln, wizCurrency)}
                  </div>
                </div>
                <div style={{ background: '#FFFFFF', padding: '7px 8px', borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: '#647067' }}>
                    {activeResult.weeklyPlan.remainingBudgetPln >= 0
                      ? pickLocalizedText(lang, { en: 'Remaining', pl: 'Pozostało', az: 'Qalıq Büdcə' })
                      : pickLocalizedText(lang, { en: 'Over Budget', pl: 'Przekroczono', az: 'Büdcədən Artıq' })}
                  </div>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 900,
                      color: activeResult.weeklyPlan.remainingBudgetPln >= 0 ? '#15803D' : '#DC2626',
                    }}
                  >
                    {formatPln(Math.abs(activeResult.weeklyPlan.remainingBudgetPln), wizCurrency)}
                  </div>
                </div>
              </div>
            </div>

            {/* Cheaper Alternatives if Basket Exceeds Budget or Swaps Exist */}
            {activeResult.budgetAnalysis.suggestions.length > 0 && (
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 800, color: '#92400E', marginBottom: 6 }}>
                  💡{' '}
                  {pickLocalizedText(lang, {
                    en: 'Cheaper Alternatives & Smart Budget Swaps:',
                    pl: 'Tańsze alternatywy i optymalizacja budżetu:',
                    az: 'Daha Ucuz Alternativlər və Büdcə Qənaəti:',
                  })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activeResult.budgetAnalysis.suggestions.slice(0, 3).map((sug) => (
                    <div
                      key={sug.id}
                      style={{
                        background: '#FFFFFF',
                        borderRadius: 9,
                        padding: '7px 9px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        border: '1px solid #FDE68A',
                      }}
                    >
                      <div style={{ fontSize: 11, color: '#1F2937' }}>
                        <div style={{ fontWeight: 800 }}>
                          {pickLocalizedText(lang, {
                            en: sug.titleEn,
                            pl: sug.titlePl,
                            az: sug.titleAz,
                          })}
                        </div>
                        <div style={{ fontSize: 10, color: '#15803D', fontWeight: 700 }}>
                          {pickLocalizedText(lang, { en: 'Save', pl: 'Oszczędność', az: 'Qənaət' })}:{' '}
                          {formatPln(sug.estimatedSavingsPln, wizCurrency)}
                        </div>
                      </div>
                      {sug.targetPlannedMealId && sug.replacementRecipeId && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onApplyBudgetSuggestion(sug);
                          }}
                          style={{
                            padding: '5px 9px',
                            borderRadius: 8,
                            border: 'none',
                            background: '#196431',
                            color: '#FFFFFF',
                            fontSize: 10.5,
                            fontWeight: 800,
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          {pickLocalizedText(lang, { en: 'Swap', pl: 'Zamień', az: 'Dəyiş' })}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Day-by-Day Generated Meals (Breakfast, Lunch, Dinner) */}
            <div style={{ fontSize: 12, fontWeight: 800, color: '#132A19', marginBottom: 6 }}>
              {pickLocalizedText(lang, {
                en: 'Generated Daily Meals (Tap any recipe for full ingredients & instructions):',
                pl: 'Wygenerowane posiłki na każdy dzień (Kliknij przepis, by zobaczyć szczegóły):',
                az: 'Günlük Yemək Planı (Resept və təlimatlar üçün üzərinə toxunun):',
              })}
            </div>

            <div
              style={{
                maxHeight: 195,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 12,
                paddingRight: 2,
              }}
            >
              {Array.from(
                { length: activeResult.weeklyPlan.planDurationDays || wizDurationDays },
                (_, dayIdx) => {
                  const dayMeals = activeResult.weeklyPlan.meals.filter((m) => m.dayIndex === dayIdx);
                  const dayFullNames = {
                    en: ['Monday, Nov 10', 'Tuesday, Nov 11', 'Wednesday, Nov 12', 'Thursday, Nov 13', 'Friday, Nov 14', 'Saturday, Nov 15', 'Sunday, Nov 16'],
                    pl: ['Poniedziałek, 10 lis', 'Wtorek, 11 lis', 'Środa, 12 lis', 'Czwartek, 13 lis', 'Piątek, 14 lis', 'Sobota, 15 lis', 'Niedziela, 16 lis'],
                    az: ['Bazar ertəsi, 10 noy', 'Çərşənbə axşamı, 11 noy', 'Çərşənbə, 12 noy', 'Cümə axşamı, 13 noy', 'Cümə, 14 noy', 'Şənbə, 15 noy', 'Bazar, 16 noy'],
                  };
                  return (
                    <div
                      key={dayIdx}
                      style={{
                        border: '1px solid #E2ECE4',
                        borderRadius: 11,
                        padding: '8px 10px',
                        background: '#FFFFFF',
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#196431', marginBottom: 5 }}>
                        {(dayFullNames[lang] || dayFullNames.en)[dayIdx]}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {dayMeals.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => onOpenRecipeDetail(m.recipe)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: 11.5,
                              cursor: 'pointer',
                              padding: '4px 6px',
                              borderRadius: 8,
                              background: '#F8FBF9',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span
                                style={{
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  color: '#196431',
                                  minWidth: 64,
                                }}
                              >
                                {toLocaleUpper(
                                  m.mealType === 'breakfast'
                                    ? t.breakfast
                                    : m.mealType === 'lunch'
                                    ? t.lunch
                                    : t.dinner,
                                  lang
                                )}
                              </span>
                              <span style={{ fontWeight: 700, color: '#132A19' }}>
                                {pickLocalizedText(lang, {
                                  en: m.recipe.titleEn,
                                  pl: m.recipe.titlePl,
                                  az: m.recipe.titleAz,
                                })}
                              </span>
                            </div>
                            <span style={{ fontSize: 10.5, color: '#647067', fontWeight: 700, flexShrink: 0 }}>
                              {formatMinutes(m.recipe.totalTimeMin, lang)} • {formatPln(m.scaledCostPln, wizCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {/* Consolidated Shopping List Preview */}
            <div
              style={{
                background: '#F6FAF7',
                border: '1px solid #D5E2D8',
                borderRadius: 11,
                padding: '9px 12px',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingBag size={18} color="#196431" />
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: '#132A19' }}>
                    {pickLocalizedText(lang, {
                      en: `Consolidated Shopping List (${activeResult.shoppingList.items.length} products)`,
                      pl: `Skonsolidowana Lista Zakupów (${activeResult.shoppingList.items.length} produktów)`,
                      az: `Birləşdirilmiş Alış-Veriş Siyahısı (${activeResult.shoppingList.items.length} məhsul)`,
                    })}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#647067' }}>
                    {pickLocalizedText(lang, {
                      en: 'Duplicate ingredients merged & rounded to real supermarket packages',
                      pl: 'Połączono powtarzające się składniki i dobrano wielkości opakowań',
                      az: 'Təkrarlanan ərzaqlar birləşdirildi və market qablaşdırmalarına uyğunlaşdırıldı',
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                data-testid="btn-wizard-open-mealplan"
                className="mp-primary-cta-btn"
                onClick={() => {
                  onNavigateTab('mealplan');
                  onClose();
                }}
              >
                {pickLocalizedText(lang, {
                  en: 'Open Meal Plan',
                  pl: 'Otwórz Plan Posiłków',
                  az: 'Yemək Planını Aç',
                })}
              </button>
              <button
                type="button"
                data-testid="btn-wizard-open-shopping"
                onClick={() => {
                  onNavigateTab('shopping');
                  onClose();
                }}
                style={{
                  padding: '11px 14px',
                  borderRadius: 12,
                  border: '1.5px solid #196431',
                  background: '#FFFFFF',
                  color: '#196431',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {pickLocalizedText(lang, {
                  en: 'Open Shopping List',
                  pl: 'Otwórz Listę Zakupów',
                  az: 'Alış-Veriş Siyahısını Aç',
                })}
              </button>
            </div>
          </div>
        )}

        {/* ==================== WIZARD FOOTER NAVIGATION (STEPS 1–7) ==================== */}
        {step <= 7 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 16,
              paddingTop: 12,
              borderTop: '1px solid #E5ECE7',
            }}
          >
            {step > 1 ? (
              <button
                type="button"
                data-testid="btn-wizard-back"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '9px 14px',
                  borderRadius: 10,
                  border: '1px solid #D5E2D8',
                  background: '#FFFFFF',
                  color: '#374151',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <ChevronLeft size={16} />
                {pickLocalizedText(lang, { en: 'Back', pl: 'Wstecz', az: 'Geri' })}
              </button>
            ) : (
              <div />
            )}

            {step < 7 && (
              <button
                type="button"
                data-testid="btn-wizard-next"
                onClick={() => setStep((s) => Math.min(7, s + 1))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '9px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#196431',
                  color: '#FFFFFF',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {step === 6
                  ? pickLocalizedText(lang, { en: 'Review Summary', pl: 'Podsumowanie', az: 'Xülasəyə Keç' })
                  : pickLocalizedText(lang, { en: 'Next Step', pl: 'Dalej', az: 'Növbəti' })}
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};
