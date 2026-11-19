import { expect, test } from 'vitest'
import { defaultCurrency, defaultLocale, formatMoney, lineTotal, sumMoney } from './money'

const plain = (s: string) => s.replace(/\s/g, ' ')

test('defaults to CAD in en-US when VITE_CURRENCY / VITE_LOCALE are unset', () => {
  expect(defaultCurrency).toBe('CAD')
  expect(defaultLocale).toBe('en-US')
  expect(formatMoney(1234.5)).toBe('CA$1,234.50')
  expect(formatMoney(0)).toBe('CA$0.00')
  // An en-CA locale shows Canadian dollars without the CA prefix.
  expect(formatMoney(1234.5, { locale: 'en-CA' })).toBe('$1,234.50')
})

test('uses each currency’s own decimals and the locale’s separators', () => {
  expect(plain(formatMoney(1234.5, { currency: 'EUR', locale: 'de-DE' }))).toBe('1.234,50 €')
  expect(formatMoney(1234.5, { currency: 'JPY', locale: 'en-US' })).toBe('¥1,235')
  // CLDR shows PKR without decimals in Pakistan.
  expect(plain(formatMoney(1234.5, { currency: 'PKR', locale: 'en-PK' }))).toBe('Rs 1,235')
})

test('rejects amounts that are not numbers', () => {
  expect(() => formatMoney(Number.NaN)).toThrow(RangeError)
  expect(() => formatMoney(Number.POSITIVE_INFINITY)).toThrow(RangeError)
})

test('sumMoney adds in cents, so 0.1 + 0.2 is 0.3', () => {
  expect(0.1 + 0.2).not.toBe(0.3)
  expect(sumMoney([0.1, 0.2])).toBe(0.3)
  expect(sumMoney([19.99, 5.01, 0.005])).toBe(25.01)
  expect(sumMoney([])).toBe(0)
})

test('lineTotal multiplies in minor units', () => {
  expect(1.15 * 3).not.toBe(3.45)
  expect(lineTotal(1.15, 3)).toBe(3.45)
  expect(lineTotal(250, 2, { currency: 'JPY' })).toBe(500)
})

test('sums keep paisa even though PKR displays without decimals', () => {
  expect(sumMoney([10.25, 10.25], { currency: 'PKR' })).toBe(20.5)
  expect(lineTotal(99.99, 3, { currency: 'PKR' })).toBe(299.97)
})
