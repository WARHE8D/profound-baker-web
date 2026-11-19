import { EmptyState } from '@/components'

type ComingSoonPageProps = {
  title: string
  /** Sprint in docs/PLAN.md that builds this page. */
  sprint: number
}

/** Placeholder for owner pages that later sprints build, so the navigation works today. */
export function ComingSoonPage({ title, sprint }: ComingSoonPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <EmptyState
        icon="🥖"
        title="Still in the oven"
        description={`This page is planned for Sprint ${sprint}.`}
      />
    </div>
  )
}
