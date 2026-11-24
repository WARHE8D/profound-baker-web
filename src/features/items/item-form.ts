import { z } from 'zod'
import type { ApiError, Schema } from '@/api'
import { parseMoney } from '@/lib/money'

export type Item = Schema<'ItemResponse'>

export const NAME_MAX = 150
export const DESCRIPTION_MAX = 2000
/** Typed prices are read like any amount of money (see parseMoney). */
export const parsePrice = parseMoney

const wholeNumber = /^\d+$/

export const itemFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a name')
      .max(NAME_MAX, `Use at most ${NAME_MAX} characters`),
    categoryId: z.string().min(1, 'Choose the category it belongs to'),
    description: z
      .string()
      .trim()
      .max(DESCRIPTION_MAX, `Use at most ${DESCRIPTION_MAX} characters`),
    price: z
      .string()
      .trim()
      .min(1, 'Enter a price')
      .refine((v) => parsePrice(v) !== null, 'Enter a price like 4.50 (at most 2 decimals)')
      .refine((v) => {
        const price = parsePrice(v)
        // An unreadable price already has its own message.
        return price === null || price >= 0.01
      }, 'The price must be more than zero'),
    leadTimeHours: z
      .string()
      .trim()
      .refine((v) => v === '' || wholeNumber.test(v), 'Enter whole hours, e.g. 0, 12 or 48')
      .refine((v) => v === '' || Number(v) <= 8760, 'Use at most 8760 hours (a year)'),
    trackStock: z.boolean(),
    stockQuantity: z.string().trim(),
    available: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.trackStock) return
    if (!wholeNumber.test(v.stockQuantity)) {
      ctx.addIssue({
        code: 'custom',
        path: ['stockQuantity'],
        message: 'Enter how many are in stock (0 or more)',
      })
    } else if (Number(v.stockQuantity) > 2_147_483_647) {
      ctx.addIssue({ code: 'custom', path: ['stockQuantity'], message: 'That number is too big' })
    }
  })

export type ItemFormValues = z.infer<typeof itemFormSchema>
export type ItemFormField = keyof ItemFormValues

export const emptyItemForm: ItemFormValues = {
  name: '',
  categoryId: '',
  description: '',
  price: '',
  leadTimeHours: '0',
  trackStock: false,
  stockQuantity: '',
  available: true,
}

export function toItemForm(item: Item): ItemFormValues {
  return {
    name: item.name,
    categoryId: item.category.id,
    description: item.description ?? '',
    price: item.price.toFixed(2),
    leadTimeHours: String(item.leadTimeHours),
    trackStock: item.stockQuantity !== null,
    stockQuantity: item.stockQuantity === null ? '' : String(item.stockQuantity),
    available: item.available,
  }
}

/** The item's editable state, in the shape the API compares and sends. */
export type ItemState = {
  name: string
  categoryId: string
  description: string | null
  price: number
  leadTimeHours: number
  stockQuantity: number | null
  available: boolean
}

export type ItemStateKey = keyof ItemState

export function stateOfItem(item: Item): ItemState {
  return {
    name: item.name,
    categoryId: item.category.id,
    description: item.description,
    price: item.price,
    leadTimeHours: item.leadTimeHours,
    stockQuantity: item.stockQuantity,
    available: item.available,
  }
}

export function stateOfForm(values: ItemFormValues): ItemState {
  return {
    name: values.name.trim(),
    categoryId: values.categoryId,
    description: values.description.trim() || null,
    price: parsePrice(values.price) ?? 0,
    leadTimeHours: values.leadTimeHours.trim() === '' ? 0 : Number(values.leadTimeHours),
    stockQuantity: values.trackStock ? Number(values.stockQuantity) : null,
    available: values.available,
  }
}

/** Which item fields each form field edits. */
const FIELD_KEYS: Record<ItemFormField, ItemStateKey> = {
  name: 'name',
  categoryId: 'categoryId',
  description: 'description',
  price: 'price',
  leadTimeHours: 'leadTimeHours',
  trackStock: 'stockQuantity',
  stockQuantity: 'stockQuantity',
  available: 'available',
}

export const FIELD_LABELS: Record<ItemStateKey, string> = {
  name: 'name',
  categoryId: 'category',
  description: 'description',
  price: 'price',
  leadTimeHours: 'lead time',
  stockQuantity: 'stock',
  available: 'availability',
}

/** The item fields the Owner actually changed: those whose form value differs from `loaded`. */
export function editedKeys(loaded: ItemState, values: ItemFormValues): ItemStateKey[] {
  const desired = stateOfForm(values)
  const keys = new Set(Object.values(FIELD_KEYS))
  return [...keys].filter((key) => desired[key] !== loaded[key])
}

export type Merge = {
  /** What to save: the latest item with only the Owner's edits applied. */
  state: ItemState
  /** Fields someone else changed since the form opened that the Owner didn't touch (kept). */
  updatedElsewhere: ItemStateKey[]
  /** Fields both changed: the Owner's value wins, but they should know. */
  overwritten: ItemStateKey[]
}

/**
 * "Reload and re-apply": `PUT` replaces every field, so saving the whole form would undo anything
 * that changed since it opened, e.g. stock that guests just bought. Instead, start from `fresh` (the
 * item as it is now) and apply only the fields the Owner edited.
 */
export function mergeEdits(loaded: ItemState, fresh: ItemState, values: ItemFormValues): Merge {
  const desired = stateOfForm(values)
  const edited = new Set(editedKeys(loaded, values))
  const state = { ...fresh }
  const updatedElsewhere: ItemStateKey[] = []
  const overwritten: ItemStateKey[] = []

  for (const key of Object.keys(fresh) as ItemStateKey[]) {
    const changedElsewhere = fresh[key] !== loaded[key]
    if (edited.has(key)) {
      Object.assign(state, { [key]: desired[key] })
      if (changedElsewhere && fresh[key] !== desired[key]) overwritten.push(key)
    } else if (changedElsewhere) {
      updatedElsewhere.push(key)
    }
  }
  return { state, updatedElsewhere, overwritten }
}

export function toItemRequest(state: ItemState): Schema<'ItemRequest'> {
  return {
    name: state.name,
    categoryId: state.categoryId,
    description: state.description ?? undefined,
    price: state.price,
    leadTimeHours: state.leadTimeHours,
    stockQuantity: state.stockQuantity ?? undefined,
  }
}

const SERVER_FIELDS: Record<string, ItemFormField> = {
  name: 'name',
  categoryId: 'categoryId',
  description: 'description',
  price: 'price',
  leadTimeHours: 'leadTimeHours',
  stockQuantity: 'stockQuantity',
}

/** The server's field errors, by form field. */
export function itemFieldErrors(error: ApiError): Partial<Record<ItemFormField, string>> {
  const fields: Partial<Record<ItemFormField, string>> = {}
  for (const { field, message } of error.fieldErrors) {
    const formField = SERVER_FIELDS[field]
    if (formField) fields[formField] ??= message.charAt(0).toUpperCase() + message.slice(1)
  }
  return fields
}
