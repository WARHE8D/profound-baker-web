import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, expect, test } from 'vitest'
import { catalogueItemQuery } from '@/features/catalogue/queries'
import { ids, items as fixtureItems } from '@/mocks/fixtures'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

beforeAll(async () => {
  await Promise.all([
    import('@/features/items/ItemsPage'),
    import('@/features/items/ItemEditorPage'),
  ])
})

async function open(path: string) {
  await signInAsOwner()
  const result = renderRoute(path)
  return result
}

const table = () => screen.getByRole('table')
const rowNames = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getByRole('link').textContent)

async function openList(path = '/owner/items') {
  const result = await open(path)
  await screen.findByRole('table')
  return result
}

async function openEditor(id: string) {
  const result = await open(`/owner/items/${id}`)
  await screen.findByRole('textbox', { name: /^Name/ })
  return result
}

const field = (name: RegExp) => screen.getByRole('textbox', { name })
const save = () => screen.getByRole('button', { name: 'Save changes' })

// ---- The list ----

test('lists every item by name, hidden ones included', async () => {
  await openList()

  expect(rowNames()).toEqual(fixtureItems.map((i) => i.name).toSorted((a, b) => a.localeCompare(b)))
  const hidden = within(table()).getByRole('switch', { name: /Wedding cake/ })
  expect(hidden).toHaveAttribute('aria-checked', 'false')
  expect(within(table()).getByText('Sold out')).toBeInTheDocument()
  expect(screen.getByText('6 items')).toBeInTheDocument()
})

test('sorts by a column, then reverses on a second click', async () => {
  const { router } = await openList()

  await userEvent.click(screen.getByRole('button', { name: 'Price' }))
  await waitFor(() => expect(rowNames()[0]).toBe('Baguette'))
  expect(router.state.location.search).toBe('?sort=price')
  expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute(
    'aria-sort',
    'ascending',
  )

  await userEvent.click(screen.getByRole('button', { name: 'Price' }))
  await waitFor(() => expect(rowNames()[0]).toBe('Wedding cake (seasonal)'))
  expect(router.state.location.search).toBe('?sort=price&dir=desc')
})

test('filters by search, category and status, kept in the URL', async () => {
  const { router } = await openList()

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search items' }), 'cake')
  await waitFor(() =>
    expect(rowNames()).toEqual(['Chocolate fudge cake', 'Wedding cake (seasonal)']),
  )
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'hidden')
  await waitFor(() => expect(rowNames()).toEqual(['Wedding cake (seasonal)']))
  expect(router.state.location.search).toBe('?q=cake&status=hidden')

  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Category' }), 'Bread')
  expect(await screen.findByText('No items match')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(rowNames()).toHaveLength(6))
  expect(screen.getByRole('searchbox', { name: 'Search items' })).toHaveValue('')
})

test('pages through more than 20 items', async () => {
  const base = fixtureItems[1]!
  mockStore.setItems(
    Array.from({ length: 25 }, (_, n) => ({
      ...base,
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      name: `Bun ${String(n + 1).padStart(2, '0')}`,
    })),
  )
  const { router } = await openList()

  expect(rowNames()).toHaveLength(20)
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() =>
    expect(rowNames()).toEqual(['Bun 21', 'Bun 22', 'Bun 23', 'Bun 24', 'Bun 25']),
  )
  expect(router.state.location.search).toBe('?page=2')
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
})

test('the switch hides an item from guests and back', async () => {
  const { queryClient } = await openList()
  await queryClient.fetchQuery(catalogueItemQuery(ids.items.baguette))

  await userEvent.click(screen.getByRole('switch', { name: 'Show Baguette on the storefront' }))

  expect(await screen.findByText('“Baguette” is hidden from guests')).toBeInTheDocument()
  expect(mockStore.findItem(ids.items.baguette)?.available).toBe(false)
  await waitFor(() =>
    expect(screen.getByRole('switch', { name: /Baguette/ })).toHaveAttribute(
      'aria-checked',
      'false',
    ),
  )
  // The storefront's copy is stale now.
  expect(
    queryClient.getQueryState(catalogueItemQuery(ids.items.baguette).queryKey)?.isInvalidated,
  ).toBe(true)
})

test('an empty menu invites the first item', async () => {
  mockStore.setItems([])
  await open('/owner/items')

  expect(await screen.findByText('No items yet')).toBeInTheDocument()
})

// ---- Creating ----

test('adds an item and opens it for editing', async () => {
  const { router } = await open('/owner/items/new')
  await screen.findByRole('textbox', { name: /^Name/ })

  await userEvent.type(field(/^Name/), 'Almond croissant')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Category/ }), 'Pastries')
  await userEvent.type(field(/^Price/), '4,25')
  await userEvent.clear(field(/^Notice/))
  await userEvent.type(field(/^Notice/), '24')
  await userEvent.click(screen.getByRole('checkbox', { name: /Limit how many/ }))
  await userEvent.type(await screen.findByRole('textbox', { name: /^In stock/ }), '12')
  await userEvent.click(screen.getByRole('checkbox', { name: /Show on the storefront/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Add item' }))

  expect(await screen.findByText('Added “Almond croissant”')).toBeInTheDocument()
  const created = mockStore.items.find((i) => i.name === 'Almond croissant')
  expect(created).toMatchObject({
    price: 4.25,
    leadTimeHours: 24,
    stockQuantity: 12,
    available: false,
    category: { id: ids.categories.pastries },
  })
  await waitFor(() => expect(router.state.location.pathname).toBe(`/owner/items/${created!.id}`))
  expect(await screen.findByRole('heading', { name: 'Almond croissant' })).toBeInTheDocument()
})

test('checks the form before sending it', async () => {
  let posts = 0
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && request.url.endsWith('/catalogue/items')) posts += 1
  })
  await open('/owner/items/new')
  await screen.findByRole('textbox', { name: /^Name/ })

  await userEvent.type(field(/^Price/), '3.999')
  await userEvent.click(screen.getByRole('button', { name: 'Add item' }))

  expect(screen.getByText('Enter a name')).toBeInTheDocument()
  expect(screen.getByText('Choose the category it belongs to')).toBeInTheDocument()
  expect(screen.getByText('Enter a price like 4.50 (at most 2 decimals)')).toBeInTheDocument()
  expect(field(/^Name/)).toHaveFocus()
  expect(posts).toBe(0)
  server.events.removeAllListeners()
})

// ---- Editing ----

test('saves an edit', async () => {
  await openEditor(ids.items.sourdough)
  expect(save()).toBeDisabled()

  await userEvent.clear(field(/^Price/))
  await userEvent.type(field(/^Price/), '9')
  await userEvent.click(save())

  expect(await screen.findByText('Changes saved')).toBeInTheDocument()
  expect(mockStore.findItem(ids.items.sourdough)).toMatchObject({ price: 9, stockQuantity: 10 })
  await waitFor(() => expect(save()).toBeDisabled())
  expect(field(/^Price/)).toHaveValue('9.00')
})

test('saving keeps stock that guests bought while the form was open', async () => {
  await openEditor(ids.items.sourdough)
  // Three loaves sold meanwhile.
  const item = mockStore.findItem(ids.items.sourdough)!
  mockStore.saveItem({ ...item, stockQuantity: 7 })

  await userEvent.clear(field(/^Price/))
  await userEvent.type(field(/^Price/), '9.25')
  await userEvent.click(save())

  expect(await screen.findByText(/The stock changed while you were editing/)).toBeInTheDocument()
  expect(mockStore.findItem(ids.items.sourdough)).toMatchObject({ price: 9.25, stockQuantity: 7 })
  expect(screen.getByRole('textbox', { name: /^In stock/ })).toHaveValue('7')
})

test('a refetch mid-edit doesn’t turn someone else’s change into an edit', async () => {
  const { queryClient } = await openEditor(ids.items.sourdough)
  await userEvent.clear(field(/^Price/))
  await userEvent.type(field(/^Price/), '9.50')

  // Another tab renames the item, and this tab refetches it (e.g. on focus) while editing.
  const item = mockStore.findItem(ids.items.sourdough)!
  mockStore.saveItem({ ...item, name: 'Sourdough (large)' })
  await queryClient.refetchQueries({ queryKey: ['owner', 'items', 'detail', ids.items.sourdough] })

  // The edit in progress stays on screen…
  expect(field(/^Price/)).toHaveValue('9.50')
  expect(field(/^Name/)).toHaveValue('Country sourdough')
  await userEvent.click(save())

  // …and saving keeps the other tab's name instead of writing the old one back.
  expect(await screen.findByText(/The name changed while you were editing/)).toBeInTheDocument()
  expect(mockStore.findItem(ids.items.sourdough)).toMatchObject({
    name: 'Sourdough (large)',
    price: 9.5,
  })
  expect(field(/^Name/)).toHaveValue('Sourdough (large)')
})

test('a write collision (409) is retried once by reloading and re-applying', async () => {
  let puts = 0
  server.use(
    http.put('*/api/catalogue/items/:id', () => {
      puts += 1
      if (puts > 1) return undefined // the second try reaches the normal mock
      return HttpResponse.json(
        {
          status: 409,
          message: 'the resource was changed by another request; reload and try again',
        },
        { status: 409 },
      )
    }),
  )
  await openEditor(ids.items.baguette)

  await userEvent.clear(field(/^Name/))
  await userEvent.type(field(/^Name/), 'Classic baguette')
  await userEvent.click(save())

  expect(await screen.findByText('Changes saved')).toBeInTheDocument()
  expect(puts).toBe(2)
  expect(mockStore.findItem(ids.items.baguette)?.name).toBe('Classic baguette')
})

test('keeps the edits and explains when collisions continue', async () => {
  server.use(
    http.put('*/api/catalogue/items/:id', () =>
      HttpResponse.json(
        {
          status: 409,
          message: 'the resource was changed by another request; reload and try again',
        },
        { status: 409, headers: { 'X-Request-Id': 'req-409' } },
      ),
    ),
  )
  await openEditor(ids.items.baguette)

  await userEvent.clear(field(/^Name/))
  await userEvent.type(field(/^Name/), 'Classic baguette')
  await userEvent.click(save())

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('kept changing while we saved it')
  expect(alert).toHaveTextContent('req-409')
  expect(field(/^Name/)).toHaveValue('Classic baguette')
})

test('changing availability in the form uses its own endpoint', async () => {
  await openEditor(ids.items.weddingCake)

  await userEvent.click(screen.getByRole('checkbox', { name: /Show on the storefront/ }))
  await userEvent.click(save())

  expect(await screen.findByText('Changes saved')).toBeInTheDocument()
  expect(mockStore.findItem(ids.items.weddingCake)?.available).toBe(true)
})

test('asks before leaving with unsaved changes', async () => {
  const { router } = await openEditor(ids.items.baguette)

  await userEvent.type(field(/^Name/), ' XL')
  await userEvent.click(screen.getByRole('link', { name: 'All items' }))

  const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
  expect(router.state.location.pathname).toBe(`/owner/items/${ids.items.baguette}`)
  expect(field(/^Name/)).toHaveValue('Baguette XL')

  await userEvent.click(screen.getByRole('link', { name: 'All items' }))
  await userEvent.click(
    within(await screen.findByRole('dialog', { name: 'Leave without saving?' })).getByRole(
      'button',
      { name: 'Discard changes' },
    ),
  )
  await waitFor(() => expect(router.state.location.pathname).toBe('/owner/items'))
})

test('an unknown item says so', async () => {
  await open('/owner/items/00000000-0000-4000-8000-00000000dead')

  expect(await screen.findByText("This item doesn't exist")).toBeInTheDocument()
})

// ---- Deleting ----

test('deletes an item nobody has ordered', async () => {
  const { router } = await openEditor(ids.items.baguette)

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete “Baguette”?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

  expect(await screen.findByText('Deleted “Baguette”')).toBeInTheDocument()
  await waitFor(() => expect(router.state.location.pathname).toBe('/owner/items'))
  expect(mockStore.findItem(ids.items.baguette)).toBeUndefined()
})

test('an item with orders can only be hidden', async () => {
  mockStore.placeOrder({
    pickupAt: '2026-12-01T15:00:00Z',
    guestContact: { name: 'Jane', email: 'jane@example.com', phone: '+1 555 0101' },
    lines: [{ itemId: ids.items.croissant, quantity: 1 }],
  })
  await openEditor(ids.items.croissant)

  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete “Butter croissant”?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    "Guests have ordered this item, so it can't be deleted.",
  )
  await userEvent.click(within(dialog).getByRole('button', { name: 'Hide it instead' }))

  expect(await screen.findByText('“Butter croissant” is hidden from guests')).toBeInTheDocument()
  expect(mockStore.findItem(ids.items.croissant)?.available).toBe(false)
})
