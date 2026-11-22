import { useQuery } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'
import { session } from '@/features/auth/session'
import { meQuery } from '@/features/auth/use-session'
import { cn } from '@/lib/cn'
import { ownerNav } from './owner-nav'
import { SkipLink } from './SkipLink'

/**
 * Owner dashboard chrome: sidebar navigation on wide screens, a scrollable tab bar on phones.
 * Rendered only for a signed-in Owner: RequireOwner wraps it in the route table.
 */
export function OwnerLayout() {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <SkipLink />
      <aside className="border-b border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex h-14 items-center justify-between px-4 md:h-16 md:px-5">
          <Link to="/owner" className="font-display text-xl font-semibold text-primary">
            SugarCrumbs
          </Link>
          <div className="flex items-center gap-3 md:hidden">
            <Link to="/" className="text-sm text-muted hover:text-text">
              View shop
            </Link>
            <SignOutButton compact />
          </div>
        </div>
        <nav aria-label="Owner">
          <ul className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3 md:pb-0">
            {ownerNav.map(({ path, label, icon: Icon }) => (
              <li key={label} className="shrink-0">
                <NavLink
                  to={path === '' ? '/owner' : `/owner/${path}`}
                  end={path === ''}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted hover:bg-surface-muted hover:text-text',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto hidden flex-col gap-3 border-t border-border px-5 py-4 md:flex">
          <SignedInAs />
          <SignOutButton />
          <Link to="/" className="text-sm text-muted hover:text-text">
            ← View shop
          </Link>
        </div>
      </aside>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <Outlet />
        </div>
      </main>
      <ScrollRestoration />
    </div>
  )
}

/** The Owner's name and email, from /api/auth/me. */
function SignedInAs() {
  const me = useQuery(meQuery())
  if (!me.data) return null
  return (
    <div className="flex min-w-0 flex-col text-sm">
      <span className="truncate font-medium">{me.data.ownerName}</span>
      <span className="truncate text-xs text-muted">{me.data.email}</span>
    </div>
  )
}

/** Ends the session in every tab; RequireOwner then sends this tab to the login page. */
function SignOutButton({ compact = false }: { compact?: boolean }) {
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    await session.logout()
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={signingOut}
      className={cn(
        'flex items-center gap-2 text-sm text-muted hover:text-text disabled:opacity-60',
        compact && 'gap-1',
      )}
    >
      <LogOut aria-hidden="true" className="size-4" />
      Sign out
    </button>
  )
}
