import { UiPreview } from '../UiPreview'

/** Development-only route /dev/ui: the gallery of UI primitives from S0.3. */
export function UiPreviewPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <UiPreview />
    </div>
  )
}
