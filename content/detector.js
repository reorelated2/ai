// KyleOS - Page Detector
// Identifies platform and page type from URL + DOM signals

import { PLATFORM, PAGE_TYPE, AUTO_ANALYZE_PAGE_TYPES, TEAM_SOURCE_PAGE_TYPES } from '../core/constants.js';

export function detectPage() {
  const url = window.location.href;
  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  const platform = detectPlatform(hostname);
  const pageType = detectPageType(platform, pathname, url);
  const autoAnalyze = AUTO_ANALYZE_PAGE_TYPES.has(pageType);
  const isTeamSource = TEAM_SOURCE_PAGE_TYPES.has(pageType);

  return {
    platform,
    pageType,
    autoAnalyze,
    isTeamSource,
    url,
    hostname,
    pathname,
    title: document.title,
    timestamp: Date.now()
  };
}

// Match hostname as exact domain or subdomain (e.g. "foo.redfin.com" or "redfin.com")
function isDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function detectPlatform(hostname) {
  if (isDomain(hostname, 'redfin.com')) return PLATFORM.AGENT_TOOLS;
  if (isDomain(hostname, 'mail.google.com')) return PLATFORM.GMAIL;
  if (isDomain(hostname, 'onehome.com')) return PLATFORM.ONEHOME;
  if (
    isDomain(hostname, 'mlsgrid.com') ||
    isDomain(hostname, 'matrix.realtors.com') ||
    isDomain(hostname, 'flexmls.com') ||
    isDomain(hostname, 'miamirealtors.com') ||
    isDomain(hostname, 'miamireb.com')
  ) return PLATFORM.MLS;
  return PLATFORM.UNKNOWN;
}

function detectPageType(platform, pathname, url) {
  switch (platform) {
    case PLATFORM.AGENT_TOOLS:
      return detectAgentToolsPageType(pathname, url);
    case PLATFORM.MLS:
      return detectMLSPageType(pathname, url);
    case PLATFORM.ONEHOME:
      return detectOneHomePageType(pathname, url);
    case PLATFORM.GMAIL:
      return detectGmailPageType(pathname, url);
    default:
      return PAGE_TYPE.UNKNOWN;
  }
}

// ─── Agent Tools (Redfin) ───────────────────────────────────────────────────

function detectAgentToolsPageType(pathname, url) {
  // Customer detail page: /agent-tools/customers/{id}
  if (/\/agent-tools\/customers\/\d+/.test(pathname)) {
    // Check if this is an expanded follow-up row within a list view
    if (isExpandedFollowUpRow()) return PAGE_TYPE.EXPANDED_FOLLOW_UP_ROW;
    return PAGE_TYPE.CUSTOMER_DETAIL;
  }

  // Team Dashboard
  if (pathname.includes('/agent-tools/team-dashboard') ||
      pathname.includes('/agent-tools/dashboard')) {
    return PAGE_TYPE.TEAM_DASHBOARD;
  }

  // Appointments
  if (pathname.includes('/agent-tools/appointments') ||
      pathname.includes('/agent-tools/tours')) {
    return PAGE_TYPE.APPOINTMENTS;
  }

  // Follow ups
  if (pathname.includes('/agent-tools/follow-ups') ||
      pathname.includes('/agent-tools/followups')) {
    if (pathname.includes('priority')) return PAGE_TYPE.PRIORITY_FOLLOW_UPS;
    return PAGE_TYPE.FOLLOW_UPS;
  }

  // Pipeline / call list
  if (pathname.includes('/agent-tools/pipeline')) return PAGE_TYPE.PIPELINE_MINING;
  if (pathname.includes('/agent-tools/call-list') ||
      pathname.includes('/agent-tools/calllist')) return PAGE_TYPE.TODAY_CALL_LIST;
  if (pathname.includes('/agent-tools/recent-tourers') ||
      pathname.includes('/agent-tools/tourers')) return PAGE_TYPE.RECENT_TOURERS;

  // Customer list
  if (pathname.includes('/agent-tools/customers')) return PAGE_TYPE.CUSTOMERS_LIST;

  // Other Agent Tools sections
  if (pathname.includes('/agent-tools/deals')) return PAGE_TYPE.DEALS;
  if (pathname.includes('/agent-tools/calendar')) return PAGE_TYPE.CALENDAR;
  if (pathname.includes('/agent-tools/performance')) return PAGE_TYPE.PERFORMANCE;
  if (pathname.includes('/agent-tools') || pathname === '/agent-tools') return PAGE_TYPE.HOME;

  // Fallback: check DOM for clues
  return detectAgentToolsFromDOM();
}

function isExpandedFollowUpRow() {
  // Check if we're looking at an expanded row in a list context
  // rather than a full customer detail page
  const expandedRow = document.querySelector(
    '.follow-up-row--expanded, [data-expanded="true"], .expanded-row'
  );
  const isListView = document.querySelector(
    '.customer-list, .follow-up-list, [class*="followup-list"]'
  );
  return !!(expandedRow && isListView);
}

function detectAgentToolsFromDOM() {
  // Try to infer from DOM elements when URL isn't conclusive
  if (document.querySelector('[class*="customer-detail"], [class*="CustomerDetail"]'))
    return PAGE_TYPE.CUSTOMER_DETAIL;
  if (document.querySelector('[class*="team-dashboard"], [class*="TeamDashboard"]'))
    return PAGE_TYPE.TEAM_DASHBOARD;
  if (document.querySelector('[class*="appointments"], [class*="Appointments"]'))
    return PAGE_TYPE.APPOINTMENTS;
  if (document.querySelector('[class*="follow-up"], [class*="FollowUp"]'))
    return PAGE_TYPE.FOLLOW_UPS;
  if (document.querySelector('[class*="customer-list"], [class*="CustomerList"]'))
    return PAGE_TYPE.CUSTOMERS_LIST;
  return PAGE_TYPE.HOME;
}

// ─── MLS ────────────────────────────────────────────────────────────────────

function detectMLSPageType(pathname, url) {
  // Matrix MLS
  if (pathname.includes('/Matrix/Listing/')) return PAGE_TYPE.MLS_LISTING;
  if (pathname.includes('/Matrix/Search/')) return PAGE_TYPE.MLS_SEARCH;
  if (pathname.includes('/Matrix/Market/')) return PAGE_TYPE.MLS_COMPS;

  // Flexmls
  if (pathname.includes('/flexmls/') && pathname.includes('/listing/')) return PAGE_TYPE.MLS_LISTING;
  if (pathname.includes('/flexmls/') && pathname.includes('/search/')) return PAGE_TYPE.MLS_SEARCH;

  // MLSGrid / generic
  if (/\/listing\/\d+/.test(pathname) || /\/property\/[A-Z0-9-]+/.test(pathname))
    return PAGE_TYPE.MLS_LISTING;
  if (pathname.includes('/search') || pathname.includes('/results'))
    return PAGE_TYPE.MLS_SEARCH;

  // DOM fallback
  if (document.querySelector('[class*="listing-detail"], [id*="listingDetail"]'))
    return PAGE_TYPE.MLS_LISTING;
  if (document.querySelector('[class*="search-results"], [id*="searchResults"]'))
    return PAGE_TYPE.MLS_SEARCH;

  return PAGE_TYPE.MLS_SEARCH;
}

// ─── OneHome ─────────────────────────────────────────────────────────────────

function detectOneHomePageType(pathname, url) {
  if (pathname.includes('/contacts') || pathname.includes('/clients'))
    return PAGE_TYPE.ONEHOME_CONTACTS;
  if (pathname.includes('/search') || pathname.includes('/alerts'))
    return PAGE_TYPE.ONEHOME_SEARCH;
  if (pathname.includes('/collection') || pathname.includes('/favorites'))
    return PAGE_TYPE.ONEHOME_COLLECTION;
  if (/\/listing\/|\/property\//.test(pathname))
    return PAGE_TYPE.ONEHOME_LISTING;
  return PAGE_TYPE.ONEHOME_CONTACTS;
}

// ─── Gmail ───────────────────────────────────────────────────────────────────

function detectGmailPageType(pathname, url) {
  if (url.includes('#compose') || url.includes('compose'))
    return PAGE_TYPE.GMAIL_COMPOSE;
  if (url.includes('#inbox') || url.includes('#all') || !url.includes('#'))
    return PAGE_TYPE.GMAIL_INBOX;
  // Thread view: typically #inbox/[threadId] or #label/[id]
  if (/#[^/]+\/[A-Za-z0-9]+/.test(url))
    return PAGE_TYPE.GMAIL_THREAD;
  return PAGE_TYPE.GMAIL_INBOX;
}

// ─── DOM Mutation Observer ────────────────────────────────────────────────────
// Re-detect when the SPA navigates without a full page reload

let lastUrl = window.location.href;
let detectionCallback = null;

export function watchPageChanges(callback) {
  detectionCallback = callback;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // Slight delay to let SPA content render
      setTimeout(() => {
        const result = detectPage();
        callback(result);
      }, 500);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
}
