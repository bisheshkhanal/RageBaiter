import React from "react";
import ReactDOM from "react-dom/client";
import { sendSettingsUpdated } from "../messaging/runtime.js";
import "./popup.css";

function Popup(): React.ReactElement {
  const [isEnabled, setIsEnabled] = React.useState(true);
  const [analysisCount, setAnalysisCount] = React.useState(0);

  React.useEffect(() => {
    chrome.storage.local.get(["isEnabled", "analysisCount"]).then((result) => {
      setIsEnabled(result.isEnabled ?? true);
      setAnalysisCount(result.analysisCount ?? 0);
    });
  }, []);

  const handleToggle = async () => {
    const newEnabled = !isEnabled;
    await chrome.storage.local.set({ isEnabled: newEnabled });
    await sendSettingsUpdated({
      isEnabled: newEnabled,
      sensitivity: "medium",
    });
    setIsEnabled(newEnabled);
  };

  const openSidePanel = async () => {
    await chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
  };

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>RageBaiter</h1>
        <p className="popup-subtitle">Echo chamber & fallacy detector</p>
      </header>

      <div className="popup-content">
        <div className="toggle-section">
          <label className="toggle-label">
            <span>Extension Enabled</span>
            <button
              type="button"
              className={`toggle-button ${isEnabled ? "enabled" : "disabled"}`}
              onClick={handleToggle}
            >
              {isEnabled ? "ON" : "OFF"}
            </button>
          </label>
        </div>

        <div className="stats-section">
          <div className="stat-item">
            <span className="stat-value">{analysisCount}</span>
            <span className="stat-label">Tweets analyzed</span>
          </div>
        </div>

        <div className="actions-section">
          <button type="button" className="action-button primary" onClick={openSidePanel}>
            Open Side Panel
          </button>
        </div>
      </div>

      <footer className="popup-footer">
        <a
          href="https://github.com/ragebaiter"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          GitHub
        </a>
        <span className="footer-divider">|</span>
        <span className="footer-version">v0.0.1</span>
      </footer>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(<Popup />);
}
