import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  createDecisionEngine,
  type DecisionLog,
  type TweetAnalysis,
  type UserProfile,
} from "../background/decision-engine.js";
import {
  MESSAGE_TYPES,
  isExtensionMessage,
  type AnalyzeResultMessage,
} from "../messaging/protocol.js";
import "./DebugPanel.css";

const MAX_LOGS = 500;

type InterventionLevel = DecisionLog["fields"]["decision"];

// Re-implement getStoredUserProfile to avoid importing from service-worker (architectural constraint)
const getStoredUserProfile = async (): Promise<UserProfile> => {
  const stored = (await chrome.storage.local.get(["userVector", "decisionConfig"])) as {
    userVector?: {
      social?: number;
      economic?: number;
      populist?: number;
    };
    decisionConfig?: UserProfile["decisionConfig"];
  };

  const baseProfile: UserProfile = {
    userVector: {
      social: stored.userVector?.social ?? 0,
      economic: stored.userVector?.economic ?? 0,
      populist: stored.userVector?.populist ?? 0,
    },
  };

  if (stored.decisionConfig) {
    return {
      ...baseProfile,
      decisionConfig: stored.decisionConfig,
    };
  }

  return baseProfile;
};

type LogItem = DecisionLog & {
  id: string;
  timestamp: number;
};

const LogEntry = React.memo(({ log }: { log: LogItem }) => {
  const levelClass = `level-${log.fields.decision || "none"}`;

  return (
    <div className="debug-log-item" data-testid="debug-log-item">
      <div className="debug-log-header">
        <span className={`debug-log-level ${levelClass}`}>{log.fields.decision || "NONE"}</span>
        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
      </div>
      <div className="debug-log-content">
        <strong>Topic:</strong> {log.fields.topic}
        <br />
        <strong>Action:</strong> {log.fields.action}
        <br />
        <strong>Bias Score:</strong> {log.fields.biasScore.toFixed(3)} (User:{" "}
        {log.fields.userBias.toFixed(3)})<br />
        <strong>Distance:</strong> {log.fields.distance.toFixed(3)}
      </div>
      <div className="debug-log-meta">
        Fallacies: {log.fields.fallacyCount} (Weighted: {log.fields.weightedFallacyScore})
      </div>
    </div>
  );
});

export const DebugPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filterText, setFilterText] = useState("");
  const [filterLevel, setFilterLevel] = useState<InterventionLevel | "all">("all");
  const decisionEngineRef = useRef(createDecisionEngine());

  useEffect(() => {
    const handleMessage = (message: unknown) => {
      if (!isExtensionMessage(message)) return;

      if (message.type === MESSAGE_TYPES.ANALYZE_RESULT) {
        const payload = (message as AnalyzeResultMessage).payload;

        void (async () => {
          const userProfile = await getStoredUserProfile();

          const tweetAnalysis: TweetAnalysis = {
            tweetId: payload.tweetId,
            topic: payload.topic,
            confidence: payload.confidence,
            tweetVector: payload.tweetVector,
            fallacies: payload.fallacies,
          };

          const decision = decisionEngineRef.current.evaluateTweet(tweetAnalysis, userProfile);

          const newLog: LogItem = {
            ...decision.log,
            id: payload.tweetId + "-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
          };

          setLogs((prev) => {
            const next = [newLog, ...prev];
            if (next.length > MAX_LOGS) return next.slice(0, MAX_LOGS);
            return next;
          });
        })();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchText =
        log.fields.topic.toLowerCase().includes(filterText.toLowerCase()) ||
        log.fields.action.toLowerCase().includes(filterText.toLowerCase());

      const matchLevel = filterLevel === "all" || log.fields.decision === filterLevel;

      return matchText && matchLevel;
    });
  }, [logs, filterText, filterLevel]);

  return (
    <div className="debug-panel">
      <div className="debug-toolbar">
        <input
          type="text"
          className="debug-search"
          placeholder="Filter logs..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          data-testid="debug-filter-input"
        />
        <select
          className="debug-filter-select"
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value as InterventionLevel | "all")}
          data-testid="debug-level-select"
        >
          <option value="all">All Levels</option>
          <option value="critical">Critical</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">None</option>
        </select>
        <button
          className="debug-action-button"
          onClick={() => setLogs([])}
          data-testid="debug-clear-button"
        >
          Clear
        </button>
      </div>

      <div className="debug-log-container" data-testid="debug-log-container">
        {filteredLogs.length === 0 ? (
          <div className="debug-empty-state">No logs to display</div>
        ) : (
          filteredLogs.map((log) => <LogEntry key={log.id} log={log} />)
        )}
      </div>
    </div>
  );
};
