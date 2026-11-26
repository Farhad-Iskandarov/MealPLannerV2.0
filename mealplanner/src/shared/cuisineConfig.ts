import { CuisinePreference, CuisineSlug, Language } from './types';

export const SUPPORTED_CUISINES: readonly CuisineSlug[] = [
  'italian',
  'french',
  'polish',
  'greek',
  'azerbaijani',
  'spanish',
] as const;

export const VALID_CUISINE_PREFERENCES = new Set<string>(['any', ...SUPPORTED_CUISINES]);

export interface CuisineOptionMeta {
  key: CuisinePreference;
  icon: string;
  label: Record<Language, string>;
}

export const CUISINE_OPTIONS: readonly CuisineOptionMeta[] = [
  {
    key: 'any',
    icon: '🌍',
    label: {
      en: 'Any cuisine',
      pl: 'Dowolna kuchnia',
      az: 'İstənilən mətbəx',
    },
  },
  {
    key: 'italian',
    icon: '🇮🇹',
    label: {
      en: 'Italian',
      pl: 'Włoska',
      az: 'İtalyan',
    },
  },
  {
    key: 'french',
    icon: '🇫🇷',
    label: {
      en: 'French',
      pl: 'Francuska',
      az: 'Fransız',
    },
  },
  {
    key: 'polish',
    icon: '🇵🇱',
    label: {
      en: 'Polish',
      pl: 'Polska',
      az: 'Polşa',
    },
  },
  {
    key: 'greek',
    icon: '🇬🇷',
    label: {
      en: 'Greek',
      pl: 'Grecka',
      az: 'Yunan',
    },
  },
  {
    key: 'azerbaijani',
    icon: '🇦🇿',
    label: {
      en: 'Azerbaijani',
      pl: 'Azerbejdżańska',
      az: 'Azərbaycan',
    },
  },
  {
    key: 'spanish',
    icon: '🇪🇸',
    label: {
      en: 'Spanish',
      pl: 'Hiszpańska',
      az: 'İspan',
    },
  },
] as const;

export function isValidCuisineSlug(value: unknown): value is CuisineSlug {
  return typeof value === 'string' && (SUPPORTED_CUISINES as readonly string[]).includes(value.trim().toLowerCase());
}

export function isValidCuisinePreference(value: unknown): value is CuisinePreference {
  if (typeof value !== 'string') return false;
  return VALID_CUISINE_PREFERENCES.has(value.trim().toLowerCase());
}

/**
 * Normalizes a stored or optional cuisine preference safely with backward compatibility:
 * null / undefined / empty string / 'any' -> 'any'.
 * Any valid CuisineSlug -> canonical lowercase slug.
 * Unknown/corrupt legacy values -> 'any'.
 */
export function normalizeCuisinePreference(value: unknown): CuisinePreference {
  if (typeof value !== 'string') return 'any';
  const cleaned = value.trim().toLowerCase();
  if (VALID_CUISINE_PREFERENCES.has(cleaned)) {
    return cleaned as CuisinePreference;
  }
  return 'any';
}

export function getCuisineLabel(cuisine: CuisinePreference | null | undefined, lang: Language): string {
  const norm = normalizeCuisinePreference(cuisine);
  const found = CUISINE_OPTIONS.find((c) => c.key === norm);
  return found ? found.label[lang] : CUISINE_OPTIONS[0].label[lang];
}
