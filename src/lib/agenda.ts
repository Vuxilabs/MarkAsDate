import type { Agenda } from '../types/agenda.ts';

const STORAGE_KEY = 'mark-as-date-agendas';

export function toDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function formatDate(
	dateKey: string,
	options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
	const [year, month, day] = dateKey.split('-').map(Number);
	return new Intl.DateTimeFormat('id-ID', options).format(new Date(year, month - 1, day));
}

export function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (ch) => (
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[ch] ?? ch
	));
}

export function loadAgendas(onError: (msg: string) => void): Agenda[] {
	try {
		const saved = sessionStorage.getItem(STORAGE_KEY);
		if (!saved) return [];
		const parsed: unknown = JSON.parse(saved);
		if (
			!Array.isArray(parsed) ||
			!parsed.every(
				(item) =>
					item &&
					typeof item.id === 'string' &&
					typeof item.date === 'string' &&
					typeof item.title === 'string' &&
					typeof item.time === 'string',
			)
		) {
			throw new Error('Format data agenda tidak valid.');
		}
		return parsed as Agenda[];
	} catch (error) {
		console.error('Gagal membaca agenda dari sesi browser:', error);
		onError('Agenda sesi sebelumnya tidak dapat dibaca.');
		return [];
	}
}

export function persistAgendas(agendas: Agenda[], onError: (msg: string) => void): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(agendas));
	} catch (error) {
		console.error('Gagal menyimpan agenda ke sesi browser:', error);
		onError('Agenda tidak dapat disimpan di sesi browser.');
	}
}

export function buildMarkdown(agendas: Agenda[]): string {
	const byDate = new Map<string, Agenda[]>();
	for (const agenda of agendas) {
		const list = byDate.get(agenda.date) ?? [];
		list.push(agenda);
		byDate.set(agenda.date, list);
	}
	return [...byDate.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, entries]) => {
			const bullets = entries
				.sort((a, b) => a.time.localeCompare(b.time))
				.map((a) => `- ${a.title} pukul : ${a.time}`)
				.join('\n');
			return `## ${formatDate(date).toLocaleLowerCase('id-ID')}\n${bullets}`;
		})
		.join('\n\n');
}

