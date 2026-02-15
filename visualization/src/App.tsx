import { Scene3D } from './components/Scene3D';
import { StatsPanel } from './components/StatsPanel';
import { VectorPanel } from './components/VectorPanel';
import { useUserData } from './hooks/useUserData';

export default function App() {
  const { data, loading } = useUserData();

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="glass px-6 py-4 text-sm text-white/60">
          Connecting to Supabase…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="glass px-6 py-4 text-sm text-red-400">
          Failed to load data. Check Supabase connection.
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <Scene3D data={data} />

      {/* Left sidebar — scrollable column */}
      <div className="absolute top-5 left-5 bottom-5 z-10 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
        <StatsPanel data={data} />
        <VectorPanel data={data} />
      </div>

      {/* Live indicator */}
      <div className="absolute top-5 right-5 z-10 glass px-4 py-2 flex items-center gap-2.5 select-none">
        <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs text-white/50">Supabase Live</span>
      </div>
    </div>
  );
}
