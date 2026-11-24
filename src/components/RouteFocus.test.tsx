import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useSearchParams, type RouteObject } from 'react-router'
import { expect, test } from 'vitest'
import { renderRoute } from '@/test/render'
import { RouteFocus } from './RouteFocus'

function Layout() {
  return (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/later">Later</Link>
        <Link to="/form">Form</Link>
      </nav>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <RouteFocus />
    </>
  )
}

function Home() {
  const [, setSearch] = useSearchParams()
  const [paid, setPaid] = useState(false)
  return (
    <>
      <h1>Home</h1>
      <button type="button" onClick={() => setSearch({ sort: 'name' })}>
        Sort
      </button>
      {paid ? (
        <p>Paid</p>
      ) : (
        <button type="button" onClick={() => setPaid(true)}>
          Mark paid
        </button>
      )}
    </>
  )
}

/** A page whose heading arrives after its data. */
function Later() {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setLoaded(true), 50)
    return () => clearTimeout(timer)
  }, [])
  return loaded ? <h1>Rye loaf</h1> : <p>Loading…</p>
}

/** A page that puts focus in its form itself. */
function Form() {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <>
      <h1>Sign in</h1>
      <input ref={ref} aria-label="Email" />
    </>
  )
}

const routes: RouteObject[] = [
  {
    Component: Layout,
    children: [
      { path: '/', Component: Home },
      { path: '/later', Component: Later },
      { path: '/form', Component: Form },
    ],
  },
]

test('names the tab after the page’s heading, without moving focus on the first page', async () => {
  renderRoute('/', { routes })

  await waitFor(() => expect(document.title).toBe('Home · SugarCrumbs'))
  expect(document.body).toHaveFocus()
})

test('after navigation, focus moves to the new page’s heading once it renders', async () => {
  renderRoute('/', { routes })
  await userEvent.click(screen.getByRole('link', { name: 'Later' }))

  // Until the heading is there, <main> holds focus instead of the clicked link.
  expect(screen.getByRole('main')).toHaveFocus()
  const heading = await screen.findByRole('heading', { level: 1, name: 'Rye loaf' })
  await waitFor(() => expect(heading).toHaveFocus())
  expect(document.title).toBe('Rye loaf · SugarCrumbs')
})

test('a page that focuses something itself keeps it', async () => {
  renderRoute('/', { routes })
  await userEvent.click(screen.getByRole('link', { name: 'Form' }))

  await waitFor(() => expect(document.title).toBe('Sign in · SugarCrumbs'))
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus()
})

test('a change to the query string alone leaves focus where it is', async () => {
  const { router } = renderRoute('/', { routes })
  const sort = screen.getByRole('button', { name: 'Sort' })
  await userEvent.click(sort)

  await waitFor(() => expect(router.state.location.search).toBe('?sort=name'))
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
  expect(sort).toHaveFocus()
})

test('when the focused button goes away, focus goes to the page’s heading', async () => {
  renderRoute('/', { routes })
  await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }))

  expect(screen.getByText('Paid')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus())
})
