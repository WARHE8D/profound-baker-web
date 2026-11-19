import { Link, useLocation } from 'react-router'
import { EmptyState } from '@/components'

/** Shown for unknown URLs; links back to the home of whichever half of the app it is in. */
export function NotFoundPage() {
  const { pathname } = useLocation()
  const inOwner = pathname === '/owner' || pathname.startsWith('/owner/')

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <EmptyState
        icon="🧁"
        title="We couldn't find that page"
        description="The link may be old, or the page may have moved."
        action={
          <Link
            to={inOwner ? '/owner' : '/'}
            className="inline-flex h-10 items-center rounded-control bg-primary px-4 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            {inOwner ? 'Back to dashboard' : 'Back to the shop'}
          </Link>
        }
      />
    </div>
  )
}
