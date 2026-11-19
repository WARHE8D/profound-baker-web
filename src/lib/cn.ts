import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Joins class names and resolves Tailwind conflicts, so a caller's `className` overrides a
 * component's defaults: cn('px-4', 'px-2') → 'px-2'.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
