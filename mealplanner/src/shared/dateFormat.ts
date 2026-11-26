import { Language } from './types';

export const WARSAW_TIME_ZONE = 'Europe/Warsaw';

/**
 * Formats an ISO-8601 observation timestamp in Europe/Warsaw with explicit timezone abbreviation
 * (e.g. "23.11.2026, 01:08 CET (Europe/Warsaw)").
 * Preserves unknown/legacy timestamps by returning null when input is null, empty, or invalid.
 */
export function formatWarsawObservationTimestamp(
  iso: string | null | undefined,
  lang: Language = 'pl'
): string | null {
  if (!iso || typeof iso !== 'string' || !iso.trim()) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;

  try {
    const locale = lang === 'pl' ? 'pl-PL' : lang === 'az' ? 'az-Latn-AZ' : 'en-GB';
    const datePart = new Intl.DateTimeFormat(locale, {
      timeZone: WARSAW_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);

    // Extract unambiguous CET/CEST (or GMT+1/GMT+2) timezone name in Europe/Warsaw
    const tzParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: WARSAW_TIME_ZONE,
      timeZoneName: 'short',
    }).formatToParts(date);
    const tzName = tzParts.find((p) => p.type === 'timeZoneName')?.value || 'CET';

    return `${datePart} ${tzName} (${WARSAW_TIME_ZONE})`;
  } catch {
    return null;
  }
}
