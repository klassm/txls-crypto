const eurFormatter = new Intl.NumberFormat('de-DE', {
	style: 'currency',
	currency: 'EUR',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
})

export function formatEur(value: number): string {
	return eurFormatter.format(value)
}

export function formatChartTimestamp(label: string | number): string {
	const date = new Date(label)
	if (Number.isNaN(date.getTime())) return String(label)
	return `${date.toLocaleDateString('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})} ${date.toLocaleTimeString('de-DE', {
		hour: '2-digit',
		minute: '2-digit',
	})}`
}
