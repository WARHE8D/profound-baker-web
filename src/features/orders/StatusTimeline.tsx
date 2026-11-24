import { Check, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { type Audience, type Step, type TimelineOrder, timelineSteps } from './timeline'

const stateText: Record<Step['state'], string> = {
  done: 'done',
  current: 'current step',
  upcoming: 'not yet',
  stopped: 'stopped here',
}

type StatusTimelineProps = { order: TimelineOrder; zone: string; audience?: Audience }

export function StatusTimeline({ order, zone, audience = 'guest' }: StatusTimelineProps) {
  const steps = timelineSteps(order, zone, audience)

  return (
    <ol aria-label="Order progress" className="flex flex-col">
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.state === 'current' || step.state === 'stopped' ? 'step' : undefined}
          className="relative flex gap-3 pb-5 last:pb-0"
        >
          {index < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute top-7 bottom-1 left-3 w-0.5 -translate-x-1/2',
                step.state === 'done' ? 'bg-success' : 'bg-border',
              )}
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'relative flex size-6 shrink-0 items-center justify-center rounded-full border-2',
              step.state === 'done' && 'border-success bg-success text-surface',
              step.state === 'current' && 'border-primary bg-primary/15',
              step.state === 'upcoming' && 'border-border bg-surface',
              step.state === 'stopped' && 'border-danger bg-danger text-danger-fg',
            )}
          >
            {step.state === 'done' && <Check className="size-3.5" strokeWidth={3} />}
            {step.state === 'stopped' && <X className="size-3.5" strokeWidth={3} />}
            {step.state === 'current' && <span className="size-2 rounded-full bg-primary" />}
          </span>
          <div className="flex flex-col gap-0.5 pt-0.5">
            <span
              className={cn(
                'text-sm font-medium',
                step.state === 'upcoming' && 'text-muted',
                step.state === 'stopped' && 'text-danger',
              )}
            >
              {step.label}
              <span className="sr-only"> ({stateText[step.state]})</span>
            </span>
            {step.detail && (
              <span className="text-sm whitespace-pre-line text-muted">{step.detail}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
