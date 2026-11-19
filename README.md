# profound-baker-web

The web front end for **SugarCrumbs**, a bakery run by one baker (the Owner). It is a React single-page app
with two halves:

- **Storefront** (public): customers browse the catalogue, pick a pickup slot and order as guests. There are
  no customer accounts. Each order gets a private **magic link** for viewing or cancelling it.
- **Owner dashboard** (signed in): the Owner manages items and categories, opening hours and blocked dates,
  orders, invoices and their profile, and sees the day's production list.

All data comes from the REST API in
[**profound-baker-server**](https://github.com/WARHE8D/profound-baker-server) (Java 21, Spring Boot,
PostgreSQL). This repository holds only the front end.

## Getting started

### 1. Run the backend

You need Docker and JDK 21+. In a clone of
[profound-baker-server](https://github.com/WARHE8D/profound-baker-server):

```bash
cp .env.example .env          # once: set DB_PASSWORD, APP_OWNER_EMAIL, APP_OWNER_INITIAL_PASSWORD
docker compose up -d          # Postgres on localhost:5432
./mvnw clean install          # build and test (Docker must be running)
./mvnw -pl app spring-boot:run -Dspring-boot.run.profiles=dev
```

The API is then on <http://localhost:8080>. Swagger UI at <http://localhost:8080/swagger-ui.html> lists
every endpoint. On first start the server creates the Owner from `APP_OWNER_EMAIL` and
`APP_OWNER_INITIAL_PASSWORD`. Use those to sign in to the dashboard.

The `dev` profile allows CORS from `http://localhost:5173` only. If you run the front end somewhere else,
set `APP_CORS_ALLOWED_ORIGINS` in the server's `.env`. It also generates a new JWT signing key on every
restart, so restarting the server signs you out.

### 2. Run the front end

You need Node.js 26+ (pinned in `.nvmrc`, so `nvm use` picks it up).

```bash
npm install
cp .env.example .env.local    # then set the API URL, see below
npm run dev                   # http://localhost:5173
```

### Project layout

| Path                   | Holds                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| `src/app/`             | App entry: root component, providers, router                       |
| `src/api/`             | The API client and generated API types                             |
| `src/features/<area>/` | One folder per feature area (catalogue, cart, checkout, orders, …) |
| `src/components/`      | Shared UI primitives                                               |
| `src/lib/`             | Framework-free helpers (money, dates, …)                           |

Import from `src` with the `@/` alias, for example `import { App } from '@/app/App'`.

### Routes

The route table is [src/app/routes.tsx](src/app/routes.tsx). There are two trees, each with its own
layout and error boundary:

| Path       | What                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| `/`        | Storefront: header with cart, page, footer                                  |
| `/owner/*` | Owner dashboard: sidebar navigation (sign-in guard arrives with owner auth) |
| `/dev/ui`  | Development only: gallery of the UI primitives; not in production builds    |

Unknown URLs show a 404 page inside the matching layout. If a page crashes, the error shows inside
the layout so the navigation keeps working. In `npm run dev`, the TanStack Query devtools button sits
in the bottom-left corner.

### Configuration

| Variable            | Example                 | Purpose                                                                              |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | `http://localhost:8080` | Origin of the profound-baker-server API. Item image URLs are relative to it as well. |

Vite exposes `VITE_`-prefixed variables to the browser, so **never put secrets in them**.

### Scripts

| Command                           | What it does                                          |
| --------------------------------- | ----------------------------------------------------- |
| `npm run dev`                     | Start the dev server with hot reload on port 5173     |
| `npm run build`                   | Type-check, then build for production into `dist/`    |
| `npm run preview`                 | Serve the production build locally                    |
| `npm run typecheck`               | Type-check only                                       |
| `npm run lint`                    | Lint with oxlint; warnings fail                       |
| `npm run format` / `format:check` | Format with Prettier / check formatting               |
| `npm test`                        | Run the tests once (Vitest + React Testing Library)   |
| `npm run test:watch`              | Run the tests in watch mode                           |
| `npm run test:coverage`           | Run the tests with a coverage report in `coverage/`   |
| `npm run api:types`               | Refresh the API spec and types from a running backend |
| `npm run api:check`               | Check the API types match the committed spec          |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `format:check`, `lint`, `api:check`,
`typecheck`, `test:coverage` and `build` on every push and pull request.

### API types

TypeScript types for every endpoint are generated from the backend's OpenAPI spec, so the compiler
catches a wrong path, parameter or body. Two committed files hold them, and neither should be edited
by hand:

- `openapi/openapi.json`: a snapshot of the backend's `/v3/api-docs`.
- `src/api/schema.d.ts`: the types generated from that snapshot. Import them through
  `src/api/types.ts`, for example `Schema<'CheckoutRequest'>`.

When the backend's API changes, start the backend and run `npm run api:types`. It reads the
backend's address from `API_URL`, else `VITE_API_BASE_URL` in `.env.local`, else
`http://localhost:8080`. Commit both files. CI runs `api:check` and fails if the types don't match
the snapshot.

The generator (`openapi-typescript`) only supports TypeScript 5, while this project uses TypeScript 7.
The scripts therefore run a pinned copy through `npm exec` with its own TypeScript 5, and it isn't
listed in `package.json`.

### Calling the API

Import everything from `@/api`. `api` is the single client, and `unwrap()` returns a call's data or
throws an `ApiError`:

```ts
import { api, unwrap, readPage, apiUrl, isApiError } from '@/api'

const categories = await unwrap(api.GET('/api/public/catalogue/categories'))
const items = readPage(await unwrap(api.GET('/api/public/catalogue/items')))
const src = apiUrl(item.thumbnailUrls[0]) // makes /uploads/... absolute
```

- **Errors:** an `ApiError` has `status` (0 when the server can't be reached), `message`,
  `fieldErrors` with a `fieldError(name)` lookup, `requestId` from `X-Request-Id`, and
  `retryAfterSeconds` on a 429.
- **Rate limits:** a 429 whose `Retry-After` is at most 10 seconds is retried once automatically.
  Longer waits reach the UI as an error.
- **Lists:** read every list response through `readPage()`, so the backend's planned change of page
  shape needs no other edits.

### Tests and API mocks

Tests live next to the code as `*.test.ts(x)`. API calls are mocked with [MSW](https://mswjs.io):
shared handlers are in `src/test/msw/handlers.ts`, and a single test can override them with
`server.use(...)`. Any request without a handler fails the test, so tests never reach a real server.

## Working with the API

Swagger UI is the full reference. A Postman collection is also in the server repo under
[`docs/postman/`](https://github.com/WARHE8D/profound-baker-server/tree/main/docs/postman). These are the
parts that most affect the front end.

### Routes and access

| Area         | Public (no sign-in)                                                                                    | Owner (`Authorization: Bearer <accessToken>`)                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Catalogue    | `GET /api/public/catalogue/items`, `/items/{id}`, `/categories`                                        | `/api/catalogue/items/**`, `/api/catalogue/categories/**`                       |
| Availability | `GET /api/public/availability?date=` or `?from=&to=` (62 days at most)                                 | `/api/availability/working-hours/**`, `/api/availability/blocked-dates/**`      |
| Orders       | `POST /api/public/orders`, `GET /api/public/orders/by-token/{token}`, `POST …/by-token/{token}/cancel` | `/api/orders/**`                                                                |
| Invoices     |                                                                                                        | `/api/invoices/**`, `/api/orders/{id}/invoice`                                  |
| Dashboard    |                                                                                                        | `GET /api/dashboard/summary`, `GET /api/dashboard/production?date=`             |
| Owner        |                                                                                                        | `/api/auth/me`, `/api/auth/logout`, `/api/owner/profile`, `/api/owner/password` |

A missing or invalid token returns **401** and the wrong role returns **403**.

### Owner sign-in and token refresh

- `POST /api/auth/login` with `{ email, password }` returns `accessToken` (lasts `expiresIn` seconds, 15
  minutes), `refreshToken` (14 days) and `refreshTokenExpiresAt`.
- Before the access token expires, `POST /api/auth/refresh` with `{ refreshToken }` returns a new pair.
- **Each refresh token can be used only once.** Store the new one every time. If a used refresh token is
  sent again, the server treats it as theft and signs out every session from that login. If two browser
  tabs can refresh at the same time, make sure only one of them does it.
- `POST /api/auth/logout` with `{ refreshToken }` ends the session.

### Checkout and the magic link

1. Load open slots from `GET /api/public/availability`. Each day has `slots` with `startTime`,
   `remainingCapacity` and `bookable`.
2. Slot times are **local times in the Owner's time zone**. Send `pickupAt` as the matching **UTC
   instant**, for example `2026-11-21T10:00:00Z`.
3. `POST /api/public/orders` with `pickupAt`, `guestContact` (`name`, `email`, `phone`), optional `notes`,
   and `lines` (`itemId`, `quantity`).
4. The response's `accessToken` is the guest's magic-link token, and **the server returns it only
   once**. Build the guest's order link from it right away and show it to them. Later,
   `GET /api/public/orders/by-token/{token}` loads the order. An unknown or expired token returns 404.

### Order lifecycle

`PENDING` → `CONFIRMED` (or `REJECTED`, with a reason) → `IN_PROGRESS` → `FULFILLED`.
`CANCELLED` means the customer or the system cancelled the order. The system cancels pending orders the
Owner hasn't answered within 24 hours. Confirming an order creates its invoice (`INV-YYYY-NNNN`).

### Errors

Every error has the same JSON body:

```json
{
  "timestamp": "…",
  "status": 400,
  "error": "Bad Request",
  "message": "…",
  "path": "/api/…",
  "fieldErrors": [{ "field": "guestContact.email", "message": "…" }]
}
```

- **400**: show each `fieldErrors` entry next to its form field.
- **409**: a conflict, for example the slot just filled up or someone else changed the record first. Reload
  and let the user retry.
- **429**: rate limited (login 5 per minute; checkout 10 and magic links 30 per 10 minutes per IP). Wait
  the number of seconds in the `Retry-After` header.
- Every response has an `X-Request-Id` header. Show it in error messages, because it leads straight to the
  matching server logs and trace.

### Pagination

Lists accept `?page=0&size=20&sort=field,desc` (`size` is at most 100). The response currently uses
Spring Data's default page shape (`content`, `totalElements`, `totalPages`, …), and **this shape will
change** to `content` + `page{}`. Read every paginated response through a single helper so the change
only needs one edit.

### Images

- Items have `imageUrls` (up to 2000 px) and, in the same order, `thumbnailUrls` (up to 400 px). Use
  thumbnails for cards and lists.
- These URLs are relative to the API origin (`/uploads/items/<uuid>.jpg`), so prefix them with
  `VITE_API_BASE_URL`.
- Upload with `POST /api/catalogue/items/{id}/images/upload` as `multipart/form-data` with a `file` part.
  The server accepts JPEG, PNG or WebP up to 10 MB and 10 000 px per side. Check these limits in the browser
  before uploading.

## Deployment

1. Build with `npm run build` and serve `dist/` from any static host.
2. Configure the host to serve `index.html` for unknown paths, so client-side routes such as magic links
   still work after a page reload.
3. Set `VITE_API_BASE_URL` to the production API **at build time**, because Vite inlines it into the bundle.
4. Add the front end's origin to `APP_CORS_ALLOWED_ORIGINS` on the server. It takes exact,
   comma-separated origins with no wildcards.

See the [server's deployment guide](https://github.com/WARHE8D/profound-baker-server#deploy) for running the
API, which uses Docker Compose with Caddy for TLS.

## Related

- Roadmap and sprints: [docs/PLAN.md](docs/PLAN.md), issue checklists in [docs/ISSUES.md](docs/ISSUES.md)
- Backend: [WARHE8D/profound-baker-server](https://github.com/WARHE8D/profound-baker-server)
- API reference: `/swagger-ui.html` on the running server, or `/v3/api-docs` for OpenAPI JSON
