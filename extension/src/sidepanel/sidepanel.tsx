import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

import { sendQuizCompleted, sendSettingsUpdated } from "../messaging/runtime.js";
import {
  clearQuizResult,
  createQuizResult,
  getStoredQuizResult,
  storeQuizResult,
  type QuizAnswer,
} from "../lib/quiz-scorer.js";
import type { LikertValue } from "../lib/quiz-data.js";
import { QUIZ_QUESTION_COUNT } from "../lib/quiz-data.js";

import { ManualEntry } from "./ManualEntry.js";
import { QuizContainer } from "./QuizContainer.js";
import { QuizResults } from "./QuizResults.js";
import { LLMConfig } from "./LLMConfig.js";
import { DebugPanel } from "./DebugPanel.js";
import { SiteToggle } from "../components/Settings/SiteToggle.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import "./sidepanel.css";

type Tab = "quiz" | "debug" | "settings";
type QuizState = "onboarding" | "intro" | "quiz" | "manual" | "results";

type UserVector = {
  social: number;
  economic: number;
  populist: number;
  x: number;
  y: number;
};

type FeedbackHistoryItem = {
  id: string;
  tweetId: string;
  feedback: "acknowledged" | "agreed" | "dismissed";
  timestamp: string;
  beforeVector: { social: number; economic: number; populist: number };
  afterVector: { social: number; economic: number; populist: number };
  syncAttempts: number;
};

export function SidePanel(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>("quiz");
  const [quizState, setQuizState] = useState<QuizState>("intro");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, LikertValue>>(new Map());
  const [userVector, setUserVector] = useState<UserVector | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [isPrivacyActionRunning, setIsPrivacyActionRunning] = useState(false);
  const [vectorHistory, setVectorHistory] = useState<FeedbackHistoryItem[]>([]);
  const [isFromOnboarding, setIsFromOnboarding] = useState(false);

  useEffect(() => {
    const loadStoredData = async () => {
      const [storageResult, quizResult] = await Promise.all([
        chrome.storage.local.get(["userVector", "vectorHistory", "isFirstInstall"]),
        getStoredQuizResult(),
      ]);

      if (storageResult.userVector) {
        setUserVector(storageResult.userVector);
      }

      if (Array.isArray(storageResult.vectorHistory)) {
        setVectorHistory(storageResult.vectorHistory);
      }

      if (storageResult.isFirstInstall === true) {
        setQuizState("onboarding");
      } else if (quizResult) {
        setUserVector({
          social: quizResult.vector.social,
          economic: quizResult.vector.economic,
          populist: quizResult.vector.populist,
          x: quizResult.vector.social,
          y: quizResult.vector.economic,
        });
        setQuizState("results");
      }

      setIsLoading(false);
    };

    loadStoredData();
  }, []);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local") {
        return;
      }

      const userVectorChange = changes.userVector;
      if (userVectorChange?.newValue) {
        setUserVector(userVectorChange.newValue as UserVector);
      }

      const vectorHistoryChange = changes.vectorHistory;
      if (Array.isArray(vectorHistoryChange?.newValue)) {
        setVectorHistory(vectorHistoryChange.newValue as FeedbackHistoryItem[]);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const handleStartQuiz = useCallback(() => {
    setQuizState("quiz");
    setCurrentQuestionIndex(0);
    setAnswers(new Map());
  }, []);

  const handleStartQuizFromOnboarding = useCallback(async () => {
    await chrome.storage.local.remove("isFirstInstall");
    setIsFromOnboarding(true);
    setQuizState("quiz");
    setCurrentQuestionIndex(0);
    setAnswers(new Map());
  }, []);

  const handleSkipOnboarding = useCallback(async () => {
    await chrome.storage.local.remove("isFirstInstall");
    setQuizState("intro");
  }, []);

  const handleAnswer = useCallback((questionId: number, value: LikertValue) => {
    setAnswers((prev) => new Map(prev).set(questionId, value));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.min(prev + 1, QUIZ_QUESTION_COUNT - 1));
  }, []);

  const handlePrevious = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const syncToBackend = useCallback(
    async (vector: { social: number; economic: number; populist: number }) => {
      try {
        const stored = await chrome.storage.local.get([
          "backendUrl",
          "apiKey",
          "authToken",
          "accessToken",
        ]);
        const backendUrl = (stored.backendUrl as string | undefined) ?? "http://localhost:3001";
        const apiKey = (stored.apiKey as string | undefined) ?? "";
        const rawToken = (
          (stored.authToken as string | undefined) ??
          (stored.accessToken as string | undefined) ??
          ""
        )
          .trim()
          .replace(/^Bearer\s+/i, "");

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (apiKey.length > 0) {
          headers["X-API-Key"] = apiKey;
        }

        if (rawToken.length > 0) {
          headers.Authorization = `Bearer ${rawToken}`;
        }

        const response = await fetch(`${backendUrl}/api/quiz/score`, {
          method: "POST",
          headers,
          body: JSON.stringify(vector),
        });

        if (!response.ok) {
          console.warn("Backend sync failed:", response.status);
        }
      } catch (error) {
        console.warn("Backend sync error:", error);
      }
    },
    []
  );

  const handleComplete = useCallback(async () => {
    const quizAnswers: QuizAnswer[] = Array.from(answers.entries()).map(([questionId, value]) => ({
      questionId,
      value,
    }));

    const result = createQuizResult(quizAnswers);

    await storeQuizResult(result);

    const vector = {
      social: result.vector.social,
      economic: result.vector.economic,
      populist: result.vector.populist,
      x: result.vector.social,
      y: result.vector.economic,
    };

    await chrome.storage.local.set({ userVector: vector });

    await sendQuizCompleted({
      social: result.vector.social,
      economic: result.vector.economic,
      populist: result.vector.populist,
    });

    await syncToBackend(result.vector);

    setUserVector(vector);
    setQuizState("results");
  }, [answers, syncToBackend]);

  const handleManualEntry = useCallback(() => {
    setQuizState("manual");
  }, []);

  const handleManualSubmit = useCallback(
    async (vector: { social: number; economic: number; populist: number }) => {
      const fullVector = {
        ...vector,
        x: vector.social,
        y: vector.economic,
      };

      await chrome.storage.local.set({ userVector: fullVector });

      await sendQuizCompleted(vector);

      await syncToBackend(vector);

      await storeQuizResult({
        vector,
        completedAt: new Date().toISOString(),
        answers: [],
      });

      setUserVector(fullVector);
      setQuizState("results");
    },
    [syncToBackend]
  );

  const handleRetake = useCallback(async () => {
    await clearQuizResult();
    setAnswers(new Map());
    setCurrentQuestionIndex(0);
    setQuizState("quiz");
  }, []);

  const handleContinue = useCallback(() => {
    setActiveTab("debug");
  }, []);

  const handleCancelManual = useCallback(() => {
    if (answers.size > 0) {
      setQuizState("quiz");
    } else {
      setQuizState("intro");
    }
  }, [answers.size]);

  const handleSettingsSync = useCallback(async () => {
    await sendSettingsUpdated({
      isEnabled: true,
      sensitivity: "medium",
    });
  }, []);

  const getBackendRequestConfig = useCallback(async () => {
    const stored = await chrome.storage.local.get([
      "backendUrl",
      "apiKey",
      "authToken",
      "accessToken",
    ]);
    const backendUrl = (stored.backendUrl as string | undefined) ?? "http://localhost:3001";
    const apiKey = (stored.apiKey as string | undefined) ?? "";
    const rawToken = (
      (stored.authToken as string | undefined) ??
      (stored.accessToken as string | undefined) ??
      ""
    )
      .trim()
      .replace(/^Bearer\s+/i, "");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey.length > 0) {
      headers["X-API-Key"] = apiKey;
    }

    if (rawToken.length > 0) {
      headers.Authorization = `Bearer ${rawToken}`;
    }

    return { backendUrl, headers, hasAuthToken: rawToken.length > 0 };
  }, []);

  const readErrorMessage = useCallback(async (response: Response) => {
    const fallback = `Request failed (${response.status})`;

    try {
      const data = (await response.json()) as {
        error?: {
          message?: unknown;
        };
      };

      if (typeof data.error?.message === "string" && data.error.message.length > 0) {
        return data.error.message;
      }
    } catch {
      return fallback;
    }

    return fallback;
  }, []);

  const handleExportData = useCallback(async () => {
    setPrivacyError(null);
    setPrivacyStatus(null);
    setIsPrivacyActionRunning(true);

    try {
      const { backendUrl, headers, hasAuthToken } = await getBackendRequestConfig();
      if (!hasAuthToken) {
        throw new Error("Missing auth token in storage (authToken or accessToken)");
      }

      const response = await fetch(`${backendUrl}/api/user/export`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as Record<string, unknown>;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const filename = `ragebaiter-export-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);

      setPrivacyStatus("Export downloaded successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export data";
      setPrivacyError(message);
    } finally {
      setIsPrivacyActionRunning(false);
    }
  }, [getBackendRequestConfig, readErrorMessage]);

  const handleDeleteData = useCallback(async () => {
    setPrivacyError(null);
    setPrivacyStatus(null);

    const confirmed = window.confirm("Delete all your data? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setIsPrivacyActionRunning(true);

    try {
      const { backendUrl, headers, hasAuthToken } = await getBackendRequestConfig();
      if (!hasAuthToken) {
        throw new Error("Missing auth token in storage (authToken or accessToken)");
      }

      const response = await fetch(`${backendUrl}/api/user/delete`, {
        method: "DELETE",
        headers,
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(await readErrorMessage(response));
      }

      await chrome.storage.local.clear();
      setUserVector(null);
      setVectorHistory([]);
      setPrivacyStatus("All data deleted successfully. Reloading...");

      setTimeout(() => {
        globalThis.location.reload();
      }, 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete data";
      setPrivacyError(message);
    } finally {
      setIsPrivacyActionRunning(false);
    }
  }, [getBackendRequestConfig, readErrorMessage]);

  const renderQuizContent = () => {
    if (isLoading) {
      return <div className="tab-content">Loading...</div>;
    }

    switch (quizState) {
      case "onboarding":
        return (
          <div className="tab-content">
            <div className="onboarding-screen">
              <div className="onboarding-icon">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </div>
              <h2 className="onboarding-title">Welcome to RageBaiter</h2>
              <p className="onboarding-description">
                RageBaiter monitors your Twitter feed and nudges you when it detects echo chamber
                content. To personalize your experience, take a 2-minute political compass quiz.
              </p>
              <div className="onboarding-features">
                <div className="onboarding-feature">
                  <span className="onboarding-feature-icon">🎯</span>
                  <span>Personalized interventions</span>
                </div>
                <div className="onboarding-feature">
                  <span className="onboarding-feature-icon">🧠</span>
                  <span>Bias detection</span>
                </div>
                <div className="onboarding-feature">
                  <span className="onboarding-feature-icon">💬</span>
                  <span>Socratic prompts</span>
                </div>
              </div>
              <button
                type="button"
                className="action-button primary onboarding-cta"
                onClick={handleStartQuizFromOnboarding}
                data-testid="onboarding-start-quiz-button"
              >
                Take the Quiz →
              </button>
              <button
                type="button"
                className="quiz-skip-link"
                onClick={handleSkipOnboarding}
                data-testid="onboarding-skip-button"
              >
                Skip for now
              </button>
            </div>
          </div>
        );

      case "intro":
        return (
          <div className="tab-content">
            <h2>Political Compass Quiz</h2>
            <p className="placeholder-text">
              Take an 18-question quiz to determine your position across three political axes:
              Social, Economic, and Populist.
            </p>
            <button
              type="button"
              className="action-button primary"
              onClick={handleStartQuiz}
              data-testid="quiz-start-button"
            >
              Start Quiz
            </button>
            <button
              type="button"
              className="quiz-skip-link"
              onClick={handleManualEntry}
              data-testid="quiz-skip-intro-button"
            >
              Or enter manually
            </button>
          </div>
        );

      case "quiz":
        return (
          <div className="tab-content">
            <QuizContainer
              currentQuestionIndex={currentQuestionIndex}
              answers={answers}
              onAnswer={handleAnswer}
              onNext={handleNext}
              onPrevious={handlePrevious}
              onComplete={handleComplete}
              onSkip={handleManualEntry}
            />
          </div>
        );

      case "manual":
        return (
          <div className="tab-content">
            <ManualEntry onSubmit={handleManualSubmit} onCancel={handleCancelManual} />
          </div>
        );

      case "results":
        return (
          <div className="tab-content">
            {isFromOnboarding && (
              <div className="onboarding-success-banner">
                <p>
                  <strong>You&apos;re all set!</strong> RageBaiter will now analyze tweets as you
                  scroll. Head to{" "}
                  <a
                    href="https://twitter.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="onboarding-link"
                  >
                    Twitter
                  </a>{" "}
                  to see your first intervention.
                </p>
              </div>
            )}
            {userVector && (
              <>
                <QuizResults
                  social={userVector.social}
                  economic={userVector.economic}
                  populist={userVector.populist}
                  onRetake={handleRetake}
                  onContinue={handleContinue}
                />
                <section className="settings-section" data-testid="vector-history-panel">
                  <h3>Vector Drift History</h3>
                  {vectorHistory.length === 0 ? (
                    <p className="setting-hint" data-testid="vector-history-empty">
                      No feedback drift events yet.
                    </p>
                  ) : (
                    <div className="vector-history-list">
                      {[...vectorHistory]
                        .reverse()
                        .slice(0, 8)
                        .map((item) => (
                          <article
                            key={item.id}
                            className="vector-history-item"
                            data-testid="vector-history-item"
                          >
                            <div className="vector-history-head">
                              <span className="vector-history-feedback">
                                {item.feedback.toUpperCase()}
                              </span>
                              <span className="vector-history-time">
                                {new Date(item.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <p className="vector-history-meta">Tweet {item.tweetId}</p>
                            <p className="vector-history-meta" data-testid="vector-history-after">
                              ({item.afterVector.social.toFixed(2)},{" "}
                              {item.afterVector.economic.toFixed(2)})
                            </p>
                            {item.syncAttempts > 0 && (
                              <p
                                className="vector-history-sync"
                                data-testid="vector-history-retry-status"
                              >
                                Pending sync (attempts: {item.syncAttempts})
                              </p>
                            )}
                          </article>
                        ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="sidepanel-container">
      <header className="sidepanel-header">
        <h1>RageBaiter</h1>
        {userVector && (
          <div className="vector-badge">
            <span className="vector-label">Your Position</span>
            <span className="vector-value" data-testid="user-vector-badge">
              ({userVector.x.toFixed(2)}, {userVector.y.toFixed(2)})
            </span>
          </div>
        )}
      </header>

      <nav className="sidepanel-tabs">
        <button
          type="button"
          className={`tab-button ${activeTab === "quiz" ? "active" : ""}`}
          onClick={() => setActiveTab("quiz")}
        >
          Political Quiz
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "debug" ? "active" : ""}`}
          onClick={() => setActiveTab("debug")}
        >
          Debug Panel
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          Settings
        </button>
      </nav>

      <main className={`sidepanel-content ${activeTab === "debug" ? "no-padding no-scroll" : ""}`}>
        {activeTab === "quiz" && renderQuizContent()}

        {activeTab === "debug" && <DebugPanel />}

        {activeTab === "settings" && (
          <div className="tab-content">
            <h2>Settings</h2>

            <SiteToggle />

            <LLMConfig />

            <div className="settings-section">
              <h3>Privacy</h3>
              <button type="button" className="action-button primary" onClick={handleSettingsSync}>
                Sync Settings
              </button>
              <button
                type="button"
                className="action-button secondary"
                onClick={handleExportData}
                disabled={isPrivacyActionRunning}
              >
                {isPrivacyActionRunning ? "Working..." : "Export My Data"}
              </button>
              <button
                type="button"
                className="action-button danger"
                onClick={handleDeleteData}
                disabled={isPrivacyActionRunning}
              >
                Delete All Data
              </button>
              <p className="setting-hint privacy-hint">
                Requires stored bearer token in <code>authToken</code> or <code>accessToken</code>.
              </p>
              {privacyStatus && <p className="privacy-status privacy-success">{privacyStatus}</p>}
              {privacyError && <p className="privacy-status privacy-error">{privacyError}</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <ErrorBoundary>
      <SidePanel />
    </ErrorBoundary>
  );
}
