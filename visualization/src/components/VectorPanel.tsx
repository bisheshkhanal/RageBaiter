import type { UserData } from '../types';
import { VectorSlider } from './VectorSlider';

interface VectorPanelProps {
  data: UserData;
}

export function VectorPanel({ data }: VectorPanelProps) {
  const { current_vector: v } = data;

  return (
    <div className="glass select-none" style={{ width: '310px', padding: '22px 24px' }}>
      <p className="text-[11px] text-white/40 uppercase tracking-widest mb-5 font-semibold">
        Vector Breakdown
      </p>
      
      <div className="space-y-5">
        <VectorSlider 
          label="Economic" 
          value={v.economic} 
          color="#ef4444" 
          leftLabel="Left" 
          rightLabel="Right" 
        />
        <VectorSlider 
          label="Social" 
          value={v.social} 
          color="#22c55e" 
          leftLabel="Progressive" 
          rightLabel="Conservative" 
        />
        <VectorSlider 
          label="Populist" 
          value={v.populist} 
          color="#3b82f6" 
          leftLabel="Anti-Establishment" 
          rightLabel="Institutional" 
        />
      </div>
    </div>
  );
}
