# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.23.0] - 2026-06-12

### Added

- **Booking module**
  - New module under `src/modules/kapur/v1/booking/` (model, audit model, service, controller, routes, schema).
  - Routes registered at `/api/v1/booking`:
    - POST `/` – create a booking linked to `dispatchLedgerId` with `bagSizes` (`size`, `currentQuantity`, `initialQuantity`).
    - POST `/search` – find bookings by number, matching either `gatePassNo` or `manualGatePassNumber` within the authenticated cold storage.
    - GET `/` – paginated list with `limit`, `page`, `sortOrder` (asc/desc by gate pass number), and optional `dateFrom`/`dateTo` filters.
    - PUT `/:id` – update booking (manual gate pass number, date, dispatch ledger, variety, bag sizes, remarks); writes audit with previous/modified state for changed fields only.

- **Outgoing Gate Pass module**
  - New module under `src/modules/kapur/v1/outgoing-gate-pass/` (model, audit model, service, controller, routes, schema).
  - Routes registered at `/api/v1/outgoing-gate-pass`:
    - POST `/` – create an outgoing gate pass from storage gate pass allocations; stores storage snapshots for cancel/restore; supports `replacesOutgoingGatePassId` and `idempotencyKey`.
    - POST `/:outgoingGatePassId/cancel` – cancel an active pass, restore bag quantities from snapshots, and write an audit entry.

- **Transfer Stock module**
  - New module under `src/modules/kapur/v1/transfer-stock/` (model, service, controller, routes, schema).
  - Routes registered at `/api/v1/transfer-stock`:
    - POST `/` – transfer stock between farmer storage links (deducts source storage, creates destination storage + source outgoing passes, records transfer).
    - GET `/` – paginated list with `limit`, `page`, `sortOrder`, optional `gatePassNo` search, and `dateFrom`/`dateTo` filters.
    - GET `/report` – flat report rows and TanStack Table column metadata for the authenticated cold storage.

- **Store Admin – Voucher number**
  - GET voucher number endpoint now supports `incoming-gate-pass`, `grading-gate-pass`, `storage-gate-pass`, `nikasi-gate-pass`, `outgoing-gate-pass`, `transfer-stock-gate-pass`, and `booking-gate-pass`.

### Changed

- **Store Admin – Daybook**
  - Replaced incoming-centric daybook with a merged storage + outgoing ledger sorted by `createdAt`.
  - Query params: `type` (`all` | `incoming` | `outgoing`), `sortBy` (`latest` | `oldest`), `page`, `limit`.
  - Response shape: `{ data: [...], pagination }` with `passKind` (`storage` | `outgoing`) on each entry and farmer details populated.

- **Storage Gate Pass – Model**
  - Added index on `{ farmerStorageLinkId: 1, createdAt: -1 }` for daybook sorting.

- **Sync Indexes Script**
  - Added `Booking`, `BookingAudit`, `DispatchLedger`, `OutgoingGatePass`, `OutgoingGatePassAudit`, and `TransferStockGatePass` models.

---

## [1.22.0] - 2026-05-30

### Added

- **Analytics – Storage location-wise breakdown**
  - New endpoint GET `/api/v1/analytics/storage-location-wise` – hierarchical chamber → floor → row storage analytics with per-variety quantity breakdown (initial, current, removed) at every level.
  - Optional filters: `dateFrom`, `dateTo`, `variety`, `chamber`, `floor`, `row`.

- **Nikasi Gate Pass – Search**
  - New POST `/api/v1/nikasi-gate-pass/search` – find gate passes by number, matching either `gatePassNo` or `manualGatePassNumber` within the authenticated cold storage.

### Changed

- **Nikasi Gate Pass – Model and create flow**
  - Refactored nikasi gate pass to link to `dispatchLedgerId` instead of grading gate pass allocations.
  - Replaced `orderDetails` with `bagSize` entries (`size`, `variety`, `quantityIssued`).
  - Added fields: `billNumber`, `bitliNumber`, `category`, `isBooked`, `truckNumber`, `netWeight`, `averageWeightPerBag`.
  - Renamed `toField` to optional `to`; removed top-level `variety`, `gradingGatePassIds`, and grading gate pass snapshots.
  - POST `/` create now persists directly via the model (no grading allocation transaction).

- **Nikasi Gate Pass – List API**
  - GET `/api/v1/nikasi-gate-pass` now returns a paginated list with `limit`, `page`, `sortOrder` (asc/desc by gate pass number), and optional `dateFrom`/`dateTo` filters.
  - Response shape: `{ nikasiGatePasses, pagination }`.

- **Analytics – Overview**
  - `totalBagsDispatched` in overview now sums `bagSize[].quantityIssued` on nikasi gate passes (was `orderDetails`).

### Removed

- **Nikasi Gate Pass**
  - Removed POST `/bulk` bulk-create endpoint.
  - Removed GET `/grouped` grouped-by-manual-number-and-date endpoint.
  - Removed grading-gate-pass allocation create schemas and service logic.

---

## [1.20.0] - 2026-03-27

### Added

- **Unified edit history model**
  - Added new `EditHistory` model at `src/modules/kapur/v1/storage-gate-pass/edit-history.model.ts` with `entityType`, `documentId`, `coldStorageId`, `editedBy`, `editedAt`, `action`, `changeSummary`, and optional before/after snapshots.
  - Added `storage_gate_pass` entity support in `EditHistoryEntityType`.

- **Storage Gate Pass update enhancements**
  - PUT `/api/v1/storage-gate-pass/:id` now supports updating `farmerStorageLinkId`.
  - Update route docs now explicitly support create-like `bagSizes` payload fields including `bagType`, `chamber`, `floor`, and `row`.

### Changed

- **Storage edit history persistence**
  - Storage gate pass edits now write to `EditHistory` instead of the legacy `StorageGatePassAudit` model.
  - Edit history entries are recorded for successful update requests with change summary and snapshots.

- **Storage edit history API**
  - GET `/api/v1/storage-gate-pass/edits` now returns all edit documents for the logged-in cold storage (pagination removed).
  - GET `/api/v1/storage-gate-pass/:id/edits` reads from `EditHistory` for per-document history.

### Removed

- **Legacy storage audit model**
  - Removed `src/modules/kapur/v1/storage-gate-pass/storage-gate-pass-audit.model.ts`.

---

## [1.19.0] - 2026-03-27

### Added

- **Storage Gate Pass - Edit history APIs**
  - New authenticated endpoints under `/api/v1/storage-gate-pass`:
    - GET `/edits` - paginated edit history across all storage gate passes for the logged-in cold storage (`limit`, `page`).
    - GET `/:id/edits` - edit history for a single storage gate pass (`limit`).
  - Added schema/query/params validation for edit history routes and new service methods to fetch audit entries with pagination and related user/gate-pass context population.

### Changed

- **Storage Gate Pass - Update schema docs**
  - Update route OpenAPI docs now define detailed `bagSizes` item shape (size, bagType, quantities, chamber/floor/row) instead of loose objects.

---

## [1.18.0] - 2026-03-17

### Added

- **Analytics – Storage and grading trend**
  - New storage analytics routes (module `storage.routes.ts`): GET `/api/v1/analytics/storage-summary` (per-variety summary with initial/current/quantityRemoved and per-size, per bag-type JUTE/LENO breakdown; optional `dateFrom`/`dateTo`), GET `/api/v1/analytics/storage-gate-pass-report` (storage gate pass report with optional `groupByFarmer`, `groupByVariety`, `dateFrom`/`dateTo`), GET `/api/v1/analytics/storage-daily-monthly-trend` (daily and monthly trend by variety, Recharts-ready).
  - New grading analytics endpoint: GET `/api/v1/analytics/grading-daily-monthly-trend` – daily and monthly trend from grading gate passes grouped by grader; response includes `daily` and `monthly` chartData for Recharts (e.g. LineChart, AreaChart). Optional `dateFrom`/`dateTo`.

### Changed

- **Incoming Gate Pass – List**
  - GET `/api/v1/incoming-gate-pass` pagination limit increased from max 100 to max 5000 (schema, route description, and service).

---

## [1.17.0] - 2026-03-16

### Changed

- **Storage Gate Pass**
  - Create: request body validated with `createStorageGatePassSchema` before calling the service; OpenAPI body schema added for POST `/` (farmerStorageLinkId, gatePassNo, date, variety, storageCategory, bagSizes, optional manualGatePassNumber, remarks, idempotencyKey).
  - Update: OpenAPI body and params schemas documented for PUT `/:id`; update schema extended with optional nullable `manualGatePassNumber` (send `null` to clear) and optional `storageCategory`; service uses `$set`/`$unset` so clearing `manualGatePassNumber` is persisted correctly; audit tracks changes to `manualGatePassNumber` and `storageCategory`.

---

## [1.16.0] - 2026-03-09

### Added

- **Analytics – Chart and report data**
  - New analytics endpoints for chart data and farmers stock (authenticated, optional `dateFrom`/`dateTo` where applicable):
    - GET `/api/v1/analytics/variety-distribution` – variety distribution (bags per variety) from incoming gate passes; response `chartData` shaped for Recharts (e.g. PieChart).
    - GET `/api/v1/analytics/daily-monthly-trend` – daily and monthly trend from incoming gate passes; response includes daily and monthly aggregates.
    - GET `/api/v1/analytics/size-distribution` – size-wise distribution from grading gate passes, by variety; response `chartData` for Recharts.
    - GET `/api/v1/analytics/area-wise-size-distribution` – area-wise size distribution from grading by variety (area from farmer address).
    - GET `/api/v1/analytics/farmers-stock-by-filters` – farmers in a given area with varieties and sizes (stock); required query `area` (case-insensitive substring match on farmer address).
  - Analytics overview (GET `/api/v1/analytics/overview`) now includes `totalBagsStored` and `totalBagsDispatched` in addition to existing aggregates.
  - New route modules: `incoming.routes.ts` and `grading.routes.ts` under analytics, registered from main analytics routes.

### Changed

- **Incoming Gate Pass – List**
  - GET `/api/v1/incoming-gate-pass` supports date range filter: optional `dateFrom` and `dateTo` (inclusive, ISO date e.g. 2026-03-01).

- **Storage Gate Pass**
  - List by cold storage (`getStorageGatePassesByColdStorage`) now populates `createdBy` with `name` on each storage gate pass.

---

## [1.15.0] - 2026-03-05

### Added

- **Incoming Gate Pass – By farmer storage link**
  - GET `/api/v1/incoming-gate-pass/farmer-storage-link/:farmerStorageLinkId` – returns all incoming gate passes for the given farmer storage link (no pagination). Validates that the link belongs to the authenticated store admin's cold storage. Response: `{ data: { incomingGatePasses } }`. Returns 401 when cold storage is missing; 404 when link not found or access denied.

- **Store Gate Pass controller**
  - Store-facing storage gate pass controller with create, bulk create, update, list by cold storage, and list grouped by manual gate pass number and date; consistent error handling (401, 404, 409, 422, 500).

### Changed

- **Grading Gate Pass – Farmer storage link**
  - GET `/api/v1/grading-gate-pass/farmer-storage-link/:farmerStorageLinkId` now validates that the farmer storage link belongs to the authenticated cold storage. Returns 401 when cold storage is missing; 404 when link not found or does not belong to cold storage. Response shape: `{ data: { gradingGatePasses } }`.

- **Storage Gate Pass**
  - Model and schema refactored: `orderDetails` replaced with `bagSizes` (size, currentQuantity, initialQuantity, bagType, chamber, floor, row); removed `weightPerBag`, `gradingGatePassIds`, and `gradingGatePassSnapshots`. Service and create/update flows updated accordingly.

- **Outgoing Gate Pass**
  - Service now uses `bagSizes` (instead of `orderDetails`) when validating storage gate pass allocations for outgoing gate pass creation.

---

## [1.14.0] - 2026-02-28

### Added

- **Sync Indexes Script**
  - New script `pnpm run sync-indexes` to sync MongoDB indexes with Mongoose schema definitions: creates missing indexes and drops indexes no longer defined in schemas. Requires `MONGO_URI` in env.

- **Incoming Gate Pass – List**
  - GET `/api/v1/incoming-gate-pass` supports pagination (`limit`, default 10; `page`), `sortOrder` (asc | desc), search by `gatePassNo`, and filter by `status` (graded | ungraded). When `gatePassNo` is provided and no match exists, returns 404. Response shape: `{ data: { incomingGatePasses, pagination } }`.

- **Grading Gate Pass – List**
  - GET `/api/v1/grading-gate-pass` supports pagination (`limit`, default 10; `page`), `sortOrder` (asc | desc), and search by `gatePassNo`. When `gatePassNo` is provided and no match exists, returns 404. Response shape: `{ data: { gradingGatePasses, pagination } }`.

- **Incoming Gate Pass Model**
  - `gradingSummary` extended with `graded` (boolean) for filtering graded vs ungraded vouchers.

### Changed

- **Store Admin Daybook**
  - Daybook grading passes now include referenced incoming gate pass details: `manualGatePassNumber`, `gatePassNo`, `weightSlip`, `bagsReceived` (via lookup on `incomingGatePassIds` / `incomingGatePassId`).

- **Gate Pass Models (Indexes)**
  - Removed redundant field-level indexes from grading and incoming gate pass schemas; compound indexes retained for queries. Removed `orderDetails.size` index from grading gate pass. Similar index cleanup on nikasi, outgoing, and storage gate pass models. Cold storage, farmer-storage-link, farmer, and store-admin models: minor index/schema tweaks.

---

## [1.13.0] - 2026-02-21

### Added

- **Rental Storage Gate Pass (Kapur)**
  - GET `/api/v1/rental-storage-gate-pass` – list all rental storage gate passes for the authenticated store's cold storage (sorted by date and gate pass number descending), with populated farmer storage link and created-by details; 200/min rate limit.

---

## [1.12.0] - 2026-02-21

### Added

- **Rental Storage Gate Pass Module (Kapur)**
  - New module under `src/modules/kapur/v1/rental-storage-gate-pass/` (model, service, controller, routes, schema).
  - Routes registered at `/api/v1/rental-storage-gate-pass`; POST `/` to create a rental storage gate pass with authentication and rate limiting.

- **Rental Incoming Order**
  - Model added under `src/modules/kapur/v1/rental-incoming-order/` as foundation for rental incoming orders.

- **Farmer**
  - Optional `aadharCardNumber` and `panCardNumber` on farmer model.

- **Incoming Gate Pass**
  - Create payload accepts optional `aadharCardNumber` and `panCardNumber`; when provided, the linked farmer is updated with these values.

- **Store Admin**
  - Quick register farmer schema and service accept optional `aadharCardNumber` and `panCardNumber`.
  - Voucher types extended with `rental-storage-gate-pass` and `rental-incoming-order`; `getNextVoucherNumber` supports both for voucher sequencing.

### Changed

- **Application**
  - `app.ts` registers rental storage gate pass routes at `/api/v1/rental-storage-gate-pass`.

- **Temperature Module**
  - Model: single `chamber` + `runningTemperature` replaced by `temperatureReading` array of `{ chamber, value }` per record; one record per date can hold multiple chamber readings.
  - Create/update API: body uses `date` and `temperatureReading` (array of `{ chamber, value }`); at least one reading required on create.

---

## [1.11.0] - 2026-02-20

### Added

- **Temperature Module (Kapur)**
  - GET `/api/v1/temperature` – list all temperature records for the authenticated cold storage (sorted by date descending).
  - Service `getTemperaturesByColdStorage` with cold storage validation and 60/min rate limit.

### Changed

- **Store Admin / Daybook**
  - Daybook and related route response schemas now include `category` on incoming gate pass (e.g. Own Stock, Contract Farming).
  - Store admin service daybook aggregation projects `category` for incoming gate passes.

---

## [1.10.0] - 2026-02-19

### Added

- **Temperature Module (Kapur)**
  - New temperature module under `src/modules/kapur/v1/temperature/` (model, service, controller, routes, schema).
  - Temperature routes registered at `/api/v1/temperature`.
  - Create temperature records (chamber, runningTemperature, date) and update by ID with authentication and rate limiting.

### Changed

- **Application**
  - `app.ts` updated to register temperature routes at prefix `/api/v1/temperature`.

---

## [1.9.0] - 2026-02-19

### Notice

- **KAPUR FARMS CHANGES STARTED HERE** – This release marks the beginning of Kapur Farms–specific development. The codebase is being restructured: Bhatti-related modules under `src/modules/bhatti/` have been removed or refactored, and new Kapur-specific modules are being introduced under `src/modules/kapur/`. Application entry (`app.ts`) and auth utilities have been updated accordingly.

### Added

- **Kapur Modules**
  - New Kapur module structure under `src/modules/kapur/v1/` (e.g. incoming-gate-pass and related components) as the foundation for Kapur Farms features.

### Changed

- **Application**
  - `app.ts` updated to register Kapur routes and remove or replace Bhatti-specific route registration.
- **Auth**
  - `src/utils/auth.ts` updated to support Kapur Farms authentication flow.

### Removed

- **Bhatti Modules**
  - Removed Bhatti v1 modules: analytics, cold-storage, farmer-storage-link, grading-gate-pass, incoming-gate-pass, nikasi-gate-pass, outgoing-gate-pass, preferences, role-permission, shortage-stock, storage-gate-pass, store-admin (controllers, routes, services, models, schemas as per git status).

---

## [1.7.0] - 2026-02-15

### Added

- **Analytics Module**
  - New analytics module with routes at `/api/v1/analytics`
  - GET `/api/v1/analytics` – placeholder endpoint
  - GET `/api/v1/analytics/overview` – authenticated overview aggregates for the logged-in store admin's cold storage
  - Optional querystring: `dateFrom`, `dateTo` (YYYY-MM-DD) to filter by date range
  - Returns: `totalIncomingBags`, `totalIncomingWeight`, `totalUngradedBags`, `totalUngradedWeight`, `totalGradingBags` (initialQuantity, currentQuantity), `totalGradingWeight`
  - Analytics service scopes all data to cold storage and farmer-storage links; validates date format and cold storage ID

### Changed

- **Application**
  - Registered analytics routes in `app.ts` at prefix `/api/v1/analytics`

## [1.6.4] - 2026-02-10

### Added

- **Nikasi Gate Pass – Bulk create**
  - POST `/api/bhatti/v1/nikasi-gate-pass/bulk` to create multiple nikasi gate passes in one request
  - All passes created in a single transaction; any failure rolls back everything
  - Gate pass numbers must be unique per cold storage (within request and in DB)
  - Schema `createBulkNikasiGatePassSchema` and handler `createNikasiGatePassBulkHandler` with 201/400/404/409 responses and rate limit 30/min

### Changed

- **Grading Gate Pass**
  - GET `/` (list by cold storage) now uses `getGradingGatePassesByStoreSchema` for querystring validation; description/summary updated to "current logged-in store"
  - `getGradingGatePassesByColdStorage` and `getGradingGatePassesByFarmerStorageLink` populate incoming gate pass with explicit `select` (truckNumber, gatePassNo, manualGatePassNumber, date, variety, farmerStorageLinkId, bagsReceived, weightSlip, status, gradingSummary, remarks, createdAt, updatedAt)

- **Nikasi Gate Pass Service**
  - Refactored single create into `createOneNikasiGatePassWithSession`; single create and new bulk create both use it within a transaction
  - Bulk create validates duplicate gate pass numbers per cold storage within the request before creating

## [1.6.3] - 2026-02-04

### Changed

- **Store Admin Login – Error handling**
  - Login handler now validates request body early and returns consistent JSON for all error paths so clients receive clear messages instead of generic "Network Error"
  - Added `sendLoginError` helper and explicit handling for missing/invalid body, `ValidationError`, and non-Error throws
  - Login route response schema documents 400 (bad request), 401 (invalid credentials / account locked), 429 (rate limit), and 500 (internal error) with `success` and `error: { code, message }`

- **Rate limits relaxed**
  - **Store admin routes**: create/delete 10→30/min; list/get/update 100→200/min; check-mobile 30→60/min; login 50→100/min; logout and others 20→60/min
  - **Incoming, grading, nikasi, storage, outgoing gate pass routes**: 20→60/min and 100→200/min where applicable

## [1.6.0] - 2026-02-02

### Added

- **Preferences Module**
  - Added preferences module (model, service, controller, schema) for cold storage–scoped settings
  - GET `/api/bhatti/v1/cold-storage/:id/preferences` and PATCH `/api/bhatti/v1/cold-storage/:id/preferences` for bag sizes, report format, and custom key-value settings
  - Cold storage creation now creates a linked Preferences document (one-to-one); cold storage responses can populate `preferencesId`
  - Store-admin daybook and related responses include `preferences` when applicable

- **Manual Gate Pass Number**
  - Optional `manualGatePassNumber` on grading, incoming, storage, and nikasi gate pass create payloads and models
  - Daybook and voucher responses (incoming, gradingPasses, storagePasses, nikasiPasses, outgoingPasses) include `manualGatePassNumber` when set

### Changed

- **Cold Storage**
  - Cold storage model adds `preferencesId` reference to Preferences; service creates preferences on create and populates on get
  - Cold storage routes mount preferences GET/PATCH under `/:id/preferences` with rate limiting and schema

- **Gate Pass Schemas**
  - Grading, incoming, nikasi, and storage gate pass create schemas accept optional `manualGatePassNumber` (integer, positive)
  - Incoming gate pass model and nikasi/storage gate pass services persist and return `manualGatePassNumber` when provided

## [1.5.0] - 2026-02-01

### Added

- **Vouchers by Farmer Storage Link**
  - Added GET `/api/bhatti/v1/store-admin/farmer-storage-links/:farmerStorageLinkId/vouchers` to fetch all vouchers (daybook-style entries) for a single farmer-storage-link
  - Returns incoming, grading, storage, nikasi, and outgoing gate passes with summaries; link must belong to the authenticated store admin's cold storage
  - Supports `sortOrder` (asc/desc) and `gatePassType` filter; returns all orders (no pagination)
  - Includes authentication, rate limiting, validation schema, and error handling

### Changed

- **Global Error Handler (app.ts)**
  - Use `AppError` instanceof check for custom errors so `code` and `message` are always sent
  - Handle plugin errors with fallbacks so response never sends empty `error: {}`
  - Safer access to `error.message` with optional chaining

- **Store Admin Daybook**
  - `getDaybook` now accepts optional `overrideFarmerStorageLinkIds` and `unbounded` option for vouchers-by-link
  - Daybook summary uses `initialQuantity` instead of `quantityIssued` for bag totals

- **Gate Pass Models (Indexes)**
  - Removed redundant compound index `{ createdBy: 1 }` from grading, incoming, nikasi, outgoing, and storage gate pass schemas (rely on field-level index)

## [1.4.0] - 2026-01-30

### Added

- **Nikasi Gate Pass Listing by Cold Storage**
  - Added GET `/api/v1/nikasi-gate-pass` to fetch all nikasi gate passes for the authenticated store admin's cold storage
  - Returns nikasi gate passes with populated grading gate pass, incoming gate pass, farmer storage link, farmer, and linked-by details
  - Includes authentication, rate limiting, and error handling

### Changed

- **Nikasi Gate Pass Model**
  - Removed `location` field from nikasi grading gate pass snapshot bag size (interface and schema)

- **Nikasi Gate Pass Service**
  - Added size normalization for bag sizes (handles en-dash, hyphen, and Unicode dash variants) so allocations match correctly across grading and nikasi
  - Fixed bulk update operations to use grading pass map and original `orderDetails.size` in array filters for reliable decrements
  - Snapshot bag sizes no longer include a `location` field

## [1.3.0] - 2026-01-29

### Added

- **Incoming Gate Pass Listing by Cold Storage**
  - Added API to fetch all incoming gate passes for the authenticated store admin's cold storage
  - Includes farmer, linked-by, and received-by details with proper authentication and error handling

- **Gate Pass Voucher Sequencing Utilities**
  - Added utilities to generate the next voucher (gate pass) number per cold storage and voucher type
  - Supports incoming, grading, storage, nikasi, and outgoing gate pass voucher sequencing
  - Added validation schema for voucher type queries using Zod

### Changed

- **Authentication Payload**
  - Updated JWT payload typing to support both string and populated `coldStorageId` values for better compatibility

- **Models and Indexes**
  - Cleaned up Mongoose schema indexes on farmer and gate pass models to simplify idempotency key handling and avoid unnecessary indexes

## [1.2.0] - 2026-01-28

### Added

- **Nikasi Gate Pass Module**
  - Added complete nikasi gate pass module with routes, controller, service, model, and schema
  - Integrated nikasi gate pass routes into main application at `/api/v1/nikasi-gate-pass`
  - Supports creating nikasi gate passes from grading gate pass allocations
  - Includes audit trail functionality with nikasi gate pass audit model
  - Full validation and error handling with rate limiting

- **Outgoing Gate Pass Module**
  - Added complete outgoing gate pass module with routes, controller, service, model, and schema
  - Integrated outgoing gate pass routes into main application at `/api/v1/outgoing-gate-pass`
  - Supports creating outgoing gate passes from storage gate pass allocations
  - Includes audit trail functionality with outgoing gate pass audit model
  - Full validation and error handling with rate limiting

### Changed

- **Application Configuration**
  - Updated `app.ts` to register nikasi gate pass routes
  - Updated `app.ts` to register outgoing gate pass routes
  - Improved route organization and module structure

## [1.1.0] - 2026-01-25

### Added

- **Store Admin Module**
  - Added complete store admin module with routes, controller, service, model, and schema
  - Integrated store admin routes into main application at `/api/bhatti/v1/store-admin`

- **Role Permission Module**
  - Added role permission module structure with routes, controller, service, model, and schema
  - Foundation for role-based access control system

### Changed

- **Cold Storage Module Refactoring**
  - Renamed cold storage module files from kebab-case to camelCase for consistency
  - Updated file naming convention: `cold-storage-controller.ts` → `cold-storage.controller.ts`
  - Updated file naming convention: `cold-storage-model.ts` → `cold-storage.model.ts`
  - Updated file naming convention: `cold-storage-routes.ts` → `cold-storage.routes.ts`
  - Updated file naming convention: `cold-storage-schema.ts` → `cold-storage.schema.ts`
  - Updated file naming convention: `cold-storage-service.ts` → `cold-storage.service.ts`

- **Application Configuration**
  - Updated `app.ts` to register store admin routes
  - Improved route organization and module structure

## [1.0.0] - 2026-01-25

### Added

- **TypeScript Configuration**
  - Added `tsconfig.json` with strict type checking enabled
  - Configured for ES2022 target with ESNext modules
  - Set up source maps and declaration files for better development experience

- **ESLint Setup**
  - Configured ESLint 9 with flat config format (`eslint.config.js`)
  - Integrated TypeScript ESLint plugin for TypeScript-specific linting
  - Added Prettier integration to ensure consistent code formatting
  - Configured rules for unused variables with underscore prefix exception

- **Prettier Configuration**
  - Added `.prettierrc` with consistent formatting rules
  - Configured single quotes, semicolons, and 80 character line width
  - Added `.prettierignore` to exclude build artifacts and dependencies

- **Husky Git Hooks**
  - Set up Husky v9 for Git hooks management
  - Configured pre-commit hook to run lint-staged
  - Added lint-staged configuration to format and lint staged files automatically

- **Package Scripts**
  - `dev`: Development mode with hot reload using tsx
  - `build`: Compile TypeScript to JavaScript
  - `start`: Run production build
  - `lint`: Check for linting errors
  - `lint:fix`: Auto-fix linting errors
  - `format`: Format code with Prettier
  - `format:check`: Check if code is formatted
  - `type-check`: Type check without building

- **Project Structure**
  - Created `src/` directory for source code
  - Added basic `src/index.ts` entry point
  - Configured build output to `dist/` directory

- **Development Dependencies**
  - TypeScript 5.7.2
  - ESLint 9.17.0 with TypeScript support
  - Prettier 3.4.2
  - Husky 9.1.7
  - lint-staged 15.2.11
  - tsx 4.19.2 for development
  - @types/node for Node.js type definitions

### Changed

- Updated package.json to use pnpm as package manager
- Set module type to ES modules

### Technical Details

- All source code is organized in the `src/` directory
- Build output goes to `dist/` directory
- Pre-commit hooks ensure code quality before commits
- Strict TypeScript configuration for type safety
- Modern ESLint flat config format for better maintainability
