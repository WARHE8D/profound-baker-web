import { z } from 'zod'
import type { ApiError, Schema } from '@/api'
import type { CartLine } from '@/features/cart/cart-store'

/**
 * The guest's details, with the server's limits (GuestContactRequest, CheckoutRequest.notes) so
 * the form catches mistakes before a round trip. The server stays the authority: its field errors
 * are mapped back onto these fields.
 */
export const checkoutFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(150, 'Use at most 150 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .max(254, 'Use at most 254 characters')
    .pipe(z.email('Enter a valid email address, like name@example.com')),
  phone: z
    .string()
    .trim()
    .min(1, 'Enter a phone number the bakery can reach you on')
    .max(30, 'Use at most 30 characters'),
  notes: z.string().trim().max(1000, 'Use at most 1000 characters'),
})

export type CheckoutFormInput = z.input<typeof checkoutFormSchema>
export type CheckoutFormValues = z.output<typeof checkoutFormSchema>
export type CheckoutFormField = keyof CheckoutFormValues

export const emptyCheckoutForm: CheckoutFormInput = { name: '', email: '', phone: '', notes: '' }

export const NOTES_MAX_LENGTH = 1000

/** The request body for `POST /api/public/orders`. */
export function toCheckoutRequest(
  values: CheckoutFormValues,
  pickupAt: string,
  lines: readonly Pick<CartLine, 'itemId' | 'quantity'>[],
): Schema<'CheckoutRequest'> {
  return {
    pickupAt,
    guestContact: { name: values.name, email: values.email, phone: values.phone },
    notes: values.notes === '' ? undefined : values.notes,
    lines: lines.map(({ itemId, quantity }) => ({ itemId, quantity })),
  }
}

/** Where a server field error belongs on the checkout page. */
export type ServerFieldErrors = {
  /** Messages for the form's own fields. */
  fields: Partial<Record<CheckoutFormField, string>>
  /** About the pickup time: shown with the slot picker. */
  pickup: string | null
  /** Anything else (e.g. the cart's lines): shown above the submit button. */
  other: string[]
}

const FIELD_NAMES: Record<string, CheckoutFormField> = {
  'guestContact.name': 'name',
  'guestContact.email': 'email',
  'guestContact.phone': 'phone',
  notes: 'notes',
}

/**
 * Sorts the server's `fieldErrors` onto the checkout page. The server's messages are terse
 * ("must not be blank"), so they are prefixed with the field's name when shown on their own.
 */
export function mapServerFieldErrors(error: ApiError): ServerFieldErrors {
  const result: ServerFieldErrors = { fields: {}, pickup: null, other: [] }
  for (const { field, message } of error.fieldErrors) {
    const formField = FIELD_NAMES[field]
    if (formField) result.fields[formField] ??= capitalize(message)
    else if (field === 'pickupAt') result.pickup ??= `Pickup time ${message}.`
    else result.other.push(`${field} ${message}`)
  }
  return result
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
