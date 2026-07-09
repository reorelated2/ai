/**
 * KyleOS — Team Dashboard & Appointments Database Capture Mode
 * Reads team-level list pages and builds per-person capture packages.
 * Does NOT auto-analyze — only runs when Kyle triggers Manual Analyze.
 */

const TeamDashboardReader = (() => {

  const APPOINTMENT_TYPES = {
    TOUR:              'Buyer Tour',
    BUYER_CONSULT:     'Buyer Consult',
    SELLER_CONSULT:    'Seller Listing Consult',
    LISTING_REQUEST:   'Listing Request',
    ON_MARKET_CHECKIN: 'On Market Check-In',
    CLOSING:           'Closing',
    OFFER:             'Offer',
    UNKNOWN:           'Unknown',
  };

  const OPPORTUNITY_TYPES = {
    BUYER_TOUR:          'Buyer Tour',
    BUYER_CONSULT:       'Buyer Consult',
    SELLER_LISTING:      'Seller Listing Consult',
    SELLER_PLUS_BUYER:   'Seller + Buyer Opportunity',
    LISTING:             'Listing Opportunity',
    INVESTOR:            'Investor Opportunity',
    RENTAL:              'Rental Opportunity',
    PAST_CLIENT_FOLLOWUP:'Past Client Follow Up',
    CLOSING_RELATED:     'Closing Related',
    UNKNOWN:             'Unknown',
  };

  /**
   * Capture all visible opportunity rows from a team dashboard or appointments page.
   * Returns an array of capture packages (one per person/appointment).
   * Caps at 20 rows to prevent overload; Kyle can request more.
   */
  function captureTeamDashboard() {
    const packages = [];

    // Read opportunity counters from top-right panel
    const counters = _readOpportunityCounters();

    // Read appointment / list rows
    const rows = _readAppointmentRows();

    // Read any team notes or recent tour insights
    const teamNotes = _readTeamNotes();

    rows.slice(0, 20).forEach((row, i) => {
      packages.push(_buildCapturePackage(row, i + 1));
    });

    return {
      counters,
      teamNotes,
      packages,
      totalRows: rows.length,
      capped: rows.length > 20,
    };
  }

  /**
   * Read the opportunity counters visible in the top-right of the Agent Tools dashboard.
   */
  function _readOpportunityCounters() {
    const counters = {};
    const counterEls = document.querySelectorAll(
      '[data-testid="opportunity-counter"], [class*="opportunityCounter"], [class*="counter-badge"], [class*="counterBadge"]'
    );

    counterEls.forEach(el => {
      const label = el.innerText.trim();
      const match = label.match(/(\d+)/);
      if (match) {
        counters[label.replace(/\d+/, '').trim()] = parseInt(match[1]);
      }
    });

    // Also try structured counter cards
    const counterCards = document.querySelectorAll(
      '[class*="opportunityCard"], [class*="kpiCard"], [class*="dashboardCard"]'
    );
    counterCards.forEach(card => {
      const title = _elText(card, '[class*="title"], [class*="label"], h3, h4');
      const count = _elText(card, '[class*="count"], [class*="number"], span');
      if (title && count) {
        counters[title.trim()] = count.trim();
      }
    });

    return counters;
  }

  /**
   * Read all visible appointment / list rows.
   */
  function _readAppointmentRows() {
    const rowSelectors = [
      '[data-testid="appointment-row"]',
      '[data-testid="customer-row"]',
      '[class*="appointmentRow"]',
      '[class*="customerRow"]',
      '[class*="tourRow"]',
      '[class*="listRow"]',
      'tbody tr',
      '.row-item',
    ];

    for (const sel of rowSelectors) {
      const rows = Array.from(document.querySelectorAll(sel));
      if (rows.length > 0) return rows.map(_parseRowElement);
    }

    return [];
  }

  /**
   * Parse a single row element into structured data.
   */
  function _parseRowElement(el) {
    const text = el.innerText || '';

    return {
      raw: text.slice(0, 500),
      name:         _elText(el, '[class*="customerName"], [class*="name"], td:nth-child(1)'),
      phone:        _elText(el, '[class*="phone"], a[href^="tel:"]') || _extractPhone(text),
      email:        _elText(el, '[class*="email"], a[href^="mailto:"]') || _extractEmail(text),
      appointmentType: _elText(el, '[class*="appointmentType"], [class*="type"], td:nth-child(2)'),
      date:         _elText(el, '[class*="date"], [class*="time"], [class*="scheduled"]'),
      requestedTime: _elText(el, '[class*="requestedTime"], [class*="requested"]'),
      address:      _elText(el, '[class*="address"], [class*="property"]'),
      mlsNumber:    _elText(el, '[class*="mlsNumber"], [class*="mls"]') || _extractMLS(text),
      price:        _elText(el, '[class*="price"], [class*="listPrice"]'),
      assignedAgent: _elText(el, '[class*="assignedAgent"], [class*="agent"]'),
      ownerAgent:   _elText(el, '[class*="ownerAgent"]'),
      team:         _elText(el, '[class*="team"]'),
      status:       _elText(el, '[class*="status"]'),
      idVerified:   text.toLowerCase().includes('id verified') || text.toLowerCase().includes('id:'),
      preapproved:  text.toLowerCase().includes('preapproved') || text.toLowerCase().includes('pre-approved'),
      building:     _elText(el, '[class*="building"], [class*="subdivision"]'),
      leadSource:   _elText(el, '[class*="leadSource"], [class*="source"]'),
      notes:        _elText(el, '[class*="note"]'),
    };
  }

  /**
   * Classify the opportunity type from row data.
   */
  function _classifyOpportunity(row) {
    const type = (row.appointmentType || '').toLowerCase();
    const raw  = (row.raw || '').toLowerCase();

    if (type.includes('listing consult') || type.includes('seller consult') || raw.includes('listing consult'))
      return OPPORTUNITY_TYPES.SELLER_LISTING;
    if (type.includes('buyer consult'))
      return OPPORTUNITY_TYPES.BUYER_CONSULT;
    if (type.includes('tour') || type.includes('showing'))
      return OPPORTUNITY_TYPES.BUYER_TOUR;
    if (type.includes('closing'))
      return OPPORTUNITY_TYPES.CLOSING_RELATED;
    if (type.includes('offer'))
      return OPPORTUNITY_TYPES.LISTING;
    if (raw.includes('investor') || raw.includes('investment'))
      return OPPORTUNITY_TYPES.INVESTOR;
    if (raw.includes('rental') || raw.includes('rent'))
      return OPPORTUNITY_TYPES.RENTAL;
    if (raw.includes('past client'))
      return OPPORTUNITY_TYPES.PAST_CLIENT_FOLLOWUP;

    return OPPORTUNITY_TYPES.UNKNOWN;
  }

  /**
   * Build the full capture package for a single row.
   */
  function _buildCapturePackage(row, index) {
    const oppType   = _classifyOpportunity(row);
    const riskFlags = _buildRiskFlags(row);
    const missing   = _buildMissingInfo(row);

    return {
      index,
      source:          'team_shared',
      permissionRequired: true, // ALL team source contacts require permission gate
      name:            row.name           || 'Unknown',
      phone:           row.phone          || null,
      email:           row.email          || null,
      appointmentType: row.appointmentType || 'Unknown',
      opportunityType: oppType,
      date:            row.date           || null,
      requestedTime:   row.requestedTime  || null,
      address:         row.address        || null,
      mlsNumber:       row.mlsNumber      || null,
      price:           row.price          || null,
      building:        row.building       || null,
      assignedAgent:   row.assignedAgent  || null,
      ownerAgent:      row.ownerAgent     || null,
      team:            row.team           || null,
      status:          row.status         || null,
      idVerified:      row.idVerified,
      preapproved:     row.preapproved,
      leadSource:      row.leadSource     || null,
      notes:           row.notes          || null,
      riskFlags,
      missingInfo:     missing,
      // CRM draft
      fubRecord:       _buildFUBRecord(row, oppType),
      smsDraft:        _buildSMSDraft(row, oppType),
      // Recommended next click
      recommendedNextClick: _recommendNextClick(row),
    };
  }

  /**
   * Build risk flags for a team capture row.
   */
  function _buildRiskFlags(row) {
    const flags = [];

    if (!row.name) flags.push('Name not visible');
    if (!row.phone && !row.email) flags.push('No contact info visible from list view');

    if (row.assignedAgent && row.ownerAgent &&
        row.assignedAgent.toLowerCase() !== row.ownerAgent.toLowerCase()) {
      flags.push('Assigned agent ≠ owner agent — verify lead ownership');
    }

    if (row.email && row.email.toLowerCase().includes('@redfin.com')) {
      flags.push('BLOCKED: @redfin.com internal email — do not contact through this agent');
    }

    if (!row.idVerified && row.appointmentType && row.appointmentType.toLowerCase().includes('tour')) {
      flags.push('ID not verified for tour');
    }

    return flags;
  }

  /**
   * Build the missing info list.
   */
  function _buildMissingInfo(row) {
    const missing = [];
    if (!row.phone) missing.push('Phone not visible — open appointment or customer detail to capture');
    if (!row.email) missing.push('Email not visible — open appointment or customer detail to capture');
    if (!row.address && !row.building) missing.push('Property address not visible');
    if (!row.assignedAgent) missing.push('Assigned agent not visible');
    return missing;
  }

  /**
   * Build a FUB contact record draft.
   */
  function _buildFUBRecord(row, oppType) {
    return {
      contactName:    row.name           || '',
      phone:          row.phone          || 'SEE APPOINTMENT',
      email:          row.email          || 'SEE APPOINTMENT',
      leadType:       oppType,
      leadSource:     row.leadSource     || 'Redfin Agent Tools',
      pipelineStage:  _pipelineStage(oppType),
      assignedAgent:  'Kyle Kleinman',
      tags:           _buildTags(row, oppType),
      propertyAddress: row.address        || '',
      mlsNumber:      row.mlsNumber       || '',
      budget:         row.price           || '',
      lastActivity:   row.date            || '',
      nextAction:     _nextAction(oppType),
      internalNote:   _buildNote(row, oppType),
    };
  }

  function _pipelineStage(oppType) {
    const stages = {
      [OPPORTUNITY_TYPES.BUYER_TOUR]:          'Active Buyer',
      [OPPORTUNITY_TYPES.BUYER_CONSULT]:       'New Buyer Lead',
      [OPPORTUNITY_TYPES.SELLER_LISTING]:      'Seller Lead',
      [OPPORTUNITY_TYPES.SELLER_PLUS_BUYER]:   'Active Buyer / Seller Lead',
      [OPPORTUNITY_TYPES.LISTING]:             'Listing',
      [OPPORTUNITY_TYPES.INVESTOR]:            'Investor',
      [OPPORTUNITY_TYPES.RENTAL]:              'Rental',
      [OPPORTUNITY_TYPES.PAST_CLIENT_FOLLOWUP]:'Past Client',
      [OPPORTUNITY_TYPES.CLOSING_RELATED]:     'Under Contract',
      [OPPORTUNITY_TYPES.UNKNOWN]:             'New Lead',
    };
    return stages[oppType] || 'New Lead';
  }

  function _buildTags(row, oppType) {
    const tags = ['redfin-source', 'team-capture'];
    if (oppType !== OPPORTUNITY_TYPES.UNKNOWN) tags.push(oppType.toLowerCase().replace(/ /g, '-'));
    if (row.idVerified) tags.push('id-verified');
    if (row.preapproved) tags.push('preapproved');
    if (row.team) tags.push(`team:${row.team.toLowerCase()}`);
    return tags;
  }

  function _nextAction(oppType) {
    const actions = {
      [OPPORTUNITY_TYPES.BUYER_TOUR]:          'Confirm tour — review property, prep buyer',
      [OPPORTUNITY_TYPES.BUYER_CONSULT]:       'Schedule buyer consult call',
      [OPPORTUNITY_TYPES.SELLER_LISTING]:      'Schedule listing consult — prep CMA',
      [OPPORTUNITY_TYPES.SELLER_PLUS_BUYER]:   'Schedule consult — cover both sides',
      [OPPORTUNITY_TYPES.LISTING]:             'Review listing details — prep strategy',
      [OPPORTUNITY_TYPES.INVESTOR]:            'Qualify criteria — prep investor search',
      [OPPORTUNITY_TYPES.RENTAL]:              'Qualify rental needs',
      [OPPORTUNITY_TYPES.PAST_CLIENT_FOLLOWUP]:'Reach out — reconnect and check in',
      [OPPORTUNITY_TYPES.CLOSING_RELATED]:     'Review closing timeline and tasks',
      [OPPORTUNITY_TYPES.UNKNOWN]:             'Open appointment detail — gather context',
    };
    return actions[oppType] || 'Review and qualify';
  }

  function _buildNote(row, oppType) {
    const parts = [];
    if (oppType !== OPPORTUNITY_TYPES.UNKNOWN) parts.push(`${oppType}.`);
    if (row.appointmentType) parts.push(`Appointment: ${row.appointmentType}.`);
    if (row.date) parts.push(`Date: ${row.date}.`);
    if (row.address) parts.push(`Property: ${row.address}.`);
    if (row.price) parts.push(`Price: ${row.price}.`);
    if (row.idVerified) parts.push('ID verified.');
    if (row.preapproved) parts.push('Pre-approved.');
    if (row.assignedAgent) parts.push(`Assigned: ${row.assignedAgent}.`);
    parts.push('Source: Redfin team/shared queue. Permission required before outreach.');
    return parts.join(' ');
  }

  function _buildSMSDraft(row, oppType) {
    if (!row.name) return null;
    const first = row.name.split(' ')[0];

    const drafts = {
      [OPPORTUNITY_TYPES.BUYER_TOUR]:
        `Hey ${first}, this is Kyle at Redfin. Confirming your tour. Let me know if anything changed.`,
      [OPPORTUNITY_TYPES.BUYER_CONSULT]:
        `Hey ${first}, Kyle here from Redfin. Wanted to connect about buying. Quick call this week?`,
      [OPPORTUNITY_TYPES.SELLER_LISTING]:
        `Hey ${first}, Kyle Kleinman with Redfin. Saw you were interested in listing — happy to chat about strategy.`,
      [OPPORTUNITY_TYPES.UNKNOWN]:
        `Hey ${first}, this is Kyle at Redfin. Just wanted to connect. Good time to talk?`,
    };

    return drafts[oppType] || drafts[OPPORTUNITY_TYPES.UNKNOWN];
  }

  function _recommendNextClick(row) {
    if (!row.name && !row.phone) {
      return 'Open appointment row → open customer detail to capture contact info';
    }
    if (row.appointmentType && row.appointmentType.toLowerCase().includes('tour')) {
      return 'Open appointment row → review tour details and confirm';
    }
    if (row.appointmentType && row.appointmentType.toLowerCase().includes('listing')) {
      return 'Open appointment row → open listing consult details';
    }
    return 'Open appointment row → open customer detail';
  }

  /**
   * Read team notes / recent tour insights if visible.
   */
  function _readTeamNotes() {
    return Array.from(document.querySelectorAll(
      '[class*="teamNote"], [class*="recentTourInsight"], [class*="tourInsight"]'
    )).map(el => el.innerText.trim()).filter(Boolean).slice(0, 5);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function _elText(el, selector) {
    try {
      const n = el.querySelector(selector);
      return n ? n.innerText.trim() || null : null;
    } catch (_) { return null; }
  }

  function _extractPhone(text) {
    const m = text.match(/(\+?1?\s*[\(\-]?\d{3}[\)\-\s]?\s*\d{3}[\-\s]\d{4})/);
    return m ? m[1].trim() : null;
  }

  function _extractEmail(text) {
    const m = text.match(/[\w.+\-]+@[\w\-]+\.[\w.]+/);
    return m ? m[0] : null;
  }

  function _extractMLS(text) {
    const m = text.match(/\b([A-Z]{0,3}\d{6,10})\b/);
    return m ? m[1] : null;
  }

  return { captureTeamDashboard, OPPORTUNITY_TYPES, APPOINTMENT_TYPES };
})();

if (typeof module !== 'undefined') {
  module.exports = { TeamDashboardReader };
}
