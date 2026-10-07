/**
 * .marktime — MarkAsDate's own human-readable schedule format.
 *
 * All data stays 100% local. This file is a transfer mechanism between
 * two instances of the same app running in different browsers / devices.
 * Nothing is sent to any server.
 *
 * Example:
 * ---
 * format: marktime/1.0
 * app: MarkAsDate
 * generated: 2026-10-07
 * ---
 *
 * ## 7 Oktober 2026
 *
 * ### Rapat Tim Produk
 * label: Kerja | #3B82F6
 * location: Ruang Konferensi A
 * time: 09:00–10:30, 14:00–15:00
 * desc: Bahas roadmap Q4 bersama tim.
 *
 * ---
 */

import type { Agenda, TimeRange, AgendaLabel } from '../types/agenda.ts';
import { formatDate } from './agenda.ts';

const HEADER_MARKER = '---';
const FORMAT_LINE = 'format: marktime/1.0';
const APP_LINE = 'app: MarkAsDate';

// ── Export ────────────────────────────────────────────────────────────────────

export function exportMarktime(agendas: Agenda[]): string {
	if (agendas.length === 0) return '';

	const byDate = new Map<string, Agenda[]>();
	for (const agenda of agendas) {
		const list = byDate.get(agenda.date) ?? [];
		list.push(agenda);
		byDate.set(agenda.date, list);
	}

	const today = new Date().toISOString().split('T')[0];
	const sections = [...byDate.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, entries]) => {
			const dateHeader = `## ${formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}`;
			const items = entries
				.sort((a, b) => {
					const aStart = a.timeRanges[0]?.start ?? '';
					const bStart = b.timeRanges[0]?.start ?? '';
					return aStart.localeCompare(bStart);
				})
				.map(serializeAgenda)
				.join('\n\n---\n\n');
			return `${dateHeader}\n\n${items}`;
		})
		.join('\n\n---\n\n');

	return [
		HEADER_MARKER,
		FORMAT_LINE,
		APP_LINE,
		`generated: ${today}`,
		HEADER_MARKER,
		'',
		sections,
		'',
		HEADER_MARKER,
	].join('\n');
}

function serializeAgenda(agenda: Agenda): string {
	const lines: string[] = [`### ${agenda.title}`];
	if (agenda.label) {
		lines.push(`label: ${agenda.label.name} | ${agenda.label.color}`);
	}
	if (agenda.location) {
		lines.push(`location: ${agenda.location}`);
	}
	if (agenda.timeRanges.length > 0) {
		const timeStr = agenda.timeRanges
			.filter((r) => r.start)
			.map((r) => (r.end ? `${r.start}–${r.end}` : r.start))
			.join(', ');
		if (timeStr) lines.push(`time: ${timeStr}`);
	}
	if (agenda.description) {
		lines.push(`desc: ${agenda.description}`);
	}
	return lines.join('\n');
}

// ── Import ────────────────────────────────────────────────────────────────────

export function importMarktime(content: string): { agendas: Agenda[]; errors: string[] } {
	const agendas: Agenda[] = [];
	const errors: string[] = [];

	// Strip header block
	const withoutHeader = content.replace(/^---[\s\S]*?---\n?/, '').trim();

	// Split into date sections by "## "
	const dateSections = withoutHeader.split(/^## /m).filter((s) => s.trim());

	for (const section of dateSections) {
		const lines = section.split('\n');
		const rawDate = lines[0]?.trim() ?? '';
		const dateKey = parseIndonesianDate(rawDate);

		if (!dateKey) {
			errors.push(`Tanggal tidak dikenali: "${rawDate}"`);
			continue;
		}

		// Split by "### " for individual agenda items
		const agendaBlocks = section.split(/^### /m).slice(1);

		for (const block of agendaBlocks) {
			const blockLines = block
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l && l !== HEADER_MARKER);

			const title = blockLines[0];
			if (!title) continue;

			let label: AgendaLabel | undefined;
			let location: string | undefined;
			let timeRanges: TimeRange[] = [];
			let description: string | undefined;

			for (const line of blockLines.slice(1)) {
				if (line.startsWith('label: ')) {
					const parts = line.slice(7).split(' | ');
					if (parts.length === 2) {
						label = { name: parts[0].trim(), color: parts[1].trim() };
					}
				} else if (line.startsWith('location: ')) {
					location = line.slice(10);
				} else if (line.startsWith('time: ')) {
					timeRanges = line
						.slice(6)
						.split(', ')
						.map((seg) => {
							// Support both em-dash (–) and hyphen (-)
							const sep = seg.includes('–') ? '–' : '-';
							const [start, end] = seg.split(sep);
							return { start: start?.trim() ?? '', end: end?.trim() ?? '' };
						})
						.filter((r) => r.start);
				} else if (line.startsWith('desc: ')) {
					description = line.slice(6);
				}
			}

			agendas.push({
				id: globalThis.crypto.randomUUID(),
				date: dateKey,
				title,
				timeRanges,
				label,
				location,
				description,
			});
		}
	}

	return { agendas, errors };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const INDONESIAN_MONTHS: Record<string, number> = {
	januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
	juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

function parseIndonesianDate(str: string): string | null {
	const match = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
	if (!match) return null;
	const day = parseInt(match[1], 10);
	const month = INDONESIAN_MONTHS[match[2].toLowerCase()];
	const year = parseInt(match[3], 10);
	if (month === undefined || isNaN(day) || isNaN(year)) return null;
	const d = new Date(year, month, day);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const dy = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${dy}`;
}

