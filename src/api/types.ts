// Short names for the generated API types (src/api/schema.d.ts — never edit that file by hand;
// run `npm run api:types` against a running backend to refresh it).
import type { components, operations, paths } from './schema'

export type { components, operations, paths }

/** A request/response body schema by name, e.g. `Schema<'CheckoutRequest'>`. */
export type Schema<Name extends keyof components['schemas']> = components['schemas'][Name]
