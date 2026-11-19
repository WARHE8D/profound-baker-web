/**
 * An item's lead time (the notice the bakery needs before pickup) as shoppers read it:
 * 0 → "No notice needed", 12 → "Order 12 hours ahead", 48 → "Order 2 days ahead".
 * Whole days read as days; anything else stays in hours so it is never rounded down.
 */
export function formatLeadTime(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return 'No notice needed'
  if (hours % 24 === 0) {
    const days = hours / 24
    return `Order ${days} ${days === 1 ? 'day' : 'days'} ahead`
  }
  return `Order ${hours} ${hours === 1 ? 'hour' : 'hours'} ahead`
}
