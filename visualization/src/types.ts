export interface VectorSnapshot {
  economic: number;
  social: number;
  populist: number;
}

// ---- Supabase row types ----

export interface SupabaseUserRow {
  id: number;
  auth_id: string;
  vector_social: number;
  vector_economic: number;
  vector_populist: number;
  created_at: string;
  updated_at: string;
}

export interface SupabaseFeedbackRow {
  id: number;
  user_id: number;
  tweet_id: string;
  feedback_type: string; // "agreed" | "dismissed" | "acknowledged"
  created_at: string;
}

export interface SupabaseTweetRow {
  id: number;
  tweet_id: string;
  tweet_text: string;
  vector_social: number;
  vector_economic: number;
  vector_populist: number;
  fallacies: { name: string; confidence: number }[];
  topic: string;
  analyzed_at: string;
  expires_at: string;
}

// ---- App types ----

export interface HistoryEntry {
  timestamp: string;
  tweet_id: string;
  tweet_text: string;
  tweet_vector: VectorSnapshot;
  interaction: string;
  rage_score: number;
  topic: string;
  fallacies: string[];
  user_vector_snapshot: VectorSnapshot;
}

export interface UserData {
  user_id: string;
  username: string;
  joined_at: string;
  statistics: {
    total_tweets_analyzed: number;
    rage_bait_encounters: number;
    baits_taken: number;
    lines_cut: number;
    echo_chamber_depth: number;
  };
  current_vector: VectorSnapshot & { drift_velocity: number };
  vector_history: HistoryEntry[];
}

/** Derive a rage score (0-100) from a tweet's fallacies */
export function fallacyRageScore(fallacies: { name: string; confidence: number }[]): number {
  if (!fallacies || fallacies.length === 0) return 5;
  const avg = fallacies.reduce((sum, f) => sum + f.confidence, 0) / fallacies.length;
  return Math.round(avg * 100);
}

/** Map a rage score (0-100) to a hex color: green → yellow → red */
export function rageColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  if (t < 0.5) {
    const s = t * 2;
    const r = Math.round(34 + s * (234 - 34));
    const g = Math.round(197 + s * (179 - 197));
    const b = Math.round(94 + s * (8 - 94));
    return `rgb(${r},${g},${b})`;
  }
  const s = (t - 0.5) * 2;
  const r = Math.round(234 + s * (239 - 234));
  const g = Math.round(179 - s * 179);
  const b = Math.round(8 - s * 8);
  return `rgb(${r},${g},${b})`;
}

/** Convert a vector snapshot to [x, y, z] scaled into the scene */
export function vectorToPosition(v: VectorSnapshot, scale = 1.8): [number, number, number] {
  return [v.economic * scale, v.social * scale, v.populist * scale];
}
