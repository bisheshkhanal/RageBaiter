import React, { useCallback, useEffect, useState } from "react";

import {
  LLM_PROVIDERS,
  type LlmConfig,
  type LlmConnectionStatus,
  type LlmModel,
  type LlmProvider,
  type LlmUsageStats,
  formatApiKeyDisplay,
  getDefaultModelForProvider,
  getLlmConfig,
  getLlmConnectionStatus,
  getLlmUsageStats,
  getModelsForProvider,
  isValidProvider,
  resetLlmUsageStats,
  storeLlmConfig,
} from "../lib/llm-config.js";
import {
  sendLlmConfigUpdated,
  sendLlmConnectionTest,
  sendLlmCredentialsCleared,
} from "../messaging/runtime.js";

const DEFAULT_USAGE: LlmUsageStats = {
  totalRequests: 0,
  totalTokens: 0,
  estimatedCost: 0,
  lastResetDate: new Date().toISOString(),
};

const DEFAULT_CONNECTION_STATUS: LlmConnectionStatus = {
  status: "untested",
};

export type LLMConfigProps = {
  onConfigChange?: (config: LlmConfig) => void;
};

export function LLMConfig({ onConfigChange }: LLMConfigProps): React.ReactElement {
  const [config, setConfig] = useState<LlmConfig>({
    provider: "internal",
    model: "",
    apiKey: undefined,
    customBaseUrl: undefined,
    useFallback: true,
  });

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [customUrlInput, setCustomUrlInput] = useState("");
  const [availableModels, setAvailableModels] = useState<LlmModel[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<LlmConnectionStatus>(DEFAULT_CONNECTION_STATUS);
  const [usage, setUsage] = useState<LlmUsageStats>(DEFAULT_USAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [storedConfig, storedStatus, storedUsage] = await Promise.all([
          getLlmConfig(),
          getLlmConnectionStatus(),
          getLlmUsageStats(),
        ]);

        setConfig(storedConfig);
        setApiKeyInput(storedConfig.apiKey || "");
        setCustomUrlInput(storedConfig.customBaseUrl || "");
        setConnectionStatus(storedStatus);
        setUsage(storedUsage);

        if (storedConfig.provider !== "internal" && storedConfig.provider !== "custom") {
          setAvailableModels(getModelsForProvider(storedConfig.provider));
        }
      } catch (error) {
        console.error("Failed to load LLM config:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadConfig();
  }, []);

  const handleProviderChange = useCallback((provider: string) => {
    if (!isValidProvider(provider)) return;

    const newProvider = provider as LlmProvider;
    const newModel = newProvider === "internal" ? "" : getDefaultModelForProvider(newProvider);

    setConfig((prev) => ({
      ...prev,
      provider: newProvider,
      model: newModel,
      apiKey: newProvider === "internal" ? undefined : prev.apiKey,
      customBaseUrl: newProvider === "custom" ? prev.customBaseUrl : undefined,
    }));

    if (newProvider !== "internal" && newProvider !== "custom") {
      setAvailableModels(getModelsForProvider(newProvider));
    } else {
      setAvailableModels([]);
    }

    setConnectionStatus(DEFAULT_CONNECTION_STATUS);
    setHasChanges(true);
  }, []);

  const handleModelChange = useCallback((model: string) => {
    setConfig((prev) => ({ ...prev, model }));
    setHasChanges(true);
  }, []);

  const handleApiKeyChange = useCallback((value: string) => {
    setApiKeyInput(value);
    setConfig((prev) => ({ ...prev, apiKey: value || undefined }));
    setHasChanges(true);
  }, []);

  const handleCustomUrlChange = useCallback((value: string) => {
    setCustomUrlInput(value);
    setConfig((prev) => ({ ...prev, customBaseUrl: value || undefined }));
    setHasChanges(true);
  }, []);

  const handleFallbackChange = useCallback((useFallback: boolean) => {
    setConfig((prev) => ({ ...prev, useFallback }));
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    try {
      await storeLlmConfig(config);
      await sendLlmConfigUpdated(config);
      setHasChanges(false);
      onConfigChange?.(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save configuration";
      setSaveError(message);
    }
  }, [config, onConfigChange]);

  const handleTestConnection = useCallback(async () => {
    if (config.provider === "internal") return;

    setIsTesting(true);
    setConnectionStatus({ status: "testing" });

    try {
      const result = await sendLlmConnectionTest({
        provider: config.provider,
        model: config.model,
        apiKey: config.apiKey,
        customBaseUrl: config.customBaseUrl,
      });

      if (result.ok && "payload" in result && result.payload) {
        const testResult = result.payload as {
          success: boolean;
          message: string;
          latencyMs: number;
        };
        setConnectionStatus({
          status: testResult.success ? "connected" : "error",
          message: `${testResult.message} (${testResult.latencyMs}ms)`,
          lastTested: new Date(),
        });
      } else if (!result.ok) {
        setConnectionStatus({
          status: "error",
          message: result.error,
          lastTested: new Date(),
        });
      }
    } catch (error) {
      setConnectionStatus({
        status: "error",
        message: error instanceof Error ? error.message : "Connection test failed",
        lastTested: new Date(),
      });
    } finally {
      setIsTesting(false);
    }
  }, [config]);

  const handleClearCredentials = useCallback(async () => {
    if (
      !window.confirm(
        "Are you sure you want to clear all LLM credentials? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      await sendLlmCredentialsCleared();
      setConfig({
        provider: "internal",
        model: "",
        apiKey: undefined,
        customBaseUrl: undefined,
        useFallback: true,
      });
      setApiKeyInput("");
      setCustomUrlInput("");
      setConnectionStatus(DEFAULT_CONNECTION_STATUS);
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to clear credentials:", error);
    }
  }, []);

  const handleResetUsage = useCallback(async () => {
    await resetLlmUsageStats();
    setUsage(DEFAULT_USAGE);
  }, []);

  const formatCost = (cost: number): string => {
    if (cost < 0.01) return `< $0.01`;
    return `$${cost.toFixed(2)}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="settings-section">
        <h3>LLM Configuration</h3>
        <p className="setting-hint">Loading configuration...</p>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h3>LLM Configuration</h3>

      {saveError && (
        <div className="llm-error-banner" data-testid="llm-save-error">
          {saveError}
        </div>
      )}

      <div className="setting-item">
        <label htmlFor="llm-provider">Provider</label>
        <select
          id="llm-provider"
          data-testid="llm-provider-select"
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="setting-select"
        >
          {LLM_PROVIDERS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <p className="setting-hint">
          {config.provider === "internal"
            ? "Uses the internal API (no personal API key required)"
            : "Connect your own API key for Socratic interventions"}
        </p>
      </div>

      {config.provider !== "internal" && (
        <>
          <div className="setting-item">
            <label htmlFor="llm-model">Model</label>
            <select
              id="llm-model"
              data-testid="llm-model-select"
              value={config.model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="setting-select"
            >
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} (~${model.estimatedCostPer1kTokens}/1k tokens)
                </option>
              ))}
            </select>
          </div>

          <div className="setting-item">
            <label htmlFor="llm-api-key">
              API Key
              {config.apiKey && (
                <span className="llm-key-indicator" data-testid="llm-key-stored">
                  (Stored: {formatApiKeyDisplay(config.apiKey)})
                </span>
              )}
            </label>
            <input
              id="llm-api-key"
              data-testid="llm-api-key-input"
              type="password"
              value={apiKeyInput}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder={`Enter your ${LLM_PROVIDERS.find((p) => p.id === config.provider)?.name} API key`}
              className="setting-input"
            />
            <p className="setting-hint">
              Your API key is stored locally in Chrome&apos;s encrypted storage and is never sent to
              our servers.
            </p>
          </div>

          {config.provider === "custom" && (
            <div className="setting-item">
              <label htmlFor="llm-custom-url">Custom Base URL</label>
              <input
                id="llm-custom-url"
                data-testid="llm-custom-url-input"
                type="url"
                value={customUrlInput}
                onChange={(e) => handleCustomUrlChange(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="setting-input"
              />
            </div>
          )}

          <div className="setting-item">
            <button
              type="button"
              data-testid="llm-test-connection"
              onClick={handleTestConnection}
              disabled={isTesting || !config.apiKey}
              className={`action-button ${connectionStatus.status === "connected" ? "success" : "primary"}`}
            >
              {isTesting
                ? "Testing..."
                : connectionStatus.status === "connected"
                  ? "Test Again"
                  : "Test Connection"}
            </button>

            {connectionStatus.status === "connected" && (
              <div className="llm-status-success" data-testid="llm-connection-success">
                ✓ Connected{connectionStatus.message ? `: ${connectionStatus.message}` : ""}
              </div>
            )}

            {connectionStatus.status === "error" && (
              <div className="llm-status-error" data-testid="llm-connection-error">
                ✗ Error{connectionStatus.message ? `: ${connectionStatus.message}` : ""}
              </div>
            )}
          </div>
        </>
      )}

      <div className="setting-item">
        <label className="llm-checkbox-label">
          <input
            type="checkbox"
            data-testid="llm-fallback-toggle"
            checked={config.useFallback}
            onChange={(e) => handleFallbackChange(e.target.checked)}
          />
          Allow fallback to internal API
        </label>
        <p className="setting-hint">
          When enabled, requests will use the internal API if your configured provider fails. Note:
          Internal API requests are processed on our servers with privacy implications.
        </p>
      </div>

      {config.provider === "internal" && (
        <div className="llm-privacy-notice" data-testid="llm-privacy-notice">
          <strong>Privacy Notice:</strong> Using the internal API means tweet content is sent to our
          servers for analysis. We do not store tweet content permanently, but it is processed
          externally. For maximum privacy, configure your own API key.
        </div>
      )}

      <div className="llm-usage-section">
        <h4>Usage Statistics</h4>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">Requests</span>
            <span className="stat-value" data-testid="llm-usage-requests">
              {usage.totalRequests}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Tokens</span>
            <span className="stat-value" data-testid="llm-usage-tokens">
              {usage.totalTokens.toLocaleString()}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Est. Cost</span>
            <span className="stat-value" data-testid="llm-usage-cost">
              {formatCost(usage.estimatedCost)}
            </span>
          </div>
        </div>
        <p className="setting-hint">Since {formatDate(usage.lastResetDate)}</p>
        <button
          type="button"
          onClick={handleResetUsage}
          className="action-button secondary"
          data-testid="llm-reset-usage"
        >
          Reset Statistics
        </button>
      </div>

      <div className="llm-actions">
        <button
          type="button"
          data-testid="llm-save-config"
          onClick={handleSave}
          disabled={!hasChanges}
          className="action-button primary"
        >
          Save Configuration
        </button>

        <button
          type="button"
          data-testid="llm-clear-credentials"
          onClick={handleClearCredentials}
          className="action-button danger"
        >
          Clear Credentials
        </button>
      </div>

      {hasChanges && (
        <p className="llm-unsaved-warning" data-testid="llm-unsaved-warning">
          You have unsaved changes. Click &quot;Save Configuration&quot; to apply them.
        </p>
      )}
    </div>
  );
}
