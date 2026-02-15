import { useEffect, useState } from "react";
import { demoAuthToken, supabase } from "../lib/supabase";
import type {
  SupabaseUserRow,
  SupabaseFeedbackRow,
  SupabaseTweetRow,
  UserData,
  HistoryEntry,
  VectorSnapshot,
} from "../types";
import { fallacyRageScore } from "../types";

const DEFAULT_USER_ID = 1;
const FALLBACK_USER_ID = Number(import.meta.env.VITE_SUPABASE_FALLBACK_USER_ID ?? DEFAULT_USER_ID);

const BRIDGE_REQUEST_TYPE = "RAGEBAITER_BRIDGE_GET_STATE";
const BRIDGE_STATE_TYPE = "RAGEBAITER_BRIDGE_STATE";
const BRIDGE_UPDATE_TYPE = "RAGEBAITER_BRIDGE_UPDATE";
const BRIDGE_PAGE_SOURCE = "ragebaiter-visualizer";
const BRIDGE_EXTENSION_SOURCE = "ragebaiter-extension";

type BridgeVector = VectorSnapshot & {
  x?: number;
  y?: number;
};

type BridgeHistoryEvent = {
  id: string;
  tweetId: string;
  feedback: "acknowledged" | "agreed" | "dismissed";
  timestamp: string;
  tweetVector: VectorSnapshot;
  beforeVector: VectorSnapshot;
  afterVector: VectorSnapshot;
  delta: VectorSnapshot;
  syncedAt?: string;
  syncAttempts: number;
};

type BridgeStatePayload = {
  userVector: BridgeVector | null;
  vectorHistory: BridgeHistoryEvent[];
};

type BridgeRequestMessage = {
  source: typeof BRIDGE_PAGE_SOURCE;
  type: typeof BRIDGE_REQUEST_TYPE;
  requestId: string;
};

type BridgeEventMessage = {
  source: typeof BRIDGE_EXTENSION_SOURCE;
  type: typeof BRIDGE_STATE_TYPE | typeof BRIDGE_UPDATE_TYPE;
  requestId?: string;
  payload?: BridgeStatePayload;
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : `${normalized}${"=".repeat(4 - remainder)}`;
  return atob(padded);
}

function decodeAuthIdFromToken(rawToken: string): string | null {
  const token = rawToken.trim().replace(/^Bearer\s+/i, "");
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const payloadJson = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadJson) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

function getTokenFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? params.get("authToken") ?? "";
}

function getResolvedAuthId(): string | null {
  const urlToken = getTokenFromUrl();
  return decodeAuthIdFromToken(urlToken || demoAuthToken);
}

function rowToVector(row: {
  vector_economic: number;
  vector_social: number;
  vector_populist: number;
}): VectorSnapshot {
  return {
    economic: row.vector_economic,
    social: row.vector_social,
    populist: row.vector_populist,
  };
}

function vectorDistance(a: VectorSnapshot, b: VectorSnapshot): number {
  return Math.sqrt(
    (b.economic - a.economic) ** 2 + (b.social - a.social) ** 2 + (b.populist - a.populist) ** 2
  );
}

function vectorMagnitude(v: VectorSnapshot): number {
  return Math.sqrt(v.economic ** 2 + v.social ** 2 + v.populist ** 2);
}

function toSigned(value: number): string {
  const fixed = value.toFixed(2);
  return value >= 0 ? `+${fixed}` : fixed;
}

function normalizeBridgeHistory(events: BridgeHistoryEvent[]): BridgeHistoryEvent[] {
  return [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function bridgeHistoryToEntries(events: BridgeHistoryEvent[]): HistoryEntry[] {
  return normalizeBridgeHistory(events).map((event) => {
    const deltaMag = vectorMagnitude(event.delta);
    const rageScore = Math.max(5, Math.min(95, Math.round((deltaMag / 0.35) * 100)));
    const topic = `Delta S ${toSigned(event.delta.social)} E ${toSigned(event.delta.economic)} P ${toSigned(event.delta.populist)}`;
    const fallacies = [
      `Before ${event.beforeVector.economic.toFixed(2)}, ${event.beforeVector.social.toFixed(2)}, ${event.beforeVector.populist.toFixed(2)}`,
      `After ${event.afterVector.economic.toFixed(2)}, ${event.afterVector.social.toFixed(2)}, ${event.afterVector.populist.toFixed(2)}`,
    ];

    return {
      timestamp: event.timestamp,
      tweet_id: `${event.tweetId}-${event.timestamp}`,
      tweet_text: `Tweet ${event.tweetId}`,
      tweet_vector: event.tweetVector,
      interaction: event.feedback,
      rage_score: rageScore,
      topic,
      fallacies,
      user_vector_snapshot: event.afterVector,
    };
  });
}

function bridgeStateToUserData(state: BridgeStatePayload): UserData {
  const historyEntries = bridgeHistoryToEntries(state.vectorHistory || []);
  const latestFromHistory = historyEntries[historyEntries.length - 1]?.user_vector_snapshot;
  const currentVector = state.userVector
    ? {
        economic: state.userVector.economic,
        social: state.userVector.social,
        populist: state.userVector.populist,
      }
    : (latestFromHistory ?? { economic: 0, social: 0, populist: 0 });

  let driftVel = 0;
  if (historyEntries.length >= 2) {
    const a = historyEntries[historyEntries.length - 2].user_vector_snapshot;
    const b = historyEntries[historyEntries.length - 1].user_vector_snapshot;
    driftVel = vectorDistance(a, b);
  }

  const feedback = state.vectorHistory || [];
  const joinedAt = historyEntries[0]?.timestamp ?? new Date().toISOString();

  return {
    user_id: "local-extension",
    username: "local-extension",
    joined_at: joinedAt,
    statistics: {
      total_tweets_analyzed: feedback.length,
      rage_bait_encounters: feedback.length,
      baits_taken: feedback.filter((event) => event.feedback === "agreed").length,
      lines_cut: feedback.filter((event) => event.feedback === "dismissed").length,
      echo_chamber_depth: Math.min(1, vectorMagnitude(currentVector) / 1.73),
    },
    current_vector: {
      ...currentVector,
      drift_velocity: parseFloat(driftVel.toFixed(3)),
    },
    vector_history: historyEntries,
  };
}

function emptyBridgeState(): BridgeStatePayload {
  return {
    userVector: null,
    vectorHistory: [],
  };
}

function requestBridgeState(timeoutMs = 1000): Promise<BridgeStatePayload | null> {
  return new Promise((resolve) => {
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let settled = false;

    const finish = (value: BridgeStatePayload | null) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", onMessage);
      resolve(value);
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as Partial<BridgeEventMessage> | undefined;
      if (!data || data.source !== BRIDGE_EXTENSION_SOURCE || data.type !== BRIDGE_STATE_TYPE) {
        return;
      }

      if (data.requestId !== requestId) {
        return;
      }

      finish(data.payload ?? null);
    };

    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("message", onMessage);

    const requestMessage: BridgeRequestMessage = {
      source: BRIDGE_PAGE_SOURCE,
      type: BRIDGE_REQUEST_TYPE,
      requestId,
    };
    window.postMessage(requestMessage, window.location.origin);
  });
}

function handleBridgeEventMessage(event: MessageEvent<unknown>): BridgeStatePayload | null {
  if (event.source !== window || event.origin !== window.location.origin) {
    return null;
  }

  const data = event.data as Partial<BridgeEventMessage> | undefined;
  if (!data || data.source !== BRIDGE_EXTENSION_SOURCE) {
    return null;
  }

  if (data.type !== BRIDGE_STATE_TYPE && data.type !== BRIDGE_UPDATE_TYPE) {
    return null;
  }

  return data.payload ?? null;
}

/** Build history entries by joining feedback with analyzed tweets */
function buildHistory(
  feedback: SupabaseFeedbackRow[],
  tweetsMap: Map<string, SupabaseTweetRow>,
  startVec: VectorSnapshot,
  endVec: VectorSnapshot
): HistoryEntry[] {
  const sorted = [...feedback].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const entries: HistoryEntry[] = [];
  const totalSteps = sorted.length + 1;

  sorted.forEach((fb, i) => {
    const tweet = tweetsMap.get(fb.tweet_id);
    if (!tweet) return;

    const tweetVec: VectorSnapshot = {
      economic: tweet.vector_economic,
      social: tweet.vector_social,
      populist: tweet.vector_populist,
    };

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
  const [source, setSource] = useState<"bridge" | "supabase" | "none">("none");

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const onBridgeUpdate = (event: MessageEvent<unknown>) => {
      const payload = handleBridgeEventMessage(event);
      if (!payload) {
        return;
      }

      const next = bridgeStateToUserData(payload);
      if (!next) {
        return;
      }

      setData(next);
      setSource("bridge");
      setLoading(false);

      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const fetchSupabaseData = async () => {
      if (!supabase) {
        return;
      }

      const authId = getResolvedAuthId();
      const userQuery = authId
        ? supabase.from("users").select("*").eq("auth_id", authId)
        : supabase.from("users").select("*").eq("id", FALLBACK_USER_ID);

      const userRes = await userQuery.single();
      if (userRes.error || !userRes.data) {
        console.error("Failed to fetch user:", userRes.error?.message);
        setLoading(false);
        return;
      }

      const user = userRes.data as SupabaseUserRow;
      const [feedbackRes, tweetsRes] = await Promise.all([
        supabase.from("user_feedback").select("*").eq("user_id", user.id),
        supabase.from("analyzed_tweets").select("*"),
      ]);

      const feedback = (feedbackRes.data || []) as SupabaseFeedbackRow[];
      const tweets = (tweetsRes.data || []) as SupabaseTweetRow[];
      const tweetsMap = new Map<string, SupabaseTweetRow>();
      tweets.forEach((tweet) => tweetsMap.set(tweet.tweet_id, tweet));

      const currentVec = rowToVector(user);
      const startVec: VectorSnapshot = { economic: 0, social: 0, populist: 0 };
      const history = buildHistory(feedback, tweetsMap, startVec, currentVec);

      let driftVel = 0;
      if (history.length >= 2) {
        const a = history[history.length - 2].user_vector_snapshot;
        const b = history[history.length - 1].user_vector_snapshot;
        driftVel = vectorDistance(a, b);
      }

      const mag = vectorMagnitude(currentVec);

      if (cancelled) {
        return;
      }

      setData({
        user_id: user.auth_id,
        username: user.auth_id.slice(0, 8),
        joined_at: user.created_at,
        statistics: {
          total_tweets_analyzed: tweets.length,
          rage_bait_encounters: tweets.filter((tweet) => (tweet.fallacies || []).length > 0).length,
          baits_taken: feedback.filter((entry) => entry.feedback_type === "agreed").length,
          lines_cut: feedback.filter((entry) => entry.feedback_type === "dismissed").length,
          echo_chamber_depth: Math.min(1, mag / 1.73),
        },
        current_vector: { ...currentVec, drift_velocity: parseFloat(driftVel.toFixed(3)) },
        vector_history: history,
      });

      setSource("supabase");
      setLoading(false);
    };

    const initialize = async () => {
      window.addEventListener("message", onBridgeUpdate);

      let bridgePayload: BridgeStatePayload | null = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        bridgePayload = await requestBridgeState(600);
        if (bridgePayload) {
          break;
        }
      }

      if (cancelled) {
        return;
      }

      if (bridgePayload) {
        setData(bridgeStateToUserData(bridgePayload));
        setSource("bridge");
        setLoading(false);
        return;
      }

      if (!supabase) {
        setData(bridgeStateToUserData(emptyBridgeState()));
        setSource("none");
        setLoading(false);
        return;
      }

      await fetchSupabaseData();
      if (cancelled) {
        return;
      }

      intervalId = window.setInterval(fetchSupabaseData, 2000);
    };

    void initialize();

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("message", onBridgeUpdate);
    };
  }, []);

  return { data, loading, source };
}
