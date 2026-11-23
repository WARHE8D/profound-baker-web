import { describe, expect, test } from 'vitest'
import { demoOrders } from '@/mocks/demo-orders'
import {
  canEditContents,
  canReschedule,
  draftChanged,
  draftProblem,
  draftSubtotal,
  mayHaveInvoice,
  toDraft,
  toLinesRequest,
  transitionsFor,
  type DraftLine,
} from './order-detail'
import { timelineSteps } from './timeline'

const NOW = new Date('2026-11-20T17:00:00Z')
// SC-D002: pending, 1 × Chocolate fudge cake (42.00) and 6 × Cinnamon roll (4.50).
const order = demoOrders(NOW)[1]!

describe('what the Owner can do', () => {
  test('follows the server’s state machine', () => {
    expect(transitionsFor('PENDING')).toEqual(['confirm', 'reject'])
    expect(transitionsFor('CONFIRMED')).toEqual(['start-preparation', 'fulfill', 'cancel'])
    expect(transitionsFor('IN_PROGRESS')).toEqual(['fulfill', 'cancel'])
    expect(transitionsFor('FULFILLED')).toEqual([])
    expect(transitionsFor('REJECTED')).toEqual([])
    expect(transitionsFor('CANCELLED')).toEqual([])
  })

  test('reschedules until the order is over; edits contents only while pending', () => {
    expect(['PENDING', 'CONFIRMED', 'IN_PROGRESS'].every((s) => canReschedule(s as never))).toBe(
      true,
    )
    expect(canReschedule('FULFILLED')).toBe(false)
    expect(canEditContents('PENDING')).toBe(true)
    expect(canEditContents('CONFIRMED')).toBe(false)
  })

  test('only a confirmed order ever has an invoice', () => {
    expect(mayHaveInvoice('PENDING')).toBe(false)
    expect(mayHaveInvoice('REJECTED')).toBe(false)
    expect(mayHaveInvoice('CANCELLED')).toBe(true)
  })
})

describe('the lines editor’s draft', () => {
  const draft = toDraft(order)

  test('starts as the order, unchanged', () => {
    expect(draftChanged(order, draft)).toBe(false)
    expect(draftSubtotal(draft)).toBe(69)
    expect(draftProblem(draft)).toBeNull()
  })

  test('sends every kept line with its quantity', () => {
    const edited: DraftLine[] = [{ ...draft[0]!, quantity: 2 }]
    expect(toLinesRequest(edited)).toEqual([{ itemId: draft[0]!.itemId, quantity: 2 }])
    expect(draftChanged(order, edited)).toBe(true)
    expect(draftSubtotal(edited)).toBe(84)
  })

  test('drops a line whose item was deleted, which counts as a change', () => {
    const withDeleted = {
      ...order,
      lines: [...order.lines, { ...order.lines[0]!, lineNo: 3, itemId: null }],
    }
    const fromIt = toDraft(withDeleted)
    expect(toLinesRequest(fromIt)).toHaveLength(2)
    expect(draftChanged(withDeleted, fromIt)).toBe(true)
  })

  test('explains what keeps it from being saved', () => {
    expect(draftProblem([])).toMatch(/at least one item/)
    expect(draftProblem([{ ...draft[0]!, quantity: 0 }])).toMatch(/from 1 to 100/)
    expect(draftProblem([{ ...draft[0]!, quantity: 1.5 }])).toMatch(/whole numbers/)
    expect(draftProblem([{ ...draft[0]!, quantity: Number.NaN }])).toMatch(/whole numbers/)
    const many = Array.from({ length: 21 }, (_, i) => ({ ...draft[0]!, itemId: `item-${i}` }))
    expect(draftProblem(many)).toMatch(/at most 20/)
  })
})

describe('the Owner’s timeline', () => {
  const zone = 'America/New_York'
  const steps = (status: typeof order.status) =>
    timelineSteps({ ...order, status, placedAt: order.createdAt }, zone, 'owner')

  test('waits for the Owner, in their words', () => {
    expect(steps('PENDING').map((s) => [s.label, s.state, s.detail])).toEqual([
      ['Order placed', 'done', 'Nov 19, 2026, 3:00 PM'],
      ['Confirmed', 'current', 'Waiting for you'],
      ['Being prepared', 'upcoming', undefined],
      ['Picked up', 'upcoming', undefined],
    ])
  })

  test('says a declined order was rejected', () => {
    expect(steps('REJECTED')[1]).toMatchObject({ label: 'Rejected', state: 'stopped' })
    // The guest still reads "Declined by the bakery".
    expect(
      timelineSteps({ ...order, status: 'REJECTED', placedAt: order.createdAt }, zone)[1]?.label,
    ).toBe('Declined by the bakery')
  })
})
