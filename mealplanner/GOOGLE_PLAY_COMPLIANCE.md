# MealPlanner — Google Play Compliance Audit & Permanent Engineering Standard

**Application Name**: MealPlanner  
**Application ID / Package Name**: `pl.mealplanner.app`  
**Version**: `2.0.0` (`versionCode = 2`)  
**Target Markets**: Poland (`PL` / `PLN` `zł`) & Azerbaijan (`AZ` / `AZN` `₼`)  
**Supported Languages**: English (`en`, default), Polish (`pl`), Azerbaijani (`az`)  

---

## 1. Architecture & Project Overview (Part 1)

- **Framework & Languages**: Full-stack TypeScript (ES2022) with React 19 client (`src/client/`), Express 5 + `node:sqlite` backend (`src/server/`), shared domain/i18n/regional engines (`src/shared/`), and a native Android WebView host (`android/app/src/main/java/pl/mealplanner/app/MainActivity.java`) serving bundled assets via `https://appassets.androidplatform.net/index.html`.
- **Android SDK Configuration**:
  - `applicationId`: `pl.mealplanner.app`
  - `minSdk`: `24` (Android 7.0 Nougat)
  - `compileSdk`: `35` (Android 15, ready for API 36)
  - `targetSdk`: `35` (Android 15, meets Google Play mandatory Target API level requirement)
- **Permissions**: Only `android.permission.INTERNET` and `android.permission.ACCESS_NETWORK_STATE`. Zero dangerous runtime permissions (no camera, location, contacts, microphone, or external storage permissions).
- **AI Engine**: Hybrid deterministic + optional server-side Gemini 1.5 Flash engine (`src/server/ai/aiMealPlanner.ts`). Client bundle (`scripts/build-client.mjs`) explicitly strips `process.env.GEMINI_API_KEY` (`""`) so API keys are never exposed in the Android APK/AAB or browser bundle.

---

## 2. Structured Compliance Audit Report (Parts 2, 3 & 4)

### CRITICAL PRIORITY ISSUES (All Resolved)

| ID | Issue | Google Play Policy / Requirement | Previous Implementation | Implemented Solution | Files Affected |
|---|---|---|---|---|---|
| **CRIT-01** | Missing In-App & External Web Account Deletion Flows | **User Data Policy — Account Deletion Requirement**: Apps that support account creation must allow users to delete their account both inside the app and via an external web link (`https://.../delete-account`), permanently purging associated user data. | `DELETE /api/auth/account` existed on the server, but had no UI button/modal inside the app, no external web deletion URL, and left custom recipes or reports behind. | 1. Upgraded `deleteUserAccount(userId)` to atomically purge all user records across `users`, `preferences`, `households`, `weekly_plans`, `planned_meals`, `shopping_lists`, `shopping_items`, `pantry`, `favourites`, `ai_content_reports`, and user-created `recipes`/`ingredients`.<br>2. Added a dedicated **Delete Account** tab in the Account Modal + Profile Settings row (`data-testid="setting-delete-account"`) with a mandatory confirmation checkbox.<br>3. Added public interactive web portal `GET /delete-account` and `POST /api/auth/delete-account-web`. | `src/server/db/database.ts`, `src/server/app.ts`, `src/client/api/clientApi.ts`, `src/client/components/Modals.tsx`, `src/client/MealPlannerApp.tsx` |
| **CRIT-02** | Cleartext HTTP Traffic Enabled Globally in Android Manifest | **Google Play Security & Network Data Safety**: Production apps must encrypt network traffic over HTTPS/TLS by default and disallow arbitrary cleartext traffic. | `AndroidManifest.xml` had `android:usesCleartextTraffic="true"` globally with no `network_security_config.xml`. | Set `android:usesCleartextTraffic="false"` and added `res/xml/network_security_config.xml` enforcing `cleartextTrafficPermitted="false"` for `<base-config>` while permitting `localhost` / `10.0.2.2` for local development. | `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/xml/network_security_config.xml` |
| **CRIT-03** | WebView Local File & Content URI Access Enabled | **Android WebView Security Vulnerability (Zip-Slip / File Theft)**: Enabling `setAllowFileAccess(true)` and `setAllowContentAccess(true)` exposes local app files if XSS occurs. | `MainActivity.java` had `setAllowFileAccess(true)` and `setAllowContentAccess(true)`, and lacked `..` path traversal checks in `shouldInterceptRequest`. | Set `setAllowFileAccess(false)` and `setAllowContentAccess(false)` in `MainActivity.java`, added strict `..` path traversal rejection, and added `X-Content-Type-Options: nosniff` headers. | `android/app/src/main/java/pl/mealplanner/app/MainActivity.java` |
| **CRIT-04** | Missing In-App AI-Generated Content Reporting & Medical Disclaimers | **Google Play AI-Generated Content Policy & Health/Nutrition Disclaimers**: Apps generating content with AI must provide an in-app user reporting/flagging mechanism and avoid unsupported medical claims. | No in-app feature to report/flag inaccurate AI recipes, allergens, or nutrition; limited disclaimer text. | Added `ai_content_reports` SQLite table, `POST /api/ai/report` endpoint, `activeModal === 'ai_report'` reporting modal, report buttons in Meal Plan, Recipe Nutrition, and Profile screens, and explicit medical/allergen verification disclaimers in EN, PL, and AZ. | `src/server/db/database.ts`, `src/server/app.ts`, `src/server/ai/aiMealPlanner.ts`, `src/client/components/Modals.tsx`, `src/client/MealPlannerApp.tsx` |
| **CRIT-05** | Missing Public Privacy Policy URL & Repository Secret Protection | **User Data Policy & Secret Protection**: A public HTTPS Privacy Policy URL must be accessible without login, and `.env` / `*.keystore` / `*.jks` files must never be committed. | Privacy policy was only viewable inside an in-app modal; no `.gitignore` existed in the repository. | Added public `GET /privacy` web page detailing GDPR & Google Play Data Safety disclosures, and created `.gitignore` and `mealplanner/.gitignore` blocking `.env`, `*.keystore`, `*.jks`, and `key.properties`. | `.gitignore`, `mealplanner/.gitignore`, `src/server/app.ts` |

### HIGH PRIORITY ISSUES (All Resolved)

| ID | Issue | Google Play Policy / Requirement | Previous Implementation | Implemented Solution | Files Affected |
|---|---|---|---|---|---|
| **HIGH-01** | 16 KB Memory Page-Size Compatibility & Native Packaging | **Android 15+ (API 35) 16 KB Page Size Requirement**: Apps targeting Android 15+ must align uncompressed shared libraries and APK/AAB archives on 16 KB boundaries. | `scripts/build-apk.mjs` used `zipalign -f 4` without `-P 16`; `AndroidManifest.xml` and `build.gradle.kts` lacked explicit packaging flags. | Added `android:extractNativeLibs="false"` in `AndroidManifest.xml`, `jniLibs { useLegacyPackaging = false }` in `build.gradle.kts`, and `zipalign -P 16 -f 4` in `scripts/build-apk.mjs`. | `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle.kts`, `scripts/build-apk.mjs` |
| **HIGH-02** | Missing Adaptive Launcher Icon & Unencrypted Cloud Auto-Backup | **Google Play Technical Quality & Credential Security**: Apps must declare adaptive icons (`@mipmap/ic_launcher`) and prevent unencrypted cloud backups of `localStorage` JWT tokens. | `AndroidManifest.xml` had no `android:icon`, `android:roundIcon`, or `android:allowBackup="false"`. | Created vector adaptive icons (`ic_launcher.xml`, `ic_launcher_round.xml`, foreground/background drawables) and set `android:allowBackup="false"` in `AndroidManifest.xml`. | `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/drawable/*`, `android/app/src/main/res/mipmap-anydpi-v26/*` |
| **HIGH-03** | Dedicated AI Generation Rate Limiting & Prompt Sanitization | **AI Cost Protection & Abuse Prevention**: Prevent accidental or abusive bursts of AI meal plan generation requests and sanitize user prompt tokens. | Only a general 240 req/min API limiter existed; external Gemini fetch had no timeout or prompt token sanitization. | Added a dedicated per-user/IP rate limiter (`20 req/min` via `AI_RATE_LIMIT_PER_MIN`) on `POST /api/meal-plan/generate`, added `sanitizePromptToken()`, and enforced an 8-second `AbortSignal.timeout(8000)` on external LLM calls. | `src/server/app.ts`, `src/server/ai/aiMealPlanner.ts` |
| **HIGH-04** | Password Recovery Token Expiration & Production Hardening | **Authentication & Session Security**: Password recovery tokens must expire quickly and never leak in production API responses. | `reset_code` had no expiration timestamp and `recoveryCodeDemo` was always returned. | Added 15-minute expiration (`reset_code_expires_at`) verified during `/api/auth/reset-password`, and suppressed `recoveryCodeDemo` when `NODE_ENV === 'production'`. | `src/server/db/database.ts`, `src/server/app.ts` |
| **HIGH-05** | Android Back Navigation & WebView Lifecycle Battery Management | **Android Core App Quality**: System back press should close active modals or return to the Home tab before exiting the app; backgrounded WebViews must pause timers. | `MainActivity.onBackPressed()` exited immediately in SPA navigation, and `onPause`/`onResume`/`onDestroy` were not implemented. | Added `onPause()`, `onResume()`, and `onDestroy()` timer lifecycle management in `MainActivity.java` and bridged `onBackPressed()` to `window.__handleAndroidBack()`. | `android/app/src/main/java/pl/mealplanner/app/MainActivity.java`, `src/client/MealPlannerApp.tsx` |

### MEDIUM PRIORITY IMPROVEMENTS (All Resolved)

| ID | Issue | Google Play Policy / Requirement | Previous Implementation | Implemented Solution | Files Affected |
|---|---|---|---|---|---|
| **MED-01** | Release Signing Config, R8 Minification & AAB Language Split Prevention | **Android App Bundle (AAB) Release Readiness**: Prevent Google Play AAB base splits from stripping PL/AZ strings and support environment-injected release signing. | `android/app/build.gradle.kts` had only `defaultConfig` and `compileOptions`. | Added release signing config (reading from `ANDROID_KEYSTORE_*` env vars or `key.properties`), R8 minification, `proguard-rules.pro`, and `bundle { language { enableSplit = false } }`. | `android/app/build.gradle.kts`, `android/build.gradle.kts`, `android/settings.gradle.kts`, `android/gradle.properties`, `android/app/proguard-rules.pro` |
| **MED-02** | Viewport Pinch-to-Zoom Accessibility & Dynamic `<html lang>` | **Android Accessibility / WCAG 2.1 AA**: Users with low vision must be able to pinch-to-zoom, and screen readers need accurate `<html lang="en|pl|az">`. | `scripts/build-client.mjs` hardcoded `<html lang="pl">` and `maximum-scale=1.0, user-scalable=no`. | Changed default HTML to `<html lang="en">`, removed `maximum-scale=1.0, user-scalable=no`, enabled zoom controls in `MainActivity.java`, and synced `document.documentElement.lang` dynamically in `MealPlannerApp.tsx`. | `scripts/build-client.mjs`, `src/client/MealPlannerApp.tsx`, `android/app/src/main/java/pl/mealplanner/app/MainActivity.java` |
| **MED-03** | GDPR Art. 20 Right to Data Portability (JSON Export) | **EU/Poland GDPR Compliance**: Allow users to export all personal data in a structured, machine-readable format. | No personal data export endpoint or button existed. | Added `GET /api/auth/export-data` and a 1-click **Export My Data (JSON)** button inside both the Account Modal and Privacy Modal. | `src/server/db/database.ts`, `src/server/app.ts`, `src/client/api/clientApi.ts`, `src/client/components/Modals.tsx`, `src/client/MealPlannerApp.tsx` |

---

## 3. Google Play Console Declarations Guide

### A. Data Safety Section Declarations
- **Does your app collect or share any of the required user data types?** Yes.
- **Is all of the user data collected by your app encrypted in transit?** Yes (TLS/HTTPS enforced via `network_security_config.xml`).
- **Do you provide a way for users to request that their data is deleted?** Yes:
  - In-App Path: **Profile → Delete Account → Confirm Permanent Account & Data Deletion**
  - External Web URL: `https://<your-production-domain>/delete-account`
- **Data Types Collected**:
  1. **Personal Info → Name & Email Address**: Collected (Optional — only when registering an account; app also works in guest/offline mode). Purpose: *App functionality, Account management*. Shared with third parties: *No*.
  2. **Health and Fitness / Dietary Preferences**: Collected (Dietary restrictions, allergies, calorie/macro targets). Purpose: *App functionality, Personalization*. Shared with third parties: *No* (sanitized, non-identifiable dietary parameters are used only to generate meal plans).
- **Third-Party Advertising / Analytics SDKs**: None (`No advertising ID`, `No tracking SDKs`).

### B. App Access Instructions for Google Play Reviewers
Provide the following credentials in **Play Console → Policy → App content → App access**:
- **Option 1 (No Login Required)**: All core features (AI Meal Plan Generation, Recipes, Shopping List, Region/Currency Switching between Poland PLN and Azerbaijan AZN, Language Switching between EN/PL/AZ) work immediately upon launch without requiring sign-in.
- **Option 2 (Demo Reviewer Account)**:
  - **Email**: `farhad@mealplanner.pl`
  - **Password**: `MealPlanner2026!`

### C. Target Audience, Content Rating & Category
- **Category**: Food & Drink (or Health & Fitness)
- **Target Age Group**: 18+ (General audience; not directed at children under 13 — `Is this app an Ad-Supported Child-Directed App? No`)
- **IARC Content Rating**: Everyone / PEGI 3 (No violence, gambling, user-to-user unmoderated chat, or restricted goods)
- **Contains Ads**: No
- **In-App Purchases**: None in v2.0.0
