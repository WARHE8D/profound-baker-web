import { useQuery } from '@tanstack/react-query'
import { KeyRound, LogOut, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { session } from '@/features/auth/session'
import { meQuery } from '@/features/auth/use-session'
import { pendingCountQuery } from '@/features/orders/owner-queries'
import { dismissPasswordReminder, usePasswordReminder } from '@/features/profile/password-reminder'
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
                  {path === 'orders' && <PendingBadge />}
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
          <PasswordReminder />
          <Outlet />
        </div>
      </main>
      <ScrollRestoration />
    </div>
  )
}

/** Orders waiting to be confirmed or rejected, next to "Orders" in the navigation. */
function PendingBadge() {
  const pending = useQuery(pendingCountQuery())
  const count = pending.data ?? 0
  if (count === 0) return null
  return (
    <span className="ml-auto rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-surface tabular-nums">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">, {count} pending</span>
    </span>
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

/**
 * Asks the Owner to replace the password the server was set up with. The API can't say whether
 * that has happened, so it shows until the password is changed here or the reminder dismissed.
 */
function PasswordReminder() {
  const me = useQuery(meQuery())
  const ownerId = me.data?.id
  const show = usePasswordReminder(ownerId)
  const { pathname } = useLocation()
  // The profile page has the form itself.
  if (!show || !ownerId || pathname === '/owner/profile') return null

  return (
    <section
      aria-label="Password reminder"
      className="mb-6 flex items-start gap-3 rounded-card border border-warning/50 bg-warning/10 p-4 text-sm"
    >
      <KeyRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong className="font-semibold">Still using the password from setup?</strong> Change it
          so only you can sign in.
        </p>
        <Link
          to="/owner/profile#password"
          className="shrink-0 font-medium text-primary underline underline-offset-4"
        >
          Change password
        </Link>
      </div>
      <button
        type="button"
        onClick={() => dismissPasswordReminder(ownerId)}
        aria-label="Dismiss: I've already changed it"
        className="-m-1 rounded-control p-1 text-muted hover:bg-surface-muted hover:text-text"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </section>
  )
}
