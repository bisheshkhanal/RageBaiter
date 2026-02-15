import {
  type SiteConfiguration,
  type SupportedSite,
  DEFAULT_SITE_CONFIG,
  STORAGE_KEY_SITES,
  mergeSiteConfig,
  updateSiteEnabled,
  toggleGlobalEnabled,
} from "./site-config.js";

export interface SiteConfigStorage {
  getConfig(): Promise<SiteConfiguration>;
  setConfig(config: SiteConfiguration): Promise<void>;
  updateSiteEnabled(siteId: SupportedSite, enabled: boolean): Promise<SiteConfiguration>;
  toggleGlobalEnabled(): Promise<SiteConfiguration>;
  resetToDefaults(): Promise<SiteConfiguration>;
}

function createStorageAdapter(): SiteConfigStorage {
  const getConfig = async (): Promise<SiteConfiguration> => {
    const result = await chrome.storage.sync.get(STORAGE_KEY_SITES);
    const stored = result[STORAGE_KEY_SITES];

    if (!stored) {
      await chrome.storage.sync.set({ [STORAGE_KEY_SITES]: DEFAULT_SITE_CONFIG });
      return DEFAULT_SITE_CONFIG;
    }

    return mergeSiteConfig(DEFAULT_SITE_CONFIG, stored as Partial<SiteConfiguration>);
  };

  const setConfig = async (config: SiteConfiguration): Promise<void> => {
    await chrome.storage.sync.set({ [STORAGE_KEY_SITES]: config });
  };

  const updateSite = async (
    siteId: SupportedSite,
    enabled: boolean
  ): Promise<SiteConfiguration> => {
    const current = await getConfig();
    const updated = updateSiteEnabled(current, siteId, enabled);
    await setConfig(updated);
    return updated;
  };

  const toggleGlobal = async (): Promise<SiteConfiguration> => {
    const current = await getConfig();
    const updated = toggleGlobalEnabled(current);
    await setConfig(updated);
    return updated;
  };

  const resetToDefaults = async (): Promise<SiteConfiguration> => {
    await setConfig(DEFAULT_SITE_CONFIG);
    return DEFAULT_SITE_CONFIG;
  };

  return {
    getConfig,
    setConfig,
    updateSiteEnabled: updateSite,
    toggleGlobalEnabled: toggleGlobal,
    resetToDefaults,
  };
}

export const siteConfigStorage = createStorageAdapter();

export async function initializeSiteConfig(): Promise<SiteConfiguration> {
  const existing = await chrome.storage.sync.get(STORAGE_KEY_SITES);

  if (!existing[STORAGE_KEY_SITES]) {
    await chrome.storage.sync.set({ [STORAGE_KEY_SITES]: DEFAULT_SITE_CONFIG });
    return DEFAULT_SITE_CONFIG;
  }

  return siteConfigStorage.getConfig();
}
