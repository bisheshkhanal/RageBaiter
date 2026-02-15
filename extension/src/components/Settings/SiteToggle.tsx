import React, { useCallback, useEffect, useState } from "react";
import { sendSiteConfigUpdated, sendGlobalPauseToggled } from "../../messaging/runtime.js";
import { siteConfigStorage, type SiteConfigStorage } from "../../lib/site-storage.js";
import {
  type SiteConfiguration,
  type SupportedSite,
  type SiteConfig,
  getEnabledSiteCount,
  hasAnySiteEnabled,
} from "../../lib/site-config.js";
import "./SiteToggle.css";

interface SiteToggleProps {
  storage?: SiteConfigStorage;
}

export function SiteToggle({ storage = siteConfigStorage }: SiteToggleProps): React.ReactElement {
  const [config, setConfig] = useState<SiteConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      const loaded = await storage.getConfig();
      setConfig(loaded);
      setIsLoading(false);
    };

    loadConfig();

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ragebaiter_site_config) {
        setConfig(changes.ragebaiter_site_config.newValue as SiteConfiguration);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [storage]);

  const handleSiteToggle = useCallback(
    async (siteId: SupportedSite, enabled: boolean) => {
      if (!config) return;

      const updated = await storage.updateSiteEnabled(siteId, enabled);
      setConfig(updated);
      await sendSiteConfigUpdated({ siteId, enabled });
    },
    [config, storage]
  );

  const handleGlobalPause = useCallback(async () => {
    if (!config) return;

    const newPaused = config.globalEnabled;
    const updated = await storage.toggleGlobalEnabled();
    setConfig(updated);
    await sendGlobalPauseToggled({ paused: newPaused });
  }, [config, storage]);

  if (isLoading || !config) {
    return <div className="site-toggle-loading">Loading site settings...</div>;
  }

  const enabledCount = getEnabledSiteCount(config);
  const anyEnabled = hasAnySiteEnabled(config);

  return (
    <div className="site-toggle-container">
      <div className="site-toggle-header">
        <h3>Active Sites</h3>
        <span className="site-toggle-count">{enabledCount} enabled</span>
      </div>

      <div className="site-toggle-list">
        {Object.values(config.sites).map((site) => (
          <SiteToggleItem
            key={site.id}
            site={site}
            globalEnabled={config.globalEnabled}
            onToggle={(enabled) => handleSiteToggle(site.id, enabled)}
          />
        ))}
      </div>

      <div className="site-toggle-global">
        <button
          type="button"
          className={`global-pause-button ${!config.globalEnabled ? "paused" : ""}`}
          onClick={handleGlobalPause}
          disabled={!anyEnabled}
          data-testid="global-pause-button"
        >
          {config.globalEnabled ? "Pause All Sites" : "Resume All Sites"}
        </button>
      </div>

      {!anyEnabled && (
        <div className="site-toggle-warning">
          At least one site must be enabled for the extension to work.
        </div>
      )}

      {!config.globalEnabled && anyEnabled && (
        <div className="site-toggle-paused-notice">
          Extension is paused. Enable to resume monitoring.
        </div>
      )}
    </div>
  );
}

interface SiteToggleItemProps {
  site: SiteConfig;
  globalEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

function SiteToggleItem({
  site,
  globalEnabled,
  onToggle,
}: SiteToggleItemProps): React.ReactElement {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onToggle(e.target.checked);
  };

  return (
    <div className={`site-toggle-item ${!globalEnabled ? "disabled-globally" : ""}`}>
      <label className="site-toggle-label">
        <input
          type="checkbox"
          checked={site.enabled}
          onChange={handleChange}
          className="site-toggle-checkbox"
          data-testid={`site-toggle-${site.id}`}
        />
        <span className="site-toggle-info">
          <span className="site-toggle-name">{site.name}</span>
          <span className="site-toggle-description">{site.description}</span>
        </span>
      </label>
      {site.enabled && globalEnabled && <span className="site-toggle-status active">Active</span>}
      {site.enabled && !globalEnabled && <span className="site-toggle-status paused">Paused</span>}
    </div>
  );
}
