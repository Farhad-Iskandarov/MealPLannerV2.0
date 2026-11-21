import React, { useEffect, useState } from 'react';
import {
  X,
  Check,
  AlertTriangle,
  Plus,
  Trash2,
  Sparkles,
  ShieldCheck,
  Store,
  Lock,
  Search,
  Globe,
  Coins,
} from 'lucide-react';
import {
  Language,
  SupermarketSlug,
  DietaryOption,
  MealType,
  Recipe,
  RegionCode,
  CurrencyCode,
} from '../../shared/types';
import { AppStatePayload } from '../api/clientApi';
import { formatPln, translations } from '../../shared/i18n';
import {
  pickLocalizedText,
  getCatalogueSupermarketsForRegion,
  getDefaultCurrencyForRegion,
  resolveValidSupermarketForRegion,
  localizeQuantityLabel,
  formatMinutes,
  toLocaleUpper,
  handleMealImageError,
} from '../../shared/regionConfig';
import { getRecipeBaseCostForCurrency } from '../../server/ai/aiMealPlanner';
import { SupermarketLogo } from './BrandAssets';
import { AiPlanWizardModal } from './AiPlanWizardModal';

export type ActiveModalType =
  | null
  | 'ai_wizard'
  | 'price_comparison'
  | 'pantry'
  | 'budget_optimizer'
  | 'preferences'
  | 'region_settings'
  | 'replace_meal'
  | 'create_recipe'
  | 'auth'
  | 'notifications'
  | 'privacy'
  | 'ai_report';

interface ModalProps {
  activeModal: ActiveModalType;
  onClose: () => void;
  state: AppStatePayload;
  lang: Language;
  selectedDayIndex: number;
  targetMealSlot: { dayIndex: number; mealType: MealType; plannedMealId?: string } | null;
  onSelectReplacementRecipe: (recipeId: string, mealType: MealType, servings: number) => Promise<void>;
  onSavePreferences: (patch: any) => Promise<void>;
  onGenerateWizardPlan: (patch: any, variationSeed?: number) => Promise<AppStatePayload>;
  onNavigateTab: (tab: 'home' | 'mealplan' | 'recipes' | 'shopping' | 'profile') => void;
  onAddPantryItem: (item: any) => Promise<void>;
  onDeletePantryItem: (id: string) => Promise<void>;
  onTogglePantrySubtraction: (subtract: boolean) => Promise<void>;
  onApplyBudgetSuggestion: (s: any) => Promise<void>;
  onCreateCustomRecipe: (r: any) => Promise<void>;
  onSelectSupermarket: (s: SupermarketSlug) => Promise<void>;
  onSyncPrices?: () => Promise<void>;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (data: any) => Promise<void>;
  onRecoverPassword: (email: string) => Promise<{ message: string; recoveryCodeDemo?: string }>;
  onResetPassword: (email: string, code: string, newPass: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onReportAiContent: (payload: {
    targetType: 'meal_plan' | 'recipe' | 'ingredient_match' | 'other';
    targetId: string;
    reasonCategory:
      | 'allergen_safety'
      | 'inaccurate_nutrition'
      | 'inappropriate_content'
      | 'wrong_price_or_product'
      | 'other';
    details: string;
  }) => Promise<void>;
  onExportUserData: () => Promise<void>;
  onLogout: () => void;
  onOpenRecipeDetail: (recipe: Recipe) => void;
}

export const AppModals: React.FC<ModalProps> = ({
  activeModal,
  onClose,
  state,
  lang,
  selectedDayIndex,
  targetMealSlot,
  onSelectReplacementRecipe,
  onSavePreferences,
  onGenerateWizardPlan,
  onNavigateTab,
  onAddPantryItem,
  onDeletePantryItem,
  onTogglePantrySubtraction,
  onApplyBudgetSuggestion,
  onCreateCustomRecipe,
  onSelectSupermarket,
  onSyncPrices,
  onLogin,
  onRegister,
  onRecoverPassword,
  onResetPassword,
  onDeleteAccount,
  onReportAiContent,
  onExportUserData,
  onLogout,
  onOpenRecipeDetail,
}) => {
  const t = translations[lang];
  const activeRegion: RegionCode = state.user.regionCode || state.user.preferences.regionCode || 'PL';
  const activeCurrency: CurrencyCode =
    state.user.currencyCode ||
    state.user.preferences.currencyCode ||
    getDefaultCurrencyForRegion(activeRegion);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Price comparison search
  const [compSearch, setCompSearch] = useState('');

  // Pantry new item state
  const [pantryName, setPantryName] = useState('');
  const [pantryQty, setPantryQty] = useState('250');
  const [pantryUnit, setPantryUnit] = useState<'g' | 'ml' | 'pcs'>('g');
  const [pantryExpiry, setPantryExpiry] = useState('2026-11-18');

  // Preferences form state
  const prefs = state.user.preferences;
  const [prefName, setPrefName] = useState(state.user.displayName);
  const [prefRegion, setPrefRegion] = useState<RegionCode>(activeRegion);
  const [prefCurrency, setPrefCurrency] = useState<CurrencyCode>(activeCurrency);
  const [prefLanguage, setPrefLanguage] = useState<Language>(lang);
  const [prefHousehold, setPrefHousehold] = useState(String(prefs.householdSize));
  const [prefBudget, setPrefBudget] = useState(String(prefs.weeklyBudgetPln));
  const [prefStore, setPrefStore] = useState<SupermarketSlug>(prefs.preferredSupermarket);
  const [prefDiets, setPrefDiets] = useState<DietaryOption[]>(prefs.dietaryRestrictions);
  const [prefAllergies, setPrefAllergies] = useState(prefs.allergies.join(', '));
  const [prefExclusions, setPrefExclusions] = useState(prefs.excludedIngredients.join(', '));
  const [prefDislikes, setPrefDislikes] = useState(prefs.dislikes.join(', '));
  const [prefPrepTime, setPrefPrepTime] = useState(String(prefs.preferredPrepTimeMin));
  const [prefSkill, setPrefSkill] = useState(prefs.cookingSkill);
  const [prefSnacks, setPrefSnacks] = useState(prefs.includeSnacks);

  // Sync local form state when modal opens or user state changes
  useEffect(() => {
    setPrefName(state.user.displayName);
    setPrefRegion(activeRegion);
    setPrefCurrency(activeCurrency);
    setPrefLanguage(lang);
    setPrefHousehold(String(prefs.householdSize));
    setPrefBudget(String(prefs.weeklyBudgetPln));
    setPrefStore(prefs.preferredSupermarket);
    setPrefDiets(prefs.dietaryRestrictions);
    setPrefAllergies(prefs.allergies.join(', '));
    setPrefExclusions(prefs.excludedIngredients.join(', '));
    setPrefDislikes(prefs.dislikes.join(', '));
    setPrefPrepTime(String(prefs.preferredPrepTimeMin));
    setPrefSkill(prefs.cookingSkill);
    setPrefSnacks(prefs.includeSnacks);
  }, [activeModal, state.user, activeRegion, activeCurrency, lang, prefs]);

  // Replace/Add meal modal state
  const [chosenMealType, setChosenMealType] = useState<MealType>(targetMealSlot?.mealType || 'lunch');
  const [chosenServings, setChosenServings] = useState(prefs.householdSize);

  // Custom recipe state
  const [recTitlePl, setRecTitlePl] = useState('');
  const [recMealType, setRecMealType] = useState<MealType>('lunch');
  const [recPrepMin, setRecPrepMin] = useState('15');
  const [recCost, setRecCost] = useState(activeCurrency === 'AZN' ? '5.20' : '10.50');
  const [recKcal, setRecKcal] = useState('480');
  const [recIngName, setRecIngName] = useState(
    lang === 'az' ? 'Toyuq filesi' : lang === 'pl' ? 'Pierś z kurczaka' : 'Chicken breast'
  );
  const [recIngAmt, setRecIngAmt] = useState('300');
  const [recInstructions, setRecInstructions] = useState(
    lang === 'az'
      ? 'Ərzaqları doğrayın, zeytun yağında qızardın və 12 dəqiqə bişirin.'
      : lang === 'pl'
      ? 'Pokrój składniki, podsmaż na oliwie i duś przez 12 minut.'
      : 'Slice ingredients, sear in olive oil, and simmer for 12 minutes.'
  );

  // Auth modal state
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'recover' | 'delete'>('login');
  const [authEmail, setAuthEmail] = useState('farhad@email.com');
  const [authPassword, setAuthPassword] = useState('MealPlanner2026!');
  const [authDisplayName, setAuthDisplayName] = useState('Anna Kowalska');
  const [recoveryCodeSent, setRecoveryCodeSent] = useState<string | null>(null);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);

  // AI Content Reporting state (Google Play AI-Generated Content Policy)
  const [reportTargetType, setReportTargetType] = useState<'meal_plan' | 'recipe' | 'ingredient_match' | 'other'>('meal_plan');
  const [reportReason, setReportReason] = useState<
    'allergen_safety' | 'inaccurate_nutrition' | 'inappropriate_content' | 'wrong_price_or_product' | 'other'
  >('allergen_safety');
  const [reportDetails, setReportDetails] = useState('');

  if (!activeModal) return null;

  const toggleDiet = (d: DietaryOption) => {
    if (d === 'none') {
      setPrefDiets([]);
      return;
    }
    if (prefDiets.includes(d)) {
      setPrefDiets(prefDiets.filter((x) => x !== d));
    } else {
      setPrefDiets([...prefDiets.filter((x) => x !== 'none'), d]);
    }
  };

  const activeCatalogueStores = getCatalogueSupermarketsForRegion(activeRegion);
  const comingSoonStores = state.supermarkets.filter(
    (s) => s.adapterStatus === 'COMING_SOON_UNAVAILABLE'
  );

  return (
    <div className="mp-modal-backdrop" onClick={onClose}>
      <div className="mp-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* === 0. 6-STEP INTERACTIVE AI MEAL PLAN WIZARD === */}
        {activeModal === 'ai_wizard' && (
          <AiPlanWizardModal
            state={state}
            lang={lang}
            onClose={onClose}
            onGenerateWizardPlan={onGenerateWizardPlan}
            onApplyBudgetSuggestion={onApplyBudgetSuggestion}
            onOpenRecipeDetail={onOpenRecipeDetail}
            onNavigateTab={onNavigateTab}
          />
        )}

        {/* === 1. PRICE COMPARISON & SUPERMARKET CATALOGUE ENGINE MODAL === */}
        {activeModal === 'price_comparison' && (
          <>
            <div className="mp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Store size={20} color="#196431" />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                    {activeRegion === 'AZ'
                      ? pickLocalizedText(lang, {
                          en: 'Supermarket Price Engine: Bravo vs Araz',
                          pl: 'Porównywarka Cen: Bravo vs Araz',
                          az: 'Market Qiymət Müqayisəsi: Bravo və Araz',
                        })
                      : pickLocalizedText(lang, {
                          en: 'Supermarket Price Engine: Biedronka vs Lidl',
                          pl: 'Porównywarka Cen: Biedronka vs Lidl',
                          az: 'Market Qiymət Müqayisəsi: Biedronka və Lidl',
                        })}
                  </h3>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {activeRegion === 'AZ'
                      ? pickLocalizedText(lang, {
                          en: 'Normalized unit prices (AZN/kg, AZN/L) • EAN barcodes • Loyalty conditions',
                          pl: 'Znormalizowane ceny jednostkowe (AZN/kg, AZN/L) • Kody EAN • Promocje',
                          az: 'Vahid qiymətlər (₼/kq, ₼/L) • EAN barkodlar • Endirim kartı şərtləri',
                        })
                      : pickLocalizedText(lang, {
                          en: 'Normalized unit prices (PLN/kg, PLN/L) • EAN barcodes • Loyalty conditions',
                          pl: 'Znormalizowane ceny jednostkowe (zł/kg, zł/L) • Kody EAN • Promocje lojalnościowe',
                          az: 'Vahid qiymətlər (zł/kq, zł/L) • EAN barkodlar • Sadiqlik kartları',
                        })}
                  </div>
                </div>
              </div>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              {/* Store Basket Summary Comparison */}
              <div
                style={{
                  background: '#F2F9F4',
                  border: '1px solid #CBE4D2',
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, color: '#164A26', marginBottom: 8 }}>
                  {pickLocalizedText(lang, {
                    en: 'Your Complete Weekly Shopping Basket Comparison:',
                    pl: 'Porównanie Twojego pełnego koszyka tygodniowego:',
                    az: 'Həftəlik alış-veriş səbətinizin marketlər üzrə müqayisəsi:',
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {activeCatalogueStores.map((st) => {
                    const comp = state.shoppingList.comparisonByStore[st];
                    const isSelected = state.shoppingList.supermarketId === st;
                    return (
                      <div
                        key={st}
                        onClick={() => onSelectSupermarket(st)}
                        style={{
                          background: isSelected ? '#196431' : '#FFFFFF',
                          color: isSelected ? '#FFFFFF' : '#1B241E',
                          padding: '8px 6px',
                          borderRadius: 12,
                          textAlign: 'center',
                          cursor: 'pointer',
                          border: '1px solid #D5E2D8',
                        }}
                        data-testid={`compare-store-card-${st}`}
                      >
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                          <SupermarketLogo store={st} size={26} />
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'capitalize' }}>{st}</div>
                        <div style={{ fontSize: 13, fontWeight: 900, marginTop: 2 }}>
                          {comp ? formatPln(comp.totalBasketPln, activeCurrency) : '—'}
                        </div>
                        {comp && comp.savingsVsRegularPln > 0 && (
                          <div style={{ fontSize: 9.5, opacity: 0.88 }}>
                            {pickLocalizedText(lang, {
                              en: 'Save',
                              pl: 'Oszczędzasz',
                              az: 'Qənaət',
                            })}{' '}
                            {formatPln(comp.savingsVsRegularPln, activeCurrency)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Additional regional retailers (Coming Soon / Unavailable live API) */}
                {comingSoonStores.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: '1px dashed #CBE4D2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 10.5, color: '#4A6351', fontWeight: 700 }}>
                      {pickLocalizedText(lang, {
                        en: 'Additional regional chains (no live public feed yet):',
                        pl: 'Dodatkowe sieci regionalne (brak publicznego API):',
                        az: 'Digər yerli şəbəkələr (canlı API hələ mövcud deyil):',
                      })}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {comingSoonStores.map((cs) => (
                        <span
                          key={cs.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            background: '#FFFFFF',
                            border: '1px solid #D5E2D8',
                            borderRadius: 999,
                            padding: '3px 8px',
                            fontSize: 10.5,
                            color: '#647067',
                          }}
                        >
                          <SupermarketLogo store={cs.id} size={16} />
                          <strong>{cs.name}</strong>
                          <span
                            style={{
                              background: '#F3F4F6',
                              color: '#4B5563',
                              padding: '1px 5px',
                              borderRadius: 6,
                              fontSize: 9.5,
                              fontWeight: 700,
                            }}
                          >
                            {t.comingSoonBadge}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bazar Store 24-Hour Automated Price Monitoring & History Panel */}
              {state.priceMonitoring && (
                <div
                  data-testid="bazarstore-monitor-panel"
                  style={{
                    background: '#F4F9F5',
                    border: '1px solid #CBE4D2',
                    borderRadius: 12,
                    padding: '10px 12px',
                    marginBottom: 12,
                    fontSize: 11,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: '#145328', fontSize: 12 }}>
                        📡{' '}
                        {pickLocalizedText(lang, {
                          en: 'Bazarstore 24h Automated Price Monitor',
                          pl: 'Automatyczny 24h Monitoring Cen Bazarstore',
                          az: 'Bazarstore 24 Saatlıq Avtomatik Qiymət Monitorinqi',
                        })}
                      </div>
                      <div style={{ fontSize: 10, color: '#4A6351' }}>
                        {pickLocalizedText(lang, {
                          en: `Source: bazarstore.az/bütün-məhsullar • Last check: ${(state.priceMonitoring.lastSuccessfulSyncAt || '').slice(0, 16).replace('T', ' ')} UTC`,
                          pl: `Źródło: bazarstore.az/bütün-məhsullar • Ostatni odczyt: ${(state.priceMonitoring.lastSuccessfulSyncAt || '').slice(0, 16).replace('T', ' ')} UTC`,
                          az: `Mənbə: bazarstore.az/bütün-məhsullar • Son yoxlama: ${(state.priceMonitoring.lastSuccessfulSyncAt || '').slice(0, 16).replace('T', ' ')} UTC`,
                        })}
                      </div>
                    </div>
                    {onSyncPrices && (
                      <button
                        type="button"
                        data-testid="btn-trigger-price-sync"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await onSyncPrices();
                          } finally {
                            setBusy(false);
                          }
                        }}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 999,
                          border: '1px solid #196431',
                          background: '#196431',
                          color: '#FFFFFF',
                          fontSize: 10.5,
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {busy
                          ? '...'
                          : pickLocalizedText(lang, {
                              en: 'Check Prices Now',
                              pl: 'Sprawdź ceny teraz',
                              az: 'Qiymətləri indi yoxla',
                            })}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    <span
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #D5E2D8',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontWeight: 700,
                        color: '#1B241E',
                      }}
                    >
                      📦 {state.priceMonitoring.totalMonitoredProducts}{' '}
                      {pickLocalizedText(lang, {
                        en: 'monitored variants',
                        pl: 'monitorowanych wariantów',
                        az: 'izlənilən məhsul variantı',
                      })}
                    </span>
                    <span
                      style={{
                        background: '#DCFCE7',
                        color: '#166534',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontWeight: 700,
                      }}
                    >
                      ✓ {state.priceMonitoring.availableProductsCount}{' '}
                      {pickLocalizedText(lang, {
                        en: 'in stock',
                        pl: 'dostępnych',
                        az: 'stokda var',
                      })}
                    </span>
                    <span
                      style={{
                        background:
                          state.priceMonitoring.outdatedProductsCount > 0 ? '#FEF3C7' : '#FFFFFF',
                        color:
                          state.priceMonitoring.outdatedProductsCount > 0 ? '#92400E' : '#4B5563',
                        border: '1px solid #D5E2D8',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontWeight: 700,
                      }}
                    >
                      ⏱️ {state.priceMonitoring.outdatedProductsCount}{' '}
                      {pickLocalizedText(lang, {
                        en: 'outdated (>48h)',
                        pl: 'nieaktualnych (>48h)',
                        az: 'köhnəlmiş (>48s)',
                      })}
                    </span>
                  </div>

                  {state.priceMonitoring.recentPriceChanges.length > 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: '1px dashed #CBE4D2',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                      }}
                    >
                      <div style={{ fontWeight: 800, color: '#164A26', fontSize: 10.5 }}>
                        {pickLocalizedText(lang, {
                          en: 'Recent Historical Price Changes (Bazarstore AZN ₼):',
                          pl: 'Ostatnie zmiany cen w historii (Bazarstore AZN ₼):',
                          az: 'Son Qiymət Dəyişiklikləri Tarixçəsi (Bazarstore AZN ₼):',
                        })}
                      </div>
                      {state.priceMonitoring.recentPriceChanges.slice(0, 3).map((chg) => (
                        <div
                          key={chg.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 10,
                            color: '#374151',
                          }}
                        >
                          <span>
                            {pickLocalizedText(lang, {
                              en: chg.productNameEn || chg.productNameAz || '',
                              pl: chg.productNameEn || chg.productNameAz || '',
                              az: chg.productNameAz || chg.productNameEn || '',
                            })}
                          </span>
                          <span style={{ fontWeight: 800 }}>
                            {chg.previousEffectivePrice !== null && (
                              <span style={{ textDecoration: 'line-through', color: '#9CA3AF', marginRight: 4 }}>
                                {chg.previousEffectivePrice.toFixed(2)} ₼
                              </span>
                            )}
                            <span style={{ color: (chg.priceDelta || 0) <= 0 ? '#15803D' : '#B45309' }}>
                              {chg.effectivePrice.toFixed(2)} ₼ (
                              {(chg.priceDelta || 0) > 0 ? `+${chg.priceDelta?.toFixed(2)}` : chg.priceDelta?.toFixed(2)} ₼)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Transparency Banner */}
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 11,
                  color: '#92400E',
                  marginBottom: 12,
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>
                    {pickLocalizedText(lang, {
                      en: 'Price Source Transparency:',
                      pl: 'Transparentność cenowa:',
                      az: 'Qiymət mənbəyi şəffaflığı:',
                    })}
                  </strong>{' '}
                  {activeRegion === 'AZ'
                    ? pickLocalizedText(lang, {
                        en: 'Bravo, Araz, Bazarstore, and Rahat do not expose unauthenticated public APIs. Prices below are clearly labelled Azerbaijan reference / leaflet catalogue data in AZN (₼).',
                        pl: 'Sieci Bravo, Araz, Bazarstore i Rahat nie udostępniają otwartego API. Ceny poniżej pochodzą z oznaczonego katalogu referencyjnego Azerbejdżanu w AZN (₼).',
                        az: 'Bravo, Araz, Bazarstore və Rahat açıq ictimai API təqdim etmir. Aşağıdakı qiymətlər AZN (₼) ilə açıq şəkildə işarələnmiş kataloq və buklet məlumatlarıdır.',
                      })
                    : pickLocalizedText(lang, {
                        en: 'Biedronka and Lidl do not expose unauthenticated live public APIs. Prices below are clearly labelled demonstration / promotional leaflet reference data in PLN (zł).',
                        pl: 'Biedronka i Lidl nie udostępniają otwartego API w czasie rzeczywistym. Poniższe pozycje pochodzą z wyraźnie oznaczonego katalogu referencyjnego / gazetek promocyjnych w PLN (zł).',
                        az: 'Biedronka və Lidl açıq ictimai API təqdim etmir. Aşağıdakı qiymətlər PLN (zł) ilə işarələnmiş kataloq və aksiya məlumatlarıdır.',
                      })}
                </div>
              </div>

              {/* Search Input */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: 11, top: 11, color: '#647067' }}
                />
                <input
                  className="mp-input"
                  style={{ paddingLeft: 34 }}
                  placeholder={pickLocalizedText(lang, {
                    en: 'Search product, brand, or EAN barcode...',
                    pl: 'Szukaj produktu, marki lub kodu EAN...',
                    az: 'Məhsul, brend və ya EAN barkod axtar...',
                  })}
                  value={compSearch}
                  onChange={(e) => setCompSearch(e.target.value)}
                />
              </div>

              {/* Product Comparison Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {state.priceComparisons
                  .filter((p) => {
                    if (!compSearch.trim()) return true;
                    const q = compSearch.toLowerCase();
                    return (
                      p.namePl.toLowerCase().includes(q) ||
                      p.nameEn.toLowerCase().includes(q) ||
                      (p.nameAz && p.nameAz.toLowerCase().includes(q)) ||
                      p.brand.toLowerCase().includes(q) ||
                      p.ean.includes(q)
                    );
                  })
                  .map((item) => {
                    const primaryLeft = activeRegion === 'AZ' ? item.bazarstore || item.bravo : item.biedronka;
                    const primaryRight = activeRegion === 'AZ' ? item.bravo : item.lidl;
                    const leftTitle = activeRegion === 'AZ' ? '🛒 Bazarstore' : '🐞 Biedronka';
                    const rightTitle = activeRegion === 'AZ' ? '🍏 Bravo' : '🔵 Lidl';
                    return (
                      <div
                        key={item.productId}
                        style={{
                          border: '1px solid #E3E7E3',
                          borderRadius: 12,
                          padding: 10,
                          background: '#FFFFFF',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 22 }}>{item.icon}</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 800 }}>
                                {pickLocalizedText(lang, {
                                  en: item.nameEn,
                                  pl: item.namePl,
                                  az: item.nameAz,
                                })}{' '}
                                <span style={{ fontWeight: 600, color: '#647067' }}>
                                  ({localizeQuantityLabel(item.packageLabelPl, lang)})
                                </span>
                              </div>
                              <div style={{ fontSize: 10.5, color: '#647067' }}>
                                {item.brand} • EAN: {item.ean}
                              </div>
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              background: '#DCFCE7',
                              color: '#166534',
                              padding: '3px 8px',
                              borderRadius: 999,
                            }}
                          >
                            {pickLocalizedText(lang, {
                              en: 'Cheapest:',
                              pl: 'Najtaniej:',
                              az: 'Ən ucuz:',
                            })}{' '}
                            {toLocaleUpper(item.cheapestStore, lang)}
                          </span>
                        </div>

                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 8,
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: '1px dashed #EAECE8',
                            fontSize: 11.5,
                          }}
                        >
                          {/* Primary Store 1 Column */}
                          <div style={{ background: '#FFFDF5', padding: 7, borderRadius: 8, border: '1px solid #F3E8C8' }}>
                            <div style={{ fontWeight: 800, color: activeRegion === 'AZ' ? '#15803D' : '#B91C1C' }}>
                              {leftTitle}
                            </div>
                            {primaryLeft ? (
                              <>
                                <div style={{ fontSize: 13.5, fontWeight: 900, marginTop: 2 }}>
                                  {formatPln(primaryLeft.effectivePricePln, activeCurrency)}{' '}
                                  {primaryLeft.promoPricePln && (
                                    <span style={{ textDecoration: 'line-through', color: '#9CA3AF', fontSize: 11 }}>
                                      {formatPln(primaryLeft.regularPricePln, activeCurrency)}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10.5, color: '#4B5563' }}>
                                  {primaryLeft.unitPriceLabel}
                                  {primaryLeft.isOutdated && (
                                    <span style={{ color: '#B45309', fontWeight: 800, marginLeft: 4 }}>
                                      • ⚠️ {pickLocalizedText(lang, { en: 'Outdated', pl: 'Nieaktualna', az: 'Köhnəlmiş' })}
                                    </span>
                                  )}
                                  {primaryLeft.isAvailable === false && (
                                    <span style={{ color: '#DC2626', fontWeight: 800, marginLeft: 4 }}>
                                      • 🚫 {pickLocalizedText(lang, { en: 'Unavailable', pl: 'Niedostępny', az: 'Stokda yoxdur' })}
                                    </span>
                                  )}
                                </div>
                                {primaryLeft.loyaltyRequired && (
                                  <div style={{ fontSize: 10, color: '#B45309', fontWeight: 700, marginTop: 2 }}>
                                    💳{' '}
                                    {pickLocalizedText(lang, {
                                      en: primaryLeft.loyaltyConditionEn || '',
                                      pl: primaryLeft.loyaltyConditionPl || '',
                                      az: primaryLeft.loyaltyConditionAz || primaryLeft.loyaltyConditionEn || '',
                                    })}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div>—</div>
                            )}
                          </div>

                          {/* Primary Store 2 Column */}
                          <div style={{ background: '#F5F9FF', padding: 7, borderRadius: 8, border: '1px solid #CBE0F8' }}>
                            <div style={{ fontWeight: 800, color: activeRegion === 'AZ' ? '#166534' : '#0050AA' }}>
                              {rightTitle}
                            </div>
                            {primaryRight ? (
                              <>
                                <div style={{ fontSize: 13.5, fontWeight: 900, marginTop: 2 }}>
                                  {formatPln(primaryRight.effectivePricePln, activeCurrency)}{' '}
                                  {primaryRight.promoPricePln && (
                                    <span style={{ textDecoration: 'line-through', color: '#9CA3AF', fontSize: 11 }}>
                                      {formatPln(primaryRight.regularPricePln, activeCurrency)}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 10.5, color: '#4B5563' }}>{primaryRight.unitPriceLabel}</div>
                                {primaryRight.loyaltyRequired && (
                                  <div style={{ fontSize: 10, color: '#1D4ED8', fontWeight: 700, marginTop: 2 }}>
                                    📱{' '}
                                    {pickLocalizedText(lang, {
                                      en: primaryRight.loyaltyConditionEn || '',
                                      pl: primaryRight.loyaltyConditionPl || '',
                                      az: primaryRight.loyaltyConditionAz || primaryRight.loyaltyConditionEn || '',
                                    })}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div>—</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}

        {/* === 2. PANTRY & LEFTOVERS MANAGER MODAL === */}
        {activeModal === 'pantry' && (
          <>
            <div className="mp-modal-header">
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                  🥫 {t.pantry} ({state.pantry.length})
                </h3>
                <div style={{ fontSize: 11, color: '#647067' }}>
                  {pickLocalizedText(lang, {
                    en: 'Manage home ingredients, expiry dates, and deduct from shopping list',
                    pl: 'Zarządzaj zapasami w domu, datami ważności i odliczaj je z listy zakupów',
                    az: 'Evdəki ərzaq ehtiyatını, son istifadə tarixlərini idarə edin və siyahıdan çıxın',
                  })}
                </div>
              </div>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              {/* Toggle subtract pantry */}
              <div
                style={{
                  background: '#F0F9F2',
                  border: '1px solid #C6E6CE',
                  borderRadius: 12,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 14,
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#155724' }}>
                    {pickLocalizedText(lang, {
                      en: 'Subtract Pantry items from Shopping List',
                      pl: 'Odejmij zapasy ze Spiżarni od Listy Zakupów',
                      az: 'Evdəki ərzaqları (Anbarı) Alış-veriş Siyahısından çıx',
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: '#4A6B53' }}>
                    {pickLocalizedText(lang, {
                      en: 'Automatically reduce shopping quantities using home inventory',
                      pl: 'Unikaj kupowania produktów, które masz już w kuchni',
                      az: 'Mətbəxdə artıq mövcud olan ərzaqları təkrar almaqdan çəkinin',
                    })}
                  </div>
                </div>
                <button
                  className={`mp-switch ${state.shoppingList.subtractPantry ? 'on' : ''}`}
                  onClick={() => onTogglePantrySubtraction(!state.shoppingList.subtractPantry)}
                >
                  <div className="mp-switch-knob" />
                </button>
              </div>

              {/* Add Pantry Item Form */}
              <div
                style={{
                  background: '#F9FAF8',
                  border: '1px solid #E3E7E3',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 14,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                  {pickLocalizedText(lang, {
                    en: '+ Add item to Pantry',
                    pl: '+ Dodaj produkt do spiżarni',
                    az: '+ Anbara ərzaq əlavə et',
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <input
                    className="mp-input"
                    placeholder={pickLocalizedText(lang, {
                      en: 'Ingredient name (e.g. Rice, Milk)',
                      pl: 'Nazwa (np. Ryż, Mleko)',
                      az: 'Ərzaq adı (məs. Düyü, Süd)',
                    })}
                    value={pantryName}
                    onChange={(e) => setPantryName(e.target.value)}
                  />
                  <input
                    className="mp-input"
                    type="number"
                    placeholder={pickLocalizedText(lang, { en: 'Qty', pl: 'Ilość', az: 'Miqdar' })}
                    value={pantryQty}
                    onChange={(e) => setPantryQty(e.target.value)}
                  />
                  <select
                    className="mp-input"
                    value={pantryUnit}
                    onChange={(e) => setPantryUnit(e.target.value as any)}
                  >
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="pcs">{pickLocalizedText(lang, { en: 'pcs', pl: 'szt.', az: 'ədəd' })}</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="mp-input"
                    type="date"
                    value={pantryExpiry}
                    onChange={(e) => setPantryExpiry(e.target.value)}
                  />
                  <button
                    className="mp-primary-cta-btn"
                    style={{ width: 'auto', padding: '9px 16px', whiteSpace: 'nowrap' }}
                    onClick={async () => {
                      if (!pantryName.trim()) return;
                      await onAddPantryItem({
                        namePl: pantryName.trim(),
                        nameEn: pantryName.trim(),
                        nameAz: pantryName.trim(),
                        quantity: Number(pantryQty) || 100,
                        unit: pantryUnit,
                        expiryDate: pantryExpiry,
                      });
                      setPantryName('');
                    }}
                  >
                    <Plus size={15} />{' '}
                    {pickLocalizedText(lang, { en: 'Add', pl: 'Dodaj', az: 'Əlavə et' })}
                  </button>
                </div>
              </div>

              {/* Pantry Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {state.pantry.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid #E5E8E5',
                      background: item.isExpiringSoon ? '#FFF9EB' : '#FFFFFF',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 19 }}>{item.icon}</span>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                          {pickLocalizedText(lang, {
                            en: item.nameEn,
                            pl: item.namePl,
                            az: item.nameAz,
                          })}{' '}
                          <span style={{ color: '#2B8A44', fontWeight: 800 }}>
                            ({localizeQuantityLabel(`${item.quantity} ${item.unit}`, lang)})
                          </span>
                        </div>
                        <div style={{ fontSize: 10.5, color: item.isExpiringSoon ? '#B45309' : '#647067' }}>
                          {item.expiryDate
                            ? `${pickLocalizedText(lang, {
                                en: 'Expires:',
                                pl: 'Ważne do:',
                                az: 'Bitmə tarixi:',
                              })} ${item.expiryDate}${
                                item.isExpiringSoon
                                  ? pickLocalizedText(lang, {
                                      en: ' • Use soon!',
                                      pl: ' • Zużyj wkrótce!',
                                      az: ' • Tezliklə istifadə edin!',
                                    })
                                  : ''
                              }`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <button
                      className="mp-icon-btn"
                      onClick={() => onDeletePantryItem(item.id)}
                      title="Delete"
                    >
                      <Trash2 size={15} color="#DC2626" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Recommended Recipes from Expiring Pantry Items */}
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>
                {pickLocalizedText(lang, {
                  en: 'Recommended Recipes Using Your Pantry (Zero Waste):',
                  pl: 'Przepisy wykorzystujące Twoje zapasy (Zero Waste):',
                  az: 'Evdəki ərzaqlara uyğun tövsiyə olunan reseptlər (Zero Waste):',
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {state.recipes.slice(0, 3).map((rec) => {
                  const recCost = getRecipeBaseCostForCurrency(rec, activeCurrency);
                  return (
                    <div
                      key={rec.id}
                      onClick={() => {
                        onClose();
                        onOpenRecipeDetail(rec);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 8,
                        borderRadius: 10,
                        border: '1px solid #DCE7DE',
                        background: '#F7FBF8',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img
                          src={rec.imageUrl}
                          alt={rec.titleEn}
                          loading="lazy"
                          decoding="async"
                          style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover', backgroundColor: '#EAECE8' }}
                        />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 800 }}>
                            {pickLocalizedText(lang, {
                              en: rec.titleEn,
                              pl: rec.titlePl,
                              az: rec.titleAz,
                            })}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#2B8A44' }}>
                            {formatMinutes(rec.totalTimeMin, lang)} • ~{formatPln(recCost, activeCurrency)}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#196431' }}>
                        {pickLocalizedText(lang, { en: 'View →', pl: 'Zobacz →', az: 'Bax →' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* === 3. BUDGET OPTIMISATION ENGINE MODAL === */}
        {activeModal === 'budget_optimizer' && (
          <>
            <div className="mp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={19} color="#196431" />
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>{t.budgetOptimizerTitle}</h3>
              </div>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginBottom: 14,
                  textAlign: 'center',
                }}
              >
                <div style={{ background: '#F3F7F4', padding: 10, borderRadius: 12 }}>
                  <div style={{ fontSize: 10.5, color: '#647067' }}>{t.weeklyBudget}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#1B241E' }}>
                    {formatPln(state.budgetAnalysis.weeklyBudgetPln, activeCurrency)}
                  </div>
                </div>
                <div style={{ background: '#F3F7F4', padding: 10, borderRadius: 12 }}>
                  <div style={{ fontSize: 10.5, color: '#647067' }}>{t.estimatedCost}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#196431' }}>
                    {formatPln(state.budgetAnalysis.estimatedBasketPln, activeCurrency)}
                  </div>
                </div>
                <div
                  style={{
                    background: state.budgetAnalysis.isOverBudget ? '#FEF2F2' : '#ECFDF5',
                    padding: 10,
                    borderRadius: 12,
                  }}
                >
                  <div style={{ fontSize: 10.5, color: '#647067' }}>
                    {state.budgetAnalysis.isOverBudget ? t.overBudget : t.remainingBudget}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 900,
                      color: state.budgetAnalysis.isOverBudget ? '#DC2626' : '#15803D',
                    }}
                  >
                    {formatPln(Math.abs(state.budgetAnalysis.differencePln), activeCurrency)}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>
                {pickLocalizedText(lang, {
                  en: 'Smart Basket Optimisation Suggestions (1-Click Apply):',
                  pl: 'Rekomendacje optymalizacji koszyka (1 kliknięcie):',
                  az: 'Ağıllı Səbət Optimallaşdırma Tövsiyələri (1 toxunuşla):',
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {state.budgetAnalysis.suggestions.map((sug) => (
                  <div
                    key={sug.id}
                    style={{
                      border: '1px solid #CBE4D2',
                      background: '#F7FCF8',
                      borderRadius: 12,
                      padding: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#164A26' }}>
                        {pickLocalizedText(lang, {
                          en: sug.titleEn,
                          pl: sug.titlePl,
                          az: sug.titleAz,
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: '#4A6351', marginTop: 2 }}>
                        {pickLocalizedText(lang, {
                          en: sug.descriptionEn,
                          pl: sug.descriptionPl,
                          az: sug.descriptionAz,
                        })}
                      </div>
                    </div>
                    <button
                      className="mp-primary-cta-btn"
                      style={{ width: 'auto', padding: '7px 12px', fontSize: 11.5, whiteSpace: 'nowrap' }}
                      onClick={async () => {
                        await onApplyBudgetSuggestion(sug);
                      }}
                    >
                      -{formatPln(sug.estimatedSavingsPln, activeCurrency)}
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11, color: '#647067', lineHeight: 1.4 }}>
                {pickLocalizedText(lang, {
                  en: state.budgetAnalysis.disclaimerEn,
                  pl: state.budgetAnalysis.disclaimerPl,
                  az: state.budgetAnalysis.disclaimerAz,
                })}
              </div>
            </div>
          </>
        )}

        {/* === 3B. DEDICATED REGION, CURRENCY & LANGUAGE SETTINGS MODAL === */}
        {activeModal === 'region_settings' && (
          <>
            <div className="mp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Globe size={20} color="#196431" />
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                  {t.region} • {t.currency} • {t.language}
                </h3>
              </div>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              {/* 1. Region Section */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>{t.region}</div>
                <div style={{ fontSize: 11, color: '#647067', marginBottom: 8 }}>{t.regionSub}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(
                    [
                      { code: 'PL' as RegionCode, flag: '🇵🇱', label: t.regionPoland, sub: 'PLN (zł) • Biedronka, Lidl, Auchan, Kaufland' },
                      { code: 'AZ' as RegionCode, flag: '🇦🇿', label: t.regionAzerbaijan, sub: 'AZN (₼) • Bravo, Araz, Bazarstore, Rahat' },
                    ]
                  ).map((reg) => {
                    const selected = activeRegion === reg.code;
                    return (
                      <button
                        key={reg.code}
                        type="button"
                        onClick={async () => {
                          await onSavePreferences({
                            regionCode: reg.code,
                            currencyCode: getDefaultCurrencyForRegion(reg.code),
                            preferredSupermarket: resolveValidSupermarketForRegion(undefined, reg.code),
                          });
                        }}
                        style={{
                          padding: 11,
                          borderRadius: 12,
                          border: selected ? '2px solid #196431' : '1px solid #D5E2D8',
                          background: selected ? '#ECFDF5' : '#FFFFFF',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                        data-testid={`modal-select-region-${reg.code}`}
                      >
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1B241E' }}>
                          {reg.flag} {reg.label}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#4A6351', marginTop: 3 }}>{reg.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Region Change Explanation Banner */}
              <div
                style={{
                  background: '#F0F9F2',
                  border: '1px solid #C6E6CE',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 11,
                  color: '#164A26',
                  marginBottom: 14,
                }}
              >
                ℹ️ {t.regionChangeNotice}
              </div>

              {/* 2. Currency Section */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>{t.currency}</div>
                <div style={{ fontSize: 11, color: '#647067', marginBottom: 8 }}>{t.currencySub}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(
                    [
                      { code: 'PLN' as CurrencyCode, label: t.currencyPln },
                      { code: 'AZN' as CurrencyCode, label: t.currencyAzn },
                    ]
                  ).map((cur) => {
                    const selected = activeCurrency === cur.code;
                    return (
                      <button
                        key={cur.code}
                        type="button"
                        onClick={async () => {
                          await onSavePreferences({ currencyCode: cur.code });
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: selected ? '2px solid #196431' : '1px solid #D5E2D8',
                          background: selected ? '#ECFDF5' : '#FFFFFF',
                          fontWeight: 800,
                          fontSize: 12.5,
                          color: '#1B241E',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                        data-testid={`modal-select-currency-${cur.code}`}
                      >
                        <Coins size={15} color="#196431" />
                        <span>{cur.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Language Section */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>{t.language}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {(
                    [
                      { code: 'en' as Language, flag: '🇬🇧', label: t.english },
                      { code: 'pl' as Language, flag: '🇵🇱', label: t.polish },
                      { code: 'az' as Language, flag: '🇦🇿', label: t.azerbaijani },
                    ]
                  ).map((l) => {
                    const selected = lang === l.code;
                    return (
                      <button
                        key={l.code}
                        type="button"
                        onClick={async () => {
                          await onSavePreferences({ language: l.code });
                        }}
                        style={{
                          padding: '10px 8px',
                          borderRadius: 12,
                          border: selected ? '2px solid #196431' : '1px solid #D5E2D8',
                          background: selected ? '#ECFDF5' : '#FFFFFF',
                          fontWeight: 800,
                          fontSize: 12,
                          color: '#1B241E',
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                        data-testid={`modal-select-language-${l.code}`}
                      >
                        <div>{l.flag}</div>
                        <div style={{ marginTop: 2 }}>{l.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button className="mp-primary-cta-btn" onClick={onClose}>
                <Check size={16} /> {t.saveChanges}
              </button>
            </div>
          </>
        )}

        {/* === 4. ONBOARDING & PREFERENCES / ALLERGY VALIDATION MODAL === */}
        {activeModal === 'preferences' && (
          <>
            <div className="mp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color="#196431" />
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>{t.onboardingTitle}</h3>
              </div>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              {errorMsg && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 10, marginBottom: 10, fontSize: 12 }}>
                  {errorMsg}
                </div>
              )}

              {/* Region, Currency & Language Selector Row inside Preferences */}
              <div
                style={{
                  background: '#F4F9F5',
                  border: '1px solid #CBE4D2',
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 12,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8,
                }}
              >
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 4 }}>
                    {t.region}
                  </label>
                  <select
                    className="mp-input"
                    value={prefRegion}
                    onChange={(e) => {
                      const nextReg = e.target.value as RegionCode;
                      setPrefRegion(nextReg);
                      setPrefCurrency(getDefaultCurrencyForRegion(nextReg));
                      setPrefStore(resolveValidSupermarketForRegion(undefined, nextReg));
                    }}
                  >
                    <option value="PL">🇵🇱 {t.regionPoland}</option>
                    <option value="AZ">🇦🇿 {t.regionAzerbaijan}</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 4 }}>
                    {t.currency}
                  </label>
                  <select
                    className="mp-input"
                    value={prefCurrency}
                    onChange={(e) => setPrefCurrency(e.target.value as CurrencyCode)}
                  >
                    <option value="PLN">PLN — zł</option>
                    <option value="AZN">AZN — ₼</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 4 }}>
                    {t.language}
                  </label>
                  <select
                    className="mp-input"
                    value={prefLanguage}
                    onChange={(e) => setPrefLanguage(e.target.value as Language)}
                  >
                    <option value="en">English</option>
                    <option value="pl">Polski</option>
                    <option value="az">Azərbaycan dili</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Display Name',
                      pl: 'Imię i nazwisko',
                      az: 'Ad və soyad',
                    })}
                  </label>
                  <input
                    className="mp-input"
                    value={prefName}
                    onChange={(e) => setPrefName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {t.household}
                  </label>
                  <input
                    className="mp-input"
                    type="number"
                    min={1}
                    max={12}
                    value={prefHousehold}
                    onChange={(e) => setPrefHousehold(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {t.weeklyBudget} ({prefCurrency})
                  </label>
                  <input
                    className="mp-input"
                    type="number"
                    min={20}
                    step={10}
                    value={prefBudget}
                    onChange={(e) => setPrefBudget(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {t.preferredSupermarket}
                  </label>
                  <select
                    className="mp-input"
                    value={prefStore}
                    onChange={(e) => setPrefStore(e.target.value as SupermarketSlug)}
                  >
                    {getCatalogueSupermarketsForRegion(prefRegion).map((slug) => (
                      <option key={slug} value={slug}>
                        {slug.charAt(0).toUpperCase() + slug.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                  {pickLocalizedText(lang, {
                    en: 'Dietary Preferences (Deterministically Enforced):',
                    pl: 'Preferencje dietetyczne (walidowane deterministycznie):',
                    az: 'Pəhriz seçimləri (deterministik olaraq yoxlanılır):',
                  })}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(
                    [
                      'none',
                      'vegetarian',
                      'vegan',
                      'pescatarian',
                      'high_protein',
                      'low_carb',
                      'gluten_free',
                      'lactose_free',
                    ] as DietaryOption[]
                  ).map((d) => {
                    const active = d === 'none' ? prefDiets.length === 0 : prefDiets.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        className={`mp-chip ${active ? 'active' : ''}`}
                        onClick={() => toggleDiet(d)}
                      >
                        {t.dietNames[d]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Allergies (comma-separated, hard block)',
                      pl: 'Alergie (np. gluten, milk, eggs, fish, soy)',
                      az: 'Allergiyalar (məs. gluten, milk, eggs, fish)',
                    })}
                  </label>
                  <input
                    className="mp-input"
                    placeholder="gluten, milk, eggs"
                    value={prefAllergies}
                    onChange={(e) => setPrefAllergies(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Excluded Ingredients (hard block)',
                      pl: 'Wykluczone składniki (twarda blokada)',
                      az: 'İstisna edilən ərzaqlar (qadağan)',
                    })}
                  </label>
                  <input
                    className="mp-input"
                    placeholder="onion, salmon"
                    value={prefExclusions}
                    onChange={(e) => setPrefExclusions(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Food Dislikes',
                      pl: 'Nielubiane produkty',
                      az: 'Sevilməyən ərzaqlar',
                    })}
                  </label>
                  <input
                    className="mp-input"
                    placeholder="broccoli, spinach"
                    value={prefDislikes}
                    onChange={(e) => setPrefDislikes(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Max Prep Time (min)',
                      pl: 'Maks. czas gotowania (min)',
                      az: 'Maks. bişirmə vaxtı (dəq)',
                    })}
                  </label>
                  <input
                    className="mp-input"
                    type="number"
                    min={10}
                    max={120}
                    value={prefPrepTime}
                    onChange={(e) => setPrefPrepTime(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Cooking Skill',
                      pl: 'Umiejętności kulinarne',
                      az: 'Bişirmə bacarığı',
                    })}
                  </label>
                  <select
                    className="mp-input"
                    value={prefSkill}
                    onChange={(e) => setPrefSkill(e.target.value as any)}
                  >
                    <option value="beginner">
                      {pickLocalizedText(lang, { en: 'Beginner', pl: 'Początkujący', az: 'Başlanğıc' })}
                    </option>
                    <option value="intermediate">
                      {pickLocalizedText(lang, { en: 'Intermediate', pl: 'Średniozaawansowany', az: 'Orta' })}
                    </option>
                    <option value="advanced">
                      {pickLocalizedText(lang, { en: 'Advanced', pl: 'Zaawansowany', az: 'Peşəkar' })}
                    </option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18 }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {pickLocalizedText(lang, {
                      en: 'Include Daily Snacks',
                      pl: 'Uwzględnij przekąski (4 posiłki)',
                      az: 'Qəlyanaltıları daxil et (4 yemək)',
                    })}
                  </span>
                  <button
                    type="button"
                    className={`mp-switch ${prefSnacks ? 'on' : ''}`}
                    onClick={() => setPrefSnacks(!prefSnacks)}
                  >
                    <div className="mp-switch-knob" />
                  </button>
                </div>
              </div>

              <button
                className="mp-primary-cta-btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErrorMsg(null);
                  try {
                    await onSavePreferences({
                      displayName: prefName,
                      regionCode: prefRegion,
                      currencyCode: prefCurrency,
                      language: prefLanguage,
                      householdSize: Number(prefHousehold) || 2,
                      weeklyBudgetPln: Number(prefBudget) || (prefCurrency === 'AZN' ? 110 : 250),
                      preferredSupermarket: prefStore,
                      dietaryRestrictions: prefDiets,
                      allergies: prefAllergies
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      excludedIngredients: prefExclusions
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      dislikes: prefDislikes
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      preferredPrepTimeMin: Number(prefPrepTime) || 35,
                      cookingSkill: prefSkill,
                      includeSnacks: prefSnacks,
                      mealsPerDay: prefSnacks ? 4 : 3,
                      regeneratePlan: true,
                    });
                    onClose();
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Check size={16} /> {t.saveChanges} & {t.generatePlanBtn}
              </button>
            </div>
          </>
        )}

        {/* === 5. REPLACE / ADD MEAL SELECTOR MODAL === */}
        {activeModal === 'replace_meal' && (
          <>
            <div className="mp-modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                {targetMealSlot?.plannedMealId ? t.replaceMeal : t.addMeal} (#{selectedDayIndex + 1})
              </h3>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              {errorMsg && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 10, marginBottom: 10, fontSize: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mt) => (
                  <button
                    key={mt}
                    className={`mp-chip ${chosenMealType === mt ? 'active' : ''}`}
                    onClick={() => setChosenMealType(mt)}
                  >
                    {t[mt]}
                  </button>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
                  <span>{t.servings}:</span>
                  <input
                    className="mp-input"
                    style={{ width: 60, padding: '4px 8px' }}
                    type="number"
                    min={1}
                    max={12}
                    value={chosenServings}
                    onChange={(e) => setChosenServings(Number(e.target.value) || 2)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {state.recipes.map((r) => {
                  const rCost = getRecipeBaseCostForCurrency(r, activeCurrency);
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 10,
                        borderRadius: 12,
                        border: '1px solid #E2E7E3',
                        background: '#FFFFFF',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <img
                          src={r.imageUrl}
                          alt={r.titleEn}
                          loading="lazy"
                          decoding="async"
                          onError={handleMealImageError}
                          style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', backgroundColor: '#EAECE8' }}
                        />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800 }}>
                            {pickLocalizedText(lang, {
                              en: r.titleEn,
                              pl: r.titlePl,
                              az: r.titleAz,
                            })}
                          </div>
                          <div style={{ fontSize: 11, color: '#647067' }}>
                            {formatMinutes(r.totalTimeMin, lang)} • {r.nutrition.caloriesKcal} kcal • ~{formatPln(rCost, activeCurrency)}
                          </div>
                        </div>
                      </div>
                      <button
                        className="mp-primary-cta-btn"
                        style={{ width: 'auto', padding: '7px 12px', fontSize: 11.5 }}
                        onClick={async () => {
                          setErrorMsg(null);
                          try {
                            await onSelectReplacementRecipe(r.id, chosenMealType, chosenServings);
                            onClose();
                          } catch (err: any) {
                            setErrorMsg(err.message);
                          }
                        }}
                      >
                        {pickLocalizedText(lang, { en: 'Select', pl: 'Wybierz', az: 'Seç' })}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* === 6. CREATE CUSTOM RECIPE MODAL === */}
        {activeModal === 'create_recipe' && (
          <>
            <div className="mp-modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>{t.createRecipeBtn}</h3>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              {errorMsg && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 10, marginBottom: 10, fontSize: 12 }}>
                  {errorMsg}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Recipe Title',
                      pl: 'Nazwa przepisu',
                      az: 'Reseptin adı',
                    })}
                  </label>
                  <input
                    className="mp-input"
                    placeholder={pickLocalizedText(lang, {
                      en: 'e.g. Homemade Vegetable Stew',
                      pl: 'np. Domowe leczo warzywne',
                      az: 'məs. Ev üsulu tərəvəz yeməyi',
                    })}
                    value={recTitlePl}
                    onChange={(e) => setRecTitlePl(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Meal Type',
                      pl: 'Typ posiłku',
                      az: 'Yemək növü',
                    })}
                  </label>
                  <select
                    className="mp-input"
                    value={recMealType}
                    onChange={(e) => setRecMealType(e.target.value as MealType)}
                  >
                    <option value="breakfast">{t.breakfast}</option>
                    <option value="lunch">{t.lunch}</option>
                    <option value="dinner">{t.dinner}</option>
                    <option value="snack">{t.snack}</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Prep Time (min)',
                      pl: 'Czas przygotowania (min)',
                      az: 'Hazırlanma vaxtı (dəq)',
                    })}
                  </label>
                  <input
                    className="mp-input"
                    type="number"
                    value={recPrepMin}
                    onChange={(e) => setRecPrepMin(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: `Estimated Cost (${activeCurrency})`,
                      pl: `Szacowany koszt (${activeCurrency})`,
                      az: `Təxmini qiymət (${activeCurrency})`,
                    })}
                  </label>
                  <input
                    className="mp-input"
                    type="number"
                    step="0.5"
                    value={recCost}
                    onChange={(e) => setRecCost(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Primary Ingredient',
                      pl: 'Główny składnik',
                      az: 'Əsas ərzaq',
                    })}
                  </label>
                  <input
                    className="mp-input"
                    value={recIngName}
                    onChange={(e) => setRecIngName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                    {pickLocalizedText(lang, {
                      en: 'Amount (g) & Calories',
                      pl: 'Ilość (g) i Kalorie',
                      az: 'Miqdar (q) və Kalori',
                    })}
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="mp-input"
                      type="number"
                      value={recIngAmt}
                      onChange={(e) => setRecIngAmt(e.target.value)}
                    />
                    <input
                      className="mp-input"
                      type="number"
                      value={recKcal}
                      onChange={(e) => setRecKcal(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  {pickLocalizedText(lang, {
                    en: 'Cooking Instructions',
                    pl: 'Instrukcja przygotowania',
                    az: 'Bişirmə təlimatı',
                  })}
                </label>
                <textarea
                  className="mp-input"
                  rows={3}
                  value={recInstructions}
                  onChange={(e) => setRecInstructions(e.target.value)}
                />
              </div>
              <button
                className="mp-primary-cta-btn"
                onClick={async () => {
                  setErrorMsg(null);
                  try {
                    await onCreateCustomRecipe({
                      titlePl: recTitlePl,
                      titleEn: recTitlePl,
                      titleAz: recTitlePl,
                      mealType: recMealType,
                      prepTimeMin: Number(recPrepMin) || 15,
                      cookTimeMin: 10,
                      estimatedCostPln: Number(recCost) || 10,
                      caloriesKcal: Number(recKcal) || 450,
                      ingredients: [
                        {
                          canonicalIngredient: recIngName,
                          namePl: recIngName,
                          nameEn: recIngName,
                          nameAz: recIngName,
                          amount: Number(recIngAmt) || 300,
                          unit: 'g',
                          category: 'Fruit & Vegetables',
                        },
                      ],
                      instructionsPl: [recInstructions],
                      instructionsEn: [recInstructions],
                      instructionsAz: [recInstructions],
                    });
                    setRecTitlePl('');
                    onClose();
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  }
                }}
              >
                <Plus size={16} /> {t.createRecipeBtn}
              </button>
            </div>
          </>
        )}

        {/* === 7. AUTHENTICATION & ACCOUNT RECOVERY MODAL === */}
        {activeModal === 'auth' && (
          <>
            <div className="mp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={18} color="#196431" />
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                  {pickLocalizedText(lang, {
                    en: 'MealPlanner Account & Security',
                    pl: 'Konto i Bezpieczeństwo MealPlanner',
                    az: 'MealPlanner Hesab və Təhlükəsizlik',
                  })}
                </h3>
              </div>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              <div
                className="mp-tabs-pill-bar"
                style={{ marginBottom: 14, gridTemplateColumns: 'repeat(4, 1fr)' }}
              >
                <button
                  className={`mp-tab-pill-btn ${authTab === 'login' ? 'active' : ''}`}
                  onClick={() => {
                    setErrorMsg(null);
                    setAuthTab('login');
                  }}
                >
                  {t.login}
                </button>
                <button
                  className={`mp-tab-pill-btn ${authTab === 'register' ? 'active' : ''}`}
                  onClick={() => {
                    setErrorMsg(null);
                    setAuthTab('register');
                  }}
                >
                  {t.register}
                </button>
                <button
                  className={`mp-tab-pill-btn ${authTab === 'recover' ? 'active' : ''}`}
                  onClick={() => {
                    setErrorMsg(null);
                    setAuthTab('recover');
                  }}
                >
                  {t.resetPassword}
                </button>
                <button
                  className={`mp-tab-pill-btn ${authTab === 'delete' ? 'active' : ''}`}
                  style={authTab === 'delete' ? { background: '#DC2626', color: '#FFFFFF' } : { color: '#DC2626' }}
                  onClick={() => {
                    setErrorMsg(null);
                    setAuthTab('delete');
                  }}
                  data-testid="tab-delete-account"
                >
                  {t.deleteAccount}
                </button>
              </div>

              {errorMsg && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 10, marginBottom: 10, fontSize: 12 }}>
                  {errorMsg}
                </div>
              )}

              {authTab === 'login' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    className="mp-input"
                    placeholder="E-mail"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                  <input
                    className="mp-input"
                    type="password"
                    placeholder={pickLocalizedText(lang, {
                      en: 'Password',
                      pl: 'Hasło',
                      az: 'Şifrə',
                    })}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                  <button
                    className="mp-primary-cta-btn"
                    onClick={async () => {
                      setErrorMsg(null);
                      try {
                        await onLogin(authEmail, authPassword);
                        onClose();
                      } catch (err: any) {
                        setErrorMsg(err.message);
                      }
                    }}
                  >
                    {t.login}
                  </button>
                  <button
                    className="mp-outline-btn"
                    onClick={() => {
                      onLogout();
                      onClose();
                    }}
                  >
                    {t.logout}
                  </button>
                </div>
              )}

              {authTab === 'register' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    className="mp-input"
                    placeholder={pickLocalizedText(lang, {
                      en: 'Full Name',
                      pl: 'Imię i nazwisko',
                      az: 'Ad və soyad',
                    })}
                    value={authDisplayName}
                    onChange={(e) => setAuthDisplayName(e.target.value)}
                  />
                  <input
                    className="mp-input"
                    placeholder="E-mail"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                  <input
                    className="mp-input"
                    type="password"
                    placeholder={pickLocalizedText(lang, {
                      en: 'Password (min 6 chars)',
                      pl: 'Hasło (min. 6 znaków)',
                      az: 'Şifrə (min. 6 simvol)',
                    })}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                  />
                  <button
                    className="mp-primary-cta-btn"
                    onClick={async () => {
                      setErrorMsg(null);
                      try {
                        await onRegister({
                          email: authEmail,
                          password: authPassword,
                          displayName: authDisplayName,
                          language: lang,
                          regionCode: activeRegion,
                          currencyCode: activeCurrency,
                          householdSize: 2,
                          weeklyBudgetPln: activeCurrency === 'AZN' ? 110 : 250,
                          preferredSupermarket: resolveValidSupermarketForRegion(undefined, activeRegion),
                        });
                        onClose();
                      } catch (err: any) {
                        setErrorMsg(err.message);
                      }
                    }}
                  >
                    {t.register}
                  </button>
                </div>
              )}

              {authTab === 'recover' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    className="mp-input"
                    placeholder="E-mail"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                  />
                  {!recoveryCodeSent ? (
                    <button
                      className="mp-primary-cta-btn"
                      onClick={async () => {
                        setErrorMsg(null);
                        try {
                          const res = await onRecoverPassword(authEmail);
                          setRecoveryCodeSent(res.recoveryCodeDemo || 'SENT');
                          setRecoveryCodeInput(res.recoveryCodeDemo || '');
                        } catch (err: any) {
                          setErrorMsg(err.message);
                        }
                      }}
                    >
                      {pickLocalizedText(lang, {
                        en: 'Send Recovery Code',
                        pl: 'Wyślij kod odzyskiwania hasła',
                        az: 'Şifrə bərpa kodunu göndər',
                      })}
                    </button>
                  ) : (
                    <>
                      <div style={{ fontSize: 11.5, color: '#15803D', fontWeight: 700 }}>
                        {pickLocalizedText(lang, {
                          en: 'Recovery Code:',
                          pl: 'Kod odzyskiwania:',
                          az: 'Bərpa kodu:',
                        })}{' '}
                        {recoveryCodeSent}
                      </div>
                      <input
                        className="mp-input"
                        placeholder={pickLocalizedText(lang, {
                          en: 'Recovery Code',
                          pl: 'Kod odzyskiwania',
                          az: 'Bərpa kodu',
                        })}
                        value={recoveryCodeInput}
                        onChange={(e) => setRecoveryCodeInput(e.target.value)}
                      />
                      <input
                        className="mp-input"
                        type="password"
                        placeholder={pickLocalizedText(lang, {
                          en: 'New Password',
                          pl: 'Nowe hasło',
                          az: 'Yeni şifrə',
                        })}
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                      />
                      <button
                        className="mp-primary-cta-btn"
                        onClick={async () => {
                          setErrorMsg(null);
                          try {
                            await onResetPassword(authEmail, recoveryCodeInput, authPassword);
                            onClose();
                          } catch (err: any) {
                            setErrorMsg(err.message);
                          }
                        }}
                      >
                        {t.resetPassword}
                      </button>
                    </>
                  )}
                </div>
              )}

              {authTab === 'delete' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div
                    style={{
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 11.5,
                      color: '#7F1D1D',
                      lineHeight: 1.45,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>
                      ⚠️{' '}
                      {pickLocalizedText(lang, {
                        en: 'Permanent Account & Associated Data Deletion',
                        pl: 'Trwałe Usunięcie Konta i Wszystkich Danych',
                        az: 'Hesabın və Əlaqəli Məlumatların Həmişəlik Silinməsi',
                      })}
                    </div>
                    <div>
                      {pickLocalizedText(lang, {
                        en: `Deleting account "${state.user.email}" permanently and irreversibly purges your user profile, household settings, dietary & allergy preferences, saved meal plans, shopping lists, pantry inventory, and custom recipes.`,
                        pl: `Usunięcie konta "${state.user.email}" trwale i nieodwracalnie usuwa profil użytkownika, ustawienia gospodarstwa domowego, preferencje dietetyczne i alergie, plany posiłków, listy zakupów, spiżarnię oraz własne przepisy.`,
                        az: `"${state.user.email}" hesabının silinməsi istifadəçi profilinizi, ailə tənzimləmələrini, pəhriz və allergiya seçimlərini, yemək planlarını, alış-veriş siyahılarını, anbarı və fərdi reseptləri həmişəlik silir.`,
                      })}
                    </div>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: '#1F2937',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={confirmPermanentDelete}
                      onChange={(e) => setConfirmPermanentDelete(e.target.checked)}
                      style={{ marginTop: 2 }}
                      data-testid="checkbox-confirm-delete-account"
                    />
                    <span>
                      {pickLocalizedText(lang, {
                        en: 'I confirm that I want to permanently delete my account and all associated personal data.',
                        pl: 'Potwierdzam, że chcę trwale usunąć moje konto oraz wszystkie powiązane dane osobowe.',
                        az: 'Hesabımı və bütün əlaqəli şəxsi məlumatlarımı həmişəlik silmək istədiyimi təsdiqləyirəm.',
                      })}
                    </span>
                  </label>

                  <button
                    className="mp-primary-cta-btn"
                    style={{
                      background: confirmPermanentDelete ? '#DC2626' : '#9CA3AF',
                      cursor: confirmPermanentDelete ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!confirmPermanentDelete || busy}
                    data-testid="btn-confirm-delete-account"
                    onClick={async () => {
                      if (!confirmPermanentDelete) return;
                      setBusy(true);
                      setErrorMsg(null);
                      try {
                        await onDeleteAccount();
                        setConfirmPermanentDelete(false);
                        onClose();
                      } catch (err: any) {
                        setErrorMsg(err.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Trash2 size={15} />{' '}
                    {pickLocalizedText(lang, {
                      en: 'Permanently Delete Account & Data',
                      pl: 'Trwale Usuń Konto i Dane',
                      az: 'Hesabı və Məlumatları Həmişəlik Sil',
                    })}
                  </button>

                  <button
                    type="button"
                    className="mp-outline-btn"
                    onClick={async () => {
                      await onExportUserData();
                    }}
                    data-testid="btn-export-user-data"
                  >
                    📥{' '}
                    {pickLocalizedText(lang, {
                      en: 'Export My Personal Data (GDPR JSON)',
                      pl: 'Eksportuj Moje Dane Osobowe (RODO JSON)',
                      az: 'Şəxsi Məlumatlarımı İxrac Et (GDPR JSON)',
                    })}
                  </button>

                  <div style={{ fontSize: 10.5, color: '#647067', textAlign: 'center' }}>
                    {pickLocalizedText(lang, {
                      en: 'Web deletion portal (without app):',
                      pl: 'Formularz usunięcia konta przez www:',
                      az: 'Veb vasitəsilə hesab silmə portalı:',
                    })}{' '}
                    <a
                      href="/delete-account"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#196431', fontWeight: 700 }}
                    >
                      /delete-account
                    </a>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* === 8. PRIVACY & TERMS MODAL === */}
        {activeModal === 'privacy' && (
          <>
            <div className="mp-modal-header">
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>{t.privacyTerms}</h3>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body" style={{ fontSize: 12.5, lineHeight: 1.55, color: '#374151' }}>
              <p style={{ marginBottom: 10 }}>
                <strong>
                  {pickLocalizedText(lang, {
                    en: '1. Data Protection & Account Isolation (GDPR):',
                    pl: '1. Ochrona Danych i Izolacja Kont (RODO / GDPR):',
                    az: '1. Məlumatların Qorunması və Hesab İzolyasiyası (GDPR):',
                  })}
                </strong>{' '}
                {pickLocalizedText(lang, {
                  en: 'Every user account (region, currency, dietary preferences, allergies, meal plans, shopping lists, and pantry inventory) is strictly isolated in SQLite and protected via JWT authentication. No personal data is sold or shared with third-party advertisers.',
                  pl: 'Dane każdego użytkownika (region, waluta, preferencje żywieniowe, alergie, plany posiłków, lista zakupów oraz zawartość spiżarni) są ściśle izolowane w bazie SQLite oraz chronione tokenami JWT. Dane nie są sprzedawane ani udostępniane reklamodawcom.',
                  az: 'Hər bir istifadəçinin məlumatları (region, valyuta, pəhriz seçimləri, allergiyalar, yemək planları, alış-veriş siyahısı və anbar) SQLite bazasında tam izolyasiya olunur və JWT ilə qorunur. Şəxsi məlumatlar üçüncü tərəflərə satılmır.',
                })}
              </p>
              <p style={{ marginBottom: 10 }}>
                <strong>
                  {pickLocalizedText(lang, {
                    en: '2. Multi-Region Supermarket Pricing Transparency:',
                    pl: '2. Transparentność Cen Supermarketów (Polska i Azerbejdżan):',
                    az: '2. Çoxregionlu Market Qiymətləri Şəffaflığı (Polşa və Azərbaycan):',
                  })}
                </strong>{' '}
                {pickLocalizedText(lang, {
                  en: 'MealPlanner uses dedicated regional catalogues for Poland (Biedronka, Lidl, Auchan, Kaufland in PLN) and Azerbaijan (Bravo, Araz, Bazarstore, Rahat in AZN) with clear verification status and loyalty card requirements.',
                  pl: 'Aplikacja wykorzystuje dedykowane katalogi regionalne dla Polski (Biedronka, Lidl, Auchan, Kaufland w PLN) oraz Azerbejdżanu (Bravo, Araz, Bazarstore, Rahat w AZN) ze statusem weryfikacji oraz wymogami kart lojalnościowych.',
                  az: 'Tətbiq Polşa (PLN ilə Biedronka, Lidl, Auchan, Kaufland) və Azərbaycan (AZN ilə Bravo, Araz, Bazarstore, Rahat) üçün ayrıca yerli kataloqlardan və sadiqlik kartı şərtlərindən istifadə edir.',
                })}
              </p>
              <p style={{ marginBottom: 10 }}>
                <strong>
                  {pickLocalizedText(lang, {
                    en: '3. Deterministic Allergy Safety & Nutritional Disclaimer:',
                    pl: '3. Bezpieczeństwo Alergii i Zastrzeżenie Medyczne:',
                    az: '3. Allergiya Təhlükəsizliyi və Tibbi Xəbərdarlıq:',
                  })}
                </strong>{' '}
                {pickLocalizedText(lang, {
                  en: 'All AI-generated meal plans undergo mandatory server-side validation against declared allergies and excluded ingredients. Nutritional figures and recipes are for informational meal planning only and do not constitute medical or clinical advice. Always verify physical product labels for allergens.',
                  pl: 'Wszystkie plany posiłków przechodzą obowiązkową walidację po stronie serwera pod kątem alergii i wykluczonych składników. Wartości odżywcze mają charakter informacyjny i nie stanowią porady lekarskiej. Zawsze sprawdzaj fizyczne etykiety produktów.',
                  az: 'Bütün süni intellekt yemək planları bəyan edilmiş allergiya və istisna olunan ərzaqlara qarşı server tərəfindən məcburi yoxlanılır. Qida dəyərləri yalnız məlumat məqsədlidir və tibbi məsləhət deyil. Həmişə fiziki məhsul etiketlərini yoxlayın.',
                })}
              </p>
              <p style={{ marginBottom: 12 }}>
                <strong>
                  {pickLocalizedText(lang, {
                    en: '4. Account Deletion & Data Retention (Google Play Policy):',
                    pl: '4. Usuwanie Konta i Retencja Danych (Polityka Google Play):',
                    az: '4. Hesabın Silinməsi və Məlumatların Saxlanması (Google Play Siyasəti):',
                  })}
                </strong>{' '}
                {pickLocalizedText(lang, {
                  en: 'You can permanently delete your account and all associated data at any time inside the app (Profile → Account & Security → Delete Account) or on the web at /delete-account without reinstalling the app.',
                  pl: 'Możesz w każdej chwili trwale usunąć konto i wszystkie dane w aplikacji (Profil → Konto i Bezpieczeństwo → Usuń konto) lub przez stronę /delete-account bez instalowania aplikacji.',
                  az: 'Hesabınızı və bütün məlumatlarınızı istənilən vaxt tətbiq daxilində (Profil → Hesabı sil) və ya /delete-account veb səhifəsindən həmişəlik silə bilərsiniz.',
                })}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="mp-outline-btn"
                  style={{ flex: 1 }}
                  onClick={async () => {
                    await onExportUserData();
                  }}
                >
                  📥{' '}
                  {pickLocalizedText(lang, {
                    en: 'Export Data (GDPR)',
                    pl: 'Eksportuj dane (RODO)',
                    az: 'Məlumatları ixrac et',
                  })}
                </button>
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mp-outline-btn"
                  style={{ flex: 1, textDecoration: 'none' }}
                >
                  🌐{' '}
                  {pickLocalizedText(lang, {
                    en: 'Public Privacy Page',
                    pl: 'Strona Prywatności',
                    az: 'Məxfilik Səhifəsi',
                  })}
                </a>
                <a
                  href="/delete-account"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mp-outline-btn"
                  style={{ flex: 1, textDecoration: 'none', color: '#DC2626', borderColor: '#FECACA' }}
                >
                  🗑️{' '}
                  {pickLocalizedText(lang, {
                    en: 'Web Deletion Portal',
                    pl: 'Usuwanie przez WWW',
                    az: 'Veb Hesab Silmə',
                  })}
                </a>
              </div>
            </div>
          </>
        )}

        {/* === 9. AI CONTENT REPORTING / FLAGGING MODAL (Google Play AI-Generated Content Policy) === */}
        {activeModal === 'ai_report' && (
          <>
            <div className="mp-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={19} color="#D97706" />
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                  {pickLocalizedText(lang, {
                    en: 'Report AI-Generated Content',
                    pl: 'Zgłoś Treść Wygenerowaną przez AI',
                    az: 'Süni İntellekt Məzmununu Şikayət Et',
                  })}
                </h3>
              </div>
              <button className="mp-icon-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
            <div className="mp-modal-body">
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 11.5,
                  color: '#92400E',
                  marginBottom: 12,
                }}
              >
                {pickLocalizedText(lang, {
                  en: 'Found an inaccurate allergen tag, unsuitable AI meal suggestion, or incorrect nutritional/price estimate? Flag it below for immediate review.',
                  pl: 'Zauważyłeś nieprawidłowy alergen, nieodpowiednią propozycję posiłku AI lub błąd w wartościach odżywczych? Zgłoś to poniżej.',
                  az: 'Yanlış allergen qeydi, uyğunsuz AI yemək təklifi və ya qida dəyəri xətası gördünüz? Aşağıda bizə bildirin.',
                })}
              </div>

              {errorMsg && (
                <div style={{ background: '#FEE2E2', color: '#991B1B', padding: 10, borderRadius: 10, marginBottom: 10, fontSize: 12 }}>
                  {errorMsg}
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  {pickLocalizedText(lang, {
                    en: 'What are you reporting?',
                    pl: 'Czego dotyczy zgłoszenie?',
                    az: 'Nə barədə məlumat verirsiniz?',
                  })}
                </label>
                <select
                  className="mp-input"
                  value={reportTargetType}
                  onChange={(e) => setReportTargetType(e.target.value as any)}
                >
                  <option value="meal_plan">
                    {pickLocalizedText(lang, {
                      en: 'AI Weekly Meal Plan',
                      pl: 'Tygodniowy Plan Posiłków AI',
                      az: 'Həftəlik AI Yemək Planı',
                    })}
                  </option>
                  <option value="recipe">
                    {pickLocalizedText(lang, {
                      en: 'Recipe Instructions / Ingredients',
                      pl: 'Przepis / Składniki',
                      az: 'Resept / Ərzaqlar',
                    })}
                  </option>
                  <option value="ingredient_match">
                    {pickLocalizedText(lang, {
                      en: 'Supermarket Product Match / Price',
                      pl: 'Dopasowanie Produktu / Cena w sklepie',
                      az: 'Market Məhsul Uyğunluğu / Qiymət',
                    })}
                  </option>
                  <option value="other">
                    {pickLocalizedText(lang, { en: 'Other', pl: 'Inne', az: 'Digər' })}
                  </option>
                </select>
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  {pickLocalizedText(lang, {
                    en: 'Issue Category',
                    pl: 'Kategoria problemu',
                    az: 'Problem kateqoriyası',
                  })}
                </label>
                <select
                  className="mp-input"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value as any)}
                >
                  <option value="allergen_safety">
                    {pickLocalizedText(lang, {
                      en: 'Allergen or dietary restriction concern',
                      pl: 'Problem z alergenem lub dietą',
                      az: 'Allergen və ya pəhriz uyğunsuzluğu',
                    })}
                  </option>
                  <option value="inaccurate_nutrition">
                    {pickLocalizedText(lang, {
                      en: 'Inaccurate nutrition or cooking steps',
                      pl: 'Nieścisłe wartości odżywcze lub kroki',
                      az: 'Qeyri-dəqiq qida dəyəri və ya bişirmə qaydası',
                    })}
                  </option>
                  <option value="wrong_price_or_product">
                    {pickLocalizedText(lang, {
                      en: 'Incorrect package size or store price',
                      pl: 'Błędna gramatura lub cena produktu',
                      az: 'Yanlış qablaşdırma ölçüsü və ya qiymət',
                    })}
                  </option>
                  <option value="inappropriate_content">
                    {pickLocalizedText(lang, {
                      en: 'Inappropriate or offensive AI content',
                      pl: 'Nieodpowiednia treść AI',
                      az: 'Uyğunsuz süni intellekt məzmunu',
                    })}
                  </option>
                  <option value="other">
                    {pickLocalizedText(lang, { en: 'Other feedback', pl: 'Inna uwaga', az: 'Digər rəy' })}
                  </option>
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  {pickLocalizedText(lang, {
                    en: 'Details',
                    pl: 'Opis zgłoszenia',
                    az: 'Ətraflı məlumat',
                  })}
                </label>
                <textarea
                  className="mp-input"
                  rows={3}
                  placeholder={pickLocalizedText(lang, {
                    en: 'Describe the issue so we can improve safety and accuracy...',
                    pl: 'Opisz problem, abyśmy mogli poprawić bezpieczeństwo...',
                    az: 'Təhlükəsizlik və dəqiqliyi artırmaq üçün problemi təsvir edin...',
                  })}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  data-testid="input-ai-report-details"
                />
              </div>

              <button
                className="mp-primary-cta-btn"
                disabled={busy}
                data-testid="btn-submit-ai-report"
                onClick={async () => {
                  if (!reportDetails.trim()) {
                    setErrorMsg(
                      pickLocalizedText(lang, {
                        en: 'Please provide brief details about the issue.',
                        pl: 'Podaj krótki opis zgłoszenia.',
                        az: 'Zəhmət olmasa problem haqqında qısa məlumat yazın.',
                      })
                    );
                    return;
                  }
                  setBusy(true);
                  setErrorMsg(null);
                  try {
                    await onReportAiContent({
                      targetType: reportTargetType,
                      targetId: state.weeklyPlan.id,
                      reasonCategory: reportReason,
                      details: reportDetails.trim(),
                    });
                    setReportDetails('');
                    onClose();
                  } catch (err: any) {
                    setErrorMsg(err.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Check size={16} />{' '}
                {pickLocalizedText(lang, {
                  en: 'Submit Content Report',
                  pl: 'Wyślij Zgłoszenie',
                  az: 'Şikayəti Göndər',
                })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
