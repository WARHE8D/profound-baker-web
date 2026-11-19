// Fixture data shaped by the generated API types, so a backend change that breaks them fails the
// typecheck. Used by the MSW handlers in tests and in the mocked dev mode (`npm run dev:mock`).
import type { Schema } from '@/api'

/** The bakery's time zone in fixtures. A zone with daylight saving, to exercise conversions. */
export const FIXTURE_TIME_ZONE = 'America/New_York'

/** Mocked owner sign-in. Only for MSW: the real backend has its own credentials. */
export const FIXTURE_OWNER_CREDENTIALS = {
  email: 'owner@sugarcrumbs.test',
  password: 'sugarcrumbs-dev',
} as const

export const ids = {
  owner: '00000000-0000-4000-8000-000000000001',
  categories: {
    bread: '10000000-0000-4000-8000-000000000001',
    cakes: '10000000-0000-4000-8000-000000000002',
    pastries: '10000000-0000-4000-8000-000000000003',
  },
  items: {
    sourdough: '20000000-0000-4000-8000-000000000001',
    baguette: '20000000-0000-4000-8000-000000000002',
    chocolateCake: '20000000-0000-4000-8000-000000000003',
    croissant: '20000000-0000-4000-8000-000000000004',
    cinnamonRoll: '20000000-0000-4000-8000-000000000005',
    weddingCake: '20000000-0000-4000-8000-000000000006',
  },
} as const

export const categories: Schema<'CategoryResponse'>[] = [
  { id: ids.categories.bread, name: 'Bread' },
  { id: ids.categories.cakes, name: 'Cakes' },
  { id: ids.categories.pastries, name: 'Pastries' },
]

const category = (id: string) => categories.find((c) => c.id === id)!

function item(
  id: string,
  categoryId: string,
  fields: Pick<Schema<'ItemResponse'>, 'name' | 'description' | 'price' | 'leadTimeHours'> &
    Partial<Pick<Schema<'ItemResponse'>, 'available' | 'stockQuantity'>>,
): Schema<'ItemResponse'> {
  const available = fields.available ?? true
  const stockQuantity = fields.stockQuantity ?? null
  return {
    id,
    category: category(categoryId),
    available,
    stockQuantity,
    orderable: available && (stockQuantity === null || stockQuantity > 0),
    imageUrls: [`/uploads/items/${id}.svg`],
    thumbnailUrls: [`/uploads/items/${id}-thumb.svg`],
    createdAt: '2026-11-01T09:00:00Z',
    updatedAt: '2026-11-01T09:00:00Z',
    ...fields,
  }
}

/** Owner view of the catalogue, including an unavailable item the storefront must not list. */
export const items: Schema<'ItemResponse'>[] = [
  item(ids.items.sourdough, ids.categories.bread, {
    name: 'Country sourdough',
    description: 'Long-fermented loaf with a crackling crust.',
    price: 8.5,
    leadTimeHours: 12,
    stockQuantity: 10,
  }),
  item(ids.items.baguette, ids.categories.bread, {
    name: 'Baguette',
    description: null,
    price: 3.25,
    leadTimeHours: 0,
  }),
  item(ids.items.chocolateCake, ids.categories.cakes, {
    name: 'Chocolate fudge cake',
    description: 'Three layers, ganache, serves 10.',
    price: 42,
    leadTimeHours: 48,
  }),
  item(ids.items.croissant, ids.categories.pastries, {
    name: 'Butter croissant',
    description: 'Laminated by hand, baked every morning.',
    price: 3.75,
    leadTimeHours: 0,
    stockQuantity: 24,
  }),
  item(ids.items.cinnamonRoll, ids.categories.pastries, {
    name: 'Cinnamon roll',
    description: 'Sold out today.',
    price: 4.5,
    leadTimeHours: 0,
    stockQuantity: 0,
  }),
  item(ids.items.weddingCake, ids.categories.cakes, {
    name: 'Wedding cake (seasonal)',
    description: 'Not on the menu right now.',
    price: 350,
    leadTimeHours: 168,
    available: false,
  }),
]

/** What the storefront sees: available items only, without the owner-only fields. */
export function toPublicItem(i: Schema<'ItemResponse'>): Schema<'PublicItemResponse'> {
  return {
    id: i.id,
    name: i.name,
    description: i.description,
    price: i.price,
    category: i.category,
    leadTimeHours: i.leadTimeHours,
    orderable: i.orderable,
    imageUrls: i.imageUrls,
    thumbnailUrls: i.thumbnailUrls,
  }
}

export const ownerProfile: Schema<'OwnerProfileResponse'> = {
  id: ids.owner,
  email: FIXTURE_OWNER_CREDENTIALS.email,
  businessName: 'SugarCrumbs',
  ownerName: 'Sam Baker',
  phone: '+1 555 0100',
  logoUrl: null,
  address: {
    street: '12 Flour Street',
    city: 'Brooklyn',
    region: 'NY',
    postalCode: '11201',
    country: 'US',
  },
  timeZone: FIXTURE_TIME_ZONE,
}

type DayOfWeek = Schema<'WorkingHoursResponse'>['dayOfWeek']

/** Weekly opening hours: weekdays 08:00–16:00, Saturday 09:00–13:00, closed Sunday. */
export const workingHours: Schema<'WorkingHoursResponse'>[] = (
  [
    ['MONDAY', '08:00', '16:00'],
    ['TUESDAY', '08:00', '16:00'],
    ['WEDNESDAY', '08:00', '16:00'],
    ['THURSDAY', '08:00', '16:00'],
    ['FRIDAY', '08:00', '16:00'],
    ['SATURDAY', '09:00', '13:00'],
  ] as const
).map(([dayOfWeek, startTime, endTime], index) => ({
  id: `30000000-0000-4000-8000-00000000000${index + 1}`,
  dayOfWeek: dayOfWeek as DayOfWeek,
  startTime,
  endTime,
  slotDurationMinutes: 30,
  maxConcurrentBookings: 2,
}))

/**
 * Closures on top of Sundays: inclusive `YYYY-MM-DD` ranges in the bakery's zone. A recurring one
 * matches by month and day every year (the year is ignored), like the backend's BlockedDate.covers.
 */
export const blockedDates: Schema<'BlockedDateResponse'>[] = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    startDate: '2026-12-25',
    endDate: '2026-12-26',
    reason: 'Christmas',
    recurringAnnually: true,
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    startDate: '2027-01-11',
    endDate: '2027-01-15',
    reason: 'Bakery holiday',
    recurringAnnually: false,
  },
]
