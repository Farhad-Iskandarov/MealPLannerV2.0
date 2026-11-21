import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env (Node >= 20.12 / 21.7 built-in, no extra dependency). Real environment variables take precedence.
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath) && typeof (process as any).loadEnvFile === 'function') {
  (process as any).loadEnvFile(envPath);
}

async function startServer() {
  // Import after env is loaded so modules read the configured values.
  const { MealPlannerDatabase } = await import('./db/database');
  const { createApp } = await import('./app');
  const { assertAuthConfiguration } = await import('./auth/authService');
  const { startBazarstorePriceScheduler } = await import('./monitoring/bazarstoreMonitor');

  assertAuthConfiguration();
  const port = Number(process.env.PORT) || 3000;
  const dbInstance = new MealPlannerDatabase(process.env.DATABASE_PATH || './data/mealplanner.sqlite');
  await dbInstance.seedIfEmpty({ seedDemoUser: process.env.SEED_DEMO_USER !== 'false' });

  // Start automated 24-hour Bazarstore price monitoring background scheduler
  startBazarstorePriceScheduler(dbInstance);

  const app = createApp(dbInstance);
  app.listen(port, '0.0.0.0', () => {
    console.log(`MealPlanner API & web app listening on http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MealPlanner server:', err instanceof Error ? err.message : err);
  process.exit(1);
});
