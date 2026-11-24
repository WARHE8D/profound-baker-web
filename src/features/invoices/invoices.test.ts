import { describe, expect, test } from 'vitest'
import { readInvoiceParams } from './invoices-list'
import { fromLocalInput, paymentProblems, toLocalInput } from './payment'

const ZONE = 'America/New_York'

describe('readInvoiceParams', () => {
  test('defaults to every invoice, newest first, page 1', () => {
    expect(readInvoiceParams(new URLSearchParams())).toEqual({
      search: '',
      statuses: [],
      from: null,
      to: null,
      sort: 'createdAt',
      direction: 'desc',
      page: 0,
    })
  })

  test('reads filters, keeps only known statuses in their order, and swaps reversed dates', () => {
    const params = readInvoiceParams(
      new URLSearchParams(
        'q=inv-2026&status=VOID&status=nope&status=PENDING&from=2026-11-30&to=2026-11-01&sort=number&dir=asc&page=3',
      ),
    )
    expect(params).toEqual({
      search: 'inv-2026',
      statuses: ['PENDING', 'VOID'],
      from: '2026-11-01',
      to: '2026-11-30',
      sort: 'number',
      direction: 'asc',
      page: 2,
    })
  })

  test('cuts the search to the server’s 50 characters and ignores bad dates', () => {
    const params = readInvoiceParams(new URLSearchParams(`q=${'x'.repeat(60)}&from=20261101`))
    expect(params.search).toHaveLength(50)
    expect(params.from).toBeNull()
  })
})

describe('payment times', () => {
  test('converts between the bakery’s local time and instants', () => {
    expect(toLocalInput(new Date('2026-11-20T14:05:30Z'), ZONE)).toBe('2026-11-20T09:05')
    expect(fromLocalInput('2026-11-20T09:05', ZONE)).toBe('2026-11-20T14:05:00Z')
    expect(fromLocalInput('2026-11-20', ZONE)).toBeNull()
  })

  test('a bank transfer needs its reference; a payment can’t be in the future', () => {
    const now = Date.parse('2026-11-20T17:00:00Z') // 12:00 in New York
    const form = { method: 'BANK_TRANSFER', reference: '  ', paidAt: '2026-11-20T12:00' } as const
    expect(paymentProblems(form, ZONE, now)).toEqual({ reference: expect.any(String) })
    expect(paymentProblems({ ...form, method: 'CASH' }, ZONE, now)).toEqual({})
    expect(
      paymentProblems({ ...form, method: 'CASH', paidAt: '2026-11-20T12:01' }, ZONE, now),
    ).toEqual({
      paidAt: 'A payment can’t be in the future.',
    })
    expect(paymentProblems({ ...form, method: 'CASH', paidAt: '' }, ZONE, now)).toEqual({
      paidAt: 'Enter the date and time it was paid.',
    })
  })
})
