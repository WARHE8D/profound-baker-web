import { ToastProvider } from '@/components'
import { UiPreview } from './UiPreview'

// Placeholder until the app shell and routing land in S0.4 (#4).
export function App() {
  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-4xl flex-col gap-12 px-4 py-12 sm:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-4xl font-semibold text-primary sm:text-5xl">SugarCrumbs</h1>
          <p className="text-lg text-muted">Storefront and owner dashboard coming soon.</p>
        </header>
        {import.meta.env.DEV && <UiPreview />}
      </main>
    </ToastProvider>
  )
}
