import React from 'react';

// Constants
const DAYS: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const START = '09:00'; // inclusive
const END = '18:00';   // exclusive
const STEP_MINUTES = 30; // minutes

// Helpers
function timeToMinutes(t: string): number {
	const [h, m] = t.split(':').map(Number);
	return h * 60 + m;
}
function minutesToLabel(total: number): string {
	const h = Math.floor(total / 60).toString().padStart(2, '0');
	const m = (total % 60).toString().padStart(2, '0');
	return `${h}:${m}`;
}
function rangeTimes(start: string, end: string, stepMin: number): number[] {
	const s = timeToMinutes(start);
	const e = timeToMinutes(end);
	const arr: number[] = [];
	for (let t = s; t < e; t += stepMin) arr.push(t);
	return arr;
}
 type Reservation = { id: string; dayIndex: number; startMin: number; endMin: number };
 type DragState = { dayIndex: number; startMin: number; currentMin: number } | null;

// Component
export default function RoadshowGrid(): JSX.Element {
	const times = React.useMemo(() => rangeTimes(START, END, STEP_MINUTES), []);
	const startMin = React.useMemo(() => timeToMinutes(START), []);
	const [reservations, setReservations] = React.useState<Reservation[]>([]);
	const [drag, setDrag] = React.useState<DragState>(null);
	const [rowHeight, setRowHeight] = React.useState<number>(48);
	const [activeId, setActiveId] = React.useState<string | null>(null);
	const timeAxisRef = React.useRef<HTMLDivElement | null>(null);

	// Measure row height from first time row
	React.useEffect(() => {
		if (!timeAxisRef.current) return;
		const first = timeAxisRef.current.querySelector<HTMLDivElement>('div');
		if (first) setRowHeight(first.offsetHeight || 48);
	}, []);

	// Global listeners for dragging and Esc cancel
	React.useEffect(() => {
		if (!drag) return;
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrag(null); };
		window.addEventListener('keydown', onKey);
		return () => { window.removeEventListener('keydown', onKey); };
	}, [drag]);

	// Delete via keyboard
	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.key === 'Delete' || e.key === 'Backspace') && activeId) {
				setReservations(list => list.filter(r => r.id !== activeId));
				setActiveId(null);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [activeId]);

	const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
	const snapToStep = (min: number) => Math.floor(min / STEP_MINUTES) * STEP_MINUTES;
	const pxFromMin = (min: number) => ((min - startMin) / STEP_MINUTES) * rowHeight;

	function hasOverlap(dayIndex: number, sMin: number, eMin: number): boolean {
		const s = Math.min(sMin, eMin);
		const e = Math.max(sMin, eMin);
		return reservations.some(r => r.dayIndex === dayIndex && Math.max(r.startMin, s) < Math.min(r.endMin, e));
	}

	function handleMouseDown(dayIndex: number, e: React.MouseEvent<HTMLDivElement>) {
		const col = e.currentTarget;
		const rect = col.getBoundingClientRect();
		const y = clamp(e.clientY - rect.top, 0, rect.height - 1);
		const offsetSteps = Math.floor(y / rowHeight);
		const start = startMin + offsetSteps * STEP_MINUTES;
		setDrag({ dayIndex, startMin: start, currentMin: start });

		const onMove = (ev: MouseEvent) => {
			const y2 = clamp(ev.clientY - rect.top, 0, rect.height - 1);
			const stepIdx = Math.floor(y2 / rowHeight);
			const cur = startMin + stepIdx * STEP_MINUTES;
			setDrag(prev => (prev ? { ...prev, currentMin: cur } : prev));
		};
		const onUp = () => {
			setDrag(prev => {
				if (!prev) return prev;
				const rawS = Math.min(prev.startMin, prev.currentMin);
				const rawE = Math.max(prev.startMin, prev.currentMin) + STEP_MINUTES; // ensure >= 1 slot
				const s = snapToStep(rawS);
				const e = snapToStep(rawE);
				if (e <= s) return null;
				if (hasOverlap(prev.dayIndex, s, e)) return null; // cancel on overlap
				const id = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
				setReservations(list => [...list, { id, dayIndex: prev.dayIndex, startMin: s, endMin: e }]);
				return null;
			});
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
	}

	return (
		<div className="w-full h-[560px] bg-white rounded-xl shadow-sm border border-gray-200 overflow-auto">
			{/* Sticky Day Header */}
			<div className="sticky top-0 z-10 bg-white border-b border-gray-200">
				<div className="grid" style={{ gridTemplateColumns: `100px repeat(${DAYS.length}, minmax(180px, 1fr))` }}>
					<div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-white">Time</div>
					{DAYS.map((d) => (
						<div key={d} className="px-3 py-2 text-sm font-semibold text-gray-700 text-center">
							{d}
						</div>
					))}
				</div>
			</div>

			{/* Body Grid */}
			<div className="grid" style={{ gridTemplateColumns: `100px repeat(${DAYS.length}, minmax(180px, 1fr))` }}>
				{/* Time axis */}
				<div ref={timeAxisRef}>
					{times.map((t, idx) => (
						<div
							key={t}
							className={`h-12 border-b border-gray-100 px-3 flex items-center text-xs text-gray-500 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
						>
							{minutesToLabel(t)}
						</div>
					))}
				</div>

				{/* Day columns */}
				{DAYS.map((d, dayIndex) => (
					<div
						key={d}
						className="relative"
						onMouseDown={(e) => handleMouseDown(dayIndex, e)}
					>
						{times.map((t, i) => (
							<div
								key={`${d}-${t}`}
								className="h-12 border-b border-l first:border-l-0 border-gray-100 hover:bg-gray-50 transition-colors"
							/>
						))}

						{/* Confirmed reservations */}
						<div className="absolute inset-0">
							{reservations.filter(r => r.dayIndex === dayIndex).map(r => {
								const top = pxFromMin(r.startMin);
								const height = pxFromMin(r.endMin) - top;
								const active = r.id === activeId;
								return (
									<div
										key={r.id}
										className={`absolute left-1 right-1 rounded-md border ${active ? 'border-indigo-600 bg-indigo-200/70 ring-2 ring-indigo-300' : 'border-indigo-300 bg-indigo-100/70'}`}
										style={{ top, height }}
										onClick={(e) => { e.stopPropagation(); setActiveId(r.id); }}
										onDoubleClick={(e) => { e.stopPropagation(); setReservations(list => list.filter(x => x.id !== r.id)); if (activeId === r.id) setActiveId(null); }}
									/>
								);
							})}
							{/* Ghost while dragging */}
							{drag && drag.dayIndex === dayIndex && (
								(() => {
									const s = Math.min(drag.startMin, drag.currentMin);
									const e = Math.max(drag.startMin, drag.currentMin) + STEP_MINUTES;
									const top = pxFromMin(s);
									const height = Math.max(rowHeight, pxFromMin(e) - top);
									return (
										<div className="absolute left-1 right-1 rounded-md border-2 border-dashed border-sky-400 bg-sky-100/40 pointer-events-none" style={{ top, height }} />
									);
								})()
							)}
						</div>
					</div>
				))}
			</div>

			{/* Export Panel */}
			<div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
				<div className="lg:col-span-2 p-3 border border-gray-200 rounded-md bg-gray-50">
					<h4 className="text-sm font-semibold text-gray-700 mb-2">예약 리스트</h4>
					<ul className="text-xs text-gray-700 list-disc pl-4 space-y-1 max-h-40 overflow-auto">
						{reservations.map(r => (
							<li key={r.id} className={r.id === activeId ? 'font-semibold text-indigo-700' : ''}>
								{DAYS[r.dayIndex]} {minutesToLabel(r.startMin)}–{minutesToLabel(r.endMin)}
							</li>
						))}
					</ul>
				</div>
				<div className="p-3 border border-gray-200 rounded-md bg-white">
					<h4 className="text-sm font-semibold text-gray-700 mb-2">JSON Export</h4>
					<pre className="text-[11px] leading-4 text-gray-800 bg-gray-50 p-2 rounded max-h-40 overflow-auto">{JSON.stringify(reservations, null, 2)}</pre>
				</div>
			</div>
		</div>
	);
} 