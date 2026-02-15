import type { UserData } from '../types';

interface StatsPanelProps {
  data: UserData;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-2">
      <span className="text-xs text-white/50 font-medium">{label}</span>
      <span className="text-sm font-bold text-white font-mono">{value}</span>
    </div>
  );
}

function RageBar({ value }: { value: number }) {
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-white/40 mb-1.5">
        <span>Safe</span>
        <span>Echo Chamber</span>
      </div>
      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full rage-gradient transition-all duration-700"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function StatsPanel({ data }: StatsPanelProps) {
  const { statistics: s, current_vector: v } = data;

  return (
    <div className="glass select-none" style={{ width: '310px', padding: '22px 24px' }}>
      {/* Title */}
      <div className="mb-5">
        <h1 className="text-lg font-bold tracking-tight text-white">
          RageBaiter
        </h1>
        <p className="text-xs text-white/40 mt-1">Drift Visualizer</p>
      </div>

      {/* User */}
      <div className="text-sm text-violet-400 font-semibold mb-5 pb-4 border-b border-white/8">
        @{data.username}
      </div>

      {/* Stats */}
      <div className="mb-6 bg-white/[0.03] rounded-xl p-4 border border-white/5 divide-y divide-white/5">
        <StatRow label="Tweets Analyzed" value={s.total_tweets_analyzed} />
        <StatRow label="Rage Bait Found" value={s.rage_bait_encounters} />
        <StatRow label="Baits Taken" value={s.baits_taken} />
        <StatRow label="Lines Cut" value={s.lines_cut} />
      </div>

      {/* Echo chamber depth */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-white/50 font-medium">
            Echo Chamber Depth
          </span>
          <span className="text-base font-bold text-amber-400 font-mono">
            {Math.round(s.echo_chamber_depth * 100)}%
          </span>
        </div>
        <RageBar value={s.echo_chamber_depth} />
      </div>

      {/* Current vector */}
      <div className="pt-5 border-t border-white/8">
        <p className="text-[11px] text-white/40 uppercase tracking-widest mb-4 font-semibold">
          Current Vector
        </p>
        <div className="grid grid-cols-3 gap-3 text-center mb-4">
          <div className="bg-white/[0.04] rounded-lg py-3 border border-white/5">
            <div className="text-base font-bold text-red-400 font-mono">{v.economic.toFixed(2)}</div>
            <div className="text-[10px] text-white/35 uppercase tracking-wide mt-1">Econ</div>
          </div>
          <div className="bg-white/[0.04] rounded-lg py-3 border border-white/5">
            <div className="text-base font-bold text-green-400 font-mono">{v.social.toFixed(2)}</div>
            <div className="text-[10px] text-white/35 uppercase tracking-wide mt-1">Social</div>
          </div>
          <div className="bg-white/[0.04] rounded-lg py-3 border border-white/5">
            <div className="text-base font-bold text-blue-400 font-mono">{v.populist.toFixed(2)}</div>
            <div className="text-[10px] text-white/35 uppercase tracking-wide mt-1">Populist</div>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-white/30 font-medium">Drift Velocity</span>
          <span className="text-xs font-mono font-semibold text-violet-400">
            {v.drift_velocity.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="pt-5 mt-5 border-t border-white/8">
        <p className="text-[11px] text-white/35 uppercase tracking-wider mb-3 font-semibold">Legend</p>
        <div className="flex items-center gap-3 text-xs text-white/50 mb-2">
          <div className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />
          <span>You (current position)</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/50">
          <div className="w-10 h-1.5 rounded-full rage-gradient shrink-0" />
          <span>Rage score (low to high)</span>
        </div>
        <p className="text-[11px] text-white/25 mt-3 italic">
          Hover waypoints for details
        </p>
      </div>
    </div>
  );
}
