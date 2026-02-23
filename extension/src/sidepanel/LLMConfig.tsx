import React, { useState, useEffect } from "react";
import {
  storeByokKey,
  getAllByokKeys,
  clearByokKey,
  type ByokProvider,
} from "../lib/llm-config.js";

type SavedKeys = Record<ByokProvider, string | undefined>;

const PROVIDER_OPTIONS: { value: ByokProvider; label: string; model: string }[] = [
  { value: "openai", label: "OpenAI", model: "gpt-4o-mini" },
  { value: "anthropic", label: "Anthropic", model: "Claude 3.5 Sonnet" },
  { value: "google", label: "Google", model: "Gemini 2.0 Flash" },
];

export function LLMConfig(): React.ReactElement {
  const [provider, setProvider] = useState<ByokProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savedKeys, setSavedKeys] = useState<SavedKeys>({
    openai: undefined,
    anthropic: undefined,
    google: undefined,
  });
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadSavedKeys = async () => {
      const keys = await getAllByokKeys();
      setSavedKeys(keys);
    };
    loadSavedKeys();
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      setFeedback({ type: "error", message: "Please enter an API key" });
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      await storeByokKey(provider, apiKey.trim());
      const keys = await getAllByokKeys();
      setSavedKeys(keys);
      setApiKey("");
      setShowKey(false);
      setFeedback({
        type: "success",
        message: `${PROVIDER_OPTIONS.find((o) => o.value === provider)?.label} key saved`,
      });
    } catch {
      setFeedback({ type: "error", message: "Failed to save key" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveKey = async (p: ByokProvider) => {
    setIsLoading(true);
    setFeedback(null);

    try {
      await clearByokKey(p);
      const keys = await getAllByokKeys();
      setSavedKeys(keys);
      setFeedback({
        type: "success",
        message: `${PROVIDER_OPTIONS.find((o) => o.value === p)?.label} key removed`,
      });
    } catch {
      setFeedback({ type: "error", message: "Failed to remove key" });
    } finally {
      setIsLoading(false);
    }
  };

  const hasAnyKey = Object.values(savedKeys).some((k) => k);

  return (
    <div className="settings-section">
      <h3>AI Analysis</h3>
      <div className="llm-notice">
        <p>Powered by internal AI — no API key required for basic analysis.</p>
      </div>

      <div className="byok-section" style={{ marginTop: "1rem" }}>
        <h4>Phase 2 Analysis (BYOK)</h4>
        <p className="setting-hint">
          Connect your own API key for unlimited deep analysis. Your key is stored locally and never
          sent to our servers.
        </p>

        {hasAnyKey && (
          <div className="saved-keys-list" style={{ marginBottom: "1rem" }}>
            <p className="setting-hint">Connected keys:</p>
            {PROVIDER_OPTIONS.filter((o) => savedKeys[o.value]).map((option) => (
              <div
                key={option.value}
                className="saved-key-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem",
                  background: "var(--color-bg-secondary, #f3f4f6)",
                  borderRadius: "0.375rem",
                  marginBottom: "0.5rem",
                }}
              >
                <span>
                  <strong>{option.label}</strong> ({option.model})
                </span>
                <button
                  type="button"
                  className="action-button secondary"
                  onClick={() => handleRemoveKey(option.value)}
                  disabled={isLoading}
                  style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          className="byok-form"
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <div>
            <label htmlFor="byok-provider" className="setting-label">
              Provider
            </label>
            <select
              id="byok-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ByokProvider)}
              className="setting-select"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem" }}
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.model})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="byok-key" className="setting-label">
              API Key
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                id="byok-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${PROVIDER_OPTIONS.find((o) => o.value === provider)?.label} API key`}
                className="setting-input"
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--color-border, #d1d5db)",
                }}
              />
              <button
                type="button"
                className="action-button secondary"
                onClick={() => setShowKey(!showKey)}
                style={{ padding: "0.5rem" }}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="button"
            className="action-button primary"
            onClick={handleSaveKey}
            disabled={isLoading || !apiKey.trim()}
          >
            {isLoading ? "Saving..." : "Save Key"}
          </button>

          {feedback && (
            <p
              className={`feedback-message ${feedback.type}`}
              style={{
                padding: "0.5rem",
                borderRadius: "0.375rem",
                background:
                  feedback.type === "success"
                    ? "var(--color-success-bg, #d1fae5)"
                    : "var(--color-error-bg, #fee2e2)",
                color:
                  feedback.type === "success"
                    ? "var(--color-success-text, #065f46)"
                    : "var(--color-error-text, #991b1b)",
              }}
            >
              {feedback.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
