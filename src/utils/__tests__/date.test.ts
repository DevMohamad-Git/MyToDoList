import { describe, expect, it } from 'vitest'
import { useI18n } from '@/i18n'
import {
  formatDate,
  formatDayLabel,
  formatDayNumber,
  fromDayKey,
  monthGridDays,
  toDayKey,
  toJalaliDateDisplay,
  weekRange,
} from '../date'
import {
  jalaliDaysInMonth,
  jalaliMonthName,
  toJalaliParts,
} from '../jalali'

describe('Jalali and date utilities', () => {
  it('correctly converts Gregorian dates to Jalali parts', () => {
    // 2024-03-20 is 1403/01/01 (Nowruz)
    const nowruz = new Date(2024, 2, 20, 12, 0, 0)
    const parts = toJalaliParts(nowruz)
    expect(parts.year).toBe(1403)
    expect(parts.month).toBe(1)
    expect(parts.day).toBe(1)
  })

  it('provides correct Jalali month names', () => {
    expect(jalaliMonthName(0)).toBe('فروردین')
    expect(jalaliMonthName(6)).toBe('مهر')
    expect(jalaliMonthName(11)).toBe('اسفند')
  })

  it('calculates days in Jalali months correctly', () => {
    // First 6 months: 31 days
    expect(jalaliDaysInMonth(1403, 1)).toBe(31)
    expect(jalaliDaysInMonth(1403, 6)).toBe(31)
    // Next 5 months: 30 days
    expect(jalaliDaysInMonth(1403, 7)).toBe(30)
    expect(jalaliDaysInMonth(1403, 11)).toBe(30)
    // Esfand in leap year 1403 is 30, non-leap 1402 is 29
    expect(jalaliDaysInMonth(1403, 12)).toBe(30)
    expect(jalaliDaysInMonth(1402, 12)).toBe(29)
  })

  it('formats dates in Jalali when language is fa', () => {
    useI18n.setState({ language: 'fa' })
    const date = new Date(2024, 2, 20, 12, 0, 0) // 1403/01/01
    const formatted = formatDate(date, 'yyyy/MM/dd')
    expect(formatted).toBe('1403/01/01')

    const dayNumber = formatDayNumber(date)
    expect(dayNumber).toBe(1)
  })

  it('formats dates in Gregorian when language is en', () => {
    useI18n.setState({ language: 'en' })
    const date = new Date(2024, 2, 20, 12, 0, 0)
    const formatted = formatDate(date, 'yyyy-MM-dd')
    expect(formatted).toBe('2024-03-20')

    const dayNumber = formatDayNumber(date)
    expect(dayNumber).toBe(20)
  })

  it('toDayKey stays consistent Gregorian format', () => {
    const date = new Date(2024, 2, 20, 12, 0, 0)
    expect(toDayKey(date)).toBe('2024-03-20')
  })

  it('formats day label correctly in Persian', () => {
    useI18n.setState({ language: 'fa' })
    const label = formatDayLabel('2024-03-20')
    expect(label).toContain('فروردین')
    expect(label).toContain('1')
  })

  it('toJalaliDateDisplay converts dayKey to Jalali yyyy/MM/dd', () => {
    expect(toJalaliDateDisplay('2024-03-20')).toBe('1403/01/01')
  })

  it('fromDayKey restores local midnight Date', () => {
    const d = fromDayKey('2024-03-20')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(20)
  })

  it('monthGridDays and weekRange work in Persian mode', () => {
    useI18n.setState({ language: 'fa' })
    const date = new Date(2024, 2, 20)
    const grid = monthGridDays(date, 6)
    expect(grid.length).toBeGreaterThanOrEqual(28)

    const range = weekRange(date, 6)
    expect(range.start).toBeDefined()
    expect(range.end).toBeDefined()
  })
})
