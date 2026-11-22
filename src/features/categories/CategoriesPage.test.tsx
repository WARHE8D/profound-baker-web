import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeAll, expect, test } from 'vitest'
import { categoriesQuery } from '@/features/catalogue/queries'
import { ids } from '@/mocks/fixtures'
import { signInAsOwner } from '@/test/auth'
import { mockStore } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/render'
import { categoryNameError } from './queries'

beforeAll(async () => {
  await import('@/features/categories/CategoriesPage')
})

async function openCategories() {
  await signInAsOwner()
  const result = renderRoute('/owner/categories')
  await screen.findByRole('list', { name: 'Categories' })
  return result
}

const names = () =>
  within(screen.getByRole('list', { name: 'Categories' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent?.replace(/(Rename|Delete)/g, '').trim())
const newName = () => screen.getByRole('textbox', { name: 'New category' })
const addButton = () => screen.getByRole('button', { name: 'Add category' })

test('lists the categories by name with a count', async () => {
  mockStore.setCategories([
    { id: 'c3', name: 'pastries' },
    { id: 'c1', name: 'Cakes' },
    { id: 'c2', name: 'Bread' },
  ])
  await openCategories()

  expect(names()).toEqual(['Bread', 'Cakes', 'pastries'])
  expect(screen.getByRole('heading', { name: '3 categories' })).toBeInTheDocument()
})

test('adds a category and refreshes the storefront filter', async () => {
  const { queryClient } = await openCategories()
  await queryClient.fetchQuery(categoriesQuery())

  await userEvent.type(newName(), '  Cookies ')
  await userEvent.click(addButton())

  expect(await screen.findByText('Added “Cookies”')).toBeInTheDocument()
  await waitFor(() => expect(names()).toEqual(['Bread', 'Cakes', 'Cookies', 'Pastries']))
  expect(mockStore.categories.map((c) => c.name)).toContain('Cookies')
  expect(newName()).toHaveValue('')
  expect(queryClient.getQueryState(categoriesQuery().queryKey)?.isInvalidated).toBe(true)
})

test('catches an empty or duplicate name before sending it', async () => {
  let posts = 0
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'POST' && request.url.endsWith('/categories')) posts += 1
  })
  await openCategories()

  await userEvent.click(addButton())
  expect(screen.getByText('Enter a name')).toBeInTheDocument()
  expect(newName()).toHaveFocus()

  await userEvent.type(newName(), 'bread')
  await userEvent.click(addButton())
  expect(screen.getByText('There’s already a category called “bread”')).toBeInTheDocument()
  expect(posts).toBe(0)
  server.events.removeAllListeners()
})

test('shows the server’s conflict when another tab added the same name first', async () => {
  await openCategories()
  mockStore.setCategories([...mockStore.categories, { id: 'c9', name: 'Cookies' }])

  await userEvent.type(newName(), 'Cookies')
  await userEvent.click(addButton())

  expect(await screen.findByText("A category named 'Cookies' already exists")).toBeInTheDocument()
  // The list refreshed with the other tab's category.
  await waitFor(() => expect(names()).toContain('Cookies'))
})

test('renames a category in place', async () => {
  await openCategories()

  await userEvent.click(screen.getByRole('button', { name: 'Rename Bread' }))
  const field = screen.getByRole('textbox', { name: 'Name' })
  expect(field).toHaveFocus()
  await userEvent.clear(field)
  await userEvent.type(field, 'Breads & loaves{Enter}')

  expect(await screen.findByText('Renamed to “Breads & loaves”')).toBeInTheDocument()
  await waitFor(() => expect(names()).toEqual(['Breads & loaves', 'Cakes', 'Pastries']))
  expect(mockStore.categories.find((c) => c.id === ids.categories.bread)?.name).toBe(
    'Breads & loaves',
  )
})

test('Escape cancels a rename; an unchanged name sends nothing', async () => {
  let puts = 0
  server.events.on('request:start', ({ request }) => {
    if (request.method === 'PUT') puts += 1
  })
  await openCategories()

  await userEvent.click(screen.getByRole('button', { name: 'Rename Cakes' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'xyz{Escape}')
  expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
  expect(names()).toContain('Cakes')

  await userEvent.click(screen.getByRole('button', { name: 'Rename Cakes' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.queryByRole('textbox', { name: 'Name' })).not.toBeInTheDocument()
  expect(puts).toBe(0)
  server.events.removeAllListeners()
})

test('a rename can change only the case of the name', async () => {
  await openCategories()

  await userEvent.click(screen.getByRole('button', { name: 'Rename Cakes' }))
  const field = screen.getByRole('textbox', { name: 'Name' })
  await userEvent.clear(field)
  await userEvent.type(field, 'CAKES{Enter}')

  expect(await screen.findByText('Renamed to “CAKES”')).toBeInTheDocument()
})

test('deletes an empty category after confirming', async () => {
  mockStore.setCategories([...mockStore.categories, { id: 'c-empty', name: 'Seasonal' }])
  await openCategories()

  await userEvent.click(screen.getByRole('button', { name: 'Delete Seasonal' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete “Seasonal”?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

  expect(await screen.findByText('Deleted “Seasonal”')).toBeInTheDocument()
  await waitFor(() => expect(names()).not.toContain('Seasonal'))
  expect(mockStore.categories.some((c) => c.id === 'c-empty')).toBe(false)
  expect(dialog).not.toBeVisible()
})

test('explains why a category with items can’t be deleted', async () => {
  await openCategories()

  await userEvent.click(screen.getByRole('button', { name: 'Delete Pastries' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete “Pastries”?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('This category still has items.')
  expect(alert).toHaveTextContent(
    "Cannot delete category 'Pastries': it still has items assigned to it.",
  )
  expect(within(alert).getByRole('link', { name: 'Go to Items' })).toHaveAttribute(
    'href',
    '/owner/items',
  )
  expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  expect(names()).toContain('Pastries')

  await userEvent.click(within(dialog).getByRole('button', { name: 'OK' }))
  expect(dialog).not.toBeVisible()
})

test('shows other failures with the request id', async () => {
  server.use(
    http.delete('*/api/catalogue/categories/:id', () =>
      HttpResponse.json(
        { status: 500, message: 'Unexpected server error' },
        { status: 500, headers: { 'X-Request-Id': 'req-500' } },
      ),
    ),
  )
  await openCategories()

  await userEvent.click(screen.getByRole('button', { name: 'Delete Bread' }))
  const dialog = screen.getByRole('dialog', { name: 'Delete “Bread”?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

  const alert = await within(dialog).findByRole('alert')
  expect(alert).toHaveTextContent('Unexpected server error')
  expect(alert).toHaveTextContent('req-500')
})

test('an empty catalogue invites the first category', async () => {
  mockStore.setCategories([])
  await signInAsOwner()
  renderRoute('/owner/categories')

  expect(await screen.findByText('No categories yet')).toBeInTheDocument()
})

test('categoryNameError matches the server’s rules', () => {
  const list = [{ id: 'a', name: 'Cakes' }]
  expect(categoryNameError('   ', list)).toBe('Enter a name')
  expect(categoryNameError('x'.repeat(101), list)).toBe('Use at most 100 characters')
  expect(categoryNameError('cakes', list)).toMatch(/already/)
  expect(categoryNameError('cakes', list, 'a')).toBeNull()
  // Accents count, like Java's equalsIgnoreCase.
  expect(categoryNameError('Cakés', list)).toBeNull()
})
