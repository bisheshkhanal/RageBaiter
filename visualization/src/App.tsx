import { Scene3D } from "./components/Scene3D";
import { StatsPanel } from "./components/StatsPanel";
import { VectorPanel } from "./components/VectorPanel";
import { TweetHistoryFeed } from "./components/TweetHistoryFeed";
import { DriftChart } from "./components/DriftChart";
import { AuthPage } from "./components/AuthPage";
import { useUserData } from "./hooks/useUserData";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const { session, loading: authLoading, signOut } = useAuth();
  const { data, loading: dataLoading, source } = useUserData();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="glass px-6 py-4 text-sm text-white/60">Checking authentication...</div>
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="glass px-6 py-4 text-sm text-white/60">Connecting to data source...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="glass px-6 py-4 text-sm text-red-400">
          Failed to load data. Start the extension on localhost or check Supabase settings.
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="hidden md:block">
        <Scene3D data={data} />
      </div>

      <div className="md:hidden absolute inset-0 bg-gradient-to-br from-slate-950 via-violet-950/20 to-slate-950" />

      <div className="absolute top-5 left-5 bottom-5 z-10 flex flex-col gap-4 overflow-y-auto scrollbar-hide panel-sidebar">
        <StatsPanel data={data} />
        <VectorPanel data={data} />
        <DriftChart data={data} />
        <TweetHistoryFeed data={data} />
      </div>

      <div className="absolute top-5 right-5 z-10 flex items-center gap-3 header-actions">
        <div className="glass px-4 py-2 flex items-center gap-2.5 select-none">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-white/50">
            {source === "bridge"
              ? "Extension Bridge Live"
              : source === "supabase"
                ? "Supabase Live"
                : "Offline"}
          </span>
        </div>

        <button
          onClick={signOut}
          className="glass px-4 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/10 transition-all duration-200 flex items-center gap-2"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
