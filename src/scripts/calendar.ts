/**
 * calendar.ts — Client-side controller for MarkAsDate.
 *
 * All data lives in the user's own browser localStorage.
 * No data is sent to any server. This is a fully private, offline-capable app.
 */

import {
	toDateKey, formatDate, escapeHtml,
	loadAgendas, persistAgendas,
	timeToMinutes, rangesOverlap,
	getContrastColor, getDateLabelColors,
} from '../lib/agenda.ts';
import { exportMarktime, importMarktime } from '../lib/marktime.ts';
import type { Agenda, TimeRange, AgendaLabel } from '../types/agenda.ts';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const calendarGrid      = document.querySelector('#calendar-grid')    as HTMLElement;
const dayHeading        = document.querySelector('#day-heading')       as HTMLElement;
const selectedDateChip  = document.querySelector('#selected-date-chip') as HTMLElement;
const dayAgendas        = document.querySelector('#day-agendas')       as HTMLElement;
const emptyDay          = document.querySelector('#empty-day')         as HTMLElement;
const agendaCount       = document.querySelector('#agenda-count')      as HTMLElement;
const marktimeOutput    = document.querySelector('#marktime-output')   as HTMLElement;

// Custom month/year picker
const monthDisplay        = document.querySelector('#month-display')           as HTMLElement;
const monthPickerTrigger  = document.querySelector('#month-picker-trigger')    as HTMLButtonElement;
const monthDropdown       = document.querySelector('#month-dropdown')          as HTMLElement;
const yearInput           = document.querySelector('#year-input')              as HTMLInputElement;

// Form elements
const form              = document.querySelector('#agenda-form')       as HTMLFormElement;
const entryHeading      = document.querySelector('#entry-heading')     as HTMLElement;
const titleInput        = document.querySelector('#agenda-title')      as HTMLInputElement;
const labelNameInput    = document.querySelector('#label-name')        as HTMLInputElement;
const labelColorInput   = document.querySelector('#label-color')       as HTMLInputElement;
const colorSwatch       = document.querySelector('#color-swatch')      as HTMLElement;
const descInput         = document.querySelector('#agenda-desc')       as HTMLTextAreaElement;
const locationInput     = document.querySelector('#agenda-location')   as HTMLInputElement;
const addTimeRangeBtn   = document.querySelector('#add-time-range')    as HTMLButtonElement;
const timeRangesList    = document.querySelector('#time-ranges-list')  as HTMLElement;
const formStatus        = document.querySelector('#form-status')       as HTMLElement;
const submitBtn         = document.querySelector('#submit-btn')        as HTMLButtonElement;
const submitLabel       = document.querySelector('#submit-label')      as HTMLElement;
const cancelEditBtn     = document.querySelector('#cancel-edit')       as HTMLButtonElement;
const colorPickerWrap   = document.querySelector('#color-picker-wrap') as HTMLElement;

// DayPanel actions
const resetAllBtn       = document.querySelector('#reset-all-btn')     as HTMLButtonElement;
const copyMarktimeBtn   = document.querySelector('#copy-marktime')     as HTMLButtonElement;
const exportMarktimeBtn = document.querySelector('#export-marktime')   as HTMLButtonElement;
const importMarktimeInput = document.querySelector('#import-marktime') as HTMLInputElement;

// ── State ─────────────────────────────────────────────────────────────────────

const now = new Date();
let selectedDate    = toDateKey(now);
let visibleYear     = now.getFullYear();
let visibleMonth    = now.getMonth();
let editingId: string | null = null;
let pendingTimeRanges: TimeRange[] = [];

function setStatus(msg: string) { formStatus.textContent = msg; }

let agendas: Agenda[] = loadAgendas(setStatus);

// ── Pad helper ────────────────────────────────────────────────────────────────

function pad(n: number): string { return String(Math.abs(n)).padStart(2, '0'); }

// ── Custom time picker ────────────────────────────────────────────────────────

function getPickerH(id: string): number {
	return parseInt((document.querySelector(`#${id}`) as HTMLElement).dataset.h ?? '0', 10);
}
function getPickerM(id: string): number {
	return parseInt((document.querySelector(`#${id}`) as HTMLElement).dataset.m ?? '0', 10);
}
function getPickerValue(id: string): string {
	return `${pad(getPickerH(id))}:${pad(getPickerM(id))}`;
}
function setPickerH(id: string, h: number) {
	const el = document.querySelector(`#${id}`) as HTMLElement;
	const clamped = ((h % 24) + 24) % 24;
	el.dataset.h = String(clamped);
	(el.querySelector('.tp-h-val') as HTMLInputElement).value = pad(clamped);
}
function setPickerM(id: string, m: number) {
	const el = document.querySelector(`#${id}`) as HTMLElement;
	const clamped = ((m % 60) + 60) % 60;
	el.dataset.m = String(clamped);
	(el.querySelector('.tp-m-val') as HTMLInputElement).value = pad(clamped);
}
function setPickerValue(id: string, time: string) {
	const [h, m] = time.split(':').map(Number);
	setPickerH(id, h || 0);
	setPickerM(id, m || 0);
}

document.querySelectorAll<HTMLButtonElement>('.tp-arrow').forEach((btn) => {
	btn.addEventListener('click', () => {
		const target = btn.dataset.target!;
		const part   = btn.dataset.part!;
		const dir    = parseInt(btn.dataset.dir!, 10);
		if (part === 'h') setPickerH(target, getPickerH(target) + dir);
		else              setPickerM(target, getPickerM(target) + dir);
	});
});

// Sync manual number-input typing into data attributes
document.querySelectorAll<HTMLInputElement>('.tp-h-val').forEach((input) => {
	input.addEventListener('change', () => {
		const picker = input.closest('.time-picker') as HTMLElement;
		if (picker) {
			const h = Math.max(0, Math.min(23, parseInt(input.value, 10) || 0));
			picker.dataset.h = String(h);
			input.value = pad(h);
		}
	});
});
document.querySelectorAll<HTMLInputElement>('.tp-m-val').forEach((input) => {
	input.addEventListener('change', () => {
		const picker = input.closest('.time-picker') as HTMLElement;
		if (picker) {
			const m = Math.max(0, Math.min(59, parseInt(input.value, 10) || 0));
			picker.dataset.m = String(m);
			input.value = pad(m);
		}
	});
});

// ── Color picker ──────────────────────────────────────────────────────────────

colorPickerWrap.addEventListener('click', () => labelColorInput.click());
labelColorInput.addEventListener('input', () => {
	colorSwatch.style.background = labelColorInput.value;
});

// ── Time ranges ───────────────────────────────────────────────────────────────

function renderTimeRangeList() {
	if (pendingTimeRanges.length === 0) {
		timeRangesList.innerHTML = '';
		return;
	}
	timeRangesList.innerHTML = pendingTimeRanges.map((r, i) => `
		<div class="time-range-chip" role="listitem">
			<span class="chip-clock" aria-hidden="true">⏱</span>
			<span>${escapeHtml(r.start)}${r.end ? ` – ${escapeHtml(r.end)}` : ''}</span>
			<button type="button" class="chip-remove" data-index="${i}" aria-label="Hapus waktu ${r.start}">×</button>
		</div>`).join('');

	timeRangesList.querySelectorAll<HTMLButtonElement>('.chip-remove').forEach((btn) => {
		btn.addEventListener('click', () => {
			const idx = parseInt(btn.dataset.index!, 10);
			pendingTimeRanges.splice(idx, 1);
			renderTimeRangeList();
		});
	});
}

addTimeRangeBtn.addEventListener('click', () => {
	const start = getPickerValue('tp-start');
	const end   = getPickerValue('tp-end');

	if (timeToMinutes(start) >= timeToMinutes(end)) {
		setStatus('Jam selesai harus setelah jam mulai.');
		return;
	}

	const newRange: TimeRange = { start, end };
	const overlap = pendingTimeRanges.some((r) => rangesOverlap(r, newRange));
	if (overlap) {
		setStatus(`Waktu ${start}–${end} tumpang tindih dengan waktu yang sudah ditambahkan.`);
		return;
	}

	pendingTimeRanges.push(newRange);
	pendingTimeRanges.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

	// Advance pickers to after the last range
	const lastEnd = pendingTimeRanges[pendingTimeRanges.length - 1].end;
	if (lastEnd) {
		const [lh, lm] = lastEnd.split(':').map(Number);
		const nextStart = lh * 60 + lm + 30;
		setPickerValue('tp-start', `${pad(Math.min(23, Math.floor(nextStart / 60)))}:${pad(nextStart % 60)}`);
		const nextEnd = nextStart + 60;
		setPickerValue('tp-end', `${pad(Math.min(23, Math.floor(nextEnd / 60)))}:${pad(nextEnd % 60)}`);
	}

	setStatus('');
	renderTimeRangeList();
});

// ── Custom month/year picker ──────────────────────────────────────────────────

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni',
	'Juli','Agustus','September','Oktober','November','Desember'];

function updateMonthYearDisplay() {
	monthDisplay.textContent = MONTH_NAMES[visibleMonth] ?? '';
	yearInput.value = String(visibleYear);

	// Highlight active month option
	monthDropdown.querySelectorAll<HTMLButtonElement>('.month-option').forEach((btn) => {
		btn.classList.toggle('active', Number(btn.dataset.month) === visibleMonth);
		btn.setAttribute('aria-selected', String(Number(btn.dataset.month) === visibleMonth));
	});
}

function toggleMonthDropdown(force?: boolean) {
	const open = force !== undefined ? force : monthDropdown.hidden;
	monthDropdown.hidden = !open;
	monthPickerTrigger.setAttribute('aria-expanded', String(open));
	monthPickerTrigger.classList.toggle('open', open);
}

monthPickerTrigger.addEventListener('click', (e) => {
	e.stopPropagation();
	toggleMonthDropdown();
});

document.querySelectorAll<HTMLButtonElement>('.month-option').forEach((btn) => {
	btn.addEventListener('click', () => {
		setVisibleMonth(visibleYear, Number(btn.dataset.month));
		toggleMonthDropdown(false);
	});
});

// Close month dropdown on outside click
document.addEventListener('click', (e) => {
	if (!monthDropdown.contains(e.target as Node) && !monthPickerTrigger.contains(e.target as Node)) {
		toggleMonthDropdown(false);
	}
});

// Year step buttons
document.querySelector('#year-down')?.addEventListener('click', () => {
	setVisibleMonth(visibleYear - 1, visibleMonth);
});
document.querySelector('#year-up')?.addEventListener('click', () => {
	setVisibleMonth(visibleYear + 1, visibleMonth);
});

yearInput.addEventListener('change', () => {
	const y = parseInt(yearInput.value, 10);
	if (!Number.isFinite(y) || y < 1900 || y > 9999) {
		setStatus('Masukkan tahun antara 1900 dan 9999.');
		yearInput.value = String(visibleYear);
		return;
	}
	setVisibleMonth(y, visibleMonth);
});

// ── Calendar navigation ───────────────────────────────────────────────────────

function changeMonth(offset: number) {
	const next = new Date(visibleYear, visibleMonth + offset, 1);
	setVisibleMonth(next.getFullYear(), next.getMonth());
}

function setVisibleMonth(year: number, month: number) {
	if (year < 1900 || year > 9999) {
		setStatus('Tahun kalender tersedia antara 1900 dan 9999.');
		return;
	}
	visibleYear  = year;
	visibleMonth = month;
	const day    = Number(selectedDate.split('-')[2]);
	const lastDay = new Date(visibleYear, visibleMonth + 1, 0).getDate();
	selectedDate = toDateKey(new Date(visibleYear, visibleMonth, Math.min(day, lastDay)));
	setStatus('');
	render();
}

document.querySelector('#previous-month')?.addEventListener('click', () => changeMonth(-1));
document.querySelector('#next-month')?.addEventListener('click', () => changeMonth(1));

// ── Form management ───────────────────────────────────────────────────────────

function resetForm() {
	form.reset();
	labelColorInput.value = '#3B82F6';
	colorSwatch.style.background = '#3B82F6';
	pendingTimeRanges = [];
	renderTimeRangeList();
	setPickerValue('tp-start', '09:00');
	setPickerValue('tp-end', '10:00');
	editingId = null;
	entryHeading.textContent = 'Tambah jadwal';
	submitLabel.textContent = 'Tandai Tanggal';
	cancelEditBtn.hidden = true;
	setStatus('');
}

function startEdit(id: string) {
	const a = agendas.find((x) => x.id === id);
	if (!a) return;

	editingId = id;
	titleInput.value        = a.title;
	labelNameInput.value    = a.label?.name ?? '';
	labelColorInput.value   = a.label?.color ?? '#3B82F6';
	colorSwatch.style.background = a.label?.color ?? '#3B82F6';
	descInput.value         = a.description ?? '';
	locationInput.value     = a.location ?? '';
	pendingTimeRanges       = [...a.timeRanges];
	renderTimeRangeList();

	if (a.timeRanges.length > 0) {
		const first = a.timeRanges[0];
		setPickerValue('tp-start', first.start);
		setPickerValue('tp-end', first.end || first.start);
	}

	entryHeading.textContent = 'Edit jadwal';
	submitLabel.textContent  = 'Simpan Perubahan';
	cancelEditBtn.hidden     = false;
	setStatus('');

	// Scroll sidebar into view (mobile-friendly)
	document.querySelector('#sidebar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	titleInput.focus();
}

cancelEditBtn.addEventListener('click', resetForm);

// ── Form submit ───────────────────────────────────────────────────────────────

form.addEventListener('submit', (e) => {
	e.preventDefault();
	const title = titleInput.value.trim();
	if (!title) { setStatus('Nama agenda wajib diisi.'); return; }

	const labelName = labelNameInput.value.trim();
	const label: AgendaLabel | undefined = labelName
		? { name: labelName, color: labelColorInput.value }
		: undefined;

	const agendaData = {
		title,
		timeRanges: [...pendingTimeRanges],
		label,
		description: descInput.value.trim() || undefined,
		location:    locationInput.value.trim() || undefined,
	};

	if (editingId) {
		agendas = agendas.map((a) => a.id === editingId ? { ...a, ...agendaData } : a);
	} else {
		agendas.push({ id: crypto.randomUUID(), date: selectedDate, ...agendaData });
	}

	persistAgendas(agendas, setStatus);
	resetForm();
	render();
	titleInput.focus();
});

// ── Reset all ─────────────────────────────────────────────────────────────────

resetAllBtn.addEventListener('click', () => {
	if (agendas.length === 0) { setStatus('Tidak ada agenda untuk dihapus.'); return; }
	const ok = window.confirm(`Hapus semua ${agendas.length} agenda? Tindakan ini tidak dapat dibatalkan.`);
	if (!ok) return;
	agendas = [];
	persistAgendas(agendas, setStatus);
	render();
});

// ── Marktime copy / export / import ──────────────────────────────────────────

copyMarktimeBtn.addEventListener('click', async () => {
	const text = marktimeOutput.classList.contains('placeholder') ? '' : (marktimeOutput.textContent ?? '');
	if (!text) { setStatus('Belum ada data marktime untuk disalin.'); return; }
	try {
		await navigator.clipboard.writeText(text);
		copyMarktimeBtn.textContent = 'Tersalin ✓';
		window.setTimeout(() => { copyMarktimeBtn.textContent = 'Salin'; }, 1800);
	} catch {
		setStatus('Tidak dapat menyalin — izin clipboard ditolak browser.');
	}
});

exportMarktimeBtn.addEventListener('click', () => {
	if (agendas.length === 0) { setStatus('Tidak ada agenda untuk diekspor.'); return; }
	const content  = exportMarktime(agendas);
	const today    = new Date().toISOString().split('T')[0];
	const filename = `agenda-${today}.marktime`;
	const blob     = new Blob([content], { type: 'text/plain; charset=utf-8' });
	const url      = URL.createObjectURL(blob);
	const a        = document.createElement('a');
	a.href         = url;
	a.download     = filename;
	a.click();
	URL.revokeObjectURL(url);
});

importMarktimeInput.addEventListener('change', () => {
	const file = importMarktimeInput.files?.[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		const { agendas: imported, errors } = importMarktime(reader.result as string);
		if (errors.length > 0) {
			setStatus(`Impor selesai dengan ${errors.length} peringatan.`);
		} else {
			setStatus('');
		}
		// Merge: add imported agendas (always new IDs, no collision)
		agendas = [...agendas, ...imported];
		persistAgendas(agendas, setStatus);
		render();
	};
	reader.readAsText(file);
	importMarktimeInput.value = ''; // reset so same file can be re-imported
});

// ── Render: Calendar ──────────────────────────────────────────────────────────

function renderCalendar() {
	updateMonthYearDisplay();

	const firstDay    = new Date(visibleYear, visibleMonth, 1).getDay();
	const daysInMonth = new Date(visibleYear, visibleMonth + 1, 0).getDate();
	const today       = toDateKey(new Date());

	const cells = Array.from(
		{ length: firstDay },
		() => '<div class="day-cell empty-cell" aria-hidden="true"></div>',
	);

	for (let day = 1; day <= daysInMonth; day++) {
		const dateKey    = toDateKey(new Date(visibleYear, visibleMonth, day));
		const isSelected = dateKey === selectedDate;
		const isToday    = dateKey === today;
		const isSunday   = new Date(visibleYear, visibleMonth, day).getDay() === 0;

		const dayAgs     = agendas.filter((a) => a.date === dateKey);
		const isMarked   = dayAgs.length > 0;
		const colors     = getDateLabelColors(agendas, dateKey);
		const primary    = colors[0];

		const classes = ['day-cell',
			isSelected ? 'selected' : '',
			isMarked   ? 'marked'   : '',
			isToday    ? 'today'    : '',
			isSunday   ? 'sunday'   : '',
			primary    ? 'colored'  : '',
		].filter(Boolean).join(' ');

		// Inline color style when a label color exists
		let styleAttr = '';
		let dotHtml   = '';
		if (primary) {
			const fg = getContrastColor(primary);
			styleAttr = ` style="background:${primary};border-color:${primary};color:${fg}"`;
			const extraColors = colors.slice(1, 4);
			if (extraColors.length) {
				dotHtml = `<div class="color-dots" aria-hidden="true">${extraColors.map(
					(c) => `<i class="color-dot" style="background:${c}"></i>`,
				).join('')}</div>`;
			} else {
				dotHtml = `<i class="day-dot" style="background:${fg}" aria-hidden="true"></i>`;
			}
		} else if (isMarked) {
			dotHtml = '<i class="day-dot" aria-hidden="true"></i>';
		} else if (isToday) {
			dotHtml = '<i class="today-dot" aria-hidden="true"></i>';
		}

		const agendaLabel = isMarked ? `, ${dayAgs.length} agenda` : '';
		const todayLabel  = isToday ? ', hari ini' : '';
		const ariaLabel   = `${day} ${formatDate(dateKey, { month: 'long', year: 'numeric' })}${agendaLabel}${todayLabel}`;

		cells.push(
			`<button class="${classes}" type="button" role="gridcell" data-date="${dateKey}"${styleAttr} ` +
			`aria-label="${ariaLabel}" aria-pressed="${isSelected}">` +
			`<span>${day}</span>${dotHtml}</button>`,
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

// ── Render: Day panel ─────────────────────────────────────────────────────────

function renderDay() {
	dayHeading.textContent      = formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' });
	selectedDateChip.textContent = formatDate(selectedDate, { day: 'numeric', month: 'short' });

	const selected = agendas
		.filter((a) => a.date === selectedDate)
		.sort((a, b) => {
			const aT = a.timeRanges[0]?.start ?? '';
			const bT = b.timeRanges[0]?.start ?? '';
			return aT.localeCompare(bT);
		});

	agendaCount.textContent = String(selected.length);
	emptyDay.hidden         = selected.length > 0;

	dayAgendas.innerHTML = selected.map((a) => {
		const labelBadgeHtml = a.label
			? `<span class="label-badge" style="background:${escapeHtml(a.label.color)};color:${getContrastColor(a.label.color)}">${escapeHtml(a.label.name)}</span>`
			: '';
		const timesHtml = a.timeRanges.length
			? `<div class="agenda-times">${a.timeRanges.map(
				(r) => `<span class="time-range-badge">${escapeHtml(r.start)}${r.end ? ` – ${escapeHtml(r.end)}` : ''}</span>`,
			).join('')}</div>`
			: '';
		const locationHtml = a.location
			? `<p class="agenda-location"><span aria-hidden="true">📍</span> ${escapeHtml(a.location)}</p>`
			: '';
		const descHtml = a.description
			? `<p class="agenda-desc">${escapeHtml(a.description)}</p>`
			: '';

		return `
		<article class="agenda-card" data-id="${escapeHtml(a.id)}">
			<div class="agenda-card-header">
				${labelBadgeHtml}
				<div class="agenda-card-btns">
					<button class="edit-btn" type="button" data-edit="${escapeHtml(a.id)}" aria-label="Edit agenda ${escapeHtml(a.title)}">Edit</button>
					<button class="delete-button" type="button" data-delete="${escapeHtml(a.id)}" aria-label="Hapus agenda ${escapeHtml(a.title)}">×</button>
				</div>
			</div>
			${timesHtml}
			<p class="agenda-title-text">${escapeHtml(a.title)}</p>
			${locationHtml}
			${descHtml}
		</article>`;
	}).join('');

	dayAgendas.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((btn) => {
		btn.addEventListener('click', () => {
			agendas = agendas.filter((a) => a.id !== btn.dataset.delete);
			persistAgendas(agendas, setStatus);
			render();
		});
	});

	dayAgendas.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach((btn) => {
		btn.addEventListener('click', () => startEdit(btn.dataset.edit!));
	});
}

// ── Render: Marktime output ───────────────────────────────────────────────────

function renderMarktime() {
	const content = exportMarktime(agendas);
	marktimeOutput.textContent = content || 'Agenda yang kamu tandai akan muncul di sini dalam format .marktime.';
	marktimeOutput.classList.toggle('placeholder', agendas.length === 0);
}

// ── Master render ─────────────────────────────────────────────────────────────

function render() {
	renderCalendar();
	renderDay();
	renderMarktime();
}

// ── Init ──────────────────────────────────────────────────────────────────────

render();
