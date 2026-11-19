import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import '@/index.css'

/** `npm run dev:mock` sets VITE_API_MOCKING: answer API calls from fixtures instead of the server. */
async function enableApiMocking() {
  if (import.meta.env.VITE_API_MOCKING !== 'true') return
  const { worker } = await import('./mocks/browser')
  // Requests the mocks don't cover (Vite's own modules, fonts) go to the network as usual.
  await worker.start({ onUnhandledFrame: 'bypass' })
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

await enableApiMocking()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
