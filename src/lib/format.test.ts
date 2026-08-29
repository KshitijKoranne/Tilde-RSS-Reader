import { describe, expect, it } from 'vitest'
import { hostOf, plural, shortTime } from './format'

const AT = (iso: string) => new Date(iso).getTime()

describe('shortTime', () => {
  const now = AT('2024-10-10T15:00:00')

  it('shows a clock for today', () => {
    expect(shortTime(AT('2024-10-10T09:30:00'), now)).toMatch(/^\d{2}:\d{2}$/)
  })

  it('says Yesterday for yesterday', () => {
    expect(shortTime(AT('2024-10-09T23:00:00'), now)).toBe('Yesterday')
  })

  it('names the weekday within the week', () => {
    expect(shortTime(AT('2024-10-07T09:00:00'), now)).toBe('Mon')
  })

  it('drops the year for earlier this year', () => {
    expect(shortTime(AT('2024-02-03T09:00:00'), now)).not.toMatch(/2024/)
  })

  it('keeps the year for another year', () => {
    expect(shortTime(AT('2021-02-03T09:00:00'), now)).toMatch(/2021/)
  })

  it('treats an hour ago as today even across a clock hour', () => {
    expect(shortTime(AT('2024-10-10T14:59:00'), now)).toMatch(/^\d{2}:\d{2}$/)
  })

  it('returns nothing for a missing date', () => {
    expect(shortTime(0, now)).toBe('')
  })
})

describe('plural', () => {
  it('uses the singular for one', () => {
    expect(plural(1, 'source', 'sources')).toBe('1 source')
  })

  it('uses the plural for none and for many', () => {
    expect(plural(0, 'source', 'sources')).toBe('0 sources')
    expect(plural(9, 'source', 'sources')).toBe('9 sources')
  })
})

describe('hostOf', () => {
  it('strips the scheme, the path and a www prefix', () => {
    expect(hostOf('https://www.example.test/feed.xml?x=1')).toBe('example.test')
  })

  it('hands back anything it cannot parse', () => {
    expect(hostOf('not a url')).toBe('not a url')
  })
})
