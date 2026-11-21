import React, { useEffect, useState } from 'react';
import {
  Home,
  Calendar,
  UtensilsCrossed,
  ShoppingCart,
  User as UserIcon,
  Bell,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  Heart,
  Share2,
  Clock,
  Flame,
  Users,
  Coins,
  RefreshCw,
  Plus,
  Check,
  ExternalLink,
  Sliders,
  Wallet,
  Store,
  Package,
  Globe,
  Sparkles,
  Search,
  Smartphone,
  LayoutGrid,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import {
  CurrencyCode,
  Language,
  MealType,
  Recipe,
  RegionCode,
  ShoppingCategory,
  SupermarketSlug,
} from '../shared/types';
import {
  CURRENCIES,
  REGIONS,
  getCatalogueSupermarketsForRegion,
  getDefaultCurrencyForRegion,
  pickLocalizedList,
  pickLocalizedText,
  localizeQuantityLabel,
  formatMinutes,
  formatItemsCount,
  handleMealImageError,
} from '../shared/regionConfig';
import { formatPln, translations } from '../shared/i18n';
import {
  buildDetailedCookingSteps,
  formatScaledIngredientAmount,
  getRecipeCookingMetadata,
} from '../shared/recipeGuide';
import { AppStatePayload, clientApi, setAuthToken } from './api/clientApi';
import { AndroidStatusBar, ChefHatLogo, SupermarketLogo } from './components/BrandAssets';
import { ActiveModalType, AppModals } from './components/Modals';

export type NavTab = 'home' | 'meal_plan' | 'recipes' | 'shopping' | 'profile';

const DAY_LABELS_EN = [
  { short: 'Mon', num: '10', full: 'Monday, Nov 10' },
  { short: 'Tue', num: '11', full: 'Tuesday, Nov 11' },
  { short: 'Wed', num: '12', full: 'Wednesday, Nov 12' },
  { short: 'Thu', num: '13', full: 'Thursday, Nov 13' },
  { short: 'Fri', num: '14', full: 'Friday, Nov 14' },
  { short: 'Sat', num: '15', full: 'Saturday, Nov 15' },
  { short: 'Sun', num: '16', full: 'Sunday, Nov 16' },
];

const DAY_LABELS_PL = [
  { short: 'Pon', num: '10', full: 'Poniedziałek, 10 lis' },
  { short: 'Wt', num: '11', full: 'Wtorek, 11 lis' },
  { short: 'Śr', num: '12', full: 'Środa, 12 lis' },
  { short: 'Czw', num: '13', full: 'Czwartek, 13 lis' },
  { short: 'Pt', num: '14', full: 'Piątek, 14 lis' },
  { short: 'Sob', num: '15', full: 'Sobota, 15 lis' },
  { short: 'Ndz', num: '16', full: 'Niedziela, 16 lis' },
];

const DAY_LABELS_AZ = [
  { short: 'B.e', num: '10', full: 'Bazar ertəsi, 10 noy' },
  { short: 'Ç.a', num: '11', full: 'Çərşənbə axşamı, 11 noy' },
  { short: 'Çər', num: '12', full: 'Çərşənbə, 12 noy' },
  { short: 'C.a', num: '13', full: 'Cümə axşamı, 13 noy' },
  { short: 'Cüm', num: '14', full: 'Cümə, 14 noy' },
  { short: 'Şən', num: '15', full: 'Şənbə, 15 noy' },
  { short: 'Baz', num: '16', full: 'Bazar, 16 noy' },
];

function getRecipeBaseCostForCurrency(recipe: Recipe, currencyCode: CurrencyCode): number {
  if (currencyCode === 'AZN') {
    if (typeof recipe.estimatedCostAzn === 'number' && recipe.estimatedCostAzn > 0) {
      return recipe.estimatedCostAzn;
    }
    return Number((recipe.estimatedCostPln * 0.425).toFixed(2));
  }
  return recipe.estimatedCostPln;
}

function getStoreDisplayName(slug: SupermarketSlug): string {
  switch (slug) {
    case 'biedronka':
      return 'Biedronka';
    case 'lidl':
      return 'Lidl';
    case 'auchan':
      return 'Auchan';
    case 'kaufland':
      return 'Kaufland';
    case 'carrefour':
      return 'Carrefour';
    case 'zabka':
      return 'Żabka';
    case 'bravo':
      return 'Bravo';
    case 'araz':
      return 'Araz';
    case 'bazarstore':
      return 'Bazarstore';
    case 'rahat':
      return 'Rahat';
    case 'oba':
      return 'OBA Market';
    case 'birmarket':
      return 'Birmarket';
    default:
      return String(slug);
  }
}

export const MealPlannerApp: React.FC = () => {
  const [state, setState] = useState<AppStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  // Default to 5-phone showcase on wide desktop (>=1150px) so the user immediately sees the exact 5-phone layout from their photo,
  // and single-phone mode on mobile/narrow viewports, with a 1-click toggle button in the top bar!
  const [viewMode, setViewMode] = useState<'showcase_5' | 'single_phone'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1150 ? 'showcase_5' : 'single_phone'
  );

  const [selectedDayIndex, setSelectedDayIndex] = useState(0); // Monday Nov 10
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipesViewMode, setRecipesViewMode] = useState<'detail' | 'discovery'>('detail');
  const [recipeTab, setRecipeTab] = useState<'ingredients' | 'instructions' | 'nutrition'>('ingredients');
  const [checkedRecipeIngs, setCheckedRecipeIngs] = useState<Record<string, boolean>>({
    'ing-gcr-1': true,
    'ing-gcr-2': true,
  });
  const [checkedCookingSteps, setCheckedCookingSteps] = useState<Record<string, boolean>>({});
  const [recipeServingsOverride, setRecipeServingsOverride] = useState<number>(2);

  // Recipe Discovery state
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeFilter, setRecipeFilter] = useState<string>('All');

  // Shopping List state
  const [shopFilter, setShopFilter] = useState<'all' | 'to_buy' | 'bought'>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [showManualAddBar, setShowManualAddBar] = useState(false);
  const [manualItemName, setManualItemName] = useState('');
  const [manualItemPrice, setManualItemPrice] = useState('4.99');

  // Modals & notifications
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [targetMealSlot, setTargetMealSlot] = useState<{
    dayIndex: number;
    mealType: MealType;
    plannedMealId?: string;
  } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  useEffect(() => {
    clientApi
      .bootstrap()
      .then((data) => {
        setState(data);
        const defaultRec =
          data.recipes.find((r) => r.id === 'rec-grilled-chicken-rice') || data.recipes[0] || null;
        setSelectedRecipe(defaultRec);
        if (defaultRec) setRecipeServingsOverride(defaultRec.baseServings);

        // Pre-warm image cache in idle time to eliminate image flash when switching tabs or recipes
        if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
          const urls = new Set<string>();
          for (const r of data.recipes) {
            if (r.imageUrl) urls.add(r.imageUrl);
          }
          for (const o of data.promotionalOffers) {
            if (o.imageUrl) urls.add(o.imageUrl);
          }
          const warmImages = () => {
            urls.forEach((u) => {
              const img = new Image();
              img.decoding = 'async';
              img.src = u;
            });
          };
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(warmImages, { timeout: 1500 });
          } else {
            setTimeout(warmImages, 250);
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const currentLang: Language = state?.user.language || 'en';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLang;
    }
  }, [currentLang]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__handleAndroidBack = () => {
        if (activeModal !== null) {
          setActiveModal(null);
          return true;
        }
        if (recipesViewMode === 'discovery' && activeTab === 'recipes') {
          setRecipesViewMode('detail');
          return true;
        }
        if (activeTab !== 'home') {
          setActiveTab('home');
          return true;
        }
        return false;
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__handleAndroidBack;
      }
    };
  }, [activeModal, activeTab, recipesViewMode]);

  if (loading || !state) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <ChefHatLogo size={56} />
        <div style={{ fontSize: 18, fontWeight: 800, color: '#196431' }}>
          Loading MealPlanner...
        </div>
      </div>
    );
  }

  const lang: Language = state.user.language || 'en';
  const t = translations[lang] || translations.en;
  const activeRegion: RegionCode =
    state.user.regionCode || state.user.preferences.regionCode || 'PL';
  const activeCurrency: CurrencyCode =
    state.user.currencyCode ||
    state.user.preferences.currencyCode ||
    getDefaultCurrencyForRegion(activeRegion);

  const dayLabels =
    lang === 'az' ? DAY_LABELS_AZ : lang === 'pl' ? DAY_LABELS_PL : DAY_LABELS_EN;
  const activeCatalogueStores = getCatalogueSupermarketsForRegion(activeRegion);

  // Displayed total cost & budget in active regional currency
  const displayBasketCost = state.shoppingList.estimatedTotalPln;
  const displayBudget = state.user.preferences.weeklyBudgetPln;
  const displayRemaining = Number((displayBudget - displayBasketCost).toFixed(2));
  const displayBudgetPct = Math.min(
    100,
    Math.round((displayBasketCost / Math.max(1, displayBudget)) * 100)
  );

  // Handlers
  const handleSelectSupermarket = async (store: SupermarketSlug) => {
    const next = await clientApi.updateShoppingSettings({ supermarketId: store });
    setState(next);
    showToast(
      pickLocalizedText(lang, {
        en: `Selected supermarket: ${getStoreDisplayName(store)} — local prices updated!`,
        pl: `Wybrano supermarket: ${getStoreDisplayName(store)} — przeliczono ceny koszyka!`,
        az: `Market seçildi: ${getStoreDisplayName(store)} — səbət qiymətləri yeniləndi!`,
      })
    );
  };

  const handleGenerateWeek = async () => {
    setIsGeneratingPlan(true);
    try {
      const next = await clientApi.generateMealPlan();
      setState(next);
      showToast(
        pickLocalizedText(lang, {
          en: 'Generated new 7-day AI meal plan!',
          pl: 'Wygenerowano nowy 7-dniowy plan posiłków AI!',
          az: 'Yeni 7 günlük AI yemək planı yaradıldı!',
        })
      );
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleCycleLanguage = async () => {
    const order: Language[] = ['en', 'pl', 'az'];
    const nextLang = order[(order.indexOf(lang) + 1) % order.length];
    // Instant optimistic language switch for 0ms UI responsiveness
    setState((prev) =>
      prev
        ? {
            ...prev,
            user: {
              ...prev.user,
              language: nextLang,
            },
          }
        : prev
    );
    const next = await clientApi.updatePreferences({ language: nextLang });
    setState(next);
    showToast(
      nextLang === 'az'
        ? 'Dil Azərbaycan dilinə dəyişdirildi'
        : nextLang === 'pl'
        ? 'Język zmieniony na Polski'
        : 'Language switched to English'
    );
  };

  const handleToggleRegionQuick = async () => {
    const nextRegion: RegionCode = activeRegion === 'PL' ? 'AZ' : 'PL';
    const next = await clientApi.updatePreferences({
      regionCode: nextRegion,
      currencyCode: getDefaultCurrencyForRegion(nextRegion),
    });
    setState(next);
    showToast(
      pickLocalizedText(lang, {
        en:
          nextRegion === 'AZ'
            ? 'Switched to 🇦🇿 Azerbaijan (AZN ₼ • Bravo, Araz, Bazarstore, Rahat)'
            : 'Switched to 🇵🇱 Poland (PLN zł • Biedronka, Lidl, Auchan, Kaufland)',
        pl:
          nextRegion === 'AZ'
            ? 'Zmieniono region na 🇦🇿 Azerbejdżan (AZN ₼ • Bravo, Araz, Bazarstore, Rahat)'
            : 'Zmieniono region na 🇵🇱 Polskę (PLN zł • Biedronka, Lidl, Auchan, Kaufland)',
        az:
          nextRegion === 'AZ'
            ? 'Region 🇦🇿 Azərbaycan olaraq dəyişdirildi (AZN ₼ • Bravo, Araz, Bazarstore, Rahat)'
            : 'Region 🇵🇱 Polşa olaraq dəyişdirildi (PLN zł • Biedronka, Lidl, Auchan, Kaufland)',
      })
    );
  };

  const handleToggleNotifications = async () => {
    const current = state.user.preferences.notifications.enabled;
    setState((prev) =>
      prev
        ? {
            ...prev,
            user: {
              ...prev.user,
              preferences: {
                ...prev.user.preferences,
                notifications: {
                  ...prev.user.preferences.notifications,
                  enabled: !current,
                },
              },
            },
          }
        : prev
    );
    const next = await clientApi.updatePreferences({
      notifications: {
        ...state.user.preferences.notifications,
        enabled: !current,
      },
    });
    setState(next);
    showToast(
      !current
        ? pickLocalizedText(lang, {
            en: 'Notifications enabled',
            pl: 'Powiadomienia włączone',
            az: 'Bildirişlər aktiv edildi',
          })
        : pickLocalizedText(lang, {
            en: 'Notifications disabled',
            pl: 'Powiadomienia wyłączone',
            az: 'Bildirişlər deaktiv edildi',
          })
    );
  };

  // Bottom Navigation Renderer inside each Phone Frame
  const renderBottomNav = (currentScreenTab: NavTab) => (
    <nav className="mp-bottom-nav">
      <button
        className={`mp-nav-tab ${currentScreenTab === 'home' ? 'active' : ''}`}
        onClick={() => setActiveTab('home')}
      >
        <Home size={18} />
        <span>{t.navHome}</span>
      </button>
      <button
        className={`mp-nav-tab ${currentScreenTab === 'meal_plan' ? 'active' : ''}`}
        onClick={() => setActiveTab('meal_plan')}
      >
        <Calendar size={18} />
        <span>{t.navMealPlan}</span>
      </button>
      <button
        className={`mp-nav-tab ${currentScreenTab === 'recipes' ? 'active' : ''}`}
        onClick={() => setActiveTab('recipes')}
      >
        <UtensilsCrossed size={18} />
        <span>{t.navRecipes}</span>
      </button>
      <button
        className={`mp-nav-tab ${currentScreenTab === 'shopping' ? 'active' : ''}`}
        onClick={() => setActiveTab('shopping')}
      >
        <ShoppingCart size={18} />
        <span>{t.navShopping}</span>
      </button>
      <button
        className={`mp-nav-tab ${currentScreenTab === 'profile' ? 'active' : ''}`}
        onClick={() => setActiveTab('profile')}
      >
        <UserIcon size={18} />
        <span>{t.navProfile}</span>
      </button>
    </nav>
  );

  // =========================================================================
  // SCREEN 1: HOME SCREEN
  // =========================================================================
  const renderHomeScreen = () => {
    const todaysMeals = state.weeklyPlan.meals.filter((m) => m.dayIndex === selectedDayIndex);
    return (
      <div className="mp-phone-frame" data-testid="screen-home">
        <AndroidStatusBar />
        <div className="mp-screen-scroll">
          {/* App Header */}
          <div className="mp-app-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ChefHatLogo size={30} />
              <span className="mp-app-bar-title">MealPlanner</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setActiveModal('region_settings')}
                style={{
                  border: '1px solid #DCE5DD',
                  background: '#F4F8F4',
                  borderRadius: 999,
                  padding: '3px 8px',
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: '#196431',
                  cursor: 'pointer',
                }}
                title={t.regionSettingsTitle}
                data-testid="home-region-pill"
              >
                {REGIONS[activeRegion].flag} {activeRegion} • {CURRENCIES[activeCurrency].symbol}
              </button>
              <button
                className="mp-icon-btn"
                onClick={handleToggleNotifications}
                title={t.notifications}
              >
                <Bell
                  size={19}
                  color={state.user.preferences.notifications.enabled ? '#196431' : '#647067'}
                />
              </button>
            </div>
          </div>

          {/* Hero AI Card (matches reference photo Screen 1) */}
          <div className="mp-hero-card">
            <div className="mp-hero-text">
              <div className="mp-hero-title">{t.heroTitle}</div>
              <div className="mp-hero-sub">{t.heroSubtitle}</div>
              <button
                className="mp-hero-cta"
                onClick={() => setActiveModal('ai_wizard')}
                disabled={isGeneratingPlan}
                data-testid="btn-generate-ai-plan"
              >
                <Sparkles size={13} />
                {isGeneratingPlan ? t.regeneratingBtn : t.generatePlanBtn}
              </button>
            </div>
            <img
              className="mp-hero-basket-img"
              src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80"
              alt="Fresh groceries basket"
              decoding="async"
              fetchPriority="high"
              onError={handleMealImageError}
            />
          </div>

          {/* 4 Quick Action Cards (matches reference photo Screen 1) */}
          <div className="mp-quick-grid">
            <div
              className="mp-quick-card"
              onClick={() => setActiveTab('meal_plan')}
              data-testid="quick-meal-plan"
            >
              <div className="mp-quick-icon-box" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                📅
              </div>
              <span className="mp-quick-label">{t.quickMealPlan}</span>
            </div>
            <div
              className="mp-quick-card"
              onClick={() => setActiveModal('price_comparison')}
              data-testid="quick-price-comparison"
            >
              <div className="mp-quick-icon-box" style={{ background: '#DCFCE7', color: '#15803D' }}>
                🪙
              </div>
              <span className="mp-quick-label">{t.quickPriceComp}</span>
            </div>
            <div
              className="mp-quick-card"
              onClick={() => setActiveTab('shopping')}
              data-testid="quick-shopping-list"
            >
              <div className="mp-quick-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}>
                📋
              </div>
              <span className="mp-quick-label">{t.quickShoppingList}</span>
            </div>
            <div
              className="mp-quick-card"
              onClick={() => setActiveModal('pantry')}
              data-testid="quick-pantry"
            >
              <div className="mp-quick-icon-box" style={{ background: '#DBEAFE', color: '#2563EB' }}>
                👥
              </div>
              <span className="mp-quick-label">{t.quickFamilySharing}</span>
            </div>
          </div>

          {/* Current Offers Section (Region-aware: Biedronka/Lidl/Auchan in PL, Bravo/Araz/Bazarstore in AZ) */}
          <div className="mp-section-row">
            <span className="mp-section-title">{t.currentOffers}</span>
            <button className="mp-section-link" onClick={() => setActiveModal('price_comparison')}>
              {t.seeAll}
            </button>
          </div>
          <div className="mp-offers-grid">
            {state.promotionalOffers.map((offer) => {
              const isYellow = offer.supermarketId === 'biedronka';
              return (
                <button
                  key={offer.id}
                  className="mp-offer-card"
                  style={{
                    background: offer.cardBgColor,
                    color: isYellow ? '#1B241E' : '#FFFFFF',
                  }}
                  onClick={() => {
                    handleSelectSupermarket(offer.supermarketId);
                    setActiveModal('price_comparison');
                  }}
                >
                  <span className="mp-offer-store">{offer.supermarketName}</span>
                  <img
                    className="mp-offer-img"
                    src={offer.imageUrl}
                    loading="lazy"
                    decoding="async"
                    onError={handleMealImageError}
                    alt={pickLocalizedText(lang, {
                      en: offer.titleEn,
                      pl: offer.titlePl,
                      az: offer.titleAz,
                    })}
                  />
                  <span className="mp-offer-badge">{offer.discountBadge}</span>
                </button>
              );
            })}
          </div>

          {/* Select Supermarket Section (Active Region's 4 Catalogue Stores) */}
          <div className="mp-section-row">
            <span className="mp-section-title">{t.selectSupermarket}</span>
            <button className="mp-section-link" onClick={() => setActiveModal('price_comparison')}>
              {t.viewAll}
            </button>
          </div>
          <div className="mp-stores-grid">
            {activeCatalogueStores.map((storeSlug) => {
              const selected = state.user.preferences.preferredSupermarket === storeSlug;
              const label = getStoreDisplayName(storeSlug);
              return (
                <button
                  key={storeSlug}
                  className={`mp-store-card ${selected ? 'selected' : ''}`}
                  onClick={() => handleSelectSupermarket(storeSlug)}
                  data-testid={`select-store-${storeSlug}`}
                >
                  <SupermarketLogo store={storeSlug} size={32} />
                  <span className="mp-store-name">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Personal Dashboard Summary Card (Greeting, Budget Progress, Today's Meals & Shopping Progress) */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              padding: 11,
              border: '1px solid #E6E5DF',
              boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800 }}>
                👋 {t.greetingPrefix}, {state.user.displayName.split(' ')[0]}!
              </span>
              <button
                onClick={() => setActiveModal('budget_optimizer')}
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: '#196431',
                  background: '#E5F3E8',
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 999,
                  cursor: 'pointer',
                }}
              >
                {t.budget}: {formatPln(displayBudget, activeCurrency)}
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#647067',
                marginBottom: 5,
              }}
            >
              <span>
                {t.estimatedCost}:{' '}
                <strong style={{ color: '#1B241E' }}>
                  {formatPln(displayBasketCost, activeCurrency)}
                </strong>
              </span>
              <span>
                {displayRemaining >= 0 ? t.remainingBudget : t.overBudget}:{' '}
                <strong style={{ color: displayRemaining >= 0 ? '#15803D' : '#DC2626' }}>
                  {formatPln(Math.abs(displayRemaining), activeCurrency)}
                </strong>
              </span>
            </div>
            <div
              style={{
                height: 6,
                background: '#EAECE8',
                borderRadius: 999,
                overflow: 'hidden',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: `${displayBudgetPct}%`,
                  height: '100%',
                  background: displayRemaining >= 0 ? '#2B8A44' : '#DC2626',
                  transition: 'width 0.3s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.2s',
                }}
              />
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: '#647067',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>
                🍽️ {t.todaysMeals}: {todaysMeals.length}
              </span>
              <span>
                🛒 {state.shoppingList.boughtCount}/{state.shoppingList.totalItemsCount}{' '}
                {t.itemsBought}
              </span>
            </div>
          </div>
        </div>
        {renderBottomNav('home')}
      </div>
    );
  };

  // =========================================================================
  // SCREEN 2: MEAL PLAN SCREEN
  // =========================================================================
  const renderMealPlanScreen = () => {
    const dayMeals = state.weeklyPlan.meals.filter((m) => m.dayIndex === selectedDayIndex);
    const dayCalories = dayMeals.reduce((sum, m) => sum + m.scaledCaloriesKcal, 0);
    const dayCost = dayMeals.reduce((sum, m) => sum + m.scaledCostPln, 0);
    const dayInfo = dayLabels[selectedDayIndex] || dayLabels[0];

    return (
      <div className="mp-phone-frame" data-testid="screen-meal-plan">
        <AndroidStatusBar />
        <div className="mp-screen-scroll">
          {/* Top App Bar */}
          <div className="mp-app-bar">
            <button className="mp-icon-btn" onClick={() => setActiveTab('home')}>
              <ArrowLeft size={19} />
            </button>
            <span className="mp-app-bar-title">{t.navMealPlan}</span>
            <button
              className="mp-icon-btn"
              onClick={handleGenerateWeek}
              title={t.regenerateWeek}
              data-testid="btn-regenerate-week"
            >
              <RefreshCw size={17} />
            </button>
          </div>

          {/* Week Date Range Bar */}
          <div className="mp-week-nav">
            <button
              className="mp-icon-btn"
              style={{ width: 24, height: 24 }}
              onClick={() => setSelectedDayIndex((prev) => Math.max(0, prev - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {pickLocalizedText(lang, {
                en: state.weeklyPlan.weekLabelEn,
                pl: state.weeklyPlan.weekLabelPl,
                az: state.weeklyPlan.weekLabelAz,
              })}
            </span>
            <button
              className="mp-icon-btn"
              style={{ width: 24, height: 24 }}
              onClick={() => setSelectedDayIndex((prev) => Math.min(6, prev + 1))}
            >
              <Calendar size={15} />
            </button>
          </div>

          {/* 7-Day Horizontal Pill Strip (Mon 10 .. Sun 16) */}
          <div className="mp-days-strip">
            {dayLabels.map((d, idx) => (
              <button
                key={d.num}
                className={`mp-day-pill ${selectedDayIndex === idx ? 'active' : ''}`}
                onClick={() => setSelectedDayIndex(idx)}
                data-testid={`day-pill-${idx}`}
              >
                <span className="mp-day-name">{d.short}</span>
                <span className="mp-day-num">{d.num}</span>
              </button>
            ))}
          </div>

          {/* Selected Day Title & Kcal / Est. Cost Summary */}
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1B241E' }}>{dayInfo.full}</div>
              <div style={{ fontSize: 11.5, color: '#647067', marginTop: 2 }}>
                {dayCalories.toLocaleString('pl-PL')} kcal • {t.estCostShort}:{' '}
                {formatPln(dayCost, activeCurrency)}
              </div>
            </div>
            <button
              onClick={() => setActiveModal('ai_wizard')}
              data-testid="btn-open-ai-wizard-mealplan"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 9px',
                borderRadius: 999,
                border: '1px solid #CBE4D2',
                background: '#ECF8F0',
                color: '#196431',
                fontSize: 10.5,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <Sparkles size={12} />
              <span>
                {pickLocalizedText(lang, {
                  en: `${state.weeklyPlan.planDurationDays || state.user.preferences.planDurationDays || 7}d AI Plan`,
                  pl: `Plan AI (${state.weeklyPlan.planDurationDays || state.user.preferences.planDurationDays || 7} dni)`,
                  az: `${state.weeklyPlan.planDurationDays || state.user.preferences.planDurationDays || 7} günlük AI Plan`,
                })}
              </span>
            </button>
          </div>

          {dayMeals.length === 0 && (
            <div
              style={{
                background: '#F6FAF7',
                border: '1px dashed #CBE4D2',
                borderRadius: 14,
                padding: '14px 12px',
                textAlign: 'center',
                marginBottom: 10,
                fontSize: 11.5,
                color: '#4B5563',
              }}
            >
              {pickLocalizedText(lang, {
                en: `No meals scheduled for ${dayInfo.full} (current AI plan duration: ${
                  state.weeklyPlan.planDurationDays || 7
                } days). Use + Add Meal below or open the AI Wizard to change duration.`,
                pl: `Brak zaplanowanych posiłków na ${dayInfo.full} (czas planu: ${
                  state.weeklyPlan.planDurationDays || 7
                } dni). Kliknij + Dodaj posiłek lub otwórz Kreator AI.`,
                az: `${dayInfo.full} üçün yemək planlaşdırılmayıb (plan müddəti: ${
                  state.weeklyPlan.planDurationDays || 7
                } gün). Aşağıdakı + Yemək əlavə et düyməsini sıxın.`,
              })}
            </div>
          )}

          {/* Meal Cards for Selected Day */}
          {dayMeals.map((meal) => (
            <div
              key={meal.id}
              className="mp-meal-card"
              onClick={() => {
                setSelectedRecipe(meal.recipe);
                setRecipeServingsOverride(meal.servings);
                setRecipesViewMode('detail');
                setActiveTab('recipes');
              }}
              data-testid={`planned-meal-${meal.mealType}`}
            >
              <img
                className="mp-meal-thumb"
                src={meal.recipe.imageUrl}
                alt={meal.recipe.titleEn}
                loading="lazy"
                decoding="async"
                onError={handleMealImageError}
              />
              <div className="mp-meal-info">
                <span className={`mp-meal-badge ${meal.mealType}`}>{t[meal.mealType]}</span>
                <div className="mp-meal-title">
                  {pickLocalizedText(lang, {
                    en: meal.recipe.titleEn,
                    pl: meal.recipe.titlePl,
                    az: meal.recipe.titleAz,
                  })}
                </div>
                <div className="mp-meal-meta">
                  {formatMinutes(meal.recipe.totalTimeMin, lang)} • {meal.scaledCaloriesKcal} kcal • ~
                  {formatPln(meal.scaledCostPln, activeCurrency)}
                </div>
              </div>
              <button
                className="mp-icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setTargetMealSlot({
                    dayIndex: selectedDayIndex,
                    mealType: meal.mealType,
                    plannedMealId: meal.id,
                  });
                  setActiveModal('replace_meal');
                }}
                title={t.replaceMeal}
              >
                <MoreVertical size={17} color="#647067" />
              </button>
            </div>
          ))}

          {/* Replace Meal & + Add Meal Buttons */}
          <div className="mp-dual-btn-row">
            <button
              className="mp-outline-btn"
              onClick={() => {
                const firstMeal = dayMeals[0];
                setTargetMealSlot({
                  dayIndex: selectedDayIndex,
                  mealType: firstMeal ? firstMeal.mealType : 'lunch',
                  plannedMealId: firstMeal?.id,
                });
                setActiveModal('replace_meal');
              }}
              data-testid="btn-replace-meal"
            >
              <RefreshCw size={13} />
              {t.replaceMeal}
            </button>
            <button
              className="mp-outline-btn"
              onClick={() => {
                setTargetMealSlot({
                  dayIndex: selectedDayIndex,
                  mealType: 'snack',
                });
                setActiveModal('replace_meal');
              }}
              data-testid="btn-add-meal"
            >
              <Plus size={14} />
              {t.addMeal}
            </button>
          </div>

          {/* Week Summary Section at bottom (Total Cost | Budget | % circle) */}
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 7 }}>{t.weekSummary}</div>
          <div
            className="mp-week-summary-card"
            onClick={() => setActiveModal('budget_optimizer')}
            style={{ cursor: 'pointer' }}
            data-testid="card-week-summary"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#DCFCE7',
                  color: '#15803D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Coins size={15} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#647067' }}>{t.totalCost}</div>
                <div style={{ fontSize: 13.5, fontWeight: 900 }}>
                  {formatPln(displayBasketCost, activeCurrency)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: '#E5F3E8',
                  color: '#196431',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Wallet size={15} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#647067' }}>{t.budget}</div>
                <div style={{ fontSize: 13.5, fontWeight: 900 }}>
                  {formatPln(displayBudget, activeCurrency)}
                </div>
              </div>
            </div>

            {/* Circular Progress Badge */}
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                border: `3.5px solid ${displayBasketCost > displayBudget ? '#DC2626' : '#2B8A44'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11.5,
                fontWeight: 900,
                color: displayBasketCost > displayBudget ? '#DC2626' : '#196431',
                flexShrink: 0,
              }}
            >
              {displayBudgetPct}%
            </div>
          </div>

          {/* AI Content Safety & Nutritional Disclaimer Strip (Google Play AI Policy) */}
          <div
            style={{
              margin: '0 10px 8px',
              padding: '6px 10px',
              borderRadius: 10,
              background: '#F4F8F4',
              border: '1px solid #DCE5DD',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 10,
              color: '#4B5563',
            }}
          >
            <span>
              {pickLocalizedText(lang, {
                en: 'ℹ️ AI nutritional & price estimates are informational only. Always verify allergen labels.',
                pl: 'ℹ️ Szacunki AI są wyłącznie informacyjne. Zawsze sprawdzaj alergeny na etykiecie.',
                az: 'ℹ️ AI qida və qiymət təxminləri yalnız məlumat xarakterlidir. Allergen etiketlərini yoxlayın.',
              })}
            </span>
            <button
              onClick={() => setActiveModal('ai_report')}
              data-testid="btn-report-ai-content"
              style={{
                border: '1px solid #DC2626',
                background: '#FEF2F2',
                color: '#991B1B',
                borderRadius: 999,
                padding: '2px 8px',
                fontSize: 9.5,
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              🚩{' '}
              {pickLocalizedText(lang, {
                en: 'Report AI',
                pl: 'Zgłoś AI',
                az: 'AI Şikayət',
              })}
            </button>
          </div>
        </div>
        {renderBottomNav('meal_plan')}
      </div>
    );
  };

  // =========================================================================
  // SCREEN 3: RECIPE DETAIL & RECIPES DISCOVERY SCREEN
  // =========================================================================
  const renderRecipeScreen = () => {
    const fallbackRec = state.recipes[0];
    const currentId = selectedRecipe?.id || fallbackRec.id;
    const activeRecipe = state.recipes.find((r) => r.id === currentId) || selectedRecipe || fallbackRec;
    const scale = recipeServingsOverride / Math.max(1, activeRecipe.baseServings);
    const baseCost = getRecipeBaseCostForCurrency(activeRecipe, activeCurrency);
    const scaledCost = Number((baseCost * scale).toFixed(2));

    const cookingMeta = getRecipeCookingMetadata(
      activeRecipe,
      lang,
      state.user.preferences.kitchenEquipment
    );
    const detailedSteps = buildDetailedCookingSteps(
      activeRecipe,
      recipeServingsOverride,
      lang
    );

    const plannedMealsUsingRecipe = state.weeklyPlan.meals.filter(
      (m) => m.recipe.id === activeRecipe.id
    );

    const handleChangeRecipeServings = async (nextServings: number) => {
      const clamped = Math.max(1, Math.min(12, nextServings));
      setRecipeServingsOverride(clamped);
      if (plannedMealsUsingRecipe.length > 0) {
        try {
          const nextState = await clientApi.updateRecipeServings(
            activeRecipe.id,
            clamped,
            selectedDayIndex
          );
          setState(nextState);
          const refreshed = nextState.recipes.find((r) => r.id === activeRecipe.id);
          if (refreshed) setSelectedRecipe(refreshed);
        } catch {
          // keep local servings override if offline
        }
      }
    };

    const handleAdjustIngredientQuantity = async (
      ingredientId: string,
      currentBaseAmount: number,
      unit: string,
      direction: -1 | 1
    ) => {
      const stepDelta =
        unit === 'g' || unit === 'ml'
          ? currentBaseAmount >= 100
            ? 25
            : 10
          : unit === 'pcs' || unit === 'cloves'
          ? 1
          : 0.5;
      const nextBaseAmount = Math.max(
        unit === 'g' || unit === 'ml' ? 10 : 0.5,
        Math.round((currentBaseAmount + direction * stepDelta) * 10) / 10
      );
      try {
        const nextState = await clientApi.updateRecipeIngredient(
          activeRecipe.id,
          ingredientId,
          nextBaseAmount
        );
        setState(nextState);
        const refreshed = nextState.recipes.find((r) => r.id === activeRecipe.id);
        if (refreshed) setSelectedRecipe(refreshed);
      } catch (err: any) {
        showToast(`⚠️ ${err.message}`);
      }
    };

    if (recipesViewMode === 'discovery') {
      const filteredRecipes = state.recipes.filter((r) => {
        if (recipeSearch.trim()) {
          const q = recipeSearch.toLowerCase();
          const matchTitle =
            r.titlePl.toLowerCase().includes(q) ||
            r.titleEn.toLowerCase().includes(q) ||
            (r.titleAz && r.titleAz.toLowerCase().includes(q)) ||
            r.ingredients.some(
              (i) =>
                i.namePl.toLowerCase().includes(q) ||
                i.nameEn.toLowerCase().includes(q) ||
                (i.nameAz && i.nameAz.toLowerCase().includes(q))
            );
          if (!matchTitle) return false;
        }
        if (recipeFilter === 'Favourites') return Boolean(r.isFavourite);
        if (recipeFilter === 'Quick') return r.totalTimeMin <= 20;
        if (recipeFilter === 'Budget') return r.estimatedCostPln <= 10.5;
        if (recipeFilter === 'Vegetarian') return r.dietaryTags.includes('vegetarian');
        if (recipeFilter === 'High-protein') return r.dietaryTags.includes('high_protein');
        return true;
      });

      return (
        <div className="mp-phone-frame" data-testid="screen-recipes-discovery">
          <AndroidStatusBar />
          <div className="mp-screen-scroll">
            <div className="mp-app-bar">
              <span className="mp-app-bar-title">{t.navRecipes}</span>
              <button
                className="mp-outline-btn"
                style={{ padding: '5px 10px', fontSize: 11 }}
                onClick={() => setActiveModal('create_recipe')}
                data-testid="btn-open-create-recipe"
              >
                <Plus size={13} />{' '}
                {pickLocalizedText(lang, {
                  en: 'Create',
                  pl: 'Nowy przepis',
                  az: 'Yeni resept',
                })}
              </button>
            </div>

            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#647067' }} />
              <input
                className="mp-input"
                style={{ paddingLeft: 32, paddingBottom: 8, paddingTop: 8 }}
                placeholder={t.searchRecipesPlaceholder}
                value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
              {[
                { id: 'All', label: t.allCategories },
                { id: 'Budget', label: t.budgetFriendly },
                { id: 'Quick', label: t.quickMeals },
                { id: 'High-protein', label: t.highProtein },
                { id: 'Vegetarian', label: t.vegetarian },
                { id: 'Favourites', label: t.favourites },
              ].map((cat) => (
                <button
                  key={cat.id}
                  className={`mp-chip ${recipeFilter === cat.id ? 'active' : ''}`}
                  style={{ whiteSpace: 'nowrap', fontSize: 11, padding: '5px 10px' }}
                  onClick={() => setRecipeFilter(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {filteredRecipes.map((rec) => {
                const recCost = getRecipeBaseCostForCurrency(rec, activeCurrency);
                const plannedMatch = state.weeklyPlan.meals.find((m) => m.recipe.id === rec.id);
                return (
                  <div
                    key={rec.id}
                    className="mp-meal-card"
                    data-testid={`discovery-recipe-${rec.id}`}
                    onClick={() => {
                      setSelectedRecipe(rec);
                      setRecipeServingsOverride(
                        plannedMatch ? plannedMatch.servings : rec.baseServings
                      );
                      setRecipesViewMode('detail');
                    }}
                  >
                    <img
                      className="mp-meal-thumb"
                      src={rec.imageUrl}
                      alt={rec.titleEn}
                      loading="lazy"
                      decoding="async"
                      onError={handleMealImageError}
                    />
                    <div className="mp-meal-info">
                      <span className={`mp-meal-badge ${rec.mealType}`}>{t[rec.mealType]}</span>
                      <div className="mp-meal-title">
                        {pickLocalizedText(lang, {
                          en: rec.titleEn,
                          pl: rec.titlePl,
                          az: rec.titleAz,
                        })}
                      </div>
                      <div className="mp-meal-meta">
                        {formatMinutes(rec.totalTimeMin, lang)} • {rec.nutrition.caloriesKcal} kcal • ~
                        {formatPln(recCost, activeCurrency)}
                      </div>
                    </div>
                    <Heart
                      size={17}
                      fill={rec.isFavourite ? '#DC2626' : 'none'}
                      color={rec.isFavourite ? '#DC2626' : '#9CA3AF'}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          {renderBottomNav('recipes')}
        </div>
      );
    }

    const renderIngredientsBlock = () => (
      <div style={{ marginBottom: 14 }} data-testid="recipe-section-ingredients">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: '#132A19' }}>
            🛒 {t.ingredients} ({activeRecipe.ingredients.length})
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              type="button"
              data-testid="btn-servings-minus"
              onClick={() => handleChangeRecipeServings(recipeServingsOverride - 1)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border: '1px solid #196431',
                background: '#FFFFFF',
                color: '#196431',
                fontWeight: 900,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              −
            </button>
            <span
              data-testid="recipe-servings-badge"
              style={{ fontSize: 11, fontWeight: 800, color: '#196431', minWidth: 58, textAlign: 'center' }}
            >
              {recipeServingsOverride} {t.servings.toLowerCase()}
            </span>
            <button
              type="button"
              data-testid="btn-servings-plus"
              onClick={() => handleChangeRecipeServings(recipeServingsOverride + 1)}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                border: '1px solid #196431',
                background: '#196431',
                color: '#FFFFFF',
                fontWeight: 900,
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              +
            </button>
          </div>
        </div>

        {activeRecipe.ingredients.map((ing) => {
          const isChecked = Boolean(checkedRecipeIngs[ing.id]);
          const scaledAmt = formatScaledIngredientAmount(ing, scale, lang);
          return (
            <div
              key={ing.id}
              className="mp-ing-row"
              data-testid={`recipe-ing-row-${ing.canonicalIngredient}`}
              onClick={() =>
                setCheckedRecipeIngs((prev) => ({ ...prev, [ing.id]: !prev[ing.id] }))
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`mp-checkbox ${isChecked ? 'checked' : ''}`}>
                  {isChecked && <Check size={12} strokeWidth={3} />}
                </span>
                <span style={{ fontSize: 15 }}>{ing.icon}</span>
                <span style={{ fontWeight: 600 }}>
                  {pickLocalizedText(lang, {
                    en: ing.nameEn,
                    pl: ing.namePl,
                    az: ing.nameAz,
                  })}
                </span>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                onClick={(e) => e.stopPropagation()}
              >
                {ing.unit !== 'to_taste' && (
                  <button
                    type="button"
                    data-testid={`btn-ing-minus-${ing.canonicalIngredient}`}
                    onClick={() =>
                      handleAdjustIngredientQuantity(ing.id, ing.amount, ing.unit, -1)
                    }
                    title="Decrease ingredient quantity"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: '1px solid #D5E2D8',
                      background: '#F8FBF9',
                      color: '#374151',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    −
                  </button>
                )}
                <span
                  data-testid={`recipe-ing-amount-${ing.canonicalIngredient}`}
                  style={{ fontWeight: 700, color: '#196431', minWidth: 52, textAlign: 'right' }}
                >
                  {scaledAmt}
                </span>
                {ing.unit !== 'to_taste' && (
                  <button
                    type="button"
                    data-testid={`btn-ing-plus-${ing.canonicalIngredient}`}
                    onClick={() =>
                      handleAdjustIngredientQuantity(ing.id, ing.amount, ing.unit, 1)
                    }
                    title="Increase ingredient quantity"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      border: '1px solid #D5E2D8',
                      background: '#F8FBF9',
                      color: '#196431',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    +
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );

    const renderCookingInfoAndInstructionsBlock = () => (
      <div style={{ marginBottom: 14 }} data-testid="recipe-section-instructions">
        {/* Cooking Information Card: Prep/Cook/Total time, Temperature & Equipment Needed */}
        <div
          style={{
            background: '#F2F9F4',
            border: '1px solid #CBE4D2',
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 10,
            fontSize: 11.5,
          }}
          data-testid="recipe-cooking-info-card"
        >
          <div style={{ fontWeight: 800, color: '#145328', marginBottom: 6, fontSize: 12 }}>
            🍳{' '}
            {pickLocalizedText(lang, {
              en: 'Cooking Information & Equipment Needed',
              pl: 'Informacje o przygotowaniu i wymagany sprzęt',
              az: 'Bişirmə Məlumatı və Lazımi Avadanlıq',
            })}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginBottom: 8,
            }}
          >
            <div style={{ background: '#FFFFFF', padding: '5px 7px', borderRadius: 8 }}>
              <div style={{ fontSize: 9.5, color: '#647067' }}>
                {pickLocalizedText(lang, { en: 'Prep Time', pl: 'Przygotowanie', az: 'Hazırlıq' })}
              </div>
              <div style={{ fontWeight: 800, color: '#132A19' }} data-testid="recipe-prep-time">
                {formatMinutes(cookingMeta.prepTimeMin, lang)}
              </div>
            </div>
            <div style={{ background: '#FFFFFF', padding: '5px 7px', borderRadius: 8 }}>
              <div style={{ fontSize: 9.5, color: '#647067' }}>
                {pickLocalizedText(lang, { en: 'Cook Time', pl: 'Gotowanie', az: 'Bişirmə' })}
              </div>
              <div style={{ fontWeight: 800, color: '#132A19' }} data-testid="recipe-cook-time">
                {formatMinutes(cookingMeta.cookTimeMin, lang)}
              </div>
            </div>
            <div style={{ background: '#FFFFFF', padding: '5px 7px', borderRadius: 8 }}>
              <div style={{ fontSize: 9.5, color: '#647067' }}>{t.totalTime}</div>
              <div style={{ fontWeight: 800, color: '#196431' }} data-testid="recipe-total-time">
                {formatMinutes(cookingMeta.totalTimeMin, lang)}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 4, color: '#1F2937' }}>
            🌡️{' '}
            <strong>
              {pickLocalizedText(lang, {
                en: 'Temperature / Heat:',
                pl: 'Temperatura / Ogień:',
                az: 'Temperatur / İstilik:',
              })}
            </strong>{' '}
            <span data-testid="recipe-temperature-label">{cookingMeta.temperatureLabel}</span>
          </div>

          <div style={{ color: '#1F2937' }}>
            🔧{' '}
            <strong>
              {pickLocalizedText(lang, {
                en: 'Equipment Needed:',
                pl: 'Potrzebny sprzęt:',
                az: 'Lazımi avadanlıq:',
              })}
            </strong>{' '}
            <span data-testid="recipe-equipment-label">
              {cookingMeta.equipmentLabels.join(' • ')}
            </span>
          </div>
        </div>

        {/* Step-by-Step Beginner-Friendly Instructions */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: '#132A19',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>
            📖{' '}
            {pickLocalizedText(lang, {
              en: 'Step-by-Step Preparation Instructions',
              pl: 'Instrukcja przygotowania krok po kroku',
              az: 'Addım-Addım Hazırlanma Qaydası',
            })}
          </span>
          <span style={{ fontSize: 10.5, color: '#196431', fontWeight: 700 }}>
            {detailedSteps.length}{' '}
            {pickLocalizedText(lang, { en: 'steps', pl: 'kroków', az: 'addım' })}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          {detailedSteps.map((st) => {
            const stepKey = `${activeRecipe.id}-step-${st.stepNumber}`;
            const isStepDone = Boolean(checkedCookingSteps[stepKey]);
            return (
              <div
                key={st.stepNumber}
                data-testid={`recipe-step-${st.stepNumber}`}
                onClick={() =>
                  setCheckedCookingSteps((prev) => ({ ...prev, [stepKey]: !prev[stepKey] }))
                }
                style={{
                  background: isStepDone ? '#F4FAF6' : '#FFFFFF',
                  padding: '10px 11px',
                  borderRadius: 12,
                  border: isStepDone ? '1.5px solid #2B8A44' : '1px solid #E5E8E5',
                  lineHeight: 1.45,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 999,
                        background: isStepDone ? '#2B8A44' : '#196431',
                        color: '#FFFFFF',
                        fontSize: 11,
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isStepDone ? '✓' : st.stepNumber}
                    </span>
                    <strong style={{ color: '#132A19', fontSize: 12 }}>{st.title}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {st.temperatureHint && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          background: '#FEF3C7',
                          color: '#92400E',
                          padding: '2px 6px',
                          borderRadius: 999,
                        }}
                      >
                        🌡️ {st.temperatureHint}
                      </span>
                    )}
                    {st.durationLabel && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          background: '#ECF8F0',
                          color: '#166534',
                          padding: '2px 6px',
                          borderRadius: 999,
                        }}
                      >
                        ⏱️ {st.durationLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ color: '#1F2937', fontSize: 11.5 }}>{st.instruction}</div>

                {st.stepIngredients.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {st.stepIngredients.map((si) => (
                      <span
                        key={si.id}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          background: '#F2F9F4',
                          border: '1px solid #D5E2D8',
                          color: '#145328',
                          padding: '2px 7px',
                          borderRadius: 999,
                        }}
                      >
                        {si.icon} {si.name}: <strong>{si.scaledAmountLabel}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );

    const renderNutritionBlock = () => (
      <div
        style={{
          background: '#FFFFFF',
          padding: 12,
          borderRadius: 12,
          border: '1px solid #E5E8E5',
          marginBottom: 14,
          fontSize: 12,
        }}
        data-testid="recipe-section-nutrition"
      >
        <div style={{ fontWeight: 800, color: '#132A19', marginBottom: 8, fontSize: 12.5 }}>
          🥗{' '}
          {pickLocalizedText(lang, {
            en: 'Nutrition Facts (Per Serving)',
            pl: 'Wartości odżywcze (na 1 porcję)',
            az: 'Qida Dəyəri (1 porsiya üçün)',
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: '#F8FBF9', padding: '6px 8px', borderRadius: 8 }}>
            🔥{' '}
            {pickLocalizedText(lang, {
              en: 'Calories',
              pl: 'Kalorie',
              az: 'Kalori',
            })}
            : <strong data-testid="recipe-nutrition-kcal">{activeRecipe.nutrition.caloriesKcal} kcal</strong>
          </div>
          <div style={{ background: '#F8FBF9', padding: '6px 8px', borderRadius: 8 }}>
            💪{' '}
            {pickLocalizedText(lang, {
              en: 'Protein',
              pl: 'Białko',
              az: 'Zülal',
            })}
            : <strong data-testid="recipe-nutrition-protein">{activeRecipe.nutrition.proteinG} g</strong>
          </div>
          <div style={{ background: '#F8FBF9', padding: '6px 8px', borderRadius: 8 }}>
            🌾{' '}
            {pickLocalizedText(lang, {
              en: 'Carbs',
              pl: 'Węglowodany',
              az: 'Karbohidrat',
            })}
            : <strong data-testid="recipe-nutrition-carbs">{activeRecipe.nutrition.carbsG} g</strong>
          </div>
          <div style={{ background: '#F8FBF9', padding: '6px 8px', borderRadius: 8 }}>
            🥑{' '}
            {pickLocalizedText(lang, {
              en: 'Fat',
              pl: 'Tłuszcze',
              az: 'Yağ',
            })}
            : <strong data-testid="recipe-nutrition-fat">{activeRecipe.nutrition.fatG} g</strong>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#647067', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span>
            {pickLocalizedText(lang, {
              en: 'Fiber',
              pl: 'Błonnik',
              az: 'Lif',
            })}
            : <strong>{activeRecipe.nutrition.fiberG} g</strong>
          </span>
          <span>
            {pickLocalizedText(lang, {
              en: 'Allergens',
              pl: 'Alergeny',
              az: 'Allergenlər',
            })}
            :{' '}
            {activeRecipe.allergens.length > 0
              ? activeRecipe.allergens.join(', ')
              : pickLocalizedText(lang, {
                  en: 'None',
                  pl: 'Brak',
                  az: 'Yoxdur',
                })}
          </span>
        </div>
        <div
          style={{
            marginTop: 8,
            paddingTop: 6,
            borderTop: '1px dashed #E2EBE3',
            fontSize: 10,
            color: '#647067',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>
            {pickLocalizedText(lang, {
              en: 'Values are approximate estimates and not medical advice.',
              pl: 'Wartości są orientacyjne i nie stanowią porady medycznej.',
              az: 'Dəyərlər təxminidir və tibbi məsləhət deyil.',
            })}
          </span>
          <button
            onClick={() => setActiveModal('ai_report')}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#991B1B',
              fontSize: 10,
              fontWeight: 800,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {pickLocalizedText(lang, {
              en: 'Report Recipe/AI',
              pl: 'Zgłoś przepis/AI',
              az: 'Resepti bildir',
            })}
          </button>
        </div>
      </div>
    );

    return (
      <div className="mp-phone-frame" data-testid="screen-recipe-detail">
        <AndroidStatusBar />
        <div className="mp-screen-scroll">
          {/* Hero Recipe Photo with Back, Favourite Heart, and Share/Discovery Toggle */}
          <div className="mp-recipe-hero-wrap">
            <img
              className="mp-recipe-hero-img"
              src={activeRecipe.imageUrl}
              alt={activeRecipe.titleEn}
              decoding="async"
              fetchPriority="high"
              onError={handleMealImageError}
            />
            <div className="mp-recipe-hero-overlay">
              <button
                className="mp-circle-glass-btn"
                onClick={() => setRecipesViewMode('discovery')}
                title={pickLocalizedText(lang, {
                  en: 'Browse all recipes',
                  pl: 'Przeglądaj wszystkie przepisy',
                  az: 'Bütün reseptlərə bax',
                })}
                data-testid="btn-browse-all-recipes"
              >
                <ArrowLeft size={16} color="#1B241E" />
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="mp-circle-glass-btn"
                  onClick={async () => {
                    const nextFav = !activeRecipe.isFavourite;
                    setSelectedRecipe((prev) =>
                      prev && prev.id === activeRecipe.id ? { ...prev, isFavourite: nextFav } : prev
                    );
                    setState((prev) =>
                      prev
                        ? {
                            ...prev,
                            recipes: prev.recipes.map((r) =>
                              r.id === activeRecipe.id ? { ...r, isFavourite: nextFav } : r
                            ),
                          }
                        : prev
                    );
                    const next = await clientApi.toggleFavouriteRecipe(activeRecipe.id);
                    setState(next);
                    const updated = next.recipes.find((r) => r.id === activeRecipe.id);
                    if (updated) setSelectedRecipe(updated);
                  }}
                  data-testid="btn-favourite-recipe"
                >
                  <Heart
                    size={15}
                    fill={activeRecipe.isFavourite ? '#EF4444' : 'none'}
                    color={activeRecipe.isFavourite ? '#EF4444' : '#1B241E'}
                  />
                </button>
                <button
                  className="mp-circle-glass-btn"
                  onClick={() => setRecipesViewMode('discovery')}
                  title={pickLocalizedText(lang, {
                    en: 'Search recipes',
                    pl: 'Szukaj przepisów',
                    az: 'Resept axtar',
                  })}
                >
                  <Share2 size={15} color="#1B241E" />
                </button>
              </div>
            </div>
          </div>

          {/* Recipe Title & Description */}
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1B241E', lineHeight: 1.28 }}>
            {pickLocalizedText(lang, {
              en: activeRecipe.titleEn,
              pl: activeRecipe.titlePl,
              az: activeRecipe.titleAz,
            })}
          </h2>
          <div style={{ fontSize: 11.5, color: '#4B5563', marginTop: 3, marginBottom: 4, lineHeight: 1.4 }}>
            {pickLocalizedText(lang, {
              en: activeRecipe.descriptionEn,
              pl: activeRecipe.descriptionPl,
              az: activeRecipe.descriptionAz,
            })}
          </div>

          {/* 4-Column Metric Strip (Total Time | Difficulty | Servings | ~ Cost) */}
          <div className="mp-metrics-strip">
            <div>
              <Clock size={14} color="#2B8A44" style={{ marginBottom: 2 }} />
              <div className="mp-metric-val">{formatMinutes(activeRecipe.totalTimeMin, lang)}</div>
              <div className="mp-metric-lbl">
                {activeRecipe.prepTimeMin}m + {activeRecipe.cookTimeMin}m
              </div>
            </div>
            <div>
              <Flame size={14} color="#2B8A44" style={{ marginBottom: 2 }} />
              <div className="mp-metric-val">
                {activeRecipe.difficulty === 'Easy'
                  ? t.easy
                  : activeRecipe.difficulty === 'Medium'
                  ? t.medium
                  : t.hard}
              </div>
              <div className="mp-metric-lbl">{t.difficulty}</div>
            </div>
            <div
              onClick={() =>
                handleChangeRecipeServings(recipeServingsOverride >= 8 ? 1 : recipeServingsOverride + 1)
              }
              style={{ cursor: 'pointer' }}
              title="Tap to adjust servings & sync shopping list"
              data-testid="metric-servings-adjust"
            >
              <Users size={14} color="#2B8A44" style={{ marginBottom: 2 }} />
              <div className="mp-metric-val">{recipeServingsOverride} ⟳</div>
              <div className="mp-metric-lbl">{t.servings}</div>
            </div>
            <div>
              <Coins size={14} color="#2B8A44" style={{ marginBottom: 2 }} />
              <div className="mp-metric-val">~ {formatPln(scaledCost, activeCurrency)}</div>
              <div className="mp-metric-lbl">{t.cost}</div>
            </div>
          </div>

          {/* Segmented Tabs: Ingredients | Instructions | Nutrition */}
          <div className="mp-tabs-pill-bar">
            <button
              className={`mp-tab-pill-btn ${recipeTab === 'ingredients' ? 'active' : ''}`}
              onClick={() => setRecipeTab('ingredients')}
              data-testid="tab-recipe-ingredients"
            >
              {t.ingredients}
            </button>
            <button
              className={`mp-tab-pill-btn ${recipeTab === 'instructions' ? 'active' : ''}`}
              onClick={() => setRecipeTab('instructions')}
              data-testid="tab-recipe-instructions"
            >
              {t.instructions}
            </button>
            <button
              className={`mp-tab-pill-btn ${recipeTab === 'nutrition' ? 'active' : ''}`}
              onClick={() => setRecipeTab('nutrition')}
              data-testid="tab-recipe-nutrition"
            >
              {t.nutrition}
            </button>
          </div>

          {/* Complete Recipe Content: Prioritizes selected tab at top while keeping all preparation sections visible */}
          {recipeTab === 'ingredients' && (
            <>
              {renderIngredientsBlock()}
              {renderCookingInfoAndInstructionsBlock()}
              {renderNutritionBlock()}
            </>
          )}
          {recipeTab === 'instructions' && (
            <>
              {renderCookingInfoAndInstructionsBlock()}
              {renderIngredientsBlock()}
              {renderNutritionBlock()}
            </>
          )}
          {recipeTab === 'nutrition' && (
            <>
              {renderNutritionBlock()}
              {renderIngredientsBlock()}
              {renderCookingInfoAndInstructionsBlock()}
            </>
          )}

          {/* Add to Meal Plan CTA Button */}
          <button
            className="mp-primary-cta-btn"
            onClick={async () => {
              try {
                const next = await clientApi.replaceOrAddMeal({
                  dayIndex: selectedDayIndex,
                  mealType: activeRecipe.mealType,
                  recipeId: activeRecipe.id,
                  servings: recipeServingsOverride,
                });
                setState(next);
                showToast(
                  pickLocalizedText(lang, {
                    en: `Added "${activeRecipe.titleEn}" to Meal Plan & updated Shopping List!`,
                    pl: `Dodano „${activeRecipe.titlePl}” do Planu Posiłków i zaktualizowano Listę Zakupów!`,
                    az: `"${activeRecipe.titleAz || activeRecipe.titleEn}" yemək planına əlavə edildi və alış-veriş siyahısı yeniləndi!`,
                  })
                );
              } catch (err: any) {
                showToast(`⚠️ ${err.message}`);
              }
            }}
            data-testid="btn-add-recipe-to-plan"
          >
            <Calendar size={15} />
            {t.addToMealPlan}
          </button>
        </div>
        {renderBottomNav('recipes')}
      </div>
    );
  };

  // =========================================================================
  // SCREEN 4: SMART SHOPPING LIST SCREEN
  // =========================================================================
  const renderShoppingListScreen = () => {
    const allItems = state.shoppingList.items;
    const filteredItems = allItems.filter((item) => {
      if (shopFilter === 'to_buy') return !item.isPurchased;
      if (shopFilter === 'bought') return item.isPurchased;
      return true;
    });

    // Group items by category
    const grouped = new Map<ShoppingCategory, typeof filteredItems>();
    for (const item of filteredItems) {
      const list = grouped.get(item.category) || [];
      list.push(item);
      grouped.set(item.category, list);
    }

    const currentStore = state.shoppingList.supermarketId;
    const storeDisplayName = getStoreDisplayName(currentStore);

    return (
      <div className="mp-phone-frame" data-testid="screen-shopping-list">
        <AndroidStatusBar />
        <div className="mp-screen-scroll">
          {/* App Header */}
          <div className="mp-app-bar">
            <button className="mp-icon-btn" onClick={() => setActiveTab('home')}>
              <ArrowLeft size={19} />
            </button>
            <span className="mp-app-bar-title">{t.quickShoppingList}</span>
            <button
              className="mp-icon-btn"
              onClick={() => setShowManualAddBar(!showManualAddBar)}
              title="Add item manually"
              data-testid="btn-toggle-manual-item"
            >
              <MoreVertical size={18} />
            </button>
          </div>

          {/* Manual Item Quick Add Bar */}
          {showManualAddBar && (
            <div
              style={{
                background: '#FFFFFF',
                padding: 8,
                borderRadius: 12,
                border: '1px solid #CFE0D3',
                marginBottom: 10,
                display: 'flex',
                gap: 6,
              }}
            >
              <input
                className="mp-input"
                style={{ padding: '6px 8px', fontSize: 12 }}
                placeholder={pickLocalizedText(lang, {
                  en: 'Add product (e.g. Coffee)',
                  pl: 'Dodaj produkt (np. Kawa)',
                  az: 'Məhsul əlavə et (məs. Qəhvə)',
                })}
                value={manualItemName}
                onChange={(e) => setManualItemName(e.target.value)}
              />
              <input
                className="mp-input"
                style={{ width: 70, padding: '6px 8px', fontSize: 12 }}
                type="number"
                step="0.5"
                value={manualItemPrice}
                onChange={(e) => setManualItemPrice(e.target.value)}
              />
              <button
                className="mp-primary-cta-btn"
                style={{ width: 'auto', padding: '6px 10px', fontSize: 11.5 }}
                onClick={async () => {
                  if (!manualItemName.trim()) return;
                  const next = await clientApi.addManualShoppingItem({
                    namePl: manualItemName.trim(),
                    packageSizeLabel: activeRegion === 'AZ' ? '1 ədəd' : '1 op.',
                    pricePln: Number(manualItemPrice) || 4.99,
                  });
                  setState(next);
                  setManualItemName('');
                  setShowManualAddBar(false);
                }}
              >
                +
              </button>
            </div>
          )}

          {/* Filter Pills Row: All Items | To Buy | Bought */}
          <div className="mp-shop-filter-row">
            <button
              className={`mp-shop-filter-pill ${shopFilter === 'all' ? 'active' : ''}`}
              onClick={() => setShopFilter('all')}
            >
              {t.allItems} ({state.shoppingList.totalItemsCount})
            </button>
            <button
              className={`mp-shop-filter-pill ${shopFilter === 'to_buy' ? 'active' : ''}`}
              onClick={() => setShopFilter('to_buy')}
            >
              {t.toBuy} ({state.shoppingList.toBuyCount})
            </button>
            <button
              className={`mp-shop-filter-pill ${shopFilter === 'bought' ? 'active' : ''}`}
              onClick={() => setShopFilter('bought')}
            >
              {t.bought} ({state.shoppingList.boughtCount})
            </button>
          </div>

          {/* Supermarket Selector Dropdown Bar */}
          <div
            className="mp-store-dropdown-bar"
            onClick={() => {
              const idx = activeCatalogueStores.indexOf(currentStore);
              const nextStore =
                activeCatalogueStores[(idx + 1) % activeCatalogueStores.length] ||
                activeCatalogueStores[0];
              handleSelectSupermarket(nextStore);
            }}
            title={pickLocalizedText(lang, {
              en: 'Click to switch between local supermarkets',
              pl: 'Kliknij, aby przełączyć supermarket',
              az: 'Yerli supermarketi dəyişmək üçün toxunun',
            })}
            data-testid="shopping-store-switcher"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <SupermarketLogo store={currentStore} size={26} />
              <span style={{ fontSize: 13.5, fontWeight: 800 }}>{storeDisplayName}</span>
            </div>
            <ChevronDown size={17} color="#647067" />
          </div>

          {/* Automated 24h Price Monitoring & Freshness Status Bar */}
          {(() => {
            const monitor = state.priceMonitoring;
            const outdatedCount = allItems.filter((i) => i.isOutdated).length;
            const lastSyncLabel = monitor?.lastSuccessfulSyncAt
              ? monitor.lastSuccessfulSyncAt.slice(0, 16).replace('T', ' ')
              : state.shoppingList.updatedAt.slice(0, 16).replace('T', ' ');
            return (
              <div
                data-testid="shopping-price-monitor-bar"
                style={{
                  background: outdatedCount > 0 ? '#FFFBEB' : '#F2F9F4',
                  border: `1px solid ${outdatedCount > 0 ? '#FDE68A' : '#CBE4D2'}`,
                  borderRadius: 11,
                  padding: '6px 9px',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  fontSize: 10,
                  color: outdatedCount > 0 ? '#92400E' : '#164A26',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>
                    {outdatedCount > 0
                      ? pickLocalizedText(lang, {
                          en: `⚠️ ${outdatedCount} outdated price(s) (>48h old)`,
                          pl: `⚠️ ${outdatedCount} nieaktualnych cen (>48h)`,
                          az: `⚠️ ${outdatedCount} köhnəlmiş qiymət (>48 saat)`,
                        })
                      : pickLocalizedText(lang, {
                          en: '✓ 24h Price Monitor Active (Bazarstore & Regional)',
                          pl: '✓ Monitoring cen 24h aktywny',
                          az: '✓ 24s Qiymət Monitorinqi Aktivdir (Bazarstore)',
                        })}
                  </div>
                  <div style={{ opacity: 0.88 }}>
                    {pickLocalizedText(lang, {
                      en: `Last price update: ${lastSyncLabel} UTC`,
                      pl: `Ostatnia aktualizacja cen: ${lastSyncLabel} UTC`,
                      az: `Son qiymət yenilənməsi: ${lastSyncLabel} UTC`,
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="btn-sync-bazarstore"
                  onClick={async () => {
                    const res = await clientApi.syncBazarstorePrices();
                    setState(res.state);
                    showToast(
                      pickLocalizedText(lang, {
                        en: 'Synced latest Bazarstore & regional prices!',
                        pl: 'Zsynchronizowano najnowsze ceny Bazarstore!',
                        az: 'Bazarstore qiymətləri yeniləndi!',
                      })
                    );
                  }}
                  style={{
                    border: '1px solid #196431',
                    background: '#FFFFFF',
                    color: '#196431',
                    borderRadius: 999,
                    padding: '3px 8px',
                    fontSize: 9.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={10} />
                  {pickLocalizedText(lang, {
                    en: 'Sync',
                    pl: 'Odśwież',
                    az: 'Yenilə',
                  })}
                </button>
              </div>
            );
          })()}

          {/* Collapsible Category Sections */}
          {Array.from(grouped.entries()).map(([category, items]) => {
            const collapsed = Boolean(collapsedCategories[category]);
            return (
              <div key={category} style={{ marginBottom: 8 }}>
                <div
                  className="mp-shop-cat-header"
                  onClick={() =>
                    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }))
                  }
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ChevronDown
                      size={15}
                      style={{
                        transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s',
                      }}
                    />
                    <span>{t.categoryNames[category] || category}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#647067', fontWeight: 600 }}>
                    {formatItemsCount(items.length, lang)}
                  </span>
                </div>

                {!collapsed &&
                  items.map((item) => (
                    <div
                      key={item.id}
                      className="mp-shop-item-card"
                      onClick={async () => {
                        const targetKey = item.isManual ? item.id : item.canonicalIngredient;
                        const nextPurchased = !item.isPurchased;
                        setState((prev) => {
                          if (!prev) return prev;
                          const updatedItems = prev.shoppingList.items.map((it) =>
                            it.id === item.id ? { ...it, isPurchased: nextPurchased } : it
                          );
                          const boughtCount = updatedItems.filter((it) => it.isPurchased).length;
                          return {
                            ...prev,
                            shoppingList: {
                              ...prev.shoppingList,
                              items: updatedItems,
                              boughtCount,
                              toBuyCount: updatedItems.length - boughtCount,
                            },
                          };
                        });
                        const next = await clientApi.toggleShoppingItem(targetKey);
                        setState(next);
                      }}
                      data-testid={`shop-item-${item.canonicalIngredient}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <span className={`mp-checkbox ${item.isPurchased ? 'checked' : ''}`}>
                          {item.isPurchased && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span style={{ fontSize: 20 }}>{item.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12.5,
                              fontWeight: 800,
                              textDecoration: item.isPurchased ? 'line-through' : 'none',
                              color: item.isPurchased ? '#8A948D' : '#1B241E',
                            }}
                          >
                            {pickLocalizedText(lang, {
                              en: item.nameEn,
                              pl: item.namePl,
                              az: item.nameAz,
                            })}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#647067' }}>
                            {localizeQuantityLabel(item.packageSizeLabel, lang)}
                            {item.leftoverAmount > 0 && (
                              <span style={{ color: '#2B8A44', marginLeft: 4 }}>
                                (+{localizeQuantityLabel(item.leftoverDisplayLabel, lang)}{' '}
                                {pickLocalizedText(lang, {
                                  en: 'pantry',
                                  pl: 'spiżarnia',
                                  az: 'anbar',
                                })}
                                )
                              </span>
                            )}
                            {item.loyaltyRequired && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: 9,
                                  background: '#FEF3C7',
                                  color: '#92400E',
                                  padding: '1px 4px',
                                  borderRadius: 4,
                                  fontWeight: 700,
                                }}
                              >
                                {item.supermarketId === 'biedronka'
                                  ? 'Moja Biedronka'
                                  : item.supermarketId === 'lidl'
                                  ? 'Lidl Plus'
                                  : item.supermarketId === 'bravo'
                                  ? 'Bravo Club'
                                  : item.supermarketId === 'araz'
                                  ? 'Araz Kart'
                                  : 'Bonus'}
                              </span>
                            )}
                            {item.isOutdated && (
                              <span
                                data-testid={`badge-outdated-${item.canonicalIngredient}`}
                                style={{
                                  marginLeft: 4,
                                  fontSize: 9,
                                  background: '#FEF3C7',
                                  color: '#92400E',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  fontWeight: 800,
                                }}
                              >
                                ⚠️{' '}
                                {pickLocalizedText(lang, {
                                  en: 'Outdated price',
                                  pl: 'Cena nieaktualna',
                                  az: 'Köhnəlmiş qiymət',
                                })}
                              </span>
                            )}
                            {item.isAvailable === false && (
                              <span
                                data-testid={`badge-unavailable-${item.canonicalIngredient}`}
                                style={{
                                  marginLeft: 4,
                                  fontSize: 9,
                                  background: '#FEE2E2',
                                  color: '#991B1B',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  fontWeight: 800,
                                }}
                              >
                                🚫{' '}
                                {pickLocalizedText(lang, {
                                  en: 'Out of stock',
                                  pl: 'Brak w sklepie',
                                  az: 'Stokda yoxdur',
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4 }}>
                            {item.regularLineTotalPln > item.lineTotalPln + 0.005 && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 800,
                                  background: '#FACC15',
                                  color: '#1B241E',
                                  padding: '1px 4px',
                                  borderRadius: 999,
                                }}
                              >
                                -{Math.round(((item.regularLineTotalPln - item.lineTotalPln) / item.regularLineTotalPln) * 100)}%
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 900,
                                color:
                                  item.regularLineTotalPln > item.lineTotalPln + 0.005
                                    ? '#DC2626'
                                    : '#1B241E',
                              }}
                            >
                              {formatPln(item.lineTotalPln, activeCurrency)}
                            </span>
                            {item.regularLineTotalPln > item.lineTotalPln + 0.005 && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: '#9CA3AF',
                                  textDecoration: 'line-through',
                                  fontWeight: 600,
                                }}
                              >
                                {formatPln(item.regularLineTotalPln, activeCurrency)}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 9.5, color: '#647067' }}>{item.unitPriceLabel}</div>
                        </div>
                        {item.isManual && (
                          <button
                            className="mp-icon-btn"
                            style={{ width: 22, height: 22 }}
                            title="Remove manual item"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const next = await clientApi.removeManualShoppingItem(item.id);
                              setState(next);
                            }}
                          >
                            <Trash2 size={13} color="#DC2626" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            );
          })}

          {/* Sticky Estimated Total & Find Items at Supermarket CTA */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 16,
              padding: 11,
              border: '1px solid #E6E5DF',
              marginTop: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShoppingCart size={20} color="#2B8A44" />
                <div>
                  <div style={{ fontSize: 11, color: '#647067', fontWeight: 700 }}>
                    {t.estimatedTotal}
                  </div>
                  <div style={{ fontSize: 11, color: '#2B8A44', fontWeight: 800 }}>
                    {formatPln(displayBasketCost, activeCurrency)}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#1B241E' }}>
                {formatPln(displayBasketCost, activeCurrency)}
              </div>
            </div>

            <button
              className="mp-primary-cta-btn"
              onClick={() => setActiveModal('price_comparison')}
              data-testid="btn-find-items-at-store"
            >
              <ShoppingCart size={15} />
              <span>
                {t.findItemsAt} {storeDisplayName}
              </span>
              <ExternalLink size={14} />
            </button>
          </div>
        </div>
        {renderBottomNav('shopping')}
      </div>
    );
  };

  // =========================================================================
  // SCREEN 5: PROFILE & SETTINGS SCREEN
  // =========================================================================
  const renderProfileScreen = () => {
    const prefs = state.user.preferences;
    const storeDisplay = getStoreDisplayName(prefs.preferredSupermarket);
    const regionMeta = REGIONS[activeRegion];
    const currencyMeta = CURRENCIES[activeCurrency];

    return (
      <div className="mp-phone-frame" data-testid="screen-profile">
        <AndroidStatusBar />
        <div className="mp-screen-scroll">
          {/* App Header */}
          <div className="mp-app-bar">
            <button className="mp-icon-btn" onClick={() => setActiveTab('home')}>
              <ArrowLeft size={19} />
            </button>
            <span className="mp-app-bar-title">{t.navProfile}</span>
            <div style={{ width: 34 }} />
          </div>

          {/* User Profile Card (Farhad Isgandarov / farhad@email.com) */}
          <div
            className="mp-profile-user-card"
            onClick={() => setActiveModal('auth')}
            data-testid="profile-user-card"
          >
            <img
              className="mp-profile-avatar"
              src={state.user.avatarUrl}
              alt={state.user.displayName}
              onError={handleMealImageError}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1B241E' }}>
                {state.user.displayName}
              </div>
              <div style={{ fontSize: 12, color: '#647067', marginTop: 2 }}>
                {state.user.email}
              </div>
            </div>
            <ChevronRight size={18} color="#647067" />
          </div>

          {/* Settings List */}
          <div className="mp-settings-list">
            {/* 1. Region Selector (🇵🇱 Poland / 🇦🇿 Azerbaijan) */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('region_settings')}
              data-testid="setting-region"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Globe size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.region}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {regionMeta.flag}{' '}
                    {activeRegion === 'AZ' ? t.azerbaijanRegion : t.polandRegion}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 2. Currency Selector (PLN zł / AZN ₼) */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('region_settings')}
              data-testid="setting-currency"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Coins size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.currency}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {currencyMeta.code} ({currencyMeta.symbol}) —{' '}
                    {activeCurrency === 'AZN' ? t.currencyAznName : t.currencyPlnName}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 3. Language Selector (English / Polski / Azərbaycan dili) */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('region_settings')}
              data-testid="setting-language"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Globe size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.language}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {lang === 'az' ? t.azerbaijani : lang === 'pl' ? t.polish : t.english}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 4. My Preferences */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('preferences')}
              data-testid="setting-preferences"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Sliders size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.myPreferences}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>{t.myPreferencesSub}</div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 5. Household */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('preferences')}
              data-testid="setting-household"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Users size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.household}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {prefs.householdSize}{' '}
                    {prefs.householdSize === 1 ? t.personCount : t.peopleCount}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 6. Weekly Budget */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('budget_optimizer')}
              data-testid="setting-budget"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Wallet size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.weeklyBudget}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {formatPln(prefs.weeklyBudgetPln, activeCurrency)}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 7. Preferred Supermarket */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('price_comparison')}
              data-testid="setting-supermarket"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Store size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.preferredSupermarket}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>{storeDisplay}</div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 8. Pantry */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('pantry')}
              data-testid="setting-pantry"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Package size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.pantry}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {state.pantry.length} {t.pantrySub}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 9. Notifications Toggle */}
            <div className="mp-setting-row" onClick={handleToggleNotifications}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <Bell size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.notifications}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>{t.notificationsSub}</div>
                </div>
              </div>
              <button
                type="button"
                className={`mp-switch ${prefs.notifications.enabled ? 'on' : ''}`}
                data-testid="toggle-notifications"
              >
                <div className="mp-switch-knob" />
              </button>
            </div>

            {/* 10. Privacy & Terms */}
            <div className="mp-setting-row" onClick={() => setActiveModal('privacy')} data-testid="setting-privacy">
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon">
                  <ShieldAlert size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{t.privacyTerms}</div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {pickLocalizedText(lang, {
                      en: 'GDPR • Data Protection • Pricing',
                      pl: 'RODO • Ochrona danych • Ceny',
                      az: 'Məxfilik • Məlumatların qorunması • Qiymətlər',
                    })}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 11. Report AI Content / Safety Feedback (Google Play AI Policy) */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('ai_report')}
              data-testid="setting-ai-report"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon" style={{ background: '#FEF3C7', color: '#B45309' }}>
                  <Sparkles size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                    {pickLocalizedText(lang, {
                      en: 'Report AI Content',
                      pl: 'Zgłoś treść AI',
                      az: 'AI məzmununu bildir',
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {pickLocalizedText(lang, {
                      en: 'Flag inaccurate allergen, nutrition or recipe data',
                      pl: 'Zgłoś błędne alergeny, wartości odżywcze lub przepis',
                      az: 'Yanlış allergen, qida dəyəri və ya resepti bildir',
                    })}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#647067" />
            </div>

            {/* 12. Delete Account & Personal Data (Google Play User Data Policy) */}
            <div
              className="mp-setting-row"
              onClick={() => setActiveModal('auth')}
              data-testid="setting-delete-account"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div className="mp-setting-icon" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                  <Trash2 size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#991B1B' }}>
                    {t.deleteAccount}
                  </div>
                  <div style={{ fontSize: 11, color: '#647067' }}>
                    {pickLocalizedText(lang, {
                      en: 'Permanently erase account & all stored data',
                      pl: 'Trwale usuń konto i wszystkie zapisane dane',
                      az: 'Hesabı və bütün saxlanılan məlumatları həmişəlik sil',
                    })}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#991B1B" />
            </div>
          </div>
        </div>
        {renderBottomNav('profile')}
      </div>
    );
  };

  return (
    <div lang={lang}>
      {/* === Top Showcase Header Banner === */}
      <header className="mp-top-showcase-header">
        <div className="mp-brand-cluster">
          <ChefHatLogo size={52} />
          <div>
            <div className="mp-brand-title">MealPlanner</div>
            <div className="mp-brand-subtitle">{t.tagline}</div>
          </div>
        </div>

        {/* 5 Interactive Feature Badges from Reference Photo */}
        <div className="mp-feature-badges-row">
          <div className="mp-feature-badge-card" onClick={() => setActiveTab('meal_plan')}>
            <span>🌱</span>
            <span>{t.badgeAiMeals}</span>
          </div>
          <div className="mp-feature-badge-card" onClick={() => setActiveModal('price_comparison')}>
            <span>🛒</span>
            <span>{t.badgeRealPrices}</span>
          </div>
          <div className="mp-feature-badge-card" onClick={() => setActiveModal('budget_optimizer')}>
            <span>💰</span>
            <span>{t.badgeBudgetControl}</span>
          </div>
          <div className="mp-feature-badge-card" onClick={() => setActiveModal('pantry')}>
            <span>🥫</span>
            <span>{t.badgePantry}</span>
          </div>
          <div className="mp-feature-badge-card" onClick={() => setActiveModal('preferences')}>
            <span>🥗</span>
            <span>{t.badgeDietary}</span>
          </div>
        </div>

        {/* View Mode, Region & Language Controls */}
        <div className="mp-view-controls">
          <button
            className="mp-mode-btn"
            onClick={handleToggleRegionQuick}
            data-testid="top-region-toggle"
            title={t.regionSettingsTitle}
          >
            <span>{REGIONS[activeRegion].flag}</span>
            <span>
              {activeRegion} • {CURRENCIES[activeCurrency].symbol}
            </span>
          </button>
          <button
            className="mp-mode-btn"
            onClick={handleCycleLanguage}
            data-testid="top-lang-toggle"
            title={t.language}
          >
            <Globe size={14} />
            {lang === 'az' ? 'AZ 🇦🇿' : lang === 'pl' ? 'PL 🇵🇱' : 'EN 🇬🇧'}
          </button>
          <button
            className={`mp-mode-btn ${viewMode === 'showcase_5' ? 'active' : ''}`}
            onClick={() => setViewMode('showcase_5')}
            data-testid="btn-mode-showcase"
          >
            <LayoutGrid size={14} />
            {pickLocalizedText(lang, {
              en: '5-Screen View',
              pl: 'Widok 5 ekranów',
              az: '5 Ekran Görünüşü',
            })}
          </button>
          <button
            className={`mp-mode-btn ${viewMode === 'single_phone' ? 'active' : ''}`}
            onClick={() => setViewMode('single_phone')}
            data-testid="btn-mode-single"
          >
            <Smartphone size={14} />
            {pickLocalizedText(lang, {
              en: 'Android Phone',
              pl: 'Telefon Android',
              az: 'Android Telefon',
            })}
          </button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#164A26',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 12.5,
            fontWeight: 700,
            zIndex: 2000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            animation: 'mpToastSlideUp 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* === Main Stage: Either 5-Phone Showcase (exact reference image layout) or Single Android Phone (Preserved DOM State) === */}
      {viewMode === 'showcase_5' ? (
        <main className="mp-phones-stage five-phone-grid">
          {renderHomeScreen()}
          {renderMealPlanScreen()}
          {renderRecipeScreen()}
          {renderShoppingListScreen()}
          {renderProfileScreen()}
        </main>
      ) : (
        <main className="mp-phones-stage">
          <div className={`mp-screen-slot ${activeTab === 'home' ? 'active' : 'hidden'}`}>
            {renderHomeScreen()}
          </div>
          <div className={`mp-screen-slot ${activeTab === 'meal_plan' ? 'active' : 'hidden'}`}>
            {renderMealPlanScreen()}
          </div>
          <div className={`mp-screen-slot ${activeTab === 'recipes' ? 'active' : 'hidden'}`}>
            {renderRecipeScreen()}
          </div>
          <div className={`mp-screen-slot ${activeTab === 'shopping' ? 'active' : 'hidden'}`}>
            {renderShoppingListScreen()}
          </div>
          <div className={`mp-screen-slot ${activeTab === 'profile' ? 'active' : 'hidden'}`}>
            {renderProfileScreen()}
          </div>
        </main>
      )}

      {/* === Interactive Modals === */}
      <AppModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        state={state}
        lang={lang}
        selectedDayIndex={selectedDayIndex}
        targetMealSlot={targetMealSlot}
        onSelectReplacementRecipe={async (recipeId, mealType, servings) => {
          const next = await clientApi.replaceOrAddMeal({
            dayIndex: targetMealSlot ? targetMealSlot.dayIndex : selectedDayIndex,
            mealType,
            recipeId,
            servings,
            plannedMealId: targetMealSlot?.plannedMealId,
          });
          setState(next);
          showToast(
            pickLocalizedText(lang, {
              en: 'Updated meal in plan!',
              pl: 'Zaktualizowano posiłek w planie!',
              az: 'Plandakı yemək yeniləndi!',
            })
          );
        }}
        onSavePreferences={async (patch) => {
          const next = await clientApi.updatePreferences(patch);
          setState(next);
          showToast(
            pickLocalizedText(lang, {
              en: 'Saved settings & updated regional data!',
              pl: 'Zapisano preferencje i zweryfikowano plan!',
              az: 'Tənzimləmələr yadda saxlanıldı və regional məlumatlar yeniləndi!',
            })
          );
        }}
        onGenerateWizardPlan={async (patch, variationSeed) => {
          setIsGeneratingPlan(true);
          try {
            const next = await clientApi.generateMealPlan(variationSeed, patch);
            setState(next);
            const days = next.weeklyPlan.planDurationDays || patch.planDurationDays || 7;
            if (selectedDayIndex >= days) {
              setSelectedDayIndex(0);
            }
            showToast(
              pickLocalizedText(lang, {
                en: `Generated personalised ${days}-day AI Meal Plan & Shopping List!`,
                pl: `Wygenerowano spersonalizowany ${days}-dniowy plan posiłków AI i listę zakupów!`,
                az: `Fərdi ${days} günlük AI Yemək Planı və Alış-Veriş Siyahısı yaradıldı!`,
              })
            );
            return next;
          } finally {
            setIsGeneratingPlan(false);
          }
        }}
        onNavigateTab={(tab) => {
          if (tab === 'mealplan') setActiveTab('meal_plan');
          else setActiveTab(tab as NavTab);
        }}
        onAddPantryItem={async (item) => {
          const next = await clientApi.addPantryItem(item);
          setState(next);
          showToast(
            pickLocalizedText(lang, {
              en: 'Added item to Pantry!',
              pl: 'Dodano produkt do Spiżarni!',
              az: 'Məhsul Ev anbarına əlavə edildi!',
            })
          );
        }}
        onDeletePantryItem={async (id) => {
          const next = await clientApi.deletePantryItem(id);
          setState(next);
        }}
        onTogglePantrySubtraction={async (subtract) => {
          const next = await clientApi.updateShoppingSettings({ subtractPantry: subtract });
          setState(next);
        }}
        onApplyBudgetSuggestion={async (sug) => {
          const next = await clientApi.applyBudgetSuggestion(sug);
          setState(next);
          showToast(
            pickLocalizedText(lang, {
              en: 'Applied budget optimisation!',
              pl: 'Zastosowano optymalizację budżetu!',
              az: 'Büdcə optimallaşdırması tətbiq edildi!',
            })
          );
        }}
        onCreateCustomRecipe={async (rec) => {
          const next = await clientApi.createCustomRecipe(rec);
          setState(next);
          showToast(
            pickLocalizedText(lang, {
              en: 'Created custom recipe!',
              pl: 'Utworzono własny przepis!',
              az: 'Fərdi resept yaradıldı!',
            })
          );
        }}
        onSelectSupermarket={handleSelectSupermarket}
        onSyncPrices={async () => {
          const res = await clientApi.syncBazarstorePrices();
          setState(res.state);
          showToast(
            pickLocalizedText(lang, {
              en: 'Checked Bazarstore catalogue & refreshed shopping basket prices!',
              pl: 'Sprawdzono katalog Bazarstore i odświeżono ceny koszyka!',
              az: 'Bazarstore kataloqu yoxlanıldı və səbət qiymətləri yeniləndi!',
            })
          );
        }}
        onLogin={async (email, password) => {
          const next = await clientApi.login(email, password);
          setState(next);
          showToast(
            pickLocalizedText(lang, {
              en: 'Logged in successfully!',
              pl: 'Zalogowano pomyślnie!',
              az: 'Hesaba uğurla daxil oldunuz!',
            })
          );
        }}
        onRegister={async (data) => {
          const next = await clientApi.register(data);
          setState(next);
          showToast(
            pickLocalizedText(lang, {
              en: 'Account created and logged in!',
              pl: 'Konto utworzone i zalogowane!',
              az: 'Hesab yaradıldı və daxil oldunuz!',
            })
          );
        }}
        onRecoverPassword={(email) => clientApi.recoverPassword(email)}
        onResetPassword={async (email, code, newPass) => {
          await clientApi.resetPassword(email, code, newPass);
          showToast(
            pickLocalizedText(lang, {
              en: 'Password reset successful!',
              pl: 'Hasło zostało zresetowane!',
              az: 'Şifrə uğurla yeniləndi!',
            })
          );
        }}
        onLogout={() => {
          setAuthToken(null);
          showToast(
            pickLocalizedText(lang, {
              en: 'Logged out',
              pl: 'Wylogowano z sesji',
              az: 'Hesabdan çıxış edildi',
            })
          );
        }}
        onDeleteAccount={async () => {
          const res = await clientApi.deleteAccount();
          setState(res.state);
          showToast(
            pickLocalizedText(lang, {
              en: 'Account & all associated personal data permanently deleted.',
              pl: 'Konto i wszystkie powiązane dane osobowe zostały trwale usunięte.',
              az: 'Hesab və bütün əlaqəli şəxsi məlumatlar həmişəlik silindi.',
            })
          );
        }}
        onReportAiContent={async (payload) => {
          await clientApi.reportAiContent(payload);
          showToast(
            pickLocalizedText(lang, {
              en: 'Thank you! AI content report submitted for review.',
              pl: 'Dziękujemy! Zgłoszenie treści AI zostało wysłane.',
              az: 'Təşəkkür edirik! AI məzmun şikayəti göndərildi.',
            })
          );
        }}
        onExportUserData={async () => {
          const data = await clientApi.exportUserData();
          if (typeof window !== 'undefined' && typeof document !== 'undefined') {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mealplanner-gdpr-export-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
          showToast(
            pickLocalizedText(lang, {
              en: 'Exported personal data (JSON).',
              pl: 'Wyeksportowano dane osobowe (JSON).',
              az: 'Şəxsi məlumatlar ixrac edildi (JSON).',
            })
          );
        }}
        onOpenRecipeDetail={(recipe) => {
          setSelectedRecipe(recipe);
          setRecipeServingsOverride(recipe.baseServings);
          setRecipesViewMode('detail');
          setActiveTab('recipes');
        }}
      />
    </div>
  );
};
