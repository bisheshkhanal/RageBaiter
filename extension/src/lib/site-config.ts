/**
 * Site configuration types and interfaces for Task-19
 * Supports extensible site scraper architecture
 */

export type SupportedSite = "twitter" | "reddit" | "facebook" | "youtube";

export interface SiteConfig {
  id: SupportedSite;
  name: string;
  enabled: boolean;
  urlPatterns: string[];
  description: string;
}

export interface SiteConfiguration {
  sites: Record<SupportedSite, SiteConfig>;
  globalEnabled: boolean;
  lastUpdated: string;
}

export const DEFAULT_SITE_CONFIG: SiteConfiguration = {
  sites: {
    twitter: {
      id: "twitter",
      name: "Twitter/X",
      enabled: true,
      urlPatterns: [
        "*://x.com/*",
        "*://twitter.com/*",
        "http://localhost/*",
        "https://localhost/*",
        "http://127.0.0.1/*",
        "https://127.0.0.1/*",
      ],
      description: "Detect political content on Twitter/X feeds",
    },
    reddit: {
      id: "reddit",
      name: "Reddit",
      enabled: false,
      urlPatterns: ["*://reddit.com/*", "*://www.reddit.com/*"],
      description: "Detect political content on Reddit posts and comments",
    },
    facebook: {
      id: "facebook",
      name: "Facebook",
      enabled: false,
      urlPatterns: ["*://facebook.com/*", "*://www.facebook.com/*"],
      description: "Detect political content on Facebook posts",
    },
    youtube: {
      id: "youtube",
      name: "YouTube",
      enabled: false,
      urlPatterns: ["*://youtube.com/*", "*://www.youtube.com/*"],
      description: "Detect political content in YouTube comments",
    },
  },
  globalEnabled: true,
  lastUpdated: new Date().toISOString(),
};

export const STORAGE_KEY_SITES = "ragebaiter_site_config";

/**
 * Interface for site-specific scrapers
 * Implement this interface to add support for new sites
 */
export interface ISiteScraper {
  readonly siteId: SupportedSite;
  readonly siteName: string;

  /**
   * Check if the current URL matches this site's patterns
   */
  matchesUrl(url: string): boolean;

  /**
   * Initialize the scraper and start observing the DOM
   * Returns a controller to stop the scraper
   */
  initialize(): ScraperController;

  /**
   * Check if the scraper is currently active
   */
  isActive(): boolean;
}

export interface ScraperController {
  stop: () => void;
}

export interface ScrapedContent {
  contentId: string;
  contentText: string;
  authorId: string;
  timestamp: string;
  url: string;
  engagementMetrics?: {
    likes?: number;
    shares?: number;
    replies?: number;
  };
}

/**
 * Check if a URL matches any of the given patterns
 * Supports wildcards: * matches any characters
 */
export function matchesUrlPattern(url: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    let regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");

    const urlHasPort = /:\d+(?:\/|$)/.test(url);
    const patternHostMatch = pattern.match(/^[^:]+:\/\/([^/]+)/);
    const patternHost = patternHostMatch?.[1] || "";
    const patternHostHasPort = /:\d+$/.test(patternHost);

    if (urlHasPort && !patternHostHasPort) {
      regexPattern = regexPattern.replace(/(:\/\/[^/]+)/, "$1(:\\d+)?");
    }

    const regex = new RegExp(`^${regexPattern}$`, "i");
    if (regex.test(url)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the site ID for a given URL based on configured patterns
 */
export function getSiteForUrl(url: string, config: SiteConfiguration): SupportedSite | null {
  for (const [siteId, siteConfig] of Object.entries(config.sites)) {
    if (siteConfig.enabled && matchesUrlPattern(url, siteConfig.urlPatterns)) {
      return siteId as SupportedSite;
    }
  }
  return null;
}

/**
 * Check if the extension should be active on the given URL
 */
export function isExtensionActiveOnUrl(url: string, config: SiteConfiguration): boolean {
  if (!config.globalEnabled) {
    return false;
  }
  return getSiteForUrl(url, config) !== null;
}

/**
 * Ensure a site config includes all default URL patterns (union with existing)
 * This handles backward compatibility when old stored configs lack new patterns like localhost
 */
function ensureDefaultPatternsForSite(siteId: SupportedSite, siteConfig: SiteConfig): SiteConfig {
  const defaultSite = DEFAULT_SITE_CONFIG.sites[siteId];
  if (!defaultSite) {
    return siteConfig;
  }

  // Union existing patterns with default patterns (avoid duplicates)
  const patternSet = new Set([...siteConfig.urlPatterns, ...defaultSite.urlPatterns]);
  const mergedPatterns = Array.from(patternSet);

  return {
    ...siteConfig,
    urlPatterns: mergedPatterns,
  };
}

/**
 * Merge partial config updates with existing config
 * Ensures localhost and other default patterns are preserved even from old stored configs
 */
export function mergeSiteConfig(
  existing: SiteConfiguration,
  updates: Partial<SiteConfiguration>
): SiteConfiguration {
  const mergedSites: Record<SupportedSite, SiteConfig> = {
    ...existing.sites,
    ...(updates.sites || {}),
  };

  // Ensure all sites include default patterns (backward compatibility)
  const sitesWithDefaults: Record<SupportedSite, SiteConfig> = {} as Record<
    SupportedSite,
    SiteConfig
  >;
  for (const [siteId, siteConfig] of Object.entries(mergedSites)) {
    sitesWithDefaults[siteId as SupportedSite] = ensureDefaultPatternsForSite(
      siteId as SupportedSite,
      siteConfig
    );
  }

  return {
    ...existing,
    ...updates,
    sites: sitesWithDefaults,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Update a specific site's enabled state
 */
export function updateSiteEnabled(
  config: SiteConfiguration,
  siteId: SupportedSite,
  enabled: boolean
): SiteConfiguration {
  return {
    ...config,
    sites: {
      ...config.sites,
      [siteId]: {
        ...config.sites[siteId],
        enabled,
      },
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Toggle the global enabled state
 */
export function toggleGlobalEnabled(config: SiteConfiguration): SiteConfiguration {
  return {
    ...config,
    globalEnabled: !config.globalEnabled,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get enabled sites count
 */
export function getEnabledSiteCount(config: SiteConfiguration): number {
  return Object.values(config.sites).filter((site) => site.enabled).length;
}

/**
 * Check if any sites are enabled
 */
export function hasAnySiteEnabled(config: SiteConfiguration): boolean {
  return Object.values(config.sites).some((site) => site.enabled);
}
