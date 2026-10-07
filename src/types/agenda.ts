export type TimeRange = {
	/** "HH:MM" */
	start: string;
	/** "HH:MM" */
	end: string;
};

export type AgendaLabel = {
	name: string;
	/** Hex color e.g. "#3B82F6" */
	color: string;
};

export type Agenda = {
	id: string;
	/** "YYYY-MM-DD" */
	date: string;
	title: string;
	timeRanges: TimeRange[];
	label?: AgendaLabel;
	description?: string;
	location?: string;
};
