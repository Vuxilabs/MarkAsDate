import type { Agenda, AgendaLabel, TimeRange } from '../types/agenda.ts';

const STORAGE_KEY = 'mark-as-date-agendas';

// ── Date helpers ──────────────────────────────────────────────────────────────

export function toDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function formatDate(
	dateKey: string,
	options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
	const [year, month, day] = dateKey.split('-').map(Number);
	return new Intl.DateTimeFormat('id-ID', options).format(new Date(year, month - 1, day));
}

// ── Security helpers ──────────────────────────────────────────────────────────

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => (
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch] ?? ch
	));
}

// ── Time helpers ──────────────────────────────────────────────────────────────

export function timeToMinutes(time: string): number {
	const [h, m] = time.split(':').map(Number);
	return (h || 0) * 60 + (m || 0);
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
	if (!a.start || !a.end || !b.start || !b.end) return false;
	return timeToMinutes(a.start) < timeToMinutes(b.end)
		&& timeToMinutes(b.start) < timeToMinutes(a.end);
}

// ── Color helpers ─────────────────────────────────────────────────────────────

/**
 * Return '#000000' or '#ffffff' whichever has more contrast against the given hex color.
 * All data stays in the browser — no external call.
 */
export function getContrastColor(hex: string): string {
	const clean = hex.replace('#', '');
	if (clean.length !== 6) return '#ffffff';
	const r = parseInt(clean.slice(0, 2), 16);
	const g = parseInt(clean.slice(2, 4), 16);
	const b = parseInt(clean.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.55 ? '#000000' : '#ffffff';
}

export function getDateLabelColors(agendas: Agenda[], dateKey: string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const a of agendas) {
		if (a.date === dateKey && a.label?.color && !seen.has(a.label.color)) {
			seen.add(a.label.color);
			result.push(a.label.color);
		}
	}
	return result;
}

// ── Persistence  (localStorage — 100% private, no server) ───────────────────

export function loadAgendas(onError: (msg: string) => void): Agenda[] {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) return [];
		const parsed: unknown = JSON.parse(saved);
		if (!Array.isArray(parsed)) throw new Error('Format tidak valid.');
		return (parsed as Record<string, unknown>[]).map(migrateAgenda).filter(Boolean) as Agenda[];
	} catch (err) {
		console.error('Gagal membaca agenda:', err);
		onError('Data agenda tidak dapat dibaca dari penyimpanan lokal.');
		return [];
	}
}

/** Migrate old single-time format to new timeRanges format safely */
function migrateAgenda(item: Record<string, unknown>): Agenda | null {
	if (typeof item?.id !== 'string' || typeof item?.date !== 'string' || typeof item?.title !== 'string') {
		return null;
	}
	let timeRanges: TimeRange[] = [];
	if (Array.isArray(item.timeRanges)) {
		timeRanges = (item.timeRanges as TimeRange[]).filter(
			(r) => typeof r?.start === 'string' && typeof r?.end === 'string',
		);
	} else if (typeof item.time === 'string' && item.time) {
		timeRanges = [{ start: item.time as string, end: '' }];
	}
	let label: AgendaLabel | undefined;
	if (item.label && typeof (item.label as AgendaLabel)?.name === 'string') {
		label = item.label as AgendaLabel;
	}
	return {
		id: item.id as string,
		date: item.date as string,
		title: item.title as string,
		timeRanges,
		label,
		description: typeof item.description === 'string' ? item.description : undefined,
		location: typeof item.location === 'string' ? item.location : undefined,
	};
}

export function persistAgendas(agendas: Agenda[], onError: (msg: string) => void): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(agendas));
	} catch (err) {
		console.error('Gagal menyimpan agenda:', err);
		onError('Agenda tidak dapat disimpan ke penyimpanan lokal.');
	}
}
