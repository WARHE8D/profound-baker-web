import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { seedDemo } from '@/mocks/demo-orders'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { renderRoute } from '@/test/render'

// Friday 20 Nov 2026, 12:00 in New York.
const NOW = new Date('2026-11-20T17:00:00Z')

beforeAll(async () => {
  await Promise.all([
    import('@/features/invoices/InvoicePage'),
    import('@/features/orders/OrderDetailPage'),
  ])
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  mockStore.setNow(NOW)
  seedDemo(mockStore)
})

afterEach(() => vi.useRealTimers())

/** The invoice of a demo order, by the order's reference. */
const invoiceOf = (reference: string) => {
  const order = mockStore.orders.find((o) => o.reference === reference)!
  return mockStore.invoiceForOrder(order.id)!
}

async function openInvoice(reference: string) {
  await signInAsOwner()
  const result = renderRoute(`/owner/invoices/${invoiceOf(reference).id}`)
  await screen.findByRole('heading', { name: invoiceOf(reference).number, level: 1 })
  return result
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const queryButton = (name: string | RegExp) => screen.queryByRole('button', { name })
const document = () => within(screen.getByRole('article'))

test('shows the invoice as printed: bakery, guest, items and totals', async () => {
  await openInvoice('SC-D004')

  const doc = document()
  expect(doc.getByText('SugarCrumbs')).toBeInTheDocument()
  expect(doc.getByText('INV-2026-0001')).toBeInTheDocument()
  expect(doc.getByRole('link', { name: 'SC-D004' })).toHaveAttribute(
    'href',
    '/owner/orders/d0000000-0000-4000-8000-000000000004',
  )
  expect(await doc.findByText('Lucas Moreau')).toBeInTheDocument()
  expect(
    doc.getByRole('row', { name: /Butter croissant 4 CA\$3\.75 CA\$15\.00/ }),
  ).toBeInTheDocument()
  expect(doc.getByRole('row', { name: /Total CA\$18\.25/ })).toBeInTheDocument()
  expect(doc.getByText(/Payable at pickup/)).toBeInTheDocument()
  expect(screen.getByText('Unpaid')).toBeInTheDocument()
  expect(queryButton('Refund…')).not.toBeInTheDocument()
})

test('applies a discount, shown on the invoice', async () => {
  await openInvoice('SC-D004')

  await userEvent.click(button('Apply discount…'))
  const dialog = await screen.findByRole('dialog', { name: 'Discount on INV-2026-0001' })
  const amount = within(dialog).getByLabelText('Amount off')
  await userEvent.type(amount, '20')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Apply discount' }))
  expect(within(dialog).getByText('At most the subtotal, CA$18.25.')).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: '10%' }))
  expect(amount).toHaveValue('1.83')
  expect(within(dialog).getByText('New total CA$16.42')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Apply discount' }))

  expect(await screen.findByText('Discount of CA$1.83 applied')).toBeInTheDocument()
  expect(invoiceOf('SC-D004')).toMatchObject({ discountAmount: 1.83, total: 16.42 })
  expect(document().getByRole('row', { name: /Discount −CA\$1\.83/ })).toBeInTheDocument()
  expect(document().getByRole('row', { name: /Total CA\$16\.42/ })).toBeInTheDocument()
  expect(button('Change discount…')).toBeInTheDocument()
})

test('records a bank transfer, which needs its reference', async () => {
  await openInvoice('SC-D004')

  await userEvent.click(button('Mark paid…'))
  const dialog = await screen.findByRole('dialog', { name: 'Record payment for INV-2026-0001' })
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Bank transfer' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Mark paid' }))
  expect(within(dialog).getByText(/Enter the transfer’s reference/)).toBeInTheDocument()

  await userEvent.type(within(dialog).getByLabelText(/Transfer reference/), 'TRF-77120')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Mark paid' }))

  expect(await screen.findByText('INV-2026-0001 marked paid')).toBeInTheDocument()
  expect(invoiceOf('SC-D004')).toMatchObject({
    status: 'PAID',
    paymentMethod: 'BANK_TRANSFER',
    paymentReference: 'TRF-77120',
    paidAt: NOW.toISOString(),
  })
  expect(
    document().getByText(/Paid Nov 20, 2026 by bank transfer \(TRF-77120\)\./),
  ).toBeInTheDocument()
  expect(queryButton('Mark paid…')).not.toBeInTheDocument()
  expect(queryButton(/discount/)).not.toBeInTheDocument()
  expect(button('Refund…')).toBeInTheDocument()
})

test('records cash taken earlier, at the time it was paid', async () => {
  await openInvoice('SC-D005')

  await userEvent.click(button('Mark paid…'))
  const dialog = await screen.findByRole('dialog', { name: /^Record payment/ })
  const paidOn = within(dialog).getByLabelText('Paid on')
  expect(paidOn).toHaveValue('2026-11-20T12:00')
  await userEvent.clear(paidOn)
  await userEvent.type(paidOn, '2026-11-20T09:30')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Mark paid' }))

  await screen.findByText(/marked paid/)
  expect(invoiceOf('SC-D005')).toMatchObject({
    status: 'PAID',
    paymentMethod: 'CASH',
    paymentReference: null,
    paidAt: '2026-11-20T14:30:00Z',
  })
})

test('refunds a paid invoice', async () => {
  await openInvoice('SC-D009')
  expect(document().getByText(/^Paid .* by cash\.$/)).toBeInTheDocument()

  await userEvent.click(button('Refund…'))
  const dialog = await screen.findByRole('dialog', { name: /^Refund INV-/ })
  expect(dialog).toHaveTextContent(/gave back the CA\$\d+\.\d{2} paid \(cash, /)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Record refund' }))

  expect(await screen.findByText(/refunded$/)).toBeInTheDocument()
  expect(invoiceOf('SC-D009')).toMatchObject({ status: 'REFUNDED', refundedAt: NOW.toISOString() })
  expect(document().getByText(/Refunded Nov 20, 2026\./)).toBeInTheDocument()
  expect(queryButton('Refund…')).not.toBeInTheDocument()
})

test('an invoice paid elsewhere is reloaded, and the Owner is told', async () => {
  await openInvoice('SC-D004')
  // Paid in another tab after this one loaded it.
  mockStore.updateInvoice(invoiceOf('SC-D004'), {
    status: 'PAID',
    paymentMethod: 'CASH',
    paymentReference: null,
    paidAt: NOW.toISOString(),
  })

  await userEvent.click(button('Apply discount…'))
  const dialog = await screen.findByRole('dialog', { name: /^Discount/ })
  await userEvent.type(within(dialog).getByLabelText('Amount off'), '2')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Apply discount' }))

  expect(await screen.findByText('Someone else changed this invoice')).toBeInTheDocument()
  expect(screen.getByText(/It's now paid/)).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(button('Refund…')).toBeInTheDocument()
  expect(invoiceOf('SC-D004').discountAmount).toBe(0)
})

test('a void invoice has nothing left to do, but can still be printed', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  mockStore.voidInvoice(mockStore.orders.find((o) => o.reference === 'SC-D006')!.id)
  await openInvoice('SC-D006')

  expect(
    document().getByText('Void: the order was cancelled. Nothing is owed.'),
  ).toBeInTheDocument()
  expect(queryButton('Mark paid…')).not.toBeInTheDocument()
  expect(queryButton('Refund…')).not.toBeInTheDocument()
  await userEvent.click(button('Print'))
  expect(print).toHaveBeenCalledOnce()
})

test('the order page links to its invoice, and back', async () => {
  await signInAsOwner()
  renderRoute('/owner/orders/d0000000-0000-4000-8000-000000000004')
  const link = await screen.findByRole('link', { name: 'INV-2026-0001' })

  await userEvent.click(link)

  expect(
    await screen.findByRole('heading', { name: 'INV-2026-0001', level: 1 }),
  ).toBeInTheDocument()
})

test('an unknown invoice says so', async () => {
  await signInAsOwner()
  renderRoute('/owner/invoices/60000000-0000-4000-8000-000000000999')

  expect(await screen.findByText('Invoice not found')).toBeInTheDocument()
})

test('“All invoices” goes back to the list as it was filtered', async () => {
  await signInAsOwner()
  const { router } = renderRoute('/owner/invoices?status=PENDING&dir=asc')
  const table = await screen.findByRole('table')
  await userEvent.click(within(table).getByRole('link', { name: 'INV-2026-0002' }))
  await screen.findByRole('heading', { name: 'INV-2026-0002', level: 1 })

  await userEvent.click(screen.getByRole('link', { name: 'All invoices' }))

  await waitFor(() => expect(router.state.location.pathname).toBe('/owner/invoices'))
  expect(router.state.location.search).toBe('?status=PENDING&dir=asc')
})
