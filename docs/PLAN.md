# SugarCrumbs Web: Plan & Sprints

_Last updated: 2026-11-18_

Each task maps to one GitHub issue (`[S<sprint>.<n>]`), grouped into one milestone per 1-week sprint. Checklists live in [ISSUES.md](ISSUES.md).

## Context

`profound-baker-web` contains only a README. It will be the React single-page app for the finished
`profound-baker-server` API, whose roadmap issues #4–#26 are all closed. The app has two halves: a public
**storefront**, where guests check out and get a magic link to their order, and an **owner dashboard** for
the catalogue, availability, orders, invoices and stats.

**Decisions:** TypeScript, Tailwind CSS, 1-week sprints, tracked in docs and on GitHub.

## Tech stack

| Concern      | Choice                                                                  | Why                                                                                                            |
| ------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Build        | Vite + React 19 + TypeScript (strict)                                   | The backend's dev CORS already allows `localhost:5173`                                                         |
| Routing      | React Router (data router)                                              | Separate public and owner route trees, with an auth guard on the owner tree                                    |
| Server state | TanStack Query                                                          | Caching and invalidation after mutations, with retry rules for 401, 409 and 429                                |
| API types    | `openapi-typescript` generated from `/v3/api-docs` + `openapi-fetch`    | Types come from the backend's contract instead of being written by hand                                        |
| Forms        | React Hook Form + Zod                                                   | Shows the backend's `fieldErrors` next to the matching inputs                                                  |
| Styling      | Tailwind CSS v4 + a few local primitives (Button, Field, Dialog, Toast) |                                                                                                                |
| Dates        | Native `Intl` (`src/lib/time.ts`)                                       | Converts slot times in the Owner's zone to UTC `pickupAt` with the backend's DST rules; no date library needed |
| Tests        | Vitest + React Testing Library + MSW; Playwright for E2E                |                                                                                                                |
| Quality      | oxlint, Prettier, `tsc --noEmit`, GitHub Actions CI                     | oxlint ships with the Vite template and is much faster than ESLint                                             |

## Cross-cutting rules (apply to every sprint)

- **One API client** (`src/api/`):
  - Reads the base URL from `VITE_API_BASE_URL`.
  - Turns every error into one typed `ApiError` that carries `X-Request-Id`.
  - Retries 429 responses after `Retry-After`.
  - Reads every paginated list through a single `readPage()` helper, because the backend's page shape will
    change.
- **Auth tokens:**
  - The access token lives in memory only. The refresh token is kept in `localStorage`. Trade-off: any
    script running on the page (an XSS bug) could read it. An `HttpOnly` cookie would hide it, but the
    backend issues tokens in JSON bodies and has no cookie flow; `sessionStorage` would hide it from other
    tabs but sign the Owner out on every new tab. Mitigations: tokens are rotated on every use (a stolen,
    reused token revokes the whole chain), the access token is never stored, and the CSP in S8.3 limits
    script sources.
  - Only one refresh may run at a time, across all tabs (`navigator.locks`), because each refresh token
    works only once and reusing one signs out every session.
- **Times:** every displayed time uses the Owner's time zone from `/api/owner/profile`. Every value sent to
  the API is UTC.
- **Images:** make each image URL absolute against the API origin. Use thumbnails in lists and cards.
- **Errors:** every error message shows the request id. A 409 response gets a "reload and retry" message.
- **Done means:** typed, tested with MSW, works at mobile width, CI green.

## Sprints

### Sprint 0: Project setup

- **S0.1 Scaffold:** Vite React-TS template; strict tsconfig; `@/` path alias; folder layout (`app/`,
  `api/`, `features/<area>/`, `components/`, `lib/`); `.env.example`; README scripts updated to match.
- **S0.2 Tooling and CI:** oxlint rules (react, typescript, jsx-a11y, import, vitest), Prettier, Vitest + RTL + MSW setup; GitHub Actions running lint,
  typecheck, test and build on every push and PR.
- **S0.3 Tailwind and UI primitives:** theme tokens (bakery palette, typography); Button, Input, Field
  (with error slot), Select, Dialog, Toast, Spinner, EmptyState.
- **S0.4 App shell and routing:** public layout and owner layout; 404 page; error boundary; QueryClient
  provider.

### Sprint 1: API layer

- **S1.1 Generated types:** `npm run api:types` pulls `/v3/api-docs` and writes `src/api/schema.d.ts`,
  which is committed. CI checks that the file is up to date.
- **S1.2 HTTP client:** base URL; `ApiError`; request id; 429 retry; `readPage()`; image URL helper.
- **S1.3 Shared helpers:** money formatting; Owner-time-zone date helpers (`slotToUtc`, `formatLocal`);
  MSW handlers and fixtures mirroring the API.

### Sprint 2: Storefront catalogue and cart

- **S2.1 Catalogue page:** category filter; item cards with thumbnails, price and lead time; loading,
  empty and error states.
- **S2.2 Item detail:** image gallery; description; sold-out state; add to cart. The public API sends
  `orderable` but no stock count, so the cart caps each item at 20 and checkout enforces real stock.
- **S2.3 Cart:** persisted in `localStorage`; quantity limits; removes or flags items that are no longer
  available; cart drawer.

### Sprint 3: Checkout and magic link

- **S3.1 Pickup slot picker:** reads `/api/public/availability` for at most 62 days; calendar plus slot
  list; respects `bookable`, `remainingCapacity` and the cart's longest lead time.
- **S3.2 Checkout form:** guest contact and notes; Zod validation; maps the server's `fieldErrors` onto
  the form; 409 "slot just filled" makes the user pick a new slot; 429 message.
- **S3.3 Confirmation page:** shows the magic link **once**, with prominent copy and bookmark buttons and a
  warning that the link can't be retrieved again; clears the cart.
- **S3.4 Guest order page** `/orders/:token`: status timeline; order lines; cancel within the cutoff; 404
  "link expired or invalid" page.

### Sprint 4: Owner auth and profile

- **S4.1 Login and session:** login page; access token in memory; single-flight refresh shared across tabs;
  logout; `RequireOwner` route guard; redirect back to the page the Owner was on.
- **S4.2 Profile:** edit profile; IANA time-zone picker; change password; first-login prompt to change the
  bootstrap password.

### Sprint 5: Catalogue and availability management

- **S5.1 Categories:** create, edit and delete.
- **S5.2 Items:** paginated table; create and edit form (price, stock, lead time, category, availability).
- **S5.3 Image upload:** client-side checks (type, 10 MB, dimensions); upload progress; delete images.
- **S5.4 Working hours:** weekly editor (open and close times, slot size, capacity).
- **S5.5 Blocked dates:** list, add and remove.

### Sprint 6: Order management

- **S6.1 Orders list:** filter by status and date range; search; pagination; "pending" badge.
- **S6.2 Order detail and transitions:** confirm, reject (with reason), start preparation, fulfil, cancel;
  reschedule using the slot picker; edit lines and notes while `PENDING`; 409 handling.

### Sprint 7: Invoices and dashboard

- **S7.1 Invoices:** list and detail; apply a discount; mark paid (cash or bank transfer, with reference);
  refund; printable invoice view.
- **S7.2 Dashboard home:** summary cards (today's pickups, pending count, monthly revenue).
- **S7.3 Production list:** pick a day; aggregated item quantities; print stylesheet.

### Sprint 8: Hardening and release

- **S8.1 E2E:** Playwright against the backend's Docker Compose stack in CI. Covers browse → checkout →
  magic link, then Owner login → confirm → mark paid.
- **S8.2 Accessibility and responsive pass:** keyboard navigation; focus management; contrast; check at
  mobile width.
- **S8.3 Production deploy:** decide the hosting (static host, or serve `dist/` from the backend's Caddy);
  SPA fallback; security headers and CSP; `VITE_API_BASE_URL` set at build time; CORS origin added on
  the server.

**Later (not scheduled):** email notifications in the UI, online payments, translations, offline support
(PWA).
