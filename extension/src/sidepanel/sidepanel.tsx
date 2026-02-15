import React from 'react';
import ReactDOM from 'react-dom/client';
import './sidepanel.css';

type Tab = 'quiz' | 'debug' | 'settings';

function SidePanel(): React.ReactElement {
  const [activeTab, setActiveTab] = React.useState<Tab>('quiz');
  const [userVector, setUserVector] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    chrome.storage.local.get(['userVector']).then((result) => {
      if (result.userVector) {
        setUserVector(result.userVector);
      }
    });
  }, []);

  return (
    <div className="sidepanel-container">
      <header className="sidepanel-header">
        <h1>RageBaiter</h1>
        {userVector && (
          <div className="vector-badge">
            <span className="vector-label">Your Position</span>
            <span className="vector-value">
              ({userVector.x.toFixed(2)}, {userVector.y.toFixed(2)})
            </span>
          </div>
        )}
      </header>

      <nav className="sidepanel-tabs">
        <button
          type="button"
          className={`tab-button ${activeTab === 'quiz' ? 'active' : ''}`}
          onClick={() => setActiveTab('quiz')}
        >
          Political Quiz
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'debug' ? 'active' : ''}`}
          onClick={() => setActiveTab('debug')}
        >
          Debug Panel
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </nav>

      <main className="sidepanel-content">
        {activeTab === 'quiz' && (
          <div className="tab-content">
            <h2>Political Compass Quiz</h2>
            <p className="placeholder-text">
              Take a 15-20 question quiz to determine your political position.
            </p>
            <button type="button" className="action-button primary" disabled>
              Start Quiz (Coming Soon)
            </button>
          </div>
        )}

        {activeTab === 'debug' && (
          <div className="tab-content">
            <h2>Debug Panel</h2>
            <div className="debug-section">
              <h3>Recent Analyses</h3>
              <p className="placeholder-text">No analyses recorded yet.</p>
            </div>
            <div className="debug-section">
              <h3>Cache Statistics</h3>
              <div className="stat-grid">
                <div className="stat-card">
                  <span className="stat-label">Cache Hits</span>
                  <span className="stat-value">0</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Cache Misses</span>
                  <span className="stat-value">0</span>
                </div>
              </div>
            </div>
            <div className="debug-section">
              <h3>Token Usage</h3>
              <p className="placeholder-text">No token usage recorded.</p>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tab-content">
            <h2>Settings</h2>
            
            <div className="settings-section">
              <h3>LLM Provider</h3>
              <div className="setting-item">
                <label htmlFor="provider-select">Provider</label>
                <select id="provider-select" className="setting-select" disabled>
                  <option>Gemini (Default)</option>
                  <option>OpenAI</option>
                  <option>Anthropic</option>
                </select>
              </div>
              <div className="setting-item">
                <label htmlFor="api-key">API Key</label>
                <input
                  id="api-key"
                  type="password"
                  placeholder="Enter your API key"
                  className="setting-input"
                  disabled
                />
                <p className="setting-hint">Your API key is stored locally only.</p>
              </div>
            </div>

            <div className="settings-section">
              <h3>Sensitivity</h3>
              <div className="setting-item">
                <label htmlFor="sensitivity-select">Detection Level</label>
                <select id="sensitivity-select" className="setting-select" disabled>
                  <option>Low</option>
                  <option selected>Medium</option>
                  <option>High</option>
                </select>
              </div>
            </div>

            <div className="settings-section">
              <h3>Privacy</h3>
              <button type="button" className="action-button secondary" disabled>
                Export My Data
              </button>
              <button type="button" className="action-button danger" disabled>
                Delete All Data
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<SidePanel />);
}
