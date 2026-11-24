import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

const tones = {
  neutral: 'bg-surface-muted text-muted',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
} as const

export type BadgeTone = keyof typeof tones

type BadgeProps = ComponentProps<'span'> & { tone?: BadgeTone }

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
