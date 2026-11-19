import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { Schema } from '@/api'
import { ids, items as fixtureItems, toPublicItem } from '@/mocks/fixtures'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'

const ITEMS_URL = 'http://localhost:8080/api/public/catalogue/items'
const CATEGORIES_URL = 'http://localhost:8080/api/public/catalogue/categories'

/** The cards in the grid, by item name. */
async function cardNames() {
  const headings = await screen.findAllByRole('heading', { level: 3 })
  return headings.map((h) => h.textContent)
}

function card(name: string) {
  return screen.getByRole('heading', { level: 3, name }).closest('article') as HTMLElement
}

function page(content: Schema<'PublicItemResponse'>[], number: number, totalElements: number) {
  return {
    content,
    number,
    size: 2,
    totalElements,
    totalPages: Math.ceil(totalElements / 2),
  } satisfies Schema<'PagePublicItemResponse'>
}

test('lists the available items with thumbnail, price and lead time', async () => {
  renderRoute('/')

  expect(await cardNames()).toEqual([
    'Baguette',
    'Butter croissant',
    'Chocolate fudge cake',
    'Cinnamon roll',
    'Country sourdough',
  ])
  // The Owner has hidden the wedding cake.
  expect(screen.queryByText('Wedding cake (seasonal)')).not.toBeInTheDocument()

  const sourdough = card('Country sourdough')
  expect(within(sourdough).getByText('CA$8.50')).toBeInTheDocument()
  expect(within(sourdough).getByText('Order 12 hours ahead')).toBeInTheDocument()
  expect(within(sourdough).getByText('Bread')).toBeInTheDocument()
  expect(sourdough.querySelector('img')).toHaveAttribute(
    'src',
    `http://localhost:8080/uploads/items/${ids.items.sourdough}-thumb.svg`,
  )
  expect(within(card('Chocolate fudge cake')).getByText('Order 2 days ahead')).toBeInTheDocument()
  expect(within(card('Baguette')).getByText('No notice needed')).toBeInTheDocument()
})

test('marks sold-out items', async () => {
  renderRoute('/')
  await cardNames()

  expect(within(card('Cinnamon roll')).getByText('Sold out')).toBeInTheDocument()
  expect(within(card('Baguette')).queryByText('Sold out')).not.toBeInTheDocument()
})

test('an item without photos shows a placeholder instead of an image', async () => {
  server.use(
    http.get(ITEMS_URL, () =>
      HttpResponse.json(
        page([{ ...toPublicItem(fixtureItems[1]!), thumbnailUrls: [], imageUrls: [] }], 0, 1),
      ),
    ),
  )
  renderRoute('/')

  await screen.findByRole('heading', { level: 3, name: 'Baguette' })
  expect(card('Baguette').querySelector('img')).toBeNull()
})

test('the category filter narrows the list and is kept in the URL', async () => {
  const { router } = renderRoute('/')
  const filter = await screen.findByRole('navigation', { name: 'Categories' })
  expect(within(filter).getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page')

  await userEvent.click(within(filter).getByRole('link', { name: 'Pastries' }))

  await waitFor(() =>
    expect(screen.queryByRole('heading', { level: 3, name: 'Baguette' })).not.toBeInTheDocument(),
  )
  expect(await cardNames()).toEqual(['Butter croissant', 'Cinnamon roll'])
  expect(router.state.location.search).toBe(`?category=${ids.categories.pastries}`)
  expect(within(filter).getByRole('link', { name: 'Pastries' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  expect(screen.getByRole('heading', { level: 2, name: 'Pastries' })).toBeInTheDocument()
  // Within one category the category name on each card would only repeat itself.
  expect(within(card('Butter croissant')).queryByText('Pastries')).not.toBeInTheDocument()

  await userEvent.click(within(filter).getByRole('link', { name: 'All' }))
  expect(await screen.findByRole('heading', { level: 3, name: 'Baguette' })).toBeInTheDocument()
  expect(router.state.location.search).toBe('')
})

test('opening a link with a category shows that category', async () => {
  renderRoute(`/?category=${ids.categories.cakes}`)

  expect(await cardNames()).toEqual(['Chocolate fudge cake'])
  expect(screen.getByRole('link', { name: 'Cakes' })).toHaveAttribute('aria-current', 'page')
})

test.each([
  ['an unknown category', '30000000-0000-4000-8000-000000000009'],
  ['a malformed category', 'not-a-uuid'],
])('a link to %s offers the whole menu', async (_, category) => {
  const { router } = renderRoute(`/?category=${category}`)

  expect(
    await screen.findByRole('heading', { name: "We couldn't find that category" }),
  ).toBeInTheDocument()

  await userEvent.click(screen.getByRole('link', { name: 'See the whole menu' }))
  expect(await screen.findByRole('heading', { level: 3, name: 'Baguette' })).toBeInTheDocument()
  expect(router.state.location.search).toBe('')
})

test('a malformed category is never sent to the API, which would answer 400', async () => {
  const itemRequests: string[] = []
  const record = ({ request }: { request: Request }) => {
    if (request.url.startsWith(ITEMS_URL)) itemRequests.push(request.url)
  }
  server.events.on('request:start', record)
  try {
    renderRoute('/?category=not-a-uuid')
    await screen.findByRole('heading', { name: "We couldn't find that category" })
    expect(itemRequests).toEqual([])
  } finally {
    server.events.removeListener('request:start', record)
  }
})

test('shows skeletons while the menu loads', async () => {
  renderRoute('/')

  expect(screen.getByRole('status')).toHaveTextContent('Loading the menu…')
  await screen.findByRole('heading', { level: 3, name: 'Baguette' })
  expect(screen.queryByText('Loading the menu…')).not.toBeInTheDocument()
})

test('an empty catalogue shows an empty state', async () => {
  server.use(http.get(ITEMS_URL, () => HttpResponse.json(page([], 0, 0))))
  renderRoute('/')

  expect(
    await screen.findByRole('heading', { name: 'Nothing on the menu right now' }),
  ).toBeInTheDocument()
})

test('an empty category links back to the whole menu', async () => {
  server.use(http.get(ITEMS_URL, () => HttpResponse.json(page([], 0, 0))))
  renderRoute(`/?category=${ids.categories.bread}`)

  expect(
    await screen.findByRole('heading', { name: 'Nothing in this category right now' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'See the whole menu' })).toBeInTheDocument()
})

test('a failed load shows the error with its request id, and retrying recovers', async () => {
  let fail = true
  server.use(
    http.get(ITEMS_URL, () => {
      if (!fail) return undefined // fall through to the default handler
      return HttpResponse.json(
        { timestamp: '', status: 500, error: 'Internal Server Error', message: 'Oven on fire' },
        { status: 500, headers: { 'X-Request-Id': 'req-abc123' } },
      )
    }),
  )
  renderRoute('/')

  // 5xx is retried twice by the query client before the error shows.
  const alert = await screen.findByRole('alert', {}, { timeout: 10_000 })
  expect(within(alert).getByText("We couldn't load the menu")).toBeInTheDocument()
  expect(within(alert).getByText(/Oven on fire/)).toBeInTheDocument()
  expect(within(alert).getByText('req-abc123')).toBeInTheDocument()

  fail = false
  await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { level: 3, name: 'Baguette' })).toBeInTheDocument()
}, 15_000)

test('the items still show when the categories fail to load', async () => {
  server.use(
    http.get(CATEGORIES_URL, () =>
      HttpResponse.json({ status: 404, message: 'nope' }, { status: 404 }),
    ),
  )
  renderRoute('/')

  expect(await screen.findByRole('heading', { level: 3, name: 'Baguette' })).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Categories' })).not.toBeInTheDocument()
})

test('"Show more" loads the next page', async () => {
  const all = fixtureItems.filter((i) => i.available).map(toPublicItem)
  server.use(
    http.get(ITEMS_URL, ({ request }) => {
      const number = Number(new URL(request.url).searchParams.get('page') ?? 0)
      return HttpResponse.json(page(all.slice(number * 2, number * 2 + 2), number, all.length))
    }),
  )
  renderRoute('/')

  expect(await cardNames()).toHaveLength(2)
  expect(screen.getByText('Showing 2 of 5')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
  await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4))

  await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
  await waitFor(() => expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(5))
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument()
})
