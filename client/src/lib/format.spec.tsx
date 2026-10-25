import { describe, expect, it } from 'vitest'
import { formatChartTimestamp, formatEur } from './format'

describe('formatEur', () => {
	it('formats EUR in de-DE style', () => {
		// Intl inserts a narrow no-break space before the currency symbol
		expect(formatEur(124850.54)).toMatch(/124\.850,54\s€/)
	})
})

describe('formatChartTimestamp', () => {
	it('formats ISO date strings as de-DE date and time', () => {
		const result = formatChartTimestamp('2026-10-25T15:30:00+02:00')

		expect(result).not.toContain('Invalid')
		expect(result).toMatch(/25\.10\.2026/)
	})

	it('formats numeric epoch milliseconds', () => {
		const result = formatChartTimestamp(1791307710349)

		expect(result).not.toContain('Invalid')
	})

	it('returns the raw value when it cannot be parsed as a date', () => {
		expect(formatChartTimestamp('not-a-date')).toBe('not-a-date')
	})
})
