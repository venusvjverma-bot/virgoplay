const GRID_COLS = 9;
const GRID_ROWS = 7;

export default function GeneratingOverlay() {
  const dots: React.ReactNode[] = [];
  let key = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const dx = c - (GRID_COLS - 1) / 2;
      const dy = r - (GRID_ROWS - 1) / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delay = `${(dist * 0.22).toFixed(2)}s`;
      const baseOpacity = 0.3 + Math.max(0, 1 - dist / 5) * 0.5;
      dots.push(
        <span
          key={key++}
          className="gen-dot rounded-full"
          style={{
            width: '7px',
            height: '7px',
            backgroundColor: '#3b82f6',
            animationDelay: delay,
            opacity: baseOpacity,
          }}
        />
      );
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white rounded-lg">
      <div
        className="grid gap-[10px] mb-6"
        style={{
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
        }}
      >
        {dots}
      </div>
      <p className="text-sm font-medium text-slate-700">Preparing the current moment…</p>
      <p className="text-xs text-slate-400 mt-1">Please wait…</p>
    </div>
  );
}
