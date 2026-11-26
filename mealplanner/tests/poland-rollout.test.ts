import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MealPlannerDatabase } from '../src/server/db/database';
import {
  extractPolishPackSize,
  matchConservativePolishCanonical,
  normalizePolishText,
  parsePolishDecimal,
  parseRetryAfterHeader,
  fetchGlovoBiedronkaWarsawSnapshot,
  GLOVO_BIEDRONKA_SOURCE_NAME,
  GLOVO_BIEDRONKA_STORE_LOCATION,
  GLOVO_BIEDRONKA_STORE_URL,
  BIEDRONKA_REFRESH_CADENCE_DAYS,
  DEFAULT_BIEDRONKA_MAX_SECTIONS,
  parseGlovoJsonLossless,
  parseGlovoProductViewResponse,
  buildGlovoProductUrl,
  fetchGlovoBiedronkaProductDetail,
  validateBiedronkaProductIdentity,
} from '../src/server/monitoring/biedronkaGlovoMonitor';
import { createApp } from '../src/server/app';
import { formatWarsawObservationTimestamp } from '../src/shared/dateFormat';
import {
  clearVerifiedBiedronkaSnapshot,
  getActiveVerifiedBiedronkaSnapshot,
  applyVerifiedBiedronkaSnapshotToCatalogue,
  getPromotionalOffersForRegion,
} from '../src/server/supermarkets/catalogueData';
import { analyzeAndOptimizeBudget } from '../src/server/budget/budgetOptimizer';
import { normalizeCachedShoppingListForPricingPolicy } from '../src/client/api/clientApi';
import { supermarketRegistry } from '../src/server/supermarkets/supermarketService';
import {
  validateRecipeForUser,
  collectHardExclusionTerms,
} from '../src/server/validation/mealValidator';
import { generateValidatedWeeklyMealPlan } from '../src/server/ai/aiMealPlanner';
import { buildSmartShoppingList } from '../src/server/matching/quantityEngine';
import { SEED_RECIPES } from '../src/server/recipes/recipeSeedData';
import { Recipe } from '../src/shared/types';

function makeGlovoHomepageHtml(sectionIds: Array<{ name: string; id: string }>): string {
  const links = sectionIds
    .map(
      (s) =>
        `"/v4/stores/12345/addresses/67890/content/main?nodeType=DEEP_LINK\\u0026link=cat#${s.name}.${s.id}"`
    )
    .join('\n');
  return `<html><body><script>${links}</script></body></html>`;
}

function makeGlovoSectionPayload(
  products: Array<{ id: string; name: string; price: number; promoPrice?: number; isPrime?: boolean }>
) {
  return {
    data: {
      body: [
        {
          data: {
            elements: products.map((p) => ({
              type: 'PRODUCT_TILE',
              data: {
                id: p.id,
                storeProductId: p.id,
                name: p.name,
                price: p.price,
                available: true,
                promotion:
                  p.promoPrice !== undefined
                    ? { price: p.promoPrice, isPrime: Boolean(p.isPrime) }
                    : null,
              },
            })),
          },
        },
      ],
    },
  };
}

describe('Poland Rollout: Biedronka-Only Store, Glovo Warsaw 5-Day Snapshots, Conservative Pricing & Hard Exclusions', () => {
  let db: MealPlannerDatabase;

  beforeEach(async () => {
    clearVerifiedBiedronkaSnapshot();
    db = new MealPlannerDatabase(':memory:');
    await db.seedIfEmpty();
  });

  afterEach(() => {
    clearVerifiedBiedronkaSnapshot();
    db.db.close();
  });

  describe('1. Biedronka-only Poland store & legacy selection coercion (AZ preserved)', () => {
    it('exposes only Biedronka in Poland while preserving all 6 Azerbaijan stores', () => {
      const plStores = supermarketRegistry.getAllStores('PL').map((s) => s.id);
      const azStores = supermarketRegistry.getAllStores('AZ').map((s) => s.id);
      expect(plStores).toEqual(['biedronka']);
      expect(azStores).toEqual(['bravo', 'araz', 'bazarstore', 'rahat', 'oba', 'birmarket']);
    });

    it('coerces legacy saved Polish store selections (lidl/auchan/kaufland/zabka) in SQLite to biedronka', () => {
      // Simulate legacy saved rows directly in test SQLite database
      db.db
        .prepare("UPDATE preferences SET preferred_supermarket = 'lidl' WHERE user_id = 'user-farhad-1'")
        .run();
      db.db
        .prepare("UPDATE weekly_plans SET supermarket_id = 'auchan' WHERE user_id = 'user-farhad-1'")
        .run();
      db.db
        .prepare("UPDATE shopping_lists SET supermarket_id = 'kaufland' WHERE user_id = 'user-farhad-1'")
        .run();

      const prefs = db.getPreferences('user-farhad-1');
      const plan = db.getWeeklyPlan('user-farhad-1');
      const list = db.getShoppingList('user-farhad-1');

      expect(prefs.preferredSupermarket).toBe('biedronka');
      expect(plan.supermarketId).toBe('biedronka');
      expect(list.supermarketId).toBe('biedronka');
      expect(Object.keys(list.comparisonByStore)).toEqual(['biedronka']);
    });

    it('preserves Azerbaijan multi-store switching (Bravo, Araz, Bazarstore, Rahat)', () => {
      db.updatePreferences('user-farhad-1', {
        regionCode: 'AZ',
        currencyCode: 'AZN',
        preferredSupermarket: 'bazarstore',
      });
      const azList = db.getShoppingList('user-farhad-1');
      expect(azList.supermarketId).toBe('bazarstore');
      expect(Object.keys(azList.comparisonByStore).sort()).toEqual([
        'araz',
        'bazarstore',
        'bravo',
        'rahat',
      ]);
    });
  });

  describe('2. Glovo Warsaw Biedronka collector, Retry-After, atomic activation & retention on partial/rate-limited refresh', () => {
    it('activates a complete validated snapshot atomically, stores Glovo Warsaw metadata & 5-day cadence, and retains it on rate-limited or incomplete refreshes', async () => {
      const homeHtml = makeGlovoHomepageHtml([
        { name: 'warzywa', id: '101' },
        { name: 'nabial-i-mieso', id: '102' },
      ]);

      const sec101 = makeGlovoSectionPayload([
        { id: 'SKU-BAN-1', name: 'Banany luzem 1 kg', price: 6.49, promoPrice: 4.49 },
        { id: 'SKU-MAR-1', name: 'Marchew myta 1 kg', price: 3.29 },
        { id: 'SKU-CEB-1', name: 'Cebula żółta 1 kg', price: 3.49 },
        { id: 'SKU-SOK-1', name: 'Sok marchewkowy 0,3 l', price: 2.99 }, // must NOT match carrot
      ]);
      const sec102 = makeGlovoSectionPayload([
        { id: 'SKU-KUR-1', name: 'Filet z piersi kurczaka 0,5 kg', price: 11.49 },
        { id: 'SKU-MLE-1', name: 'Mleko świeże 2% 1 l', price: 3.79, promoPrice: 3.19 },
        { id: 'SKU-RYZ-1', name: 'Ryż biały długoziarnisty 1 kg', price: 5.49 },
        { id: 'SKU-JAJ-1', name: 'Jaja ściółkowe M 10 szt.', price: 8.99 },
        { id: 'SKU-OLI-1', name: 'Oliwa z oliwek Extra Virgin 0,5 l', price: 15.99 },
      ]);

      const sleepCalls: number[] = [];
      let sec102Calls = 0;

      // Fixture 1: Complete refresh with one transient 429 honoring Retry-After: 2
      const completeFetch = (async (url: string) => {
        if (url === GLOVO_BIEDRONKA_STORE_URL) {
          return new Response(homeHtml, { status: 200 });
        }
        if (url.includes('id=101')) {
          return new Response(JSON.stringify(sec101), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('id=102')) {
          sec102Calls++;
          if (sec102Calls === 1) {
            return new Response('Too Many Requests', {
              status: 429,
              headers: { 'retry-after': '2' },
            });
          }
          return new Response(JSON.stringify(sec102), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('Not Found', { status: 404 });
      }) as typeof fetch;

      const t1 = '2026-11-23T00:00:00.000Z';
      const firstRun = await db.runBiedronkaGlovoRefresh({
        triggerType: 'SCHEDULED_5D',
        customFetch: completeFetch,
        sleepFn: async (ms) => {
          sleepCalls.push(ms);
        },
        requestDelayMs: 100,
        minValidProducts: 5,
        nowIso: t1,
      });

      expect(firstRun.activated).toBe(true);
      expect(firstRun.syncRun.status).toBe('SUCCESS');
      expect(firstRun.activeSnapshotId).toBeTruthy();
      expect(sleepCalls).toContain(2000); // Honored Retry-After: 2 seconds!
      expect(sleepCalls).toContain(100); // Paced between sections

      const summaryAfterFirst = db.getBiedronkaSnapshotSummary(new Date(t1).getTime());
      expect(summaryAfterFirst.sourceName).toBe(GLOVO_BIEDRONKA_SOURCE_NAME);
      expect(summaryAfterFirst.storeLocation).toBe(GLOVO_BIEDRONKA_STORE_LOCATION);
      expect(summaryAfterFirst.refreshCadenceDays).toBe(BIEDRONKA_REFRESH_CADENCE_DAYS);
      expect(summaryAfterFirst.activeItemsCount).toBe(9);
      expect(summaryAfterFirst.isStale).toBe(false);

      // Verify 5-day freshness cadence (stale after 121 hours)
      const afterSixDaysMs = new Date(t1).getTime() + 6 * 24 * 3600 * 1000;
      expect(db.getBiedronkaSnapshotSummary(afterSixDaysMs).isStale).toBe(true);

      // Verify shopping list now uses verified Glovo Warsaw SKU, original Polish name & REGULAR PLN price under policy
      const listAfterFirst = db.getShoppingList('user-farhad-1');
      const bananaItem = listAfterFirst.items.find((i) => i.canonicalIngredient === 'banana')!;
      expect(bananaItem.isPriced).toBe(true);
      expect(bananaItem.sku).toBe('SKU-BAN-1');
      expect(bananaItem.namePl).toBe('Banany luzem 1 kg');
      expect(bananaItem.unitPricePln).toBe(6.49); // Regular shelf price under PL regular-price-only policy
      expect(bananaItem.sourceName).toBe(GLOVO_BIEDRONKA_SOURCE_NAME);
      expect(bananaItem.storeLocation).toBe(GLOVO_BIEDRONKA_STORE_LOCATION);
      // Confirm promo amount (4.49) is STILL stored intact in SQLite snapshot!
      const storedBanana = db.getActiveBiedronkaSnapshotItems().find((i) => i.sku === 'SKU-BAN-1')!;
      expect(storedBanana.regularPricePln).toBe(6.49);
      expect(storedBanana.promoPricePln).toBe(4.49);

      // Verify items missing from the verified snapshot are explicitly UNPRICED and mark an INCOMPLETE total!
      expect(listAfterFirst.hasIncompleteTotal).toBe(true);
      expect(listAfterFirst.unpricedItemsCount).toBeGreaterThan(0);
      const unpricedItem = listAfterFirst.items.find((i) => i.isPriced === false)!;
      expect(unpricedItem.lineTotalPln).toBe(0);
      expect(unpricedItem.recommendedPackages).toBe(0);

      // Fixture 2: Rate-limited (429 with huge Retry-After exceeding cap) -> MUST NOT promote, MUST retain firstRun snapshot!
      const rateLimitedFetch = (async (url: string) => {
        if (url === GLOVO_BIEDRONKA_STORE_URL) {
          return new Response(homeHtml, { status: 200 });
        }
        if (url.includes('id=101')) {
          return new Response(
            JSON.stringify(
              makeGlovoSectionPayload([{ id: 'SKU-BAD', name: 'Banany luzem 1 kg', price: 99.99 }])
            ),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        return new Response('Rate Limited', { status: 429, headers: { 'retry-after': '3600' } });
      }) as typeof fetch;

      const rateLimitedRun = await db.runBiedronkaGlovoRefresh({
        triggerType: 'MANUAL_API',
        customFetch: rateLimitedFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        maxRetryAfterMs: 5000,
        nowIso: '2026-11-24T00:00:00.000Z',
      });

      expect(rateLimitedRun.activated).toBe(false);
      expect(rateLimitedRun.syncRun.status).toBe('RATE_LIMITED');
      expect(rateLimitedRun.activeSnapshotId).toBe(firstRun.activeSnapshotId);

      // Fixture 3: Partial / incomplete refresh (section 102 returns HTTP 500) -> MUST NOT promote, MUST retain firstRun snapshot!
      const partialFetch = (async (url: string) => {
        if (url === GLOVO_BIEDRONKA_STORE_URL) {
          return new Response(homeHtml, { status: 200 });
        }
        if (url.includes('id=101')) {
          return new Response(JSON.stringify(sec101), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('Internal Server Error', { status: 500 });
      }) as typeof fetch;

      const partialRun = await db.runBiedronkaGlovoRefresh({
        triggerType: 'MANUAL_API',
        customFetch: partialFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        nowIso: '2026-11-25T00:00:00.000Z',
      });

      expect(partialRun.activated).toBe(false);
      expect(partialRun.syncRun.status).toBe('PARTIAL_REJECTED');
      expect(partialRun.activeSnapshotId).toBe(firstRun.activeSnapshotId);

      // Confirm last good snapshot is still serving 6.49 PLN regular bananas (not 99.99 PLN)
      const listAfterFailures = db.getShoppingList('user-farhad-1');
      const bananaRetained = listAfterFailures.items.find((i) => i.canonicalIngredient === 'banana')!;
      expect(bananaRetained.unitPricePln).toBe(6.49);
      expect(bananaRetained.sku).toBe('SKU-BAN-1');

      // Confirm offline client cache hydration works from the active verified items
      const activeItems = db.getActiveBiedronkaSnapshotItems();
      clearVerifiedBiedronkaSnapshot();
      expect(getActiveVerifiedBiedronkaSnapshot().snapshotId).toBeNull();
      applyVerifiedBiedronkaSnapshotToCatalogue(activeItems, {
        snapshotId: firstRun.activeSnapshotId,
        activatedAt: t1,
      });
      expect(getActiveVerifiedBiedronkaSnapshot().snapshotId).toBe(firstRun.activeSnapshotId);
      expect(getActiveVerifiedBiedronkaSnapshot().items.length).toBe(9);
    });

    it('covers all 251 observed Glovo sections without hitting a 250-section cap and activates atomically', async () => {
      expect(DEFAULT_BIEDRONKA_MAX_SECTIONS).toBeGreaterThanOrEqual(251);

      const sections251 = Array.from({ length: 251 }, (_, i) => ({
        name: `sekcja-${i + 1}`,
        id: String(1000 + i),
      }));
      const homeHtml251 = makeGlovoHomepageHtml(sections251);

      const fetch251 = (async (url: string) => {
        if (url === GLOVO_BIEDRONKA_STORE_URL) {
          return new Response(homeHtml251, { status: 200 });
        }
        const idMatch = url.match(/id=(\d+)/);
        const secNum = idMatch ? Number(idMatch[1]) - 1000 : 0;
        const payload = makeGlovoSectionPayload([
          {
            id: `SKU-251-${secNum}`,
            name: secNum === 250 ? 'Banany luzem 1 kg' : `Produkt testowy ${secNum} 500 g`,
            price: secNum === 250 ? 4.29 : 5.99,
          },
        ]);
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      // Uses default maxSections (must NOT truncate 251 sections!)
      const res = await db.runBiedronkaGlovoRefresh({
        triggerType: 'CLI_COMMAND',
        customFetch: fetch251,
        sleepFn: async () => {},
        requestDelayMs: 0,
        nowIso: '2026-11-23T01:00:00.000Z',
      });

      expect(res.activated).toBe(true);
      expect(res.syncRun.status).toBe('SUCCESS');
      const summary = db.getBiedronkaSnapshotSummary(new Date('2026-11-23T01:00:00.000Z').getTime());
      expect(summary.totalSections).toBe(251);
      expect(summary.succeededSections).toBe(251);
      expect(summary.activeItemsCount).toBe(251);

      // Verify the 251st section (index 250) was actually included and matched!
      const items = db.getActiveBiedronkaSnapshotItems();
      const lastSectionBanana = items.find((i) => i.sku === 'SKU-251-250');
      expect(lastSectionBanana).toBeDefined();
      expect(lastSectionBanana?.canonicalIngredient).toBe('banana');
      expect(lastSectionBanana?.effectivePricePln).toBe(4.29);
    });

    it('supports safe resumable staging across ticks when HTTP 429 occurs after 70 of 251 sections, honors persisted Retry-After/backoff, retains last good snapshot until 251/251 complete, and enforces 5-day interval', async () => {
      // Seed an initial good active snapshot at day 0
      const seedHome = makeGlovoHomepageHtml([{ name: 'seed', id: '1' }]);
      const seedFetch = (async (url: string) => {
        if (url === GLOVO_BIEDRONKA_STORE_URL) {
          return new Response(seedHome, { status: 200 });
        }
        return new Response(
          JSON.stringify(
            makeGlovoSectionPayload([
              { id: 'SKU-OLD-BAN', name: 'Banany luzem 1 kg', price: 5.55 },
            ])
          ),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }) as typeof fetch;

      const day0Ms = Date.parse('2026-11-01T00:00:00.000Z');
      const initial = await db.runBiedronkaGlovoRefresh({
        triggerType: 'SCHEDULED_5D',
        customFetch: seedFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        minValidProducts: 1,
        nowIso: new Date(day0Ms).toISOString(),
      });
      expect(initial.activated).toBe(true);
      const oldSnapshotId = initial.activeSnapshotId!;

      // Build a 251-section catalog where tick 1 hits HTTP 429 on the 71st section (index 70)
      const sections251 = Array.from({ length: 251 }, (_, i) => ({
        name: `kat-${i + 1}`,
        id: String(2000 + i),
      }));
      const homeHtml251 = makeGlovoHomepageHtml(sections251);

      let networkCalls = 0;
      let should429OnSection70 = true;

      const stagedFetch = (async (url: string) => {
        networkCalls++;
        if (url === GLOVO_BIEDRONKA_STORE_URL) {
          return new Response(homeHtml251, { status: 200 });
        }
        const idMatch = url.match(/id=(\d+)/);
        const idx = idMatch ? Number(idMatch[1]) - 2000 : -1;

        if (idx === 70 && should429OnSection70) {
          should429OnSection70 = false; // Next tick after backoff will succeed
          return new Response('Too Many Requests', {
            status: 429,
            headers: { 'retry-after': '1200' }, // 20 minutes (> 15m initial backoff)
          });
        }

        const payload = makeGlovoSectionPayload([
          {
            id: `SKU-NEW-${idx}`,
            name: idx === 250 ? 'Banany luzem 1 kg' : `Artykul ${idx} 1 kg`,
            price: idx === 250 ? 3.99 : 4.5,
          },
        ]);
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      // Tick 1: 6 days after initial snapshot (> 5-day interval). Requests 100 sections, hits 429 after 70 sections.
      const tick1Ms = day0Ms + 6 * 24 * 3600 * 1000;
      const tick1 = await db.runResumableBiedronkaRefreshTick({
        triggerType: 'SCHEDULED_5D',
        customFetch: stagedFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        sectionsPerTick: 100,
        nowIso: new Date(tick1Ms).toISOString(),
      });

      expect(tick1.activated).toBe(false);
      expect(tick1.deferred).toBe(true);
      expect(tick1.status).toBe('RATE_LIMITED_BACKOFF');
      expect(tick1.completedSections).toBe(70);
      expect(tick1.totalSections).toBe(251);
      expect(tick1.activeSnapshotId).toBe(oldSnapshotId); // Last good snapshot still served!
      expect(tick1.stagingSnapshotId).toBeTruthy();
      expect(tick1.deferredUntil).toBe(new Date(tick1Ms + 1200 * 1000).toISOString());

      // Verify old snapshot is still serving 5.55 PLN bananas
      expect(db.getActiveBiedronkaSnapshotItems()[0].effectivePricePln).toBe(5.55);

      // Tick 2: 10 minutes later (BEFORE persisted Retry-After expires) -> 0 network requests!
      const callsBeforeTick2 = networkCalls;
      const tick2 = await db.runResumableBiedronkaRefreshTick({
        triggerType: 'SCHEDULED_5D',
        customFetch: stagedFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        sectionsPerTick: 100,
        nowIso: new Date(tick1Ms + 600 * 1000).toISOString(),
      });

      expect(networkCalls).toBe(callsBeforeTick2);
      expect(tick2.activated).toBe(false);
      expect(tick2.deferred).toBe(true);
      expect(tick2.status).toBe('RATE_LIMITED_BACKOFF');
      expect(tick2.activeSnapshotId).toBe(oldSnapshotId);

      // Tick 3: 21 minutes later (AFTER Retry-After expires) -> resumes from section 70..169 (170/251 done)
      const tick3Ms = tick1Ms + 1260 * 1000;
      const tick3 = await db.runResumableBiedronkaRefreshTick({
        triggerType: 'SCHEDULED_5D',
        customFetch: stagedFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        sectionsPerTick: 100,
        nowIso: new Date(tick3Ms).toISOString(),
      });

      expect(tick3.activated).toBe(false);
      expect(tick3.status).toBe('STAGING_IN_PROGRESS');
      expect(tick3.completedSections).toBe(170);
      expect(tick3.totalSections).toBe(251);
      expect(tick3.stagingSnapshotId).toBe(tick1.stagingSnapshotId);
      expect(tick3.activeSnapshotId).toBe(oldSnapshotId); // Still serving old snapshot!

      // Tick 4: completes remaining 81 sections (170..250 -> 251/251) -> ATOMIC PUBLICATION!
      const tick4Ms = tick3Ms + 60 * 1000;
      const tick4 = await db.runResumableBiedronkaRefreshTick({
        triggerType: 'SCHEDULED_5D',
        customFetch: stagedFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        sectionsPerTick: 100,
        nowIso: new Date(tick4Ms).toISOString(),
      });

      expect(tick4.activated).toBe(true);
      expect(tick4.status).toBe('ACTIVATED');
      expect(tick4.completedSections).toBe(251);
      expect(tick4.totalSections).toBe(251);
      expect(tick4.activeSnapshotId).toBe(tick1.stagingSnapshotId);
      expect(tick4.activeSnapshotId).not.toBe(oldSnapshotId);

      // Verify new snapshot is now active and serving 3.99 PLN bananas from section 250
      const activeAfter = db.getActiveBiedronkaSnapshotItems();
      expect(activeAfter.length).toBe(251);
      expect(activeAfter.find((i) => i.sku === 'SKU-NEW-250')?.effectivePricePln).toBe(3.99);
      // Verify per-section observation timestamps were preserved across staged ticks (not overwritten by activation time!)
      expect(activeAfter.find((i) => i.sku === 'SKU-NEW-0')?.observedAt).toBe(
        new Date(tick1Ms).toISOString()
      );
      expect(activeAfter.find((i) => i.sku === 'SKU-NEW-70')?.observedAt).toBe(
        new Date(tick3Ms).toISOString()
      );
      expect(activeAfter.find((i) => i.sku === 'SKU-NEW-250')?.observedAt).toBe(
        new Date(tick4Ms).toISOString()
      );

      // Tick 5: 2 days later (within 5-day cadence) -> SKIPPED_FRESH_5D with 0 network calls!
      const callsBeforeTick5 = networkCalls;
      const tick5 = await db.runResumableBiedronkaRefreshTick({
        triggerType: 'SCHEDULED_5D',
        customFetch: stagedFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        sectionsPerTick: 100,
        nowIso: new Date(tick4Ms + 2 * 24 * 3600 * 1000).toISOString(),
      });

      expect(networkCalls).toBe(callsBeforeTick5);
      expect(tick5.activated).toBe(false);
      expect(tick5.deferred).toBe(true);
      expect(tick5.status).toBe('SKIPPED_FRESH_5D');
      expect(tick5.activeSnapshotId).toBe(tick4.activeSnapshotId);
    });
  });

  describe('3. Conservative Polish matching, diacritics, decimal commas & dimensions', () => {
    it('handles Polish diacritics, decimal commas, multipacks, and rejects non-staples or dimension mismatches', () => {
      expect(normalizePolishText('Cebula żółta i Płatki owsiane górskie')).toBe(
        'cebula zolta i platki owsiane gorskie'
      );
      expect(parsePolishDecimal('4,99 zł')).toBe(4.99);
      expect(parseRetryAfterHeader('12')).toBe(12000);

      expect(extractPolishPackSize('Filet z piersi kurczaka 0,5 kg')).toEqual({
        packageSize: 500,
        packageUnit: 'g',
        packageLabelPl: '0,5 kg',
      });
      expect(extractPolishPackSize('Oliwa z oliwek Extra Virgin 0,5 l')).toEqual({
        packageSize: 500,
        packageUnit: 'ml',
        packageLabelPl: '0,5 l',
      });
      expect(extractPolishPackSize('Jaja ściółkowe M 10 szt.')).toEqual({
        packageSize: 10,
        packageUnit: 'pcs',
        packageLabelPl: '10 szt.',
      });
      expect(extractPolishPackSize('Mleko UHT 6 x 1 l')).toEqual({
        packageSize: 6000,
        packageUnit: 'ml',
        packageLabelPl: '6 × 1 l',
      });
      // Ambiguous product without pack size returns null (never guesses 500 g)
      expect(extractPolishPackSize('Mix warzyw sezonowych')).toBeNull();

      // Verified conservative matches
      expect(matchConservativePolishCanonical('Marchew myta 1 kg', 'g')?.canonicalIngredient).toBe('carrot');
      expect(matchConservativePolishCanonical('Cebula żółta 1 kg', 'g')?.canonicalIngredient).toBe('onion');
      expect(matchConservativePolishCanonical('Mleko świeże 2% 1 l', 'ml')?.canonicalIngredient).toBe('milk');

      // Dimension mismatch rejected (milk in grams, carrots in ml)
      expect(matchConservativePolishCanonical('Mleko świeże 2% 1 kg', 'g')).toBeNull();
      expect(matchConservativePolishCanonical('Marchew myta 1 l', 'ml')).toBeNull();

      // Non-staples & ambiguous processed items rejected
      expect(matchConservativePolishCanonical('Sok marchewkowy 0,3 l', 'ml')).toBeNull();
      expect(matchConservativePolishCanonical('Krążki cebulowe 450 g', 'g')).toBeNull();
      expect(matchConservativePolishCanonical('Mleko kokosowe 400 ml', 'ml')).toBeNull();
      expect(matchConservativePolishCanonical('Chipsy ziemniaczane 140 g', 'g')).toBeNull();
    });
  });

  describe('4. Allergy & Dislike Hard Exclusions (Compounds + Onion/Cebula Aliases), Likes Ranking, No-Safe-Recipe & Determinism', () => {
    it('hard-excludes onion/cebula aliases and known compounds (e.g. milk -> pesto/parmesan/jogurt) in recipes and shopping lists', async () => {
      // Dislike 'cebuli' (Polish inflected onion alias) must hard-exclude all recipes with onion
      const prefs = {
        ...db.getPreferences('user-farhad-1'),
        regionCode: 'PL' as const,
        currencyCode: 'PLN' as const,
        preferredSupermarket: 'biedronka' as const,
        dislikes: ['cebuli'],
        allergies: ['milk'],
        likes: ['salmon'],
        planDurationDays: 3,
      };

      // Compound test: a recipe containing pesto (dairy/nuts) must be blocked by milk allergy
      const pestoRecipe: Recipe = {
        ...SEED_RECIPES[0],
        id: 'rec-test-pesto',
        titlePl: 'Makaron z zielonym pesto i parmezanem',
        titleEn: 'Green Pesto Pasta with Parmesan',
        allergens: [],
        ingredients: [
          {
            id: 'ing-pesto-1',
            canonicalIngredient: 'pesto',
            namePl: 'Pesto bazyliowe z parmezanem',
            nameEn: 'Basil pesto with parmesan',
            amount: 50,
            unit: 'g',
            displayAmountPl: '50 g',
            displayAmountEn: '50 g',
            normalizedBaseAmount: 50,
            normalizedBaseUnit: 'g',
            category: 'Other',
            icon: '🌿',
          },
        ],
      };

      expect(validateRecipeForUser(pestoRecipe, prefs).valid).toBe(false);

      // Generate deterministic plan twice and verify identical output + zero onion/milk recipes
      const runA = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: 'wp-det-1',
        weekStartDate: '2026-11-10',
        preferences: prefs,
        availableRecipes: [...SEED_RECIPES, pestoRecipe],
        pantryItems: [],
        variationSeed: 3,
      });
      const runB = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: 'wp-det-1',
        weekStartDate: '2026-11-10',
        preferences: prefs,
        availableRecipes: [...SEED_RECIPES, pestoRecipe],
        pantryItems: [],
        variationSeed: 3,
      });

      expect(runA.meals.length).toBe(9);
      expect(runA.meals.map((m) => m.recipe.id)).toEqual(runB.meals.map((m) => m.recipe.id));

      for (const m of runA.meals) {
        const canonicals = m.recipe.ingredients.map((i) => i.canonicalIngredient);
        expect(canonicals).not.toContain('onion');
        expect(canonicals).not.toContain('milk');
        expect(canonicals).not.toContain('greek_yogurt');
        expect(canonicals).not.toContain('cottage_cheese');
        expect(m.recipe.id).not.toBe('rec-test-pesto');
      }

      // Likes only rank eligible recipes: salmon was liked and eligible, so it should appear in the plan
      expect(runA.meals.some((m) => m.recipe.id === 'rec-baked-salmon-broccoli')).toBe(true);

      // Verify shopping list also hard-excludes any onion/milk item
      const shopping = buildSmartShoppingList({
        shoppingListId: 'sl-hard-excl',
        userId: 'user-farhad-1',
        weeklyPlanId: 'wp-det-1',
        supermarketId: 'biedronka',
        regionCode: 'PL',
        currencyCode: 'PLN',
        plannedMeals: runA.meals,
        pantryItems: [],
        subtractPantry: false,
        hardExcludedTerms: collectHardExclusionTerms(prefs),
      });
      expect(shopping.items.some((i) => i.canonicalIngredient === 'onion')).toBe(false);
      expect(shopping.items.some((i) => i.canonicalIngredient === 'milk')).toBe(false);
    });

    it('likes NEVER override a hard exclusion, and reports NO_SAFE_RECIPE when no eligible recipes remain', async () => {
      const impossiblePrefs = {
        ...db.getPreferences('user-farhad-1'),
        allergies: ['milk', 'eggs', 'gluten', 'fish', 'soy'],
        dislikes: ['onion', 'chicken_breast', 'pork_loin', 'rice', 'potato', 'oat_flakes', 'banana', 'apple'],
        likes: ['chicken_breast', 'salmon'], // Likes must NEVER override hard exclusions!
        planDurationDays: 2,
      };

      const res = await generateValidatedWeeklyMealPlan({
        weeklyPlanId: 'wp-none',
        weekStartDate: '2026-11-10',
        preferences: impossiblePrefs,
        availableRecipes: SEED_RECIPES,
        pantryItems: [],
        variationSeed: 0,
      });

      expect(res.hasNoSafeRecipes).toBe(true);
      expect(res.meals).toEqual([]);
      expect(res.noSafeRecipeSlots && res.noSafeRecipeSlots.length).toBeGreaterThan(0);
      expect(res.notesEn.toLowerCase()).toContain('no safe recipes');
    });
  });

  describe('5. Lossless 64-bit IDs, Europe/Warsaw Per-Item Timestamps, Legacy Unknowns & On-Demand Product Details', () => {
    it('parses 64-bit and 29-digit Glovo IDs losslessly without JS Number rounding and formats Europe/Warsaw timestamps', () => {
      // Raw JSON with unquoted 19-digit productId (exceeds Number.MAX_SAFE_INTEGER = 9007199254740991)
      const rawJson =
        '{"data":{"metadata":{"product":{"id":4611686018881015235,"externalId":"32519899243694822619161320176","storeProductId":"32519899243694822619161320176","price":9.49,"name":"Barilla Basilico Sos pomidorowy z bazylią 400 g"}}}}';
      const parsed = parseGlovoJsonLossless(rawJson);
      expect(parsed.data.metadata.product.id).toBe('4611686018881015235');
      expect(parsed.data.metadata.product.externalId).toBe('32519899243694822619161320176');
      expect(parsed.data.metadata.product.price).toBe(9.49);

      const url = buildGlovoProductUrl({
        productId: '4611686018881015235',
        externalProductId: '32519899243694822619161320176',
        storeProductId: '32519899243694822619161320176',
      });
      expect(url).toBe(
        'https://glovoapp.com/en/pl/warszawa/stores/biedronka-waw?productId=4611686018881015235&externalProductId=32519899243694822619161320176&storeProductId=32519899243694822619161320176'
      );

      // Winter CET (+01:00) and Summer CEST (+02:00) formatting in Europe/Warsaw
      const winter = formatWarsawObservationTimestamp('2026-11-23T00:08:00.000Z', 'en');
      expect(winter).toContain('01:08');
      expect(winter).toContain('Europe/Warsaw');
      expect(formatWarsawObservationTimestamp(null, 'pl')).toBeNull();
      expect(formatWarsawObservationTimestamp('', 'en')).toBeNull();
    });

    it('fetches, validates, and caches real Glovo product detail shape (Barilla Basilico), handles missing fields without guessing, honors 429 Retry-After, and preserves legacy NULL observed_at', async () => {
      const homeHtml = `<html><body><script>"/v4/stores/46905/addresses/868734/content/main?nodeType=DEEP_LINK\\u0026link=cat#sosy.501"</script></body></html>`;
      // Raw section payload with unquoted 64-bit productId
      const rawSectionJson = JSON.stringify({
        data: {
          body: [
            {
              data: {
                elements: [
                  {
                    type: 'PRODUCT_TILE',
                    data: {
                      id: '__BIG_ID_1__',
                      externalId: '32519899243694822619161320176',
                      storeProductId: '32519899243694822619161320176',
                      name: 'Banany luzem 1 kg',
                      price: 4.99,
                      available: true,
                    },
                  },
                  {
                    type: 'PRODUCT_TILE',
                    data: {
                      id: '__BIG_ID_2__',
                      externalId: '99988877766655544433322211100',
                      storeProductId: '99988877766655544433322211100',
                      name: 'Marchew myta 1 kg',
                      price: 3.29,
                      available: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      })
        .replace('"__BIG_ID_1__"', '4611686018881015235')
        .replace('"__BIG_ID_2__"', '4611686018881015999');

      const observedIso = '2026-11-22T14:35:00.000Z';
      const snapFetch = (async (url: string) => {
        if (url === GLOVO_BIEDRONKA_STORE_URL) {
          return new Response(homeHtml, { status: 200 });
        }
        return new Response(rawSectionJson, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      const snapRun = await db.runBiedronkaGlovoRefresh({
        triggerType: 'CLI_COMMAND',
        customFetch: snapFetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        minValidProducts: 1,
        nowIso: observedIso,
      });
      expect(snapRun.activated).toBe(true);

      // Verify lossless 64-bit IDs & exact per-item observedAt propagated to shopping list!
      const list = db.getShoppingList('user-farhad-1');
      const banana = list.items.find((i) => i.canonicalIngredient === 'banana')!;
      expect(banana.matchedProductNamePl).toBe('Banany luzem 1 kg');
      expect(banana.glovoProductId).toBe('4611686018881015235');
      expect(banana.storeProductId).toBe('32519899243694822619161320176');
      expect(banana.priceObservedAt).toBe(observedIso);
      expect(banana.glovoProductUrl).toContain('productId=4611686018881015235');
      expect(banana.glovoProductUrl).toContain('storeProductId=32519899243694822619161320176');

      // Real verified Glovo product view payload shape
      const rawDetailPayload = JSON.stringify({
        data: {
          header: { data: { title: 'Barilla Basilico Sos pomidorowy z bazylią 400 g' } },
          body: {
            data: {
              elements: [
                {
                  type: 'COLLAPSABLE_CONTAINER',
                  data: {
                    title: 'Składniki',
                    elements: [
                      {
                        type: 'TEXT',
                        data: {
                          text: 'pulpa pomidorowa 72 %, koncentrat pomidorowy 14 %, cebula, olej słonecznikowy, bazylia 2 %',
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'COLLAPSABLE_CONTAINER',
                  data: {
                    title: 'Informacje o wartościach odżywczych w 100 g/ml',
                    elements: [
                      { type: 'TWO_COLUMN_ROW_TEXT', data: { firstColumnText: 'Energia', secondColumnText: '268.0kJ' } },
                      { type: 'TWO_COLUMN_ROW_TEXT', data: { firstColumnText: 'Tłuszcz', secondColumnText: '2.6g' } },
                      {
                        type: 'TWO_COLUMN_ROW_TEXT',
                        data: {
                          firstColumnText: 'w tym kwasy tłuszczowe nasycone',
                          secondColumnText: '0.3g',
                          styles: { data: { paddingValues: { start: 'XS' } } },
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'COLLAPSABLE_CONTAINER',
                  data: {
                    title: 'Kraj pochodzenia',
                    elements: [{ type: 'TEXT', data: { text: 'Country of Origin - Italy' } }],
                  },
                },
              ],
            },
          },
          metadata: {
            product: {
              id: '__BIG_ID_1__',
              externalId: '32519899243694822619161320176',
              storeProductId: '32519899243694822619161320176',
              name: 'Barilla Basilico Sos pomidorowy z bazylią 400 g',
              description: 'Słodkie pomidory uprawiane na słonecznych polach i pachnące listki bazylii.',
              price: 9.49,
              imageUrl: 'https://glovo.dhmedia.io/image/example.jpg',
            },
          },
        },
      }).replace('"__BIG_ID_1__"', '4611686018881015235');

      const parsedView = parseGlovoProductViewResponse(rawDetailPayload)!;
      expect(parsedView.productId).toBe('4611686018881015235');
      expect(parsedView.ingredients).toContain('pulpa pomidorowa 72 %');
      expect(parsedView.nutritionBasis).toBe('Informacje o wartościach odżywczych w 100 g/ml');
      expect(parsedView.nutritionRows.length).toBe(3);
      expect(parsedView.nutritionRows[2].isSubRow).toBe(true);
      expect(parsedView.countryOfOrigin).toBe('Country of Origin - Italy');

      let detailFetchCalls = 0;
      const detailFetch = (async () => {
        detailFetchCalls++;
        return new Response(rawDetailPayload, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch;

      // 1st call: fetches on demand
      const d1 = await db.getOrFetchBiedronkaProductDetail('32519899243694822619161320176', {
        customFetch: detailFetch,
        nowIso: '2026-11-22T15:00:00.000Z',
      });
      expect(d1?.detailStatus).toBe('OK');
      expect(d1?.fromCache).toBe(false);
      expect(d1?.productId).toBe('4611686018881015235');
      expect(d1?.priceObservedAt).toBe(observedIso);
      expect(d1?.countryOfOrigin).toBe('Country of Origin - Italy');
      expect(detailFetchCalls).toBe(1);

      // 2nd call: served from SQLite cache (0 upstream calls!)
      const d2 = await db.getOrFetchBiedronkaProductDetail('32519899243694822619161320176', {
        customFetch: detailFetch,
        nowIso: '2026-11-22T16:00:00.000Z',
      });
      expect(d2?.detailStatus).toBe('CACHED');
      expect(d2?.fromCache).toBe(true);
      expect(detailFetchCalls).toBe(1);

      // Unknown SKU rejected (null -> 404)
      const unknown = await db.getOrFetchBiedronkaProductDetail('NON_EXISTENT_SKU');
      expect(unknown).toBeNull();

      // 429 Rate Limit on 2nd product -> persists Retry-After and makes 0 calls while deferred!
      let rateLimitCalls = 0;
      const rateLimitFetch = (async () => {
        rateLimitCalls++;
        return new Response('Too Many Requests', {
          status: 429,
          headers: { 'retry-after': '900' },
        });
      }) as typeof fetch;

      const rl1 = await db.getOrFetchBiedronkaProductDetail('99988877766655544433322211100', {
        customFetch: rateLimitFetch,
        nowIso: '2026-11-22T15:00:00.000Z',
      });
      expect(rl1?.detailStatus).toBe('RATE_LIMITED');
      expect(rl1?.retryAfterAt).toBe('2026-11-22T15:15:00.000Z');
      expect(rl1?.ingredients).toBeNull(); // Never fabricated!
      expect(rateLimitCalls).toBe(1);

      const rl2 = await db.getOrFetchBiedronkaProductDetail('99988877766655544433322211100', {
        customFetch: rateLimitFetch,
        nowIso: '2026-11-22T15:05:00.000Z', // Still within Retry-After!
      });
      expect(rl2?.detailStatus).toBe('RATE_LIMITED');
      expect(rateLimitCalls).toBe(1); // 0 extra upstream requests!

      // Legacy NULL observed_at preservation
      db.db
        .prepare("UPDATE biedronka_snapshot_items SET observed_at = NULL WHERE sku = '32519899243694822619161320176'")
        .run();
      db.refreshInMemoryCatalogueFromMonitoredPrices();
      const legacyList = db.getShoppingList('user-farhad-1');
      const legacyBanana = legacyList.items.find((i) => i.canonicalIngredient === 'banana')!;
      expect(legacyBanana.priceObservedAt).toBeNull();
    });

    it('rejects upstream and cached details with missing or contradictory lossless IDs (including conflicting productId or store/address) and ignores public ?force=true cache bypass', async () => {
      // 1. Direct validator unit checks
      expect(
        validateBiedronkaProductIdentity(
          { productId: '4611686018881015235', storeProductId: '32519899243694822619161320176', storeId: '46905', storeAddressId: '868734' },
          { productId: null, externalProductId: null, storeProductId: null, storeId: '46905', storeAddressId: '868734' }
        ).valid
      ).toBe(false);

      // 1-digit difference on 64-bit productId must fail even if storeProductId matches!
      expect(
        validateBiedronkaProductIdentity(
          { productId: '4611686018881015235', storeProductId: '32519899243694822619161320176', storeId: '46905', storeAddressId: '868734' },
          { productId: '4611686018881015236', storeProductId: '32519899243694822619161320176', storeId: '46905', storeAddressId: '868734' }
        ).valid
      ).toBe(false);

      // Store/address mismatch must fail even if product IDs match
      expect(
        validateBiedronkaProductIdentity(
          { productId: '4611686018881015235', storeProductId: '32519899243694822619161320176', storeId: '46905', storeAddressId: '868734' },
          { productId: '4611686018881015235', storeProductId: '32519899243694822619161320176', storeId: '46905', storeAddressId: '999999' }
        ).valid
      ).toBe(false);

      // 2. Upstream fetch rejects payload with no identity fields at all
      const emptyIdentityRes = await fetchGlovoBiedronkaProductDetail({
        storeId: '46905',
        storeAddressId: '868734',
        productId: '4611686018881015235',
        externalProductId: '32519899243694822619161320176',
        storeProductId: '32519899243694822619161320176',
        customFetch: (async () =>
          new Response(JSON.stringify({ data: { metadata: { product: { name: 'Mystery Product' } } } }), {
            status: 200,
          })) as typeof fetch,
      });
      expect(emptyIdentityRes.ok).toBe(false);
      expect(emptyIdentityRes.error).toContain('Missing comparable exact product identity');

      // 3. Upstream fetch rejects conflicting 64-bit productId even when storeProductId matches
      const conflictingProductIdJson =
        '{"data":{"metadata":{"product":{"id":4611686018881015236,"externalId":"32519899243694822619161320176","storeProductId":"32519899243694822619161320176","name":"Wrong Product"}}}}';
      const conflictRes = await fetchGlovoBiedronkaProductDetail({
        storeId: '46905',
        storeAddressId: '868734',
        productId: '4611686018881015235',
        externalProductId: '32519899243694822619161320176',
        storeProductId: '32519899243694822619161320176',
        customFetch: (async () =>
          new Response(conflictingProductIdJson, { status: 200 })) as typeof fetch,
      });
      expect(conflictRes.ok).toBe(false);
      expect(conflictRes.error).toContain('Conflicting productId');

      // 4. Upstream fetch rejects conflicting storeAddressId from response events
      const conflictingStoreJson =
        '{"data":{"metadata":{"product":{"id":4611686018881015235,"externalId":"32519899243694822619161320176","storeProductId":"32519899243694822619161320176"}},"actions":[{"data":{"events":[{"data":{"storeId":"46905","storeAddressId":"111111"}}]}} ]}}';
      const storeConflictRes = await fetchGlovoBiedronkaProductDetail({
        storeId: '46905',
        storeAddressId: '868734',
        productId: '4611686018881015235',
        externalProductId: '32519899243694822619161320176',
        storeProductId: '32519899243694822619161320176',
        customFetch: (async () =>
          new Response(conflictingStoreJson, { status: 200 })) as typeof fetch,
      });
      expect(storeConflictRes.ok).toBe(false);
      expect(storeConflictRes.error).toContain('Conflicting storeAddressId');

      // 5. Cached SQLite identity validation & public ?force=true non-bypass
      const homeHtml = `<html><body><script>"/v4/stores/46905/addresses/868734/content/main?nodeType=DEEP_LINK\\u0026link=cat#owoce.601"</script></body></html>`;
      const rawSec = JSON.stringify({
        data: {
          body: [
            {
              data: {
                elements: [
                  {
                    type: 'PRODUCT_TILE',
                    data: {
                      id: '__ID__',
                      externalId: '32519899243694822619161320176',
                      storeProductId: '32519899243694822619161320176',
                      name: 'Banany luzem 1 kg',
                      price: 4.99,
                      available: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      }).replace('"__ID__"', '4611686018881015235');

      await db.runBiedronkaGlovoRefresh({
        triggerType: 'CLI_COMMAND',
        customFetch: (async (url: string) =>
          url === GLOVO_BIEDRONKA_STORE_URL
            ? new Response(homeHtml, { status: 200 })
            : new Response(rawSec, { status: 200 })) as typeof fetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        minValidProducts: 1,
        nowIso: '2026-11-22T14:00:00.000Z',
      });

      // Seed a cached row with a conflicting store_address_id -> MUST NOT be served as CACHED!
      db.db
        .prepare(
          `INSERT OR REPLACE INTO biedronka_product_details (
            sku, product_id, external_product_id, store_product_id, store_id, store_address_id,
            description, ingredients, nutrition_basis, nutrition_rows_json, country_of_origin,
            image_url, glovo_product_url, fetched_at, next_retry_at, last_error
          ) VALUES (?, ?, ?, ?, '46905', '999999', 'Stale wrong-store desc', 'Wrong ing', NULL, '[]', NULL, NULL, NULL, ?, NULL, NULL)`
        )
        .run(
          '32519899243694822619161320176',
          '4611686018881015235',
          '32519899243694822619161320176',
          '32519899243694822619161320176',
          '2026-11-22T14:10:00.000Z'
        );

      const cacheReject = await db.getOrFetchBiedronkaProductDetail('32519899243694822619161320176', {
        allowLiveFetch: false,
        nowIso: '2026-11-22T14:20:00.000Z',
      });
      expect(cacheReject?.detailStatus).toBe('OFFLINE_UNAVAILABLE');
      expect(cacheReject?.fromCache).toBe(false);
      expect(cacheReject?.description).toBeNull(); // Wrong-store cached text NOT leaked!

      // Seed a valid matching cache row and verify GET /api/monitoring/biedronka/product-detail/:sku?force=true does NOT bypass cache
      db.db
        .prepare(
          `UPDATE biedronka_product_details SET store_address_id = '868734', description = 'Verified cached desc', fetched_at = ? WHERE sku = ?`
        )
        .run(new Date().toISOString(), '32519899243694822619161320176');

      const app = createApp(db);
      const server = await new Promise<import('node:http').Server>((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });
      try {
        const addr = server.address() as import('node:net').AddressInfo;
        const res = await fetch(
          `http://127.0.0.1:${addr.port}/api/monitoring/biedronka/product-detail/32519899243694822619161320176?force=true`
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.detailStatus).toBe('CACHED');
        expect(body.fromCache).toBe(true);
        expect(body.description).toBe('Verified cached desc');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe('6. Poland Regular-Price-Only Policy (Eggs 10.99 regular / 9.49 promo × 5 = 54.95, 1.10/egg, Promo Data Preserved, AZ Promos Preserved)', () => {
    it('prices Polish discounted eggs at regular 10.99 (x5 = 54.95, 1.10/egg) across line, basket, budget, details, and legacy offline cache while preserving stored promo 9.49 and AZ promo behavior', async () => {
      const homeHtml = `<html><body><script>"/v4/stores/46905/addresses/868734/content/main?nodeType=DEEP_LINK\\u0026link=cat#nabial.701"</script></body></html>`;
      const rawSec = JSON.stringify({
        data: {
          body: [
            {
              data: {
                elements: [
                  {
                    type: 'PRODUCT_TILE',
                    data: {
                      id: '__EGGS_ID__',
                      externalId: '32519899243694822619161399999',
                      storeProductId: '32519899243694822619161399999',
                      name: 'Jaja z chowu ściółkowego M 10 szt.',
                      price: 10.99,
                      promotion: { price: 9.49, isPrime: false },
                      available: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      }).replace('"__EGGS_ID__"', '4611686018881017777');

      const observedIso = '2026-11-23T01:00:00.000Z';
      const snap = await db.runBiedronkaGlovoRefresh({
        triggerType: 'CLI_COMMAND',
        customFetch: (async (url: string) =>
          url === GLOVO_BIEDRONKA_STORE_URL
            ? new Response(homeHtml, { status: 200 })
            : new Response(rawSec, { status: 200 })) as typeof fetch,
        sleepFn: async () => {},
        requestDelayMs: 0,
        minValidProducts: 1,
        nowIso: observedIso,
      });
      expect(snap.activated).toBe(true);

      // 1. Promo data (9.49) and regular price (10.99) both survive in SQLite storage!
      const storedEggs = db
        .getActiveBiedronkaSnapshotItems()
        .find((i) => i.sku === '32519899243694822619161399999')!;
      expect(storedEggs.regularPricePln).toBe(10.99);
      expect(storedEggs.promoPricePln).toBe(9.49);

      // 2. Build a shopping list requiring 45 eggs -> 5 packages of 10 pcs (x5 = 54.95 regular total, 1.10/egg)
      const eggRecipe: Recipe = {
        ...SEED_RECIPES[0],
        id: 'rec-eggs-test',
        baseServings: 1,
        ingredients: [
          {
            id: 'ing-eggs-45',
            canonicalIngredient: 'eggs',
            namePl: 'Jaja',
            nameEn: 'Eggs',
            amount: 45,
            unit: 'pcs',
            displayAmountPl: '45 szt.',
            displayAmountEn: '45 pcs',
            normalizedBaseAmount: 45,
            normalizedBaseUnit: 'pcs',
            category: 'Dairy',
            icon: '🥚',
          },
        ],
      };

      const shopping = buildSmartShoppingList({
        shoppingListId: 'sl-eggs-regular-policy',
        userId: 'user-farhad-1',
        weeklyPlanId: 'wp-eggs',
        supermarketId: 'biedronka',
        regionCode: 'PL',
        currencyCode: 'PLN',
        plannedMeals: [
          {
            id: 'pm-eggs-1',
            weeklyPlanId: 'wp-eggs',
            dayIndex: 0,
            dateStr: '2026-11-23',
            mealType: 'breakfast',
            recipe: eggRecipe,
            servings: 1,
            scaledCostPln: 54.95,
            scaledCaloriesKcal: 600,
          },
        ],
        pantryItems: [],
        subtractPantry: false,
      });

      const eggsLine = shopping.items.find((i) => i.canonicalIngredient === 'eggs')!;
      expect(eggsLine.isPriced).toBe(true);
      expect(eggsLine.recommendedPackages).toBe(5);
      expect(eggsLine.lineTotalPln).toBe(54.95);
      expect(eggsLine.regularLineTotalPln).toBe(54.95);
      expect(eggsLine.unitPricePln).toBe(1.1);
      expect(eggsLine.unitPriceLabel).toBe('1,10 zł / szt.');
      expect(eggsLine.loyaltyRequired).toBe(false);

      // Basket & comparison totals reflect regular price with 0 promo savings
      expect(shopping.estimatedTotalPln).toBe(54.95);
      expect(shopping.regularTotalWithoutPromosPln).toBe(54.95);
      expect(shopping.totalSavingsPln).toBe(0);
      expect(shopping.comparisonByStore.biedronka?.totalBasketPln).toBe(54.95);
      expect(shopping.comparisonByStore.biedronka?.savingsVsRegularPln).toBe(0);

      // Budget analysis consumes regular basket total
      const budget = analyzeAndOptimizeBudget({
        preferences: db.getPreferences('user-farhad-1'),
        plannedMeals: [],
        shoppingList: shopping,
        allRecipes: [eggRecipe],
      });
      expect(budget.estimatedBasketPln).toBe(54.95);

      // 3. Product detail returns effectivePricePln = 10.99 (regular) while preserving promoPricePln = 9.49!
      const detail = await db.getOrFetchBiedronkaProductDetail('32519899243694822619161399999', {
        allowLiveFetch: false,
        nowIso: observedIso,
      });
      expect(detail?.regularPricePln).toBe(10.99);
      expect(detail?.promoPricePln).toBe(9.49);
      expect(detail?.effectivePricePln).toBe(10.99);

      // 4. Legacy cached basket saved with promo total (47.45) & savings (7.50) normalizes to regular 54.95 / 0 savings
      const legacyCachedBasket = {
        ...shopping,
        estimatedTotalPln: 47.45,
        regularTotalWithoutPromosPln: 54.95,
        totalSavingsPln: 7.5,
        items: shopping.items.map((it) => ({
          ...it,
          lineTotalPln: 47.45,
          regularLineTotalPln: 54.95,
          loyaltyRequired: true,
        })),
        comparisonByStore: {
          biedronka: {
            totalBasketPln: 47.45,
            availableItemsCount: 1,
            missingItemsCount: 0,
            savingsVsRegularPln: 7.5,
          },
        },
      };
      const normalizedCached = normalizeCachedShoppingListForPricingPolicy(legacyCachedBasket);
      expect(normalizedCached.estimatedTotalPln).toBe(54.95);
      expect(normalizedCached.totalSavingsPln).toBe(0);
      expect(normalizedCached.items[0].lineTotalPln).toBe(54.95);
      expect(normalizedCached.items[0].loyaltyRequired).toBe(false);
      expect(normalizedCached.comparisonByStore.biedronka?.totalBasketPln).toBe(54.95);
      expect(normalizedCached.comparisonByStore.biedronka?.savingsVsRegularPln).toBe(0);

      // 5. Polish promo-only offer surface is hidden, while Azerbaijan promos & offers remain active!
      expect(getPromotionalOffersForRegion('PL')).toEqual([]);
      expect(getPromotionalOffersForRegion('AZ').length).toBeGreaterThan(0);

      db.updatePreferences('user-farhad-1', {
        regionCode: 'AZ',
        currencyCode: 'AZN',
        preferredSupermarket: 'bravo',
      });
      const azList = db.getShoppingList('user-farhad-1');
      expect(azList.totalSavingsPln).toBeGreaterThan(0);
    });
  });
});
