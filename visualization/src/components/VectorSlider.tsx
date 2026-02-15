interface VectorSliderProps {
  label: string;
  value: number; // -1 to 1
  color: string;
  leftLabel: string;
  rightLabel: string;
}

export function VectorSlider({ label, value, color, leftLabel, rightLabel }: VectorSliderProps) {
  // Map -1..1 to 0..100%
  const percentage = ((value + 1) / 2) * 100;

  return (
    <div>
      <div className="flex justify-between items-end mb-2">
        <span className="text-xs text-white/50 font-semibold">
          {label}
        </span>
        <span className="text-sm font-mono font-bold" style={{ color }}>
          {value >= 0 ? '+' : ''}{value.toFixed(2)}
        </span>
      </div>
      
      <div className="relative w-full h-2 bg-white/5 rounded-full overflow-visible mx-1.5">
        {/* Center marker */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/15 z-10" />
        
        {/* The filled bar */}
        <div 
          className="absolute top-0 bottom-0 rounded-full transition-all duration-500 ease-out"
          style={{ 
            left: value < 0 ? `${percentage}%` : '50%',
            right: value < 0 ? '50%' : `${100 - percentage}%`,
            background: color,
            opacity: 0.5
          }} 
        />
        
        {/* The handle dot */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.6)] transition-all duration-500 ease-out z-20"
          style={{ left: `calc(${percentage}% - 5px)` }}
        />
      </div>

      <div className="flex justify-between mt-2 text-[10px] text-white/25 font-medium">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}
