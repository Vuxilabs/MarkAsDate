import {
	toDateKey,
	formatDate,
	escapeHtml,
	loadAgendas,
	persistAgendas,
	buildMarkdown,
} from '../lib/agenda.ts';
import type { Agenda } from '../types/agenda.ts';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const monthSelect = document.querySelector('#month-select') as HTMLSelectElement;
const yearSelect = document.querySelector('#year-select') as HTMLInputElement;
const calendarGrid = document.querySelector('#calendar-grid') as HTMLElement;
const dayHeading = document.querySelector('#day-heading') as HTMLElement;
const selectedDateChip = document.querySelector('#selected-date-chip') as HTMLElement;
const dayAgendas = document.querySelector('#day-agendas') as HTMLElement;
const emptyDay = document.querySelector('#empty-day') as HTMLElement;
const agendaCount = document.querySelector('#agenda-count') as HTMLElement;
const markdownOutput = document.querySelector('#markdown-output') as HTMLElement;
const form = document.querySelector('#agenda-form') as HTMLFormElement;
const titleInput = document.querySelector('#agenda-title') as HTMLInputElement;
const timeInput = document.querySelector('#agenda-time') as HTMLInputElement;
const formStatus = document.querySelector('#form-status') as HTMLElement;

// ── State ─────────────────────────────────────────────────────────────────────
const now = new Date();
let selectedDate = toDateKey(now);
let visibleYear = now.getFullYear();
let visibleMonth = now.getMonth();

function setStatus(msg: string) {
	formStatus.textContent = msg;
}

let agendas: Agenda[] = loadAgendas(setStatus);

// ── Calendar ──────────────────────────────────────────────────────────────────
function changeMonth(offset: number) {
	const next = new Date(visibleYear, visibleMonth + offset, 1);
	setVisibleMonth(next.getFullYear(), next.getMonth());
}

function setVisibleMonth(year: number, month: number) {
	if (year < 1900 || year > 9999) {
		setStatus('Tahun kalender tersedia antara 1900 dan 9999.');
		return;
	}
	visibleYear = year;
	visibleMonth = month;
	const day = Number(selectedDate.split('-')[2]);
	const lastDay = new Date(visibleYear, visibleMonth + 1, 0).getDate();
	selectedDate = toDateKey(new Date(visibleYear, visibleMonth, Math.min(day, lastDay)));
	setStatus('');
	render();
}

function renderCalendar() {
	monthSelect.value = String(visibleMonth);
	yearSelect.value = String(visibleYear);

	const firstDay = new Date(visibleYear, visibleMonth, 1).getDay();
	const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();
	const markedDates = new Set(agendas.map((a) => a.date));
	const today = toDateKey(new Date());

	const cells = Array.from(
		{ length: firstDay },
		() => '<div class="day-cell empty-cell" aria-hidden="true"></div>',
	);

	for (let day = 1; day <= daysInMonth; day++) {
		const dateKey = toDateKey(new Date(visibleYear, visibleMonth, day));
		const isSelected = dateKey === selectedDate;
		const isMarked = markedDates.has(dateKey);
		const isToday = dateKey === today;
		const isSunday = new Date(visibleYear, visibleMonth, day).getDay() === 0;

		const classes = [
			'day-cell',
			isSelected ? 'selected' : '',
			isMarked ? 'marked' : '',
			isToday ? 'today' : '',
			isSunday ? 'sunday' : '',
		]
			.filter(Boolean)
			.join(' ');

		const agendaLabel = isMarked ? ', ada agenda' : '';
		const todayLabel = isToday ? ', hari ini' : '';
		const dot = isMarked
			? '<i class="day-dot" aria-hidden="true"></i>'
			: isToday
				? '<i class="today-dot" aria-hidden="true"></i>'
				: '';

		cells.push(
			`<button class="${classes}" type="button" role="gridcell" data-date="${dateKey}" ` +
				`aria-label="${day} ${formatDate(dateKey, { month: 'long', year: 'numeric' })}${agendaLabel}${todayLabel}" ` +
				`aria-pressed="${isSelected}"><span>${day}</span>${dot}</button>`,
		);
	}

	calendarGrid.innerHTML = cells.join('');
	calendarGrid.querySelectorAll<HTMLButtonElement>('[data-date]').forEach((btn) => {
		btn.addEventListener('click', () => {
			selectedDate = btn.dataset.date!;
			render();
		});
	});
}

// ── Day panel ─────────────────────────────────────────────────────────────────
function renderDay() {
	dayHeading.textContent = formatDate(selectedDate, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	});
	selectedDateChip.textContent = formatDate(selectedDate, { day: 'numeric', month: 'short' });

	const selected = agendas
		.filter((a) => a.date === selectedDate)
		.sort((a, b) => a.time.localeCompare(b.time));

	agendaCount.textContent = String(selected.length);
	emptyDay.hidden = selected.length > 0;

	dayAgendas.innerHTML = selected
		.map(
			(a) => `
		<article class="agenda-card">
			<div class="agenda-time"><span class="time-dot"></span>${escapeHtml(a.time)}</div>
			<p>${escapeHtml(a.title)}</p>
			<button class="delete-button" type="button" data-delete="${escapeHtml(a.id)}" aria-label="Hapus agenda ${escapeHtml(a.title)}">×</button>
		</article>`,
		)
		.join('');

	dayAgendas.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((btn) => {
		btn.addEventListener('click', () => {
			agendas = agendas.filter((a) => a.id !== btn.dataset.delete);
			persistAgendas(agendas, setStatus);
			render();
		});
	});
}

// ── Markdown panel ────────────────────────────────────────────────────────────
function renderMarkdown() {
	const markdown = buildMarkdown(agendas);
	markdownOutput.textContent = markdown || 'Agenda yang kamu tandai akan muncul di sini.';
	markdownOutput.classList.toggle('placeholder', markdown.length === 0);
}

// ── Master render ─────────────────────────────────────────────────────────────
function render() {
	renderCalendar();
	renderDay();
	renderMarkdown();
}

// ── Event listeners ───────────────────────────────────────────────────────────
document.querySelector('#previous-month')?.addEventListener('click', () => changeMonth(-1));
document.querySelector('#next-month')?.addEventListener('click', () => changeMonth(1));

monthSelect.addEventListener('change', () => {
	setVisibleMonth(visibleYear, Number(monthSelect.value));
});

yearSelect.addEventListener('change', () => {
	const year = Number(yearSelect.value);
	if (!Number.isInteger(year) || year < 1900 || year > 9999) {
		setStatus('Masukkan tahun antara 1900 dan 9999.');
		yearSelect.value = String(visibleYear);
		return;
	}
	setVisibleMonth(year, visibleMonth);
});

form.addEventListener('submit', (e) => {
	e.preventDefault();
	const title = titleInput.value.trim();
	if (!title || !timeInput.value) return;
	agendas.push({
		id: globalThis.crypto.randomUUID(),
		date: selectedDate,
		title,
		time: timeInput.value,
	});
	persistAgendas(agendas, setStatus);
	titleInput.value = '';
	render();
	titleInput.focus();
});

document.querySelector('#copy-markdown')?.addEventListener('click', async (e) => {
	const btn = e.currentTarget as HTMLButtonElement;
	const markdown = markdownOutput.classList.contains('placeholder') ? '' : (markdownOutput.textContent ?? '');
	if (!markdown) {
		setStatus('Belum ada Markdown untuk disalin.');
		return;
	}
	try {
		await navigator.clipboard.writeText(markdown);
		btn.textContent = 'Tersalin';
		window.setTimeout(() => {
			btn.textContent = 'Salin';
		}, 1600);
	} catch (err) {
		console.error('Gagal menyalin Markdown:', err);
		setStatus('Markdown tidak dapat disalin dari browser ini.');
	}
});

// ── Init ──────────────────────────────────────────────────────────────────────
render();

