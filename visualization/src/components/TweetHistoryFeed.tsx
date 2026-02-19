import type { HistoryEntry, UserData } from "../types";

interface TweetHistoryFeedProps {
  data: UserData;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getFeedbackIcon(feedback: string): { icon: string; color: string; label: string } {
  switch (feedback) {
    case "agreed":
      return { icon: "✓", color: "text-red-400", label: "Agreed" };
    case "dismissed":
      return { icon: "✗", color: "text-green-400", label: "Dismissed" };
    case "acknowledged":
      return { icon: "○", color: "text-amber-400", label: "Acknowledged" };
    default:
      return { icon: "?", color: "text-white/40", label: "Unknown" };
  }
}

function TweetEntry({ entry }: { entry: HistoryEntry }) {
  const feedbackInfo = getFeedbackIcon(entry.interaction);
  const primaryFallacy = entry.fallacies[0] ?? "No fallacy detected";
  const textSnippet =
    entry.tweet_text.length > 80 ? `${entry.tweet_text.slice(0, 80)}...` : entry.tweet_text;

  return (
    <div className="group py-3 border-b border-white/5 last:border-b-0 transition-colors duration-200 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/30 font-mono">
          {formatTimestamp(entry.timestamp)}
        </span>
        <div
          className={`flex items-center gap-1.5 text-[10px] font-semibold ${feedbackInfo.color}`}
        >
          <span className="text-xs">{feedbackInfo.icon}</span>
          <span>{feedbackInfo.label}</span>
        </div>
      </div>

      <p className="text-xs text-white/70 leading-relaxed mb-2 line-clamp-2">{textSnippet}</p>

      <div className="flex items-center justify-between">
        <span
          className="text-[10px] text-violet-400/80 truncate max-w-[180px]"
          title={primaryFallacy}
        >
          {primaryFallacy}
        </span>
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor:
                entry.rage_score > 70 ? "#ef4444" : entry.rage_score > 40 ? "#eab308" : "#22c55e",
            }}
          />
          <span className="text-[10px] text-white/40 font-mono">{entry.rage_score}</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="py-3 border-b border-white/5 last:border-b-0 animate-pulse">
      <div className="flex items-center justify-between mb-2">
        <div className="h-3 w-16 bg-white/10 rounded" />
        <div className="h-3 w-14 bg-white/10 rounded" />
      </div>
      <div className="space-y-1.5 mb-2">
        <div className="h-3 w-full bg-white/10 rounded" />
        <div className="h-3 w-3/4 bg-white/10 rounded" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-3 w-24 bg-white/10 rounded" />
        <div className="h-3 w-8 bg-white/10 rounded" />
      </div>
    </div>
  );
}

export function TweetHistoryFeed({ data }: TweetHistoryFeedProps) {
  const { vector_history: history } = data;
  const isEmpty = history.length === 0;

  return (
    <div
      className="glass select-none overflow-hidden"
      style={{ width: "310px", padding: "22px 24px" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">Tweet History</h2>
          <p className="text-[10px] text-white/35 mt-0.5">Recent analyzed content</p>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/5">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-[10px] text-white/50 font-mono">{history.length}</span>
        </div>
      </div>

      <div className="overflow-y-auto pr-1 scrollbar-hide" style={{ maxHeight: "320px" }}>
        {isEmpty ? (
          <div className="py-8 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white/20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <p className="text-xs text-white/40">No tweets analyzed yet</p>
            <p className="text-[10px] text-white/25 mt-1">Start browsing to see your history</p>
          </div>
        ) : (
          <div className="space-y-0">
            {[...history].reverse().map((entry, idx) => (
              <TweetEntry key={`${entry.tweet_id}-${idx}`} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {!isEmpty && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-[10px] text-white/25 text-center">Scroll to see older entries</p>
        </div>
      )}
    </div>
  );
}

export function TweetHistoryFeedSkeleton() {
  return (
    <div
      className="glass select-none overflow-hidden"
      style={{ width: "310px", padding: "22px 24px" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
          <div className="h-2.5 w-32 bg-white/5 rounded mt-1 animate-pulse" />
        </div>
        <div className="h-5 w-10 bg-white/5 rounded-full animate-pulse" />
      </div>
      <div className="space-y-0">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
