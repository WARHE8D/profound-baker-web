import { useLocation } from 'react-router'
import { ButtonLink, EmptyState } from '@/components'

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
          <ButtonLink to={inOwner ? '/owner' : '/'}>
            {inOwner ? 'Back to dashboard' : 'Back to the shop'}
          </ButtonLink>
        }
      />
    </div>
  )
}
