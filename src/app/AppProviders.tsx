import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { ToastProvider } from '@/components'
import { useClearOwnerDataOnSignOut } from '@/features/auth/use-session'
import { createQueryClient } from './query-client'

// Loaded only in development (not in tests), so the devtools never reach the production bundle.
const ReactQueryDevtools =
  import.meta.env.DEV && import.meta.env.MODE !== 'test'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })),
      )
    : null

type AppProvidersProps = {
  children: ReactNode
  /** Tests pass their own client so each test starts with an empty cache. */
  queryClient?: QueryClient
}

export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient())

  return (
    <QueryClientProvider client={client}>
      <ClearOwnerDataOnSignOut />
      <ToastProvider>{children}</ToastProvider>
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools buttonPosition="bottom-right" />
        </Suspense>
      )}
    </QueryClientProvider>
  )
}

/** Wherever the Owner is in the app when the session ends, their cached data goes with it. */
function ClearOwnerDataOnSignOut() {
  useClearOwnerDataOnSignOut()
  return null
}
