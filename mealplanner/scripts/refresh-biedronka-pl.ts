import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MealPlannerDatabase } from '../src/server/db/database';
import {
  BIEDRONKA_REFRESH_CADENCE_DAYS,
  BIEDRONKA_REFRESH_INTERVAL_MS,
  DEFAULT_BIEDRONKA_MAX_SECTIONS,
  DEFAULT_BIEDRONKA_SECTIONS_PER_TICK,
  GlovoFetchSnapshotResult,
  GlovoRawProductTile,
  GLOVO_BIEDRONKA_SOURCE_NAME,
  GLOVO_BIEDRONKA_STORE_LOCATION,
  GLOVO_BIEDRONKA_STORE_URL,
  normalizeGlovoBiedronkaTile,
} from '../src/server/monitoring/biedronkaGlovoMonitor';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = String(
    args.db || process.env.DATABASE_PATH || resolve(process.cwd(), 'data/mealplanner.sqlite')
  );
  const force = Boolean(args.force);
  const maxSections = args['max-sections']
    ? Number(args['max-sections'])
    : DEFAULT_BIEDRONKA_MAX_SECTIONS;
  const sectionsPerTick = args['sections-per-tick']
    ? Number(args['sections-per-tick'])
    : DEFAULT_BIEDRONKA_SECTIONS_PER_TICK;
  const delayMs = args['delay-ms'] ? Number(args['delay-ms']) : 400;
  const fixturePath = typeof args.fixture === 'string' ? args.fixture : null;

  const db = new MealPlannerDatabase(dbPath);

  if (fixturePath) {
    if (!existsSync(fixturePath)) {
      console.error(`[biedronka-pl] Fixture file not found: ${fixturePath}`);
      db.db.close();
      process.exit(1);
    }
    const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
    const nowIso = new Date().toISOString();
    const snapshotId = `snap-bd-fixture-${Date.now()}`;
    const tiles: GlovoRawProductTile[] = Array.isArray(raw.tiles) ? raw.tiles : [];
    const items = tiles
      .map((t) => normalizeGlovoBiedronkaTile(t, snapshotId, nowIso))
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const isComplete = Boolean(raw.isComplete) && !raw.rateLimited && items.length > 0;
    const prefetchedResult: GlovoFetchSnapshotResult = {
      status: isComplete
        ? 'COMPLETE'
        : raw.rateLimited
        ? 'RATE_LIMITED'
        : items.length > 0
        ? 'PARTIAL_REJECTED'
        : 'FAILED',
      isComplete,
      rateLimited: Boolean(raw.rateLimited),
      totalSections: Number(raw.totalSections ?? 1),
      succeededSections: Number(raw.succeededSections ?? (isComplete ? 1 : 0)),
      failedSections: Number(raw.failedSections ?? (isComplete ? 0 : 1)),
      items,
      coverage: [],
      errors: Array.isArray(raw.errors) ? raw.errors : [],
      sourceName: GLOVO_BIEDRONKA_SOURCE_NAME,
      storeLocation: GLOVO_BIEDRONKA_STORE_LOCATION,
      sourceUrl: GLOVO_BIEDRONKA_STORE_URL,
      fetchedAt: nowIso,
    };

    const res = await db.runBiedronkaGlovoRefresh({
      triggerType: 'CLI_COMMAND',
      requestDelayMs: delayMs,
      maxSections,
      prefetchedResult,
    });

    console.log(
      JSON.stringify(
        {
          activated: res.activated,
          activeSnapshotId: res.activeSnapshotId,
          status: res.syncRun.status,
          productsChecked: res.syncRun.productsChecked,
          productsUpdated: res.syncRun.productsUpdated,
          errorsCount: res.syncRun.errorsCount,
          errorSummary: res.syncRun.errorSummary,
        },
        null,
        2
      )
    );

    db.db.close();
    return;
  }

  const tick = await db.runResumableBiedronkaRefreshTick({
    triggerType: 'CLI_COMMAND',
    force,
    maxSections,
    sectionsPerTick,
    requestDelayMs: delayMs,
  });

  if (tick.status === 'SKIPPED_FRESH_5D') {
    console.log(
      `[biedronka-pl] Active snapshot ${tick.activeSnapshotId} is fresh within ${BIEDRONKA_REFRESH_CADENCE_DAYS}-day cadence (next due: ${tick.deferredUntil}). Use --force to override.`
    );
  }

  console.log(
    JSON.stringify(
      {
        status: tick.status,
        activated: tick.activated,
        deferred: tick.deferred,
        deferredUntil: tick.deferredUntil,
        activeSnapshotId: tick.activeSnapshotId,
        stagingSnapshotId: tick.stagingSnapshotId,
        completedSections: tick.completedSections,
        totalSections: tick.totalSections,
        syncRun: tick.syncRun,
      },
      null,
      2
    )
  );

  db.db.close();
}

main().catch((err) => {
  console.error('[biedronka-pl] Refresh failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
