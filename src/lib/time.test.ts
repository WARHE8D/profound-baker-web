import { describe, expect, test } from 'vitest'
import {
  formatLocal,
  formatSlotTime,
  formatUtcOffset,
  isValidTimeZone,
  slotToUtc,
  timeZoneGroups,
  todayIn,
} from './time'

// Intl puts narrow/no-break spaces in some formats ("10:00 AM"); compare with plain spaces.
const plain = (s: string) => s.replace(/\s/g, ' ')

describe('slotToUtc', () => {
  test.each([
    // zone, date, time, expected instant
    ['UTC', '2026-11-21', '10:00', '2026-11-21T10:00:00Z'],
    ['Asia/Karachi', '2026-11-21', '10:00', '2026-11-21T05:00:00Z'], // +05:00, no DST
    ['Asia/Kolkata', '2026-11-21', '10:00', '2026-11-21T04:30:00Z'], // +05:30
    ['Asia/Kathmandu', '2026-11-21', '10:00', '2026-11-21T04:15:00Z'], // +05:45
    ['America/New_York', '2026-11-21', '10:00', '2026-11-21T15:00:00Z'], // EST -05:00
    ['America/New_York', '2026-07-01', '10:00', '2026-07-01T14:00:00Z'], // EDT -04:00
    ['Europe/London', '2026-07-01', '09:30', '2026-07-01T08:30:00Z'], // BST +01:00
    ['Australia/Sydney', '2026-01-15', '08:00', '2026-01-14T21:00:00Z'], // AEDT +11:00, crosses a date
  ])('%s %s %s → %s', (zone, date, time, expected) => {
    expect(slotToUtc(date, time, zone)).toBe(expected)
  })

  test('accepts the backend’s LocalTime with seconds', () => {
    expect(slotToUtc('2026-11-21', '10:00:00', 'Asia/Karachi')).toBe('2026-11-21T05:00:00Z')
  })

  describe('daylight-saving changes, matching Java’s LocalDateTime.atZone', () => {
    test('New York spring-forward (8 Mar 2026): times around the gap', () => {
      expect(slotToUtc('2026-03-08', '01:30', 'America/New_York')).toBe('2026-03-08T06:30:00Z')
      expect(slotToUtc('2026-03-08', '03:00', 'America/New_York')).toBe('2026-03-08T07:00:00Z')
      expect(slotToUtc('2026-03-08', '10:00', 'America/New_York')).toBe('2026-03-08T14:00:00Z')
    })

    test('New York spring-forward: a skipped time moves later by the gap (02:30 → 03:30 EDT)', () => {
      expect(slotToUtc('2026-03-08', '02:30', 'America/New_York')).toBe('2026-03-08T07:30:00Z')
    })

    test('New York fall-back (1 Nov 2026): a repeated time is the earlier instant (EDT)', () => {
      expect(slotToUtc('2026-11-01', '01:30', 'America/New_York')).toBe('2026-11-01T05:30:00Z')
      expect(slotToUtc('2026-11-01', '00:30', 'America/New_York')).toBe('2026-11-01T04:30:00Z')
      expect(slotToUtc('2026-11-01', '03:00', 'America/New_York')).toBe('2026-11-01T08:00:00Z')
    })

    test('London spring-forward (29 Mar 2026): 01:30 does not exist → 02:30 BST', () => {
      expect(slotToUtc('2026-03-29', '01:30', 'Europe/London')).toBe('2026-03-29T01:30:00Z')
      expect(slotToUtc('2026-03-29', '09:00', 'Europe/London')).toBe('2026-03-29T08:00:00Z')
    })

    test('London fall-back (25 Oct 2026): repeated 01:30 is the earlier, BST one', () => {
      expect(slotToUtc('2026-10-25', '01:30', 'Europe/London')).toBe('2026-10-25T00:30:00Z')
      expect(slotToUtc('2026-10-25', '09:00', 'Europe/London')).toBe('2026-10-25T09:00:00Z')
    })

    test('Lord Howe Island’s 30-minute change (4 Oct 2026): 02:15 → 02:45 (+11:00)', () => {
      expect(slotToUtc('2026-10-04', '02:15', 'Australia/Lord_Howe')).toBe('2026-10-03T15:45:00Z')
    })

    test('every half hour of a change day round-trips, except the skipped hour', () => {
      for (const date of ['2026-03-08', '2026-11-01']) {
        for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
          const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
          const instant = slotToUtc(date, time, 'America/New_York')
          const back = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/New_York',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
          }).format(new Date(instant))
          const skipped = date === '2026-03-08' && time.startsWith('02:')
          expect(back === time).toBe(!skipped)
        }
      }
    })
  })

  test.each([
    ['2026-11-21', '25:00'],
    ['21/11/2026', '10:00'],
    ['2026-11-21', '10'],
    ['2026-02-30', '10:00'],
    ['2026-13-01', '10:00'],
    ['2026-11-21', '10:60'],
  ])('rejects malformed input %s %s', (date, time) => {
    expect(() => slotToUtc(date, time, 'UTC')).toThrow(RangeError)
  })
})

describe('formatLocal', () => {
  const instant = '2026-11-21T15:00:00Z'

  test('shows the instant in the Owner’s zone, not the viewer’s', () => {
    expect(plain(formatLocal(instant, 'America/New_York', 'time', 'en-US'))).toBe('10:00 AM')
    expect(plain(formatLocal(instant, 'Asia/Karachi', 'time', 'en-US'))).toBe('8:00 PM')
  })

  test('formats', () => {
    expect(plain(formatLocal(instant, 'America/New_York', 'date', 'en-US'))).toBe('Nov 21, 2026')
    expect(plain(formatLocal(instant, 'America/New_York', 'datetime', 'en-US'))).toBe(
      'Nov 21, 2026, 10:00 AM',
    )
    expect(plain(formatLocal(instant, 'America/New_York', 'weekday-date', 'en-US'))).toBe(
      'Saturday, November 21',
    )
  })

  test('the local date can differ from the UTC date', () => {
    expect(plain(formatLocal('2026-11-21T22:00:00Z', 'Asia/Karachi', 'date', 'en-US'))).toBe(
      'Nov 22, 2026',
    )
  })

  test('round-trips with slotToUtc', () => {
    const pickupAt = slotToUtc('2026-11-21', '09:30', 'Europe/London')
    expect(plain(formatLocal(pickupAt, 'Europe/London', 'time', 'en-GB'))).toBe('09:30')
  })

  test('rejects an invalid instant', () => {
    expect(() => formatLocal('not a date', 'UTC')).toThrow(RangeError)
  })
})

test('formatSlotTime shows a slot’s local time without converting it', () => {
  expect(plain(formatSlotTime('14:30:00', 'en-US'))).toBe('2:30 PM')
  expect(formatSlotTime('14:30', 'en-GB')).toBe('14:30')
})

test('todayIn gives the bakery’s date, which can differ from the viewer’s', () => {
  const now = new Date('2026-11-21T03:00:00Z')
  expect(todayIn('America/New_York', now)).toBe('2026-11-20')
  expect(todayIn('Asia/Karachi', now)).toBe('2026-11-21')
})

test('isValidTimeZone', () => {
  expect(isValidTimeZone('Asia/Karachi')).toBe(true)
  expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
})

test('formatUtcOffset follows daylight saving', () => {
  expect(formatUtcOffset('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe('UTC−05:00')
  expect(formatUtcOffset('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe('UTC−04:00')
  expect(formatUtcOffset('Asia/Kolkata', new Date('2026-07-15T12:00:00Z'))).toBe('UTC+05:30')
  expect(formatUtcOffset('UTC')).toBe('UTC')
})

test('timeZoneGroups groups zones by region with offsets, UTC under Other', () => {
  const groups = timeZoneGroups(new Date('2026-01-15T12:00:00Z'))
  const america = groups.find((g) => g.region === 'America')
  expect(america?.zones).toContainEqual({
    value: 'America/New_York',
    label: 'New York (UTC−05:00)',
    offsetMinutes: -300,
  })
  expect(america?.zones.find((z) => z.value === 'America/Argentina/Salta')?.label).toBe(
    'Argentina / Salta (UTC−03:00)',
  )
  expect(groups.at(-1)?.region).toBe('Other')
  expect(groups.at(-1)?.zones.map((z) => z.value)).toContain('UTC')
})

test('timeZoneGroups keeps a saved zone the browser lists under another name', () => {
  const values = timeZoneGroups(new Date(), ['Asia/Kolkata']).flatMap((g) =>
    g.zones.map((z) => z.value),
  )
  expect(values).toContain('Asia/Kolkata')
  // Unknown names are not offered.
  expect(timeZoneGroups(new Date(), ['Mars/Olympus']).flatMap((g) => g.zones)).not.toContainEqual(
    expect.objectContaining({ value: 'Mars/Olympus' }),
  )
})
