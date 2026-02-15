import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type {
  SupabaseUserRow,
  SupabaseFeedbackRow,
  SupabaseTweetRow,
  UserData,
  HistoryEntry,
  VectorSnapshot,
} from '../types';
import { fallacyRageScore } from '../types';

const SUPABASE_USER_ID = 1; // row id to watch

function rowToVector(row: { vector_economic: number; vector_social: number; vector_populist: number }): VectorSnapshot {
  return { economic: row.vector_economic, social: row.vector_social, populist: row.vector_populist };
}

/** Build history entries by joining feedback with analyzed tweets */
function buildHistory(
  feedback: SupabaseFeedbackRow[],
  tweetsMap: Map<string, SupabaseTweetRow>,
  startVec: VectorSnapshot,
  endVec: VectorSnapshot,
): HistoryEntry[] {
  // Sort feedback chronologically
  const sorted = [...feedback].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const entries: HistoryEntry[] = [];
  const totalSteps = sorted.length + 1; // +1 for the final current position

  sorted.forEach((fb, i) => {
    const tweet = tweetsMap.get(fb.tweet_id);
    if (!tweet) return;

    const tweetVec: VectorSnapshot = {
      economic: tweet.vector_economic,
      social: tweet.vector_social,
      populist: tweet.vector_populist,
    };

    // Interpolate user position: start → end over the feedback timeline
    const t = (i + 1) / totalSteps;
    const userVec: VectorSnapshot = {
      economic: startVec.economic + (endVec.economic - startVec.economic) * t,
      social: startVec.social + (endVec.social - startVec.social) * t,
      populist: startVec.populist + (endVec.populist - startVec.populist) * t,
    };

    entries.push({
      timestamp: fb.created_at,
      tweet_id: fb.tweet_id,
      tweet_text: tweet.tweet_text,
      tweet_vector: tweetVec,
      interaction: fb.feedback_type,
      rage_score: fallacyRageScore(tweet.fallacies),
      topic: tweet.topic,
      fallacies: (tweet.fallacies || []).map((f) => f.name),
      user_vector_snapshot: userVec,
    });
  });

  return entries;
}

export function useUserData() {
  const [data, setData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Core data fetch
  async function fetchAll() {
    if (!supabase) return;

    // Fetch all three in parallel
    const [userRes, feedbackRes, tweetsRes] = await Promise.all([
      supabase.from('users').select('*').eq('id', SUPABASE_USER_ID).single(),
      supabase.from('user_feedback').select('*').eq('user_id', SUPABASE_USER_ID),
      supabase.from('analyzed_tweets').select('*'),
    ]);

    if (userRes.error || !userRes.data) {
      console.error('Failed to fetch user:', userRes.error?.message);
      setLoading(false);
      return;
    }

    const user = userRes.data as SupabaseUserRow;
    const feedback = (feedbackRes.data || []) as SupabaseFeedbackRow[];
    const tweets = (tweetsRes.data || []) as SupabaseTweetRow[];

    // Build tweet lookup by tweet_id
    const tweetsMap = new Map<string, SupabaseTweetRow>();
    tweets.forEach((t) => tweetsMap.set(t.tweet_id, t));

    const currentVec = rowToVector(user);

    // Starting vector: origin (0,0,0) — the user's neutral starting point
    const startVec: VectorSnapshot = { economic: 0, social: 0, populist: 0 };

    const history = buildHistory(feedback, tweetsMap, startVec, currentVec);

    // Compute echo chamber depth: distance from origin normalized
    const mag = Math.sqrt(currentVec.economic ** 2 + currentVec.social ** 2 + currentVec.populist ** 2);

    // Compute drift velocity from last two history points
    let driftVel = 0;
    if (history.length >= 2) {
      const a = history[history.length - 2].user_vector_snapshot;
      const b = history[history.length - 1].user_vector_snapshot;
      driftVel = Math.sqrt((b.economic - a.economic) ** 2 + (b.social - a.social) ** 2 + (b.populist - a.populist) ** 2);
    }

    setData({
      user_id: user.auth_id,
      username: user.auth_id.slice(0, 8),
      joined_at: user.created_at,
      statistics: {
        total_tweets_analyzed: tweets.length,
        rage_bait_encounters: tweets.filter((t) => (t.fallacies || []).length > 0).length,
        baits_taken: feedback.filter((f) => f.feedback_type === 'agreed').length,
        lines_cut: feedback.filter((f) => f.feedback_type === 'dismissed').length,
        echo_chamber_depth: Math.min(1, mag / 1.73),
      },
      current_vector: { ...currentVec, drift_velocity: parseFloat(driftVel.toFixed(3)) },
      vector_history: history,
    });

    setLoading(false);
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    fetchAll();

    // Poll every 2s for changes (reliable fallback for realtime)
    const interval = setInterval(fetchAll, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return { data, loading };
}
