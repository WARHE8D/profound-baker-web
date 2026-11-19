import { useEffect, useState } from 'react'

/**
 * The current time in ms, refreshed every `intervalMs`, for UI that depends on the clock (which
 * pickup slots are still in the future). Re-renders at most once per interval.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
