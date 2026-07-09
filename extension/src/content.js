/**
 * KyleOS — Content Script
 * Injected into supported pages. Detects the page, reads data, and
 * communicates with the side panel via chrome.runtime messaging.
 *
 * NO direct DOM manipulation except reading. No auto-submitting, no auto-sending.
 */

(function () {
  'use strict';

  // Inline minimal copies of the modules (content scripts can't import ES modules
  // without a bundler; these are self-contained functional versions).

  // ── Page Detection ───────────────────────────────────────────────────────
  function detectPage() {
    const host   = location.hostname.toLowerCase();
    const path   = location.pathname.toLowerCase();
    const search = location.search.toLowerCase();
    const url    = location.href;

    let platform = 'unknown';
    let pageType = 'unknown';
    const meta   = {};

    // Agent Tools / Redfin
    if (host.includes('redfin.com') || host.includes('miamiagenttools.com')) {
      platform = 'agent_tools';

      if (/\/customers\/\d+/.test(path) || /\/agent\/customers\/\d+/.test(path)) {
        pageType = 'at_customer_detail';
        const m = path.match(/\/customers\/(\d+)/);
        if (m) meta.customerId = m[1];
      } else if (path.includes('/team-dashboard') || path.includes('/teamdashboard') || (path.includes('/dashboard') && path.includes('/agent'))) {
        pageType = 'at_team_dashboard';
      } else if (path.includes('/appointments') || path.includes('/appointment')) {
        pageType = 'at_appointments';
      } else if (path.includes('/pipeline')) {
        pageType = 'at_pipeline';
      } else if (path.includes('/performance') || path.includes('/kpi')) {
        pageType = 'at_performance';
      } else if (path.includes('/deals')) {
        pageType = 'at_deals';
      } else if (path.includes('/calendar')) {
        pageType = 'at_calendar';
      } else if (path.includes('/customers')) {
        pageType = 'at_customers_list';
      } else if (path === '/agent' || path === '/agent/' || path.includes('/agent/home')) {
        pageType = 'at_home';
      }

      // Expanded follow-up row
      if (pageType === 'at_customers_list' || pageType === 'at_home') {
        const exp = document.querySelector(
          '[data-testid="expanded-followup-row"], .expanded-followup-row, [class*="followup-expanded"]'
        );
        if (exp) { pageType = 'at_expanded_followup'; meta.expandedRow = true; }
      }
    }
    // MLS
    else if (
      host.includes('matrix') || host.includes('flexmls') || host.includes('mlxchange') ||
      host.includes('fnismls') || host.includes('miamiboards') || host.includes('rapattoni') ||
      host.includes('raprets') || host.includes('realtortools')
    ) {
      platform = 'mls';
      const cards = document.querySelectorAll('[class*="listing-card"],[class*="result-row"]');
      if (path.includes('/comps') || path.includes('/cma') || search.includes('comps'))
        pageType = 'mls_comps';
      else if (cards.length > 3)
        pageType = 'mls_search';
      else
        pageType = 'mls_listing';
    }
    // OneHome
    else if (host.includes('onehome.com')) {
      platform = 'onehome';
      pageType = path.includes('/contact') ? 'oh_contact' : path.includes('/search') ? 'oh_search' : 'oh_portal';
    }
    // Gmail
    else if (host.includes('mail.google.com')) {
      platform = 'gmail';
      const hash = location.hash;
      if (hash.includes('#compose') || document.querySelector('[aria-label="New Message"]'))
        pageType = 'gmail_compose';
      else
        pageType = _isRedfinLeadEmail() ? 'gmail_lead_email' : 'gmail_inbox';
    }
    // FUB
    else if (host.includes('followupboss.com')) {
      platform = 'fub';
      pageType = /\/contacts\/\d+/.test(path) ? 'fub_contact' : path.includes('/pipeline') ? 'fub_pipeline' : 'fub_dashboard';
    }

    const AUTO_ANALYZE = new Set(['at_customer_detail', 'at_expanded_followup', 'mls_listing', 'gmail_lead_email']);
    const LIST_PAGES   = new Set(['at_team_dashboard', 'at_appointments', 'at_customers_list', 'at_shared_queue', 'mls_search', 'mls_comps']);

    return {
      platform,
      pageType,
      autoAnalyze: AUTO_ANALYZE.has(pageType),
      isList:      LIST_PAGES.has(pageType),
      meta,
      url,
      title: document.title,
    };
  }

  function _isRedfinLeadEmail() {
    const txt = (document.body.innerText || '').toLowerCase();
    return ['new lead from redfin','tour request','buyer inquiry','listing consult request','agent tools notification'].some(s => txt.includes(s));
  }

  // ── Data Extractors ──────────────────────────────────────────────────────
  function extractCustomerDetail() {
    const t = (sels) => {
      for (const s of sels) {
        try { const el = document.querySelector(s); if (el && el.innerText.trim()) return el.innerText.trim(); } catch (_) {}
      }
      return null;
    };
    const arr = (sels) => {
      const r = [];
      sels.forEach(s => {
        try { document.querySelectorAll(s).forEach(el => { const v = el.innerText.trim(); if (v && !r.includes(v)) r.push(v); }); } catch (_) {}
      });
      return r;
    };

    const name         = t(['[data-testid="customer-name"]', '.customer-name', 'h1.name', '[class*="customerName"]']);
    const phone        = (() => { const a = document.querySelector('a[href^="tel:"]'); return a ? a.href.replace('tel:','').trim() : t(['[class*="phoneNumber"]', '.customer-phone']); })();
    const email        = (() => { const a = document.querySelector('a[href^="mailto:"]'); return a ? a.href.replace('mailto:','').trim() : t(['[class*="emailAddress"]', '.customer-email']); })();
    const status       = t(['[data-testid="customer-status"]', '.customer-status', '[class*="leadStatus"]']);
    const assignedAgent= t(['[data-testid="assigned-agent"]', '[class*="assignedAgent"]']);
    const ownerAgent   = t(['[data-testid="owner-agent"]', '[class*="ownerAgent"]']) || assignedAgent;
    const leadSource   = t(['[data-testid="lead-source"]', '[class*="leadSource"]']);
    const daysOnRedfin = t(['[data-testid="days-on-redfin"]', '[class*="daysOnRedfin"]']);
    const lastContact  = t(['[data-testid="last-contact"]', '[class*="lastContact"]', '[class*="lastMet"]']);
    const followUpPlan = t(['[data-testid="follow-up-plan"]', '[class*="followUpPlan"]']);
    const followUpDue  = t(['[data-testid="follow-up-due"]', '[class*="followUpDue"]', '[class*="dueDate"]']);
    const tags         = arr(['[data-testid="tag"]', '.tag', '[class*="customerTag"]']);
    const notes        = arr(['[data-testid="agent-note"]', '.note-text', '[class*="noteContent"]']).slice(0, 5);

    // Lead signals
    const text = document.body.innerText.toLowerCase();
    const signals = [];
    if (text.includes('new lead'))          signals.push('new_lead');
    if (text.includes('hot'))               signals.push('hot_lead');
    if (text.includes('stale') || (daysOnRedfin && parseInt(daysOnRedfin) > 90)) signals.push('stale_lead');
    if (text.includes('tour'))              signals.push('has_tour');
    if (text.includes('post tour'))         signals.push('post_tour');
    if (text.includes('no response'))       signals.push('no_response');
    if (text.includes('buyer consult'))     signals.push('buyer_consult');
    if (text.includes('seller consult') || text.includes('listing consult')) signals.push('seller_consult');
    if (text.includes('unclaimed offer'))   signals.push('unclaimed_offer');
    if (text.includes('unclaimed listing')) signals.push('unclaimed_listing');

    // Risk flags
    const riskFlags = [];
    if (assignedAgent && ownerAgent && assignedAgent.toLowerCase() !== ownerAgent.toLowerCase())
      riskFlags.push('wrong_agent_risk');
    if (!phone && !email)
      riskFlags.push('no_contact_info');
    if (!followUpDue && !followUpPlan)
      riskFlags.push('no_followup_plan');
    if (email && email.toLowerCase().includes('@redfin.com'))
      riskFlags.push('redfin_internal_email_BLOCK');

    // KPI
    const kpiIssues = [];
    if (!followUpPlan && !followUpDue) kpiIssues.push('No follow up plan set');
    if (!lastContact)                  kpiIssues.push('No recent contact logged');
    if (!phone && !email)              kpiIssues.push('Missing phone and email');

    return {
      name, phone, email, status, assignedAgent, ownerAgent, leadSource,
      daysOnRedfin, lastContact, followUpPlan, followUpDue, tags, notes,
      leadSignals: signals, riskFlags,
      kpiStatus: { protected: kpiIssues.length === 0, issues: kpiIssues },
    };
  }

  function extractTeamDashboard() {
    const rowSelectors = [
      '[data-testid="appointment-row"]', '[data-testid="customer-row"]',
      '[class*="appointmentRow"]', '[class*="customerRow"]', '[class*="tourRow"]', 'tbody tr',
    ];
    let rowEls = [];
    for (const s of rowSelectors) {
      rowEls = Array.from(document.querySelectorAll(s));
      if (rowEls.length) break;
    }

    const et = (el, sels) => {
      for (const s of sels) {
        try { const n = el.querySelector(s); if (n && n.innerText.trim()) return n.innerText.trim(); } catch (_) {}
      }
      return null;
    };
    const ph = (t) => { const m = t.match(/(\+?1?\s*[\(\-]?\d{3}[\)\-\s]?\s*\d{3}[\-\s]\d{4})/); return m ? m[1].trim() : null; };
    const em = (t) => { const m = t.match(/[\w.+\-]+@[\w\-]+\.[\w.]+/); return m ? m[0] : null; };

    const rows = rowEls.slice(0, 20).map((el, i) => {
      const text = el.innerText || '';
      const row = {
        index:  i + 1,
        raw:    text.slice(0, 400),
        name:   et(el, ['[class*="customerName"]', '[class*="name"]', 'td:nth-child(1)']),
        phone:  et(el, ['a[href^="tel:"]', '[class*="phone"]']) || ph(text),
        email:  et(el, ['a[href^="mailto:"]', '[class*="email"]']) || em(text),
        appointmentType: et(el, ['[class*="appointmentType"]', '[class*="type"]']),
        date:   et(el, ['[class*="date"]', '[class*="time"]', '[class*="scheduled"]']),
        address: et(el, ['[class*="address"]', '[class*="property"]']),
        assignedAgent: et(el, ['[class*="assignedAgent"]', '[class*="agent"]']),
        ownerAgent: et(el, ['[class*="ownerAgent"]']),
        price:  et(el, ['[class*="price"]']),
        status: et(el, ['[class*="status"]']),
        idVerified: text.toLowerCase().includes('id verified'),
        preapproved: text.toLowerCase().includes('preapproved') || text.toLowerCase().includes('pre-approved'),
        source: 'team_shared',
        permissionRequired: true,
      };

      // Build missing info
      row.missingInfo = [];
      if (!row.phone) row.missingInfo.push('Phone not visible — open appointment to capture');
      if (!row.email) row.missingInfo.push('Email not visible — open appointment to capture');

      // Risk flags
      row.riskFlags = [];
      if (!row.name) row.riskFlags.push('Name not visible');
      if (!row.phone && !row.email) row.riskFlags.push('No contact info visible from list view');
      if (row.email && row.email.includes('@redfin.com')) row.riskFlags.push('BLOCKED: @redfin.com — internal email');

      // SMS draft
      const first = (row.name || '').split(' ')[0] || 'there';
      row.smsDraft = `Hey ${first}, this is Kyle at Redfin. Good time to connect?`;
      row.recommendedNextClick = row.name ? 'Open appointment row → open customer detail' : 'Open appointment row → capture contact info';

      return row;
    });

    // Opportunity counters
    const counters = {};
    document.querySelectorAll('[class*="opportunityCounter"], [class*="counterBadge"], [class*="kpiCard"]').forEach(el => {
      const label = el.innerText.trim();
      const m = label.match(/(\d+)/);
      if (m) counters[label.replace(/\d+/,'').trim()] = parseInt(m[1]);
    });

    return {
      rows,
      counters,
      totalRows: rowEls.length,
      capped: rowEls.length > 20,
    };
  }

  function extractPageText(maxLen) {
    return (document.body.innerText || '').replace(/\s+/g,' ').trim().slice(0, maxLen || 600);
  }

  // ── Messaging ────────────────────────────────────────────────────────────
  let lastPageType = null;
  let autoAnalyzeSent = false;

  function sendPageInfo(pageInfo) {
    chrome.runtime.sendMessage({ type: 'PAGE_INFO', payload: pageInfo });
  }

  function sendAnalysisResult(result) {
    chrome.runtime.sendMessage({ type: 'ANALYSIS_RESULT', payload: result });
  }

  // Listen for requests from the panel
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_PAGE_INFO') {
      sendResponse(detectPage());
      return true;
    }

    if (msg.type === 'ANALYZE_PAGE') {
      const pageInfo = detectPage();
      let data = {};

      if (['at_customer_detail', 'at_expanded_followup'].includes(pageInfo.pageType)) {
        data = extractCustomerDetail();
      } else if (['at_team_dashboard', 'at_appointments', 'at_shared_queue', 'at_customers_list'].includes(pageInfo.pageType)) {
        data = extractTeamDashboard();
      } else {
        data = { pageText: extractPageText(600) };
      }

      sendResponse({ pageInfo, data });
      return true;
    }
    return false;
  });

  // ── Auto-detect on load ──────────────────────────────────────────────────
  function init() {
    const pageInfo = detectPage();
    sendPageInfo(pageInfo);
  }

  // Re-detect on navigation (SPA)
  let _lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      autoAnalyzeSent = false;
      setTimeout(init, 500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  init();

})();
