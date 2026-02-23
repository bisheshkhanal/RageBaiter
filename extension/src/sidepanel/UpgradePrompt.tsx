import React, { useState } from "react";
import { storeByokKey, type ByokProvider } from "../lib/llm-config.js";

type UpgradePromptProps = {
  quota: { used: number; limit: number; resetsAt: string };
  onDismiss: () => void;
  onKeyConnected: () => void;
};

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  quota,
  onDismiss,
  onKeyConnected,
}) => {
  const [provider, setProvider] = useState<ByokProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      await storeByokKey(provider, apiKey.trim());
      onKeyConnected();
    } catch (err) {
      setError("Failed to save API key. Please try again.");
      console.error("[UpgradePrompt] Error saving BYOK key:", err);
    } finally {
      setIsConnecting(false);
    }
  };

  const formattedDate = new Date(quota.resetsAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">Deep Analysis Limit Reached</h2>
            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 mb-2">
            <div className="flex justify-between items-end mb-2">
              <span className="text-sm font-medium text-slate-600">Phase 2 Quota</span>
              <span className="text-sm font-bold text-slate-800">
                {quota.used} / {quota.limit} used
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
              <div
                className="bg-amber-500 h-2.5 rounded-full"
                style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }}
              ></div>
            </div>
            <p className="text-xs text-slate-500">Resets on {formattedDate}</p>
          </div>
        </div>

        <div className="p-6 bg-slate-50 flex-1">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">
            Bring Your Own Key (BYOK) to continue
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Connect your own API key to bypass limits and continue using deep analysis.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="provider" className="block text-xs font-medium text-slate-700 mb-1">
                Provider
              </label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as ByokProvider)}
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google (Gemini)</option>
              </select>
            </div>

            <div>
              <label htmlFor="apiKey" className="block text-xs font-medium text-slate-700 mb-1">
                API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${provider === "google" ? "Google" : provider === "openai" ? "OpenAI" : "Anthropic"} API key`}
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
            >
              {isConnecting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                "Connect Key"
              )}
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-white text-center">
          <button
            onClick={onDismiss}
            className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            Continue with Phase 1 only
          </button>
        </div>
      </div>
    </div>
  );
};
