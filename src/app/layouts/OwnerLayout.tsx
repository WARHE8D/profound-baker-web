import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router'
import { cn } from '@/lib/cn'
import { ownerNav } from './owner-nav'
import { SkipLink } from './SkipLink'

/**
 * Owner dashboard chrome: sidebar navigation on wide screens, a scrollable tab bar on phones.
 * Sign-in protection (RequireOwner) wraps this in S4.1 (#15).
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
          <Link to="/" className="text-sm text-muted hover:text-text md:hidden">
            View shop
          </Link>
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
        <div className="mt-auto hidden px-5 py-4 md:block">
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
