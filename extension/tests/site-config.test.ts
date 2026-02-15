import { describe, it, expect, vi } from "vitest";
import {
  isExtensionActiveOnUrl,
  getSiteForUrl,
  updateSiteEnabled,
  toggleGlobalEnabled,
  DEFAULT_SITE_CONFIG,
  type SiteConfiguration,
} from "../src/lib/site-config.js";

describe("Site Configuration Logic", () => {
  const mockConfig: SiteConfiguration = {
    ...DEFAULT_SITE_CONFIG,
    sites: {
      ...DEFAULT_SITE_CONFIG.sites,
      twitter: {
        ...DEFAULT_SITE_CONFIG.sites.twitter,
        enabled: true,
      },
      reddit: {
        ...DEFAULT_SITE_CONFIG.sites.reddit,
        enabled: false,
      },
    },
    globalEnabled: true,
  };

  it("should return true for enabled site URL", () => {
    expect(isExtensionActiveOnUrl("https://twitter.com/home", mockConfig)).toBe(true);
    expect(isExtensionActiveOnUrl("https://x.com/status/123", mockConfig)).toBe(true);
  });

  it("should return false for disabled site URL", () => {
    expect(isExtensionActiveOnUrl("https://reddit.com/r/popular", mockConfig)).toBe(false);
  });

  it("should return false for unknown site URL", () => {
    expect(isExtensionActiveOnUrl("https://example.com", mockConfig)).toBe(false);
  });

  it("should return false for any URL when globally disabled", () => {
    const disabledConfig = { ...mockConfig, globalEnabled: false };
    expect(isExtensionActiveOnUrl("https://twitter.com/home", disabledConfig)).toBe(false);
  });

  it("should respect pattern matching wildcards", () => {
    expect(isExtensionActiveOnUrl("https://twitter.com/foo", mockConfig)).toBe(true);
  });
});

describe("Scraper Activation Gating", () => {
  const enabledConfig: SiteConfiguration = {
    ...DEFAULT_SITE_CONFIG,
    sites: {
      ...DEFAULT_SITE_CONFIG.sites,
      twitter: { ...DEFAULT_SITE_CONFIG.sites.twitter, enabled: true },
    },
    globalEnabled: true,
  };

  const disabledSiteConfig: SiteConfiguration = {
    ...DEFAULT_SITE_CONFIG,
    sites: {
      ...DEFAULT_SITE_CONFIG.sites,
      twitter: { ...DEFAULT_SITE_CONFIG.sites.twitter, enabled: false },
    },
    globalEnabled: true,
  };

  const globallyDisabledConfig: SiteConfiguration = {
    ...enabledConfig,
    globalEnabled: false,
  };

  describe("disabled site prevents scraper activation", () => {
    it("getSiteForUrl returns null when twitter is disabled", () => {
      expect(getSiteForUrl("https://x.com/home", disabledSiteConfig)).toBeNull();
      expect(getSiteForUrl("https://twitter.com/home", disabledSiteConfig)).toBeNull();
    });

    it("isExtensionActiveOnUrl returns false when twitter is disabled", () => {
      expect(isExtensionActiveOnUrl("https://x.com/home", disabledSiteConfig)).toBe(false);
      expect(isExtensionActiveOnUrl("https://twitter.com/home", disabledSiteConfig)).toBe(false);
    });

    it("isExtensionActiveOnUrl returns false when globally disabled even if site enabled", () => {
      expect(isExtensionActiveOnUrl("https://x.com/home", globallyDisabledConfig)).toBe(false);
    });

    it("isExtensionActiveOnUrl returns true only when both site and global are enabled", () => {
      expect(isExtensionActiveOnUrl("https://x.com/home", enabledConfig)).toBe(true);
    });
  });

  describe("toggle off stops interventions for new content", () => {
    it("updateSiteEnabled disables a previously enabled site", () => {
      const updated = updateSiteEnabled(enabledConfig, "twitter", false);
      expect(updated.sites.twitter.enabled).toBe(false);
      expect(isExtensionActiveOnUrl("https://x.com/home", updated)).toBe(false);
    });

    it("toggleGlobalEnabled flips global state", () => {
      const paused = toggleGlobalEnabled(enabledConfig);
      expect(paused.globalEnabled).toBe(false);
      expect(isExtensionActiveOnUrl("https://x.com/home", paused)).toBe(false);

      const resumed = toggleGlobalEnabled(paused);
      expect(resumed.globalEnabled).toBe(true);
      expect(isExtensionActiveOnUrl("https://x.com/home", resumed)).toBe(true);
    });

    it("after disabling twitter, re-enabling restores activation", () => {
      const disabled = updateSiteEnabled(enabledConfig, "twitter", false);
      expect(isExtensionActiveOnUrl("https://x.com/home", disabled)).toBe(false);

      const reEnabled = updateSiteEnabled(disabled, "twitter", true);
      expect(isExtensionActiveOnUrl("https://x.com/home", reEnabled)).toBe(true);
    });
  });
});

describe("Content Script Gating Simulation", () => {
  /**
   * Simulates the content-script checkAndInitialize logic:
   * 1. Request site config from service worker
   * 2. Check isExtensionActiveOnUrl
   * 3. Only start scraper if active
   */
  it("does not activate scraper when site is disabled in config", () => {
    const config: SiteConfiguration = {
      ...DEFAULT_SITE_CONFIG,
      sites: {
        ...DEFAULT_SITE_CONFIG.sites,
        twitter: { ...DEFAULT_SITE_CONFIG.sites.twitter, enabled: false },
      },
      globalEnabled: true,
    };

    const scraperStarted = vi.fn();

    const shouldActivate = isExtensionActiveOnUrl("https://x.com/home", config);
    if (shouldActivate) {
      scraperStarted();
    }

    expect(shouldActivate).toBe(false);
    expect(scraperStarted).not.toHaveBeenCalled();
  });

  it("does not activate scraper when extension is globally paused", () => {
    const config: SiteConfiguration = {
      ...DEFAULT_SITE_CONFIG,
      globalEnabled: false,
    };

    const scraperStarted = vi.fn();

    const shouldActivate = isExtensionActiveOnUrl("https://x.com/home", config);
    if (shouldActivate) {
      scraperStarted();
    }

    expect(shouldActivate).toBe(false);
    expect(scraperStarted).not.toHaveBeenCalled();
  });

  it("activates scraper when site is enabled and global is on", () => {
    const config: SiteConfiguration = {
      ...DEFAULT_SITE_CONFIG,
      sites: {
        ...DEFAULT_SITE_CONFIG.sites,
        twitter: { ...DEFAULT_SITE_CONFIG.sites.twitter, enabled: true },
      },
      globalEnabled: true,
    };

    const scraperStarted = vi.fn();

    const shouldActivate = isExtensionActiveOnUrl("https://x.com/home", config);
    if (shouldActivate) {
      scraperStarted();
    }

    expect(shouldActivate).toBe(true);
    expect(scraperStarted).toHaveBeenCalledOnce();
  });

  it("blocks intervention delivery when site becomes disabled mid-session", () => {
    const initialConfig: SiteConfiguration = {
      ...DEFAULT_SITE_CONFIG,
      sites: {
        ...DEFAULT_SITE_CONFIG.sites,
        twitter: { ...DEFAULT_SITE_CONFIG.sites.twitter, enabled: true },
      },
      globalEnabled: true,
    };

    expect(isExtensionActiveOnUrl("https://x.com/home", initialConfig)).toBe(true);

    const updatedConfig = updateSiteEnabled(initialConfig, "twitter", false);

    const interventionSent = vi.fn();
    if (isExtensionActiveOnUrl("https://x.com/home", updatedConfig)) {
      interventionSent();
    }

    expect(interventionSent).not.toHaveBeenCalled();
  });
});
