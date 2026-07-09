/**
 * KyleOS — Agent Tools Reader
 * Extracts data from Agent Tools customer detail pages and follow-up rows.
 */

const AgentToolsReader = (() => {

  /**
   * Extract all visible data from a customer detail page.
   * @returns {Object} structured customer data
   */
  function readCustomerDetail() {
    const data = {};

    // ── Name ─────────────────────────────────────────────────────────────
    data.name = _text([
      '[data-testid="customer-name"]',
      '.customer-name',
      'h1.name',
      '.contact-name',
      '[class*="customerName"]',
    ]);

    // ── Phone ─────────────────────────────────────────────────────────────
    data.phone = _text([
      '[data-testid="customer-phone"]',
      '.customer-phone',
      'a[href^="tel:"]',
      '[class*="phoneNumber"]',
    ]);
    if (!data.phone) {
      const tel = document.querySelector('a[href^="tel:"]');
      if (tel) data.phone = tel.href.replace('tel:', '').trim();
    }

    // ── Email ─────────────────────────────────────────────────────────────
    data.email = _text([
      '[data-testid="customer-email"]',
      '.customer-email',
      'a[href^="mailto:"]',
      '[class*="emailAddress"]',
    ]);
    if (!data.email) {
      const mail = document.querySelector('a[href^="mailto:"]');
      if (mail) data.email = mail.href.replace('mailto:', '').trim();
    }

    // ── Lead / Customer Status ────────────────────────────────────────────
    data.status = _text([
      '[data-testid="customer-status"]',
      '.customer-status',
      '.lead-status',
      '[class*="customerStatus"]',
      '[class*="leadStatus"]',
    ]);

    // ── Assigned Agent ────────────────────────────────────────────────────
    data.assignedAgent = _text([
      '[data-testid="assigned-agent"]',
      '.assigned-agent',
      '[class*="assignedAgent"]',
      '[class*="ownerAgent"]',
    ]);

    // ── Owner Agent ───────────────────────────────────────────────────────
    data.ownerAgent = _text([
      '[data-testid="owner-agent"]',
      '.owner-agent',
      '[class*="ownerAgent"]',
    ]) || data.assignedAgent;

    // ── Lead Source ───────────────────────────────────────────────────────
    data.leadSource = _text([
      '[data-testid="lead-source"]',
      '.lead-source',
      '[class*="leadSource"]',
      '[class*="source"]',
    ]);

    // ── Days on Redfin ────────────────────────────────────────────────────
    data.daysOnRedfin = _text([
      '[data-testid="days-on-redfin"]',
      '.days-on-redfin',
      '[class*="daysOnRedfin"]',
    ]);

    // ── Last Contact ──────────────────────────────────────────────────────
    data.lastContact = _text([
      '[data-testid="last-contact"]',
      '.last-contact',
      '[class*="lastContact"]',
      '[class*="lastMet"]',
    ]);

    // ── Tags ──────────────────────────────────────────────────────────────
    data.tags = _textArray([
      '[data-testid="tag"]',
      '.tag',
      '[class*="customerTag"]',
      '[class*="leadTag"]',
    ]);

    // ── Follow Up Plan ────────────────────────────────────────────────────
    data.followUpPlan = _text([
      '[data-testid="follow-up-plan"]',
      '.follow-up-plan',
      '[class*="followUpPlan"]',
    ]);

    // ── Next Follow Up Due ────────────────────────────────────────────────
    data.followUpDue = _text([
      '[data-testid="follow-up-due"]',
      '.follow-up-due',
      '[class*="followUpDue"]',
      '[class*="dueDate"]',
    ]);

    // ── Notes ─────────────────────────────────────────────────────────────
    data.notes = _textArray([
      '[data-testid="agent-note"]',
      '.agent-note',
      '.note-text',
      '[class*="noteContent"]',
    ]).slice(0, 5); // cap at 5 most visible notes

    // ── Tours / Appointments ──────────────────────────────────────────────
    data.tours = _parseAppointmentRows();

    // ── Milestones ────────────────────────────────────────────────────────
    data.milestones = _textArray([
      '[data-testid="milestone"]',
      '.milestone',
      '[class*="milestoneItem"]',
    ]).slice(0, 5);

    // ── Property of interest ──────────────────────────────────────────────
    data.propertyOfInterest = _text([
      '[data-testid="property-interest"]',
      '.property-of-interest',
      '[class*="propertyAddress"]',
      '[class*="favoriteProperty"]',
    ]);

    // ── Deal Tasks ────────────────────────────────────────────────────────
    data.dealTasks = _textArray([
      '[data-testid="deal-task"]',
      '.deal-task',
      '[class*="dealTask"]',
    ]).slice(0, 5);

    // ── Emails to Kyle ────────────────────────────────────────────────────
    data.recentEmails = _textArray([
      '[data-testid="email-preview"]',
      '.email-preview',
      '[class*="emailItem"]',
    ]).slice(0, 3);

    // ── Lead type signals ─────────────────────────────────────────────────
    data.leadSignals = _detectLeadSignals(data);

    // ── Risk flags ────────────────────────────────────────────────────────
    data.riskFlags = _detectRiskFlags(data);

    // ── KPI assessment ────────────────────────────────────────────────────
    data.kpiStatus = _assessKPI(data);

    return data;
  }

  /**
   * Extract data from an expanded follow-up row (list page inline expand).
   * @returns {Object}
   */
  function readExpandedFollowUpRow() {
    // Find the expanded row element
    const rowEl = document.querySelector(
      '[data-testid="expanded-followup-row"], .expanded-followup-row, .follow-up-expanded, [class*="followup-expanded"]'
    ) || document.querySelector('[class*="expanded"][class*="row"]');

    if (!rowEl) {
      // Fall back to visible highlighted/selected row
      return readCustomerDetail();
    }

    const data = {};
    const getText = (el, sels) => {
      for (const s of sels) {
        const n = el.querySelector(s);
        if (n && n.innerText.trim()) return n.innerText.trim();
      }
      return null;
    };

    data.name = getText(rowEl, [
      '[class*="customerName"]', '.customer-name', '[data-testid="customer-name"]', 'h2', 'h3',
    ]) || _text(['[data-testid="customer-name"]', '.customer-name']);

    data.phone     = getText(rowEl, ['a[href^="tel:"]', '[class*="phone"]']);
    data.email     = getText(rowEl, ['a[href^="mailto:"]', '[class*="email"]']);
    data.status    = getText(rowEl, ['[class*="status"]', '[class*="leadStatus"]']);
    data.lastContact = getText(rowEl, ['[class*="lastContact"]', '[class*="lastMet"]']);
    data.followUpDue = getText(rowEl, ['[class*="followUpDue"]', '[class*="dueDate"]']);
    data.assignedAgent = getText(rowEl, ['[class*="assignedAgent"]', '[class*="agent"]']);

    data.leadSignals = _detectLeadSignals(data);
    data.riskFlags   = _detectRiskFlags(data);
    data.kpiStatus   = _assessKPI(data);

    return data;
  }

  /**
   * Read appointment rows from the current detail page.
   */
  function _parseAppointmentRows() {
    const rows = [];
    const appointmentEls = document.querySelectorAll(
      '[data-testid="appointment-row"], .appointment-row, [class*="appointmentItem"], [class*="tourItem"]'
    );
    appointmentEls.forEach(el => {
      rows.push({
        type:    _elText(el, '[class*="appointmentType"], [class*="tourType"]'),
        date:    _elText(el, '[class*="date"], [class*="time"]'),
        address: _elText(el, '[class*="address"], [class*="property"]'),
        agent:   _elText(el, '[class*="agent"]'),
        status:  _elText(el, '[class*="status"]'),
      });
    });
    return rows;
  }

  /**
   * Detect lead type signals from extracted data.
   */
  function _detectLeadSignals(data) {
    const signals = [];
    const text = JSON.stringify(data).toLowerCase();

    if (text.includes('new lead'))           signals.push('new_lead');
    if (text.includes('hot'))                signals.push('hot_lead');
    if (text.includes('stale') || (data.daysOnRedfin && parseInt(data.daysOnRedfin) > 90))
                                              signals.push('stale_lead');
    if (text.includes('tour'))               signals.push('has_tour');
    if (text.includes('post tour'))          signals.push('post_tour');
    if (text.includes('no response') || text.includes('no contact'))
                                              signals.push('no_response');
    if (text.includes('canceled'))           signals.push('canceled_tour');
    if (text.includes('buyer consult'))      signals.push('buyer_consult');
    if (text.includes('seller consult') || text.includes('listing consult'))
                                              signals.push('seller_consult');
    if (text.includes('listing request'))    signals.push('listing_request');
    if (text.includes('unclaimed offer'))    signals.push('unclaimed_offer');
    if (text.includes('unclaimed listing'))  signals.push('unclaimed_listing');
    if (text.includes('agent request'))      signals.push('agent_request');

    return signals;
  }

  /**
   * Detect risk flags.
   */
  function _detectRiskFlags(data) {
    const flags = [];

    if (data.assignedAgent && data.ownerAgent &&
        data.assignedAgent.toLowerCase() !== data.ownerAgent.toLowerCase()) {
      flags.push('wrong_agent_risk');
    }

    if (!data.phone && !data.email) flags.push('no_contact_info');
    if (!data.followUpDue && !data.followUpPlan) flags.push('no_followup_plan');

    const days = parseInt(data.daysOnRedfin);
    if (!isNaN(days) && days > 60) flags.push(`stale_${days}d_on_redfin`);

    if (data.email && data.email.toLowerCase().includes('@redfin.com')) {
      flags.push('redfin_internal_email_BLOCK');
    }

    return flags;
  }

  /**
   * Assess KPI health for this customer.
   */
  function _assessKPI(data) {
    const issues = [];

    if (!data.followUpDue && !data.followUpPlan) {
      issues.push('No follow up plan set');
    }
    if (!data.lastContact) {
      issues.push('No recent contact logged');
    }
    if (data.riskFlags && data.riskFlags.includes('no_contact_info')) {
      issues.push('Missing phone and email');
    }

    return {
      protected: issues.length === 0,
      issues,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function _text(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim()) return el.innerText.trim();
      } catch (_) {}
    }
    return null;
  }

  function _textArray(selectors) {
    const results = [];
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach(el => {
          const t = el.innerText.trim();
          if (t && !results.includes(t)) results.push(t);
        });
      } catch (_) {}
    }
    return results;
  }

  function _elText(el, selector) {
    try {
      const n = el.querySelector(selector);
      return n ? n.innerText.trim() : null;
    } catch (_) {
      return null;
    }
  }

  return { readCustomerDetail, readExpandedFollowUpRow };
})();

if (typeof module !== 'undefined') {
  module.exports = { AgentToolsReader };
}
