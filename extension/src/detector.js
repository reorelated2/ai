/**
 * KyleOS — Platform & Page Detection
 * Identifies the current site, section, and page type.
 */

const PLATFORMS = {
  AGENT_TOOLS:   'agent_tools',
  MLS:           'mls',
  ONEHOME:       'onehome',
  GMAIL:         'gmail',
  FUB:           'fub',
  UNKNOWN:       'unknown',
};

const PAGE_TYPES = {
  // Agent Tools
  AT_CUSTOMER_DETAIL:      'at_customer_detail',
  AT_EXPANDED_FOLLOWUP:    'at_expanded_followup',
  AT_TEAM_DASHBOARD:       'at_team_dashboard',
  AT_APPOINTMENTS:         'at_appointments',
  AT_PIPELINE:             'at_pipeline',
  AT_PERFORMANCE:          'at_performance',
  AT_HOME:                 'at_home',
  AT_CUSTOMERS_LIST:       'at_customers_list',
  AT_DEALS:                'at_deals',
  AT_CALENDAR:             'at_calendar',
  AT_SHARED_QUEUE:         'at_shared_queue',

  // MLS
  MLS_LISTING:             'mls_listing',
  MLS_SEARCH:              'mls_search',
  MLS_COMPS:               'mls_comps',

  // OneHome
  OH_CONTACT:              'oh_contact',
  OH_SEARCH:               'oh_search',
  OH_PORTAL:               'oh_portal',

  // Gmail
  GMAIL_LEAD_EMAIL:        'gmail_lead_email',
  GMAIL_INBOX:             'gmail_inbox',
  GMAIL_COMPOSE:           'gmail_compose',

  // FUB
  FUB_CONTACT:             'fub_contact',
  FUB_PIPELINE:            'fub_pipeline',
  FUB_DASHBOARD:           'fub_dashboard',

  UNKNOWN:                 'unknown',
};

// Maps page types to operating mode names
const MODE_LABELS = {
  [PAGE_TYPES.AT_CUSTOMER_DETAIL]:   'Agent Tools',
  [PAGE_TYPES.AT_EXPANDED_FOLLOWUP]: 'KPI Follow Up',
  [PAGE_TYPES.AT_TEAM_DASHBOARD]:    'Team Dashboard Capture',
  [PAGE_TYPES.AT_APPOINTMENTS]:      'Appointments Capture',
  [PAGE_TYPES.AT_PIPELINE]:          'Pipeline Mining',
  [PAGE_TYPES.AT_PERFORMANCE]:       'Performance',
  [PAGE_TYPES.AT_HOME]:              'Agent Tools Home',
  [PAGE_TYPES.AT_CUSTOMERS_LIST]:    'Customers List',
  [PAGE_TYPES.AT_DEALS]:             'Deals',
  [PAGE_TYPES.AT_CALENDAR]:          'Calendar',
  [PAGE_TYPES.AT_SHARED_QUEUE]:      'Shared Queue',
  [PAGE_TYPES.MLS_LISTING]:          'MLS Listing',
  [PAGE_TYPES.MLS_SEARCH]:           'MLS Search',
  [PAGE_TYPES.MLS_COMPS]:            'CMA / Comps',
  [PAGE_TYPES.OH_CONTACT]:           'OneHome Contact',
  [PAGE_TYPES.OH_SEARCH]:            'OneHome Search',
  [PAGE_TYPES.OH_PORTAL]:            'OneHome Portal',
  [PAGE_TYPES.GMAIL_LEAD_EMAIL]:     'Gmail Lead Parser',
  [PAGE_TYPES.GMAIL_INBOX]:          'Gmail',
  [PAGE_TYPES.GMAIL_COMPOSE]:        'Gmail Compose',
  [PAGE_TYPES.FUB_CONTACT]:          'FUB Contact',
  [PAGE_TYPES.FUB_PIPELINE]:         'FUB Pipeline',
  [PAGE_TYPES.FUB_DASHBOARD]:        'FUB Dashboard',
  [PAGE_TYPES.UNKNOWN]:              'Unknown',
};

// Pages where auto-analyze is appropriate (single record / listing)
const AUTO_ANALYZE_PAGE_TYPES = new Set([
  PAGE_TYPES.AT_CUSTOMER_DETAIL,
  PAGE_TYPES.AT_EXPANDED_FOLLOWUP,
  PAGE_TYPES.MLS_LISTING,
  PAGE_TYPES.GMAIL_LEAD_EMAIL,
]);

// Pages that are list/shared views — manual only, use Database Capture Mode
const LIST_PAGE_TYPES = new Set([
  PAGE_TYPES.AT_TEAM_DASHBOARD,
  PAGE_TYPES.AT_APPOINTMENTS,
  PAGE_TYPES.AT_CUSTOMERS_LIST,
  PAGE_TYPES.AT_SHARED_QUEUE,
  PAGE_TYPES.MLS_SEARCH,
  PAGE_TYPES.MLS_COMPS,
  PAGE_TYPES.FUB_PIPELINE,
  PAGE_TYPES.FUB_DASHBOARD,
]);

/**
 * Detect which platform and page we are on.
 * @returns {{ platform, pageType, modeLabel, autoAnalyze, isList, meta }}
 */
function detectPage() {
  const url    = window.location.href;
  const host   = window.location.hostname.toLowerCase();
  const path   = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();

  let platform = PLATFORMS.UNKNOWN;
  let pageType = PAGE_TYPES.UNKNOWN;
  const meta   = {};

  // Returns true when host exactly equals domain or ends with .domain
  function hostMatches(h, domain) {
    return h === domain || h.endsWith('.' + domain);
  }

  // ── AGENT TOOLS (redfin internal tool) ───────────────────────────────────
  if (hostMatches(host, 'redfin.com') || hostMatches(host, 'miamiagenttools.com')) {
    platform = PLATFORMS.AGENT_TOOLS;

    // Check URL path patterns
    if (/\/customers\/\d+/.test(path) || /\/agent\/customers\/\d+/.test(path)) {
      pageType = PAGE_TYPES.AT_CUSTOMER_DETAIL;
      const m = path.match(/\/customers\/(\d+)/);
      if (m) meta.customerId = m[1];

    } else if (path.includes('/agent/dashboard') || path.includes('/team-dashboard') || path.includes('/teamdashboard')) {
      pageType = PAGE_TYPES.AT_TEAM_DASHBOARD;

    } else if (path.includes('/appointments') || path.includes('/appointment')) {
      pageType = PAGE_TYPES.AT_APPOINTMENTS;

    } else if (path.includes('/pipeline') || path.includes('/pipeline-mining')) {
      pageType = PAGE_TYPES.AT_PIPELINE;

    } else if (path.includes('/performance') || path.includes('/kpi')) {
      pageType = PAGE_TYPES.AT_PERFORMANCE;

    } else if (path.includes('/deals')) {
      pageType = PAGE_TYPES.AT_DEALS;

    } else if (path.includes('/calendar')) {
      pageType = PAGE_TYPES.AT_CALENDAR;

    } else if (path.includes('/customers')) {
      pageType = PAGE_TYPES.AT_CUSTOMERS_LIST;

    } else if (path === '/agent' || path === '/agent/' || path.includes('/agent/home')) {
      pageType = PAGE_TYPES.AT_HOME;
    }

    // DOM-level refinement: expanded follow-up row
    if (pageType === PAGE_TYPES.AT_CUSTOMERS_LIST || pageType === PAGE_TYPES.AT_HOME) {
      const expanded = document.querySelector(
        '[data-testid="expanded-followup-row"], .expanded-followup-row, .follow-up-expanded, [class*="followup-expanded"]'
      );
      if (expanded) {
        pageType = PAGE_TYPES.AT_EXPANDED_FOLLOWUP;
        meta.expandedRow = true;
      }
    }

    // Shared/team queue detection via DOM signals
    if (pageType === PAGE_TYPES.AT_CUSTOMERS_LIST) {
      const sharedIndicator = document.querySelector(
        '[data-testid="shared-queue"], .shared-queue, [class*="team-queue"], [class*="unclaimed"]'
      );
      if (sharedIndicator) {
        pageType = PAGE_TYPES.AT_SHARED_QUEUE;
      }
    }
  }

  // ── MLS ───────────────────────────────────────────────────────────────────
  // MLS hostnames are internal/proprietary systems. Fragment matching is safe
  // because these are distinct platform identifiers, not security boundaries.
  else if (
    host.includes('matrix') ||
    host.includes('mls') ||
    host.includes('crmls') ||
    host.includes('bright') ||
    hostMatches(host, 'har.com') ||
    host.includes('mlxchange') ||
    // MIAMI MLS (Miami Realtors / Flexmls / Clareity)
    host.includes('miamiboards') ||
    host.includes('rapattoni') ||
    host.includes('flexmls') ||
    host.includes('fnismls') ||
    host.includes('realtortools') ||
    host.includes('raprets')
  ) {
    platform = PLATFORMS.MLS;

    if (/\/listing\/\d+/.test(path) || /\/mls\/\d+/.test(path) || search.includes('mlsnum') || search.includes('listingid')) {
      pageType = PAGE_TYPES.MLS_LISTING;
    } else if (path.includes('/comps') || path.includes('/cma') || search.includes('comps')) {
      pageType = PAGE_TYPES.MLS_COMPS;
    } else if (path.includes('/search') || path.includes('/results') || search.includes('search')) {
      pageType = PAGE_TYPES.MLS_SEARCH;
    } else {
      // Heuristic: single large listing card vs. grid of results
      const listingCards = document.querySelectorAll('[class*="listing-card"], [class*="result-row"]');
      if (listingCards.length > 3) {
        pageType = PAGE_TYPES.MLS_SEARCH;
      } else if (listingCards.length >= 1) {
        pageType = PAGE_TYPES.MLS_LISTING;
      } else {
        pageType = PAGE_TYPES.MLS_SEARCH;
      }
    }
  }

  // ── ONEHOME ───────────────────────────────────────────────────────────────
  else if (hostMatches(host, 'onehome.com')) {
    platform = PLATFORMS.ONEHOME;

    if (path.includes('/contact') || path.includes('/client')) {
      pageType = PAGE_TYPES.OH_CONTACT;
    } else if (path.includes('/search') || path.includes('/listings')) {
      pageType = PAGE_TYPES.OH_SEARCH;
    } else {
      pageType = PAGE_TYPES.OH_PORTAL;
    }
  }

  // ── GMAIL ─────────────────────────────────────────────────────────────────
  else if (host === 'mail.google.com') {
    platform = PLATFORMS.GMAIL;

    const hash = window.location.hash;
    if (hash.includes('#compose') || document.querySelector('[aria-label="New Message"]')) {
      pageType = PAGE_TYPES.GMAIL_COMPOSE;
    } else if (hash.includes('#inbox/') || hash.match(/#[a-z]+\/[A-Za-z0-9]+/)) {
      // Single email open — check for Redfin lead signals
      pageType = _isRedfinLeadEmail() ? PAGE_TYPES.GMAIL_LEAD_EMAIL : PAGE_TYPES.GMAIL_INBOX;
    } else {
      pageType = PAGE_TYPES.GMAIL_INBOX;
    }
  }

  // ── FOLLOW UP BOSS ───────────────────────────────────────────────────────
  else if (hostMatches(host, 'followupboss.com')) {
    platform = PLATFORMS.FUB;

    if (path.includes('/contacts/') && /\/contacts\/\d+/.test(path)) {
      pageType = PAGE_TYPES.FUB_CONTACT;
    } else if (path.includes('/pipeline')) {
      pageType = PAGE_TYPES.FUB_PIPELINE;
    } else {
      pageType = PAGE_TYPES.FUB_DASHBOARD;
    }
  }

  const modeLabel   = MODE_LABELS[pageType] || 'Unknown';
  const autoAnalyze = AUTO_ANALYZE_PAGE_TYPES.has(pageType);
  const isList      = LIST_PAGE_TYPES.has(pageType);

  return { platform, pageType, modeLabel, autoAnalyze, isList, meta, url };
}

/**
 * Check whether the currently open Gmail email looks like a Redfin lead alert.
 */
function _isRedfinLeadEmail() {
  const body = document.body.innerText || '';
  const redfinSignals = [
    'new lead from redfin',
    'redfin agent tools',
    'tour request',
    'new tour scheduled',
    'buyer inquiry',
    'listing consult request',
    'redfin.com lead',
    'agent tools notification',
  ];
  const lower = body.toLowerCase();
  return redfinSignals.some(s => lower.includes(s));
}

if (typeof module !== 'undefined') {
  module.exports = { detectPage, PLATFORMS, PAGE_TYPES, MODE_LABELS, AUTO_ANALYZE_PAGE_TYPES, LIST_PAGE_TYPES };
}
