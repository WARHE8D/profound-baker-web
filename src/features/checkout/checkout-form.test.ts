import { describe, expect, test } from 'vitest'
import { ApiError } from '@/api'
import {
  checkoutFormSchema,
  mapServerFieldErrors,
  toCheckoutRequest,
  type CheckoutFormInput,
} from './checkout-form'

const valid: CheckoutFormInput = {
  name: '  Jane Baker ',
  email: 'jane@example.com',
  phone: '+1 555 0101',
  notes: '',
}

describe('checkoutFormSchema', () => {
  test('trims and accepts valid details', () => {
    expect(checkoutFormSchema.parse(valid)).toEqual({ ...valid, name: 'Jane Baker' })
  })

  test('mirrors the server: required name, email and phone, and their lengths', () => {
    const result = checkoutFormSchema.safeParse({
      name: '   ',
      email: 'jane@',
      phone: 'x'.repeat(31),
      notes: 'x'.repeat(1001),
    })
    expect(result.success).toBe(false)
    expect(result.error?.flatten().fieldErrors).toEqual({
      name: ['Enter your name'],
      email: ['Enter a valid email address, like name@example.com'],
      phone: ['Use at most 30 characters'],
      notes: ['Use at most 1000 characters'],
    })

    const empty = checkoutFormSchema.safeParse({ name: '', email: '', phone: '', notes: '' })
    expect(empty.error?.flatten().fieldErrors).toEqual({
      name: ['Enter your name'],
      email: ['Enter your email address'],
      phone: ['Enter a phone number the bakery can reach you on'],
    })
  })
})

test('toCheckoutRequest sends trimmed details, no empty notes, and the lines', () => {
  const values = checkoutFormSchema.parse(valid)
  expect(
    toCheckoutRequest(values, '2026-11-23T15:00:00Z', [
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 1 },
    ]),
  ).toEqual({
    pickupAt: '2026-11-23T15:00:00Z',
    guestContact: { name: 'Jane Baker', email: 'jane@example.com', phone: '+1 555 0101' },
    notes: undefined,
    lines: [
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 1 },
    ],
  })
  expect(toCheckoutRequest({ ...values, notes: 'No nuts' }, 'x', []).notes).toBe('No nuts')
})

test('mapServerFieldErrors puts each server error where the guest will see it', () => {
  const error = new ApiError({
    status: 400,
    message: 'validation failed',
    fieldErrors: [
      { field: 'guestContact.email', message: 'must be a well-formed email address' },
      { field: 'guestContact.name', message: 'must not be blank' },
      { field: 'notes', message: 'size must be between 0 and 1000' },
      { field: 'pickupAt', message: 'must be a future date' },
      { field: 'lines[0].quantity', message: 'must be greater than or equal to 1' },
    ],
  })

  expect(mapServerFieldErrors(error)).toEqual({
    fields: {
      email: 'Must be a well-formed email address',
      name: 'Must not be blank',
      notes: 'Size must be between 0 and 1000',
    },
    pickup: 'Pickup time must be a future date.',
    other: ['lines[0].quantity must be greater than or equal to 1'],
  })
})
