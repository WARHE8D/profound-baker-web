// Prices come from the API as plain numbers (BigDecimal on the server) with no currency, so the
// currency and number format are app settings: VITE_CURRENCY (ISO 4217, default "CAD") and
// VITE_LOCALE (BCP 47, e.g. "en-US"). Every price on screen goes through formatMoney.

export const defaultCurrency = (import.meta.env.VITE_CURRENCY ?? 'CAD').trim().toUpperCase()
export const defaultLocale = import.meta.env.VITE_LOCALE?.trim() || 'en-US'

type MoneyOptions = { currency?: string; locale?: string }

const formatters = new Map<string, Intl.NumberFormat>()

/** "CA$1,234.50" (CAD, en-US): uses the currency's own decimals (none for JPY, two for CAD). */
export function formatMoney(
  amount: number,
  { currency = defaultCurrency, locale = defaultLocale }: MoneyOptions = {},
): string {
  if (!Number.isFinite(amount)) throw new RangeError(`Invalid amount: ${amount}`)
  const key = `${locale}|${currency}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency })
    formatters.set(key, formatter)
  }
  return formatter.format(amount)
}

/**
 * Sums money without binary floating-point drift (0.1 + 0.2), by adding in minor units (cents).
 * The server's totals stay authoritative; this is for showing a cart subtotal before checkout.
 */
export function sumMoney(amounts: readonly number[], { currency = defaultCurrency } = {}): number {
  const scale = 10 ** arithmeticDigits(currency)
  const minorUnits = amounts.reduce((sum, amount) => sum + Math.round(amount * scale), 0)
  return minorUnits / scale
}

/** `price × quantity`, rounded to the currency's minor unit. */
export function lineTotal(
  price: number,
  quantity: number,
  { currency = defaultCurrency } = {},
): number {
  const scale = 10 ** arithmeticDigits(currency)
  return (Math.round(price * scale) * quantity) / scale
}

/**
 * Decimals to keep when adding prices. Display decimals can be fewer than the currency really has
 * (PKR shows none, but prices may carry paisa), so keep at least 2 and never round sums away.
 * JPY (0) still works: whole-yen prices are unchanged by extra precision.
 */
function arithmeticDigits(currency: string): number {
  const display =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  return Math.max(2, display)
}

/** The server stores amounts as DECIMAL(10, 2): at most 8 whole digits and 2 decimals. */
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/

/**
 * Reads a typed amount: "3.5", "3,50", "$ 1,234.50" → a number, or null if it isn't one. A comma
 * is a decimal separator only when there is no dot and it is followed by 1–2 digits at the end.
 */
export function parseMoney(text: string): number | null {
  let cleaned = text.replace(/[^\d.,]/g, '')
  if (!cleaned.includes('.') && /,\d{1,2}$/.test(cleaned)) cleaned = cleaned.replace(',', '.')
  cleaned = cleaned.replaceAll(',', '')
  if (!AMOUNT_PATTERN.test(cleaned)) return null
  return Number(cleaned)
}

const wholeFormatters = new Map<string, Intl.NumberFormat>()

/** "CA$1,235": rounded to whole units, for chart axes where cents are noise. */
export function formatMoneyWhole(
  amount: number,
  { currency = defaultCurrency, locale = defaultLocale }: MoneyOptions = {},
): string {
  const key = `${locale}|${currency}`
  let formatter = wholeFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    wholeFormatters.set(key, formatter)
  }
  return formatter.format(amount)
}
