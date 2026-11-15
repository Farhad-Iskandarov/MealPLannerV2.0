# MealPlanner — AI Meal Planning & Smart Grocery Shopping for Poland

**MealPlanner** is a full-stack Android application and smart grocery shopping platform designed for the Polish market (`PLN / zł`, Polish default language + English).

## Architecture Overview

- **Mobile & Web UI (`src/client/`)**: React + TypeScript Android UI implementing both the **5-Screen Showcase View** (matching the reference specification side-by-side) and the **Single-Phone Android View** (responsive for small/large mobile screens and packaged into the native Android `.apk`).
- **Backend API (`src/server/`)**: Node.js + Express + TypeScript REST API (`src/server/app.ts`) keeping all secret keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `JWT_SECRET`) strictly on the server.
- **Persistent Relational Database (`src/server/db/database.ts`)**: Built-in Node 22 SQLite (`node:sqlite`) with 15 normalized tables (`users`, `households`, `preferences`, `supermarkets`, `products`, `product_prices`, `price_history`, `recipes`, `ingredients`, `weekly_plans`, `planned_meals`, `shopping_lists`, `shopping_items`, `pantry`, `favourites`).
- **Supermarket Pricing Engine (`src/server/supermarkets/`)**: Modular retailer adapters (`BiedronkaAdapter`, `LidlAdapter`, `AuchanAdapter`, `KauflandAdapter`) with EAN-13 barcodes, package sizes, regular vs promotional prices, loyalty card conditions (`Karta Moja Biedronka`, `Aplikacja Lidl Plus`), normalized unit prices (`zł / kg`, `zł / L`, `zł / szt.`), and explicit price verification statuses.
- **Quantity Intelligence & Matching (`src/server/matching/quantityEngine.ts`)**: Aggregates duplicate ingredients across all planned meals, normalizes household units (`g`, `kg`, `ml`, `l`, `tbsp`, `tsp`, `cloves`, `pcs`), subtracts available Pantry inventory, and calculates recommended supermarket packages and leftover quantities.
- **Deterministic Allergy & Diet Validator (`src/server/validation/mealValidator.ts`)**: Server-side deterministic enforcement of allergies (`gluten`, `milk`, `eggs`, `fish`, `soy`, etc.), excluded ingredients, and dietary options (`vegetarian`, `vegan`, `pescatarian`, `high_protein`, `low_carb`, `gluten_free`, `lactose_free`).
- **Native Android APK (`android/` & `scripts/build-apk.mjs`)**: Packages the complete application into a signed, installable Android package (`MealPlanner.apk` / `android/app/build/outputs/apk/debug/MealPlanner-debug.apk`).

## Quick Start & Installation

### 1. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Optional external AI credentials (kept strictly server-side):
- `GEMINI_API_KEY`: Google Gemini API key (`gemini-2.5-flash`) for live LLM recipe/plan generation. When omitted, the deterministic `SmartAlgorithmicPlanner` generates full 7-day validated plans automatically.
- `JWT_SECRET`: Secret key used to sign authentication tokens.

### 2. Install & Build
```bash
npm install
npm run build:client
npm run typecheck
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Start the Server & Application
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 5. Build the Android APK
```bash
node scripts/build-apk.mjs
```
Produces the signed installable Android APK at:
- `MealPlanner.apk`
- `android/app/build/outputs/apk/debug/MealPlanner-debug.apk`
