# Sprint issues

Each section below is one GitHub issue, and `docs/PLAN.md` explains the design behind it. A sprint lasts one
week and has its own milestone. The rules in "Cross-cutting rules" in PLAN.md apply to every issue.

---

<!-- sprint 0 -->
## [S0.1] Scaffold the Vite + React + TypeScript project
- [ ] `npm create vite@latest` with the `react-ts` template; React 19
- [ ] `strict: true` in tsconfig, plus `noUncheckedIndexedAccess`
- [ ] `@/` path alias for `src/`, configured in both tsconfig and Vite
- [ ] Folder layout: `src/app/`, `src/api/`, `src/features/<area>/`, `src/components/`, `src/lib/`
- [ ] `.env.example` with `VITE_API_BASE_URL=http://localhost:8080`; ignore `.env*.local` in git
- [ ] Pin the Node version (`.nvmrc` and `engines`)
- [ ] Update the README's Getting started and Scripts sections to match the real scripts

## [S0.2] Tooling and CI
- [ ] oxlint (from the S0.1 scaffold): enable the `react`, `typescript`, `jsx-a11y`, `import` and `vitest` plugins and treat warnings as errors in CI; Prettier
- [ ] Vitest + React Testing Library + jsdom; MSW for API mocks in tests
- [ ] Scripts: `lint`, `typecheck`, `test`, `build`
- [ ] GitHub Actions: lint, typecheck, test and build on every push and PR; cache npm

## [S0.3] Tailwind CSS and UI primitives
- [ ] Tailwind CSS v4 through the Vite plugin
- [ ] Theme tokens: bakery colour palette, typography, spacing, light and dark mode
- [ ] Primitives: Button, Input, Textarea, Select, Field (label, hint and error slot), Dialog, Toast,
      Spinner, EmptyState, Badge
- [ ] Every primitive is keyboard accessible and has a focus ring

## [S0.4] App shell and routing
- [ ] React Router data router with two trees: public (`/`) and owner (`/owner/*`)
- [ ] Public layout: header, cart button placeholder, footer. Owner layout: sidebar navigation
- [ ] 404 page and route-level error boundary
- [ ] QueryClient provider with default retry rules (none for 4xx)

<!-- sprint 1 -->
## [S1.1] Generate API types from the backend OpenAPI spec
- [ ] `openapi-typescript` + `openapi-fetch`
- [ ] `npm run api:types` reads `${API}/v3/api-docs` and writes `src/api/schema.d.ts` (committed)
- [ ] CI job checks that the generated file is current. It may use a schema snapshot so CI doesn't need
      the server running.

## [S1.2] HTTP client and error handling
- [ ] One client instance with the base URL from `VITE_API_BASE_URL`
- [ ] Every error becomes a typed `ApiError` (`status`, `message`, `fieldErrors`, `requestId` from
      `X-Request-Id`)
- [ ] 429 responses retry once after `Retry-After`; otherwise the error surfaces with the wait time
- [ ] Auth hook point for the owner bearer token (filled in by S4.1)
- [ ] `readPage()` helper that hides Spring's page shape, ready for the `content` + `page{}` change
- [ ] `apiUrl()` helper that makes `/uploads/...` image URLs absolute
- [ ] Unit tests for each helper

## [S1.3] Shared helpers and test fixtures
- [ ] Money formatting
- [ ] Time-zone helpers: `slotToUtc(date, time, zone)`, `formatLocal(instant, zone)`, with tests that
      cross DST changes
- [ ] MSW handlers and fixtures for the catalogue, availability, orders and auth, shared by tests and an
      optional mocked dev mode

<!-- sprint 2 -->
## [S2.1] Storefront catalogue page
- [ ] Items from `GET /api/public/catalogue/items`, categories from `/categories`
- [ ] Category filter kept in the URL query string
- [ ] Item card: thumbnail, name, price, lead time
- [ ] Loading skeletons, empty state, error state with the request id
- [ ] Responsive grid

## [S2.2] Item detail page
- [ ] `GET /api/public/catalogue/items/{id}`; 404 page when missing
- [ ] Image gallery: full images, thumbnails as the strip
- [ ] Description, price, lead time, stock left (when tracked)
- [ ] Add to cart with a quantity selector

## [S2.3] Cart
- [ ] Cart state (item id, quantity, name and price as last seen), saved to `localStorage`
- [ ] Cart drawer and page: change quantity, remove, subtotal
- [ ] Re-checks items against the catalogue and flags unavailable items and price changes
- [ ] Quantity limited by stock

<!-- sprint 3 -->
## [S3.1] Pickup slot picker
- [ ] `GET /api/public/availability?from=&to=` (at most 62 days per request)
- [ ] Calendar of days with open slots, then a list of slots for the chosen day
- [ ] Only `bookable` slots can be picked; shows `remainingCapacity`
- [ ] Hides days earlier than the cart's longest lead time allows
- [ ] Times shown in the Owner's time zone; `pickupAt` computed as UTC

## [S3.2] Checkout form
- [ ] Guest contact (`name`, `email`, `phone`), optional `notes`; Zod schema matching the server's rules
- [ ] `POST /api/public/orders` with the slot and cart lines
- [ ] Server `fieldErrors` shown on the matching fields
- [ ] 409 (slot just filled up, or stock changed): explain it and send the user back to pick another slot
- [ ] 429: show how long to wait
- [ ] Double-submit guard

## [S3.3] Order confirmation and magic link
- [ ] Shows the order reference, pickup time and lines
- [ ] Magic link `/orders/{token}` shown prominently with Copy and "bookmark this page" actions
- [ ] Clear warning: the link is shown only once and can't be recovered
- [ ] Clears the cart after the order is placed

## [S3.4] Guest order page
- [ ] `/orders/:token` loads `GET /api/public/orders/by-token/{token}`
- [ ] Status timeline (PENDING → CONFIRMED → IN_PROGRESS → FULFILLED; REJECTED and CANCELLED variants,
      with reasons)
- [ ] Cancel button only while cancellable; confirmation dialog;
      `POST /api/public/orders/by-token/{token}/cancel`
- [ ] 404: "link expired or invalid" page
- [ ] No token in page titles, logs or analytics

<!-- sprint 4 -->
## [S4.1] Owner login and session
- [ ] Login page, `POST /api/auth/login`; 401 and 429 messages
- [ ] Access token kept in memory; refresh token in `localStorage` (trade-off recorded in PLAN.md)
- [ ] Refresh before the access token expires and on a 401 response; only one refresh at a time, across
      tabs (`navigator.locks`), because each refresh token works only once
- [ ] Logout (`POST /api/auth/logout`) clears the session in every tab
- [ ] `RequireOwner` guard; after login, return to the page the Owner was trying to open
- [ ] Session restored on page reload via refresh; `GET /api/auth/me`

## [S4.2] Owner profile and password
- [ ] `GET/PUT /api/owner/profile`, including an IANA time-zone picker
- [ ] Change password form, `POST /api/owner/password`
- [ ] Prompt to change the initial bootstrap password
- [ ] Changing the profile's time zone refreshes every time shown in the app

<!-- sprint 5 -->
## [S5.1] Category management
- [ ] List, create, rename and delete categories (`/api/catalogue/categories/**`)
- [ ] Delete confirmation; show the server's error when a category is still in use

## [S5.2] Item management
- [ ] Paginated, sortable items table using `readPage()`
- [ ] Create and edit form: name, description, category, price, lead time, stock (optional), availability
- [ ] Optimistic-lock 409: reload and re-apply

## [S5.3] Item image upload
- [ ] `POST /api/catalogue/items/{id}/images/upload` as multipart with a `file` part
- [ ] Client-side checks before upload: JPEG, PNG or WebP; at most 10 MB; at most 10 000 px per side
- [ ] Upload progress, multiple files, delete image

## [S5.4] Working hours editor
- [ ] Weekly grid of open and close times per day, slot size, capacity per slot
- [ ] `/api/availability/working-hours/**`
- [ ] Preview of the slots the settings produce

## [S5.5] Blocked dates
- [ ] List upcoming blocked dates; add (date and reason) and remove
- [ ] `/api/availability/blocked-dates/**`

<!-- sprint 6 -->
## [S6.1] Orders list
- [ ] `/api/orders` with filters for status, date range and search; kept in the URL
- [ ] Paginated table; count of pending orders in the sidebar
- [ ] Highlight pending orders close to the 24-hour auto-cancel

## [S6.2] Order detail and transitions
- [ ] Detail view: guest contact, lines, notes, pickup time, status history, link to the invoice
- [ ] Actions available only in the matching status: confirm, reject (reason required), start
      preparation, fulfil, cancel
- [ ] Reschedule using the S3.1 slot picker
- [ ] Edit lines and notes while `PENDING`
- [ ] 409: reload and tell the Owner that someone else changed the order

<!-- sprint 7 -->
## [S7.1] Invoices
- [ ] List and filter `/api/invoices`; detail; link from the order (`/api/orders/{id}/invoice`)
- [ ] Apply a discount; mark paid (cash or bank transfer, with reference); refund
- [ ] Printable invoice view (print stylesheet)

## [S7.2] Dashboard home
- [ ] `GET /api/dashboard/summary`: today's pickups, pending count, monthly revenue
- [ ] Owner's landing page after login

## [S7.3] Production list
- [ ] `GET /api/dashboard/production?date=` with a day picker (defaults to today)
- [ ] Aggregated quantities per item; print-friendly layout

<!-- sprint 8 -->
## [S8.1] End-to-end tests
- [ ] Playwright; in CI, start the backend's Docker Compose stack and the built frontend
- [ ] Guest flow: browse → cart → slot → checkout → magic link → view → cancel
- [ ] Owner flow: login → confirm order → invoice → mark paid; token refresh

## [S8.2] Accessibility and responsive pass
- [ ] Keyboard-only walkthrough of every flow; focus management in dialogs and after navigation
- [ ] axe checks in tests; colour contrast
- [ ] Check at 360 px, tablet and desktop widths

## [S8.3] Production deployment
- [ ] Decide the hosting: a static host, or `dist/` served by the backend's Caddy
- [ ] SPA fallback to `index.html`; cache headers for hashed assets
- [ ] Security headers and CSP (`connect-src` limited to the API origin)
- [ ] `VITE_API_BASE_URL` set at build time; frontend origin added to the server's
      `APP_CORS_ALLOWED_ORIGINS`
- [ ] Deploy workflow and a short runbook in the README
