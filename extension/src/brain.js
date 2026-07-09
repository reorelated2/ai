/**
 * KyleOS — Brain / Mode Router
 * Routes page context to the correct analysis mode and formats output.
 * Pure logic — no DOM access. Receives extracted data, returns structured results.
 */

const Brain = (() => {

  /**
   * Main entry point: take page context and route to the correct mode.
   * @param {{ pageType, platform, data, settings }} ctx
   * @returns {Object} analysis result with mode-specific output
   */
  function analyze(ctx) {
    const { pageType, platform, data, settings } = ctx;

    const PAGE_TYPES = {
      AT_CUSTOMER_DETAIL:   'at_customer_detail',
      AT_EXPANDED_FOLLOWUP: 'at_expanded_followup',
      AT_TEAM_DASHBOARD:    'at_team_dashboard',
      AT_APPOINTMENTS:      'at_appointments',
      AT_PIPELINE:          'at_pipeline',
      AT_PERFORMANCE:       'at_performance',
      AT_HOME:              'at_home',
      AT_CUSTOMERS_LIST:    'at_customers_list',
      AT_DEALS:             'at_deals',
      AT_CALENDAR:          'at_calendar',
      AT_SHARED_QUEUE:      'at_shared_queue',
      MLS_LISTING:          'mls_listing',
      MLS_SEARCH:           'mls_search',
      MLS_COMPS:            'mls_comps',
      OH_CONTACT:           'oh_contact',
      OH_SEARCH:            'oh_search',
      OH_PORTAL:            'oh_portal',
      GMAIL_LEAD_EMAIL:     'gmail_lead_email',
      GMAIL_INBOX:          'gmail_inbox',
      FUB_CONTACT:          'fub_contact',
      FUB_PIPELINE:         'fub_pipeline',
      FUB_DASHBOARD:        'fub_dashboard',
      UNKNOWN:              'unknown',
    };

    switch (pageType) {
      case PAGE_TYPES.AT_CUSTOMER_DETAIL:
      case PAGE_TYPES.AT_EXPANDED_FOLLOWUP:
        return _agentToolsMode(data, settings);

      case PAGE_TYPES.AT_TEAM_DASHBOARD:
      case PAGE_TYPES.AT_APPOINTMENTS:
      case PAGE_TYPES.AT_SHARED_QUEUE:
        return _teamDashboardMode(data, settings);

      case PAGE_TYPES.AT_PIPELINE:
        return _pipelineModeStub(data);

      case PAGE_TYPES.MLS_LISTING:
        return _mlsListingMode(data, settings);

      case PAGE_TYPES.MLS_SEARCH:
      case PAGE_TYPES.MLS_COMPS:
        return _mlsSearchMode(data, settings);

      case PAGE_TYPES.OH_CONTACT:
      case PAGE_TYPES.OH_SEARCH:
      case PAGE_TYPES.OH_PORTAL:
        return _oneHomeMode(data, settings);

      case PAGE_TYPES.GMAIL_LEAD_EMAIL:
        return _gmailLeadMode(data, settings);

      case PAGE_TYPES.FUB_CONTACT:
        return _fubContactMode(data, settings);

      default:
        return _unknownMode(data);
    }
  }

  // ── AGENT TOOLS MODE ───────────────────────────────────────────────────

  function _agentToolsMode(data, settings) {
    const name         = data.name || 'Unknown';
    const first        = name.split(' ')[0];
    const kpi          = data.kpiStatus || { protected: true, issues: [] };
    const signals      = data.leadSignals || [];
    const risks        = data.riskFlags || [];

    // Priority classification
    const priority     = _classifyPriority(signals, kpi, risks);

    // Why it matters
    const whyItMatters = _whyItMatters(data, signals, priority);

    // Next best action
    const nextAction   = _nextBestAction(data, signals, kpi, risks);

    // Agent Tools note (short, factual, paste-ready)
    const agentNote    = _buildAgentNote(data, kpi);

    // Follow up task
    const followUpTask = _buildFollowUpTask(data, signals);

    // SMS draft
    const smsDraft     = _buildSMSDraft(data, signals, first);

    // Call reason
    const callReason   = _buildCallReason(data, signals);

    // Email draft (only if needed — not for @redfin.com)
    const emailDraft   = _buildEmailDraft(data, signals, first);

    return {
      mode:          'Agent Tools',
      sections: [
        { id: 'summary',      label: 'Lead Summary',       content: _buildLeadSummary(data, signals, priority) },
        { id: 'priority',     label: 'Priority',           content: priority.label },
        { id: 'why',          label: 'Why It Matters',     content: whyItMatters },
        { id: 'next_action',  label: 'Next Best Action',   content: nextAction },
        { id: 'agent_note',   label: 'Agent Tools Note',   content: agentNote, copyable: true },
        { id: 'followup',     label: 'Follow Up Task',     content: followUpTask },
        { id: 'sms',          label: 'SMS Draft',          content: smsDraft, copyable: true, actionType: 'send_sms' },
        emailDraft && { id: 'email', label: 'Email Draft', content: emailDraft, copyable: true, actionType: 'send_email' },
        { id: 'call_reason',  label: 'Call Reason',        content: callReason },
        { id: 'kpi',          label: 'KPI Status',         content: _formatKPI(kpi) },
        risks.length && { id: 'risks', label: 'Risk Flags', content: risks, type: 'risk' },
        data.missingInfo && data.missingInfo.length && { id: 'missing', label: 'Missing Info', content: data.missingInfo, type: 'warning' },
        { id: 'click',        label: 'Recommended Click',  content: _recommendedClick(data, signals) },
      ].filter(Boolean),
    };
  }

  function _classifyPriority(signals, kpi, risks) {
    if (signals.includes('new_lead_not_contacted'))
      return { level: 'critical', label: '🔴 Critical — New lead, not yet contacted' };
    if (signals.includes('unclaimed_offer') || signals.includes('unclaimed_listing'))
      return { level: 'critical', label: '🔴 Critical — Unclaimed offer/listing' };
    if (signals.includes('hot_lead'))
      return { level: 'high', label: '🟠 High — Hot lead' };
    if (signals.includes('post_tour'))
      return { level: 'high', label: '🟠 High — Post-tour follow up needed' };
    if (signals.includes('buyer_consult') || signals.includes('seller_consult'))
      return { level: 'high', label: '🟠 High — Consult scheduled or needed' };
    if (!kpi.protected)
      return { level: 'medium', label: '🟡 Medium — KPI action needed' };
    if (signals.includes('stale_lead'))
      return { level: 'low', label: '🔵 Low — Stale, re-engage' };
    return { level: 'normal', label: '✅ Normal' };
  }

  function _buildLeadSummary(data, signals, priority) {
    const parts = [];
    if (data.name) parts.push(data.name);
    if (data.status) parts.push(data.status);
    if (data.leadSource) parts.push(`Source: ${data.leadSource}`);
    if (data.daysOnRedfin) parts.push(`${data.daysOnRedfin}d on Redfin`);
    if (data.lastContact) parts.push(`Last contact: ${data.lastContact}`);
    return parts.join(' · ') || 'Customer detail extracted.';
  }

  function _whyItMatters(data, signals, priority) {
    if (signals.includes('new_lead')) return 'New lead. Speed matters. Call first.';
    if (signals.includes('unclaimed_offer')) return 'Unclaimed offer — revenue at risk. Claim and respond immediately.';
    if (signals.includes('post_tour')) return 'Post-tour. Buyer is warm. Follow up drives the deal forward.';
    if (signals.includes('buyer_consult')) return 'Consult stage. Set it and prep. This is where the relationship locks in.';
    if (signals.includes('seller_consult')) return 'Seller lead. Listing consult is the goal. Prep CMA and strategy.';
    if (signals.includes('stale_lead')) return 'Gone quiet. A simple check-in can re-activate without pressure.';
    if (signals.includes('has_tour')) return 'Has toured. This person is active. Keep the momentum.';
    return 'Active customer requiring follow through.';
  }

  function _nextBestAction(data, signals, kpi, risks) {
    if (risks.includes('redfin_internal_email_BLOCK'))
      return 'BLOCKED: Redfin internal email detected. Do not contact through this agent.';
    if (risks.includes('wrong_agent_risk'))
      return 'Verify lead ownership before outreach. Check assigned and owner agent.';
    if (signals.includes('new_lead_not_contacted') || signals.includes('new_lead'))
      return 'Call now. If no answer, text within 5 minutes. Log attempt in Agent Tools.';
    if (signals.includes('unclaimed_offer'))
      return 'Claim the offer. Open the unclaimed offer, review terms, respond.';
    if (signals.includes('post_tour'))
      return 'Text within 24 hours of tour. Ask one question about the showing.';
    if (signals.includes('buyer_consult'))
      return 'Set the consult. Confirm time, prep buyer questions, send calendar link.';
    if (signals.includes('seller_consult'))
      return 'Schedule listing consult. Pull comps, prep CMA, confirm timeline.';
    if (signals.includes('stale_lead'))
      return 'Send a short re-engagement text. One sentence. No pressure.';
    if (!kpi.protected)
      return kpi.issues[0] ? `Fix KPI: ${kpi.issues[0]}` : 'Set a follow up plan.';
    return 'Log last contact, confirm follow up plan is set.';
  }

  function _buildAgentNote(data, kpi) {
    // Short, factual, broad brush — KPI safe
    const parts = [];
    if (data.status)       parts.push(data.status);
    if (data.lastContact)  parts.push(`Last: ${data.lastContact}`);
    if (data.tours && data.tours.length) parts.push(`${data.tours.length} tour(s)`);
    if (!kpi.protected)    parts.push('KPI: ' + kpi.issues.map(i => i.label || i).join(', '));
    return parts.join(' · ') || 'Review and follow up.';
  }

  function _buildFollowUpTask(data, signals) {
    if (signals.includes('new_lead'))   return 'Call + text within 5 min of lead receipt';
    if (signals.includes('post_tour'))  return 'Post-tour follow up — text same day';
    if (signals.includes('buyer_consult')) return 'Confirm consult — send calendar + prep docs';
    if (signals.includes('seller_consult')) return 'Schedule listing consult — pull CMA';
    if (signals.includes('stale_lead')) return 'Re-engagement text — keep it short';
    return 'Set follow up plan and log contact';
  }

  function _buildSMSDraft(data, signals, first) {
    if (!first || first === 'Unknown') return null;
    if (signals.includes('new_lead'))
      return `Hey ${first}, this is Kyle at Redfin. Just saw your inquiry. Good time to talk?`;
    if (signals.includes('post_tour'))
      return `Hey ${first}, how'd you feel about what you saw today? Anything stand out?`;
    if (signals.includes('buyer_consult'))
      return `Hey ${first}, Kyle here. Ready to set up that buyer consult. What days work?`;
    if (signals.includes('seller_consult'))
      return `Hey ${first}, Kyle at Redfin. Happy to chat about listing strategy. Available this week?`;
    if (signals.includes('stale_lead'))
      return `Hey ${first}, Kyle here. Still thinking about buying in Miami?`;
    return `Hey ${first}, this is Kyle at Redfin. Just checking in — anything I can help with?`;
  }

  function _buildCallReason(data, signals) {
    if (signals.includes('new_lead'))      return 'New lead — introduce, qualify buyer/seller intent, set next step';
    if (signals.includes('post_tour'))     return 'Post-tour debrief — get honest feedback, identify next property or next step';
    if (signals.includes('buyer_consult')) return 'Buyer consult set-up — confirm time, send docs, answer questions';
    if (signals.includes('seller_consult')) return 'Listing consult call — understand goals, timeline, pricing expectations';
    if (signals.includes('stale_lead'))    return 'Re-engagement — quick check-in, no pressure, value add if possible';
    return 'Follow up call — log outcome and set next step';
  }

  function _buildEmailDraft(data, signals, first) {
    // Only build if we have an email AND it's not @redfin.com
    if (!data.email) return null;
    if (data.email.toLowerCase().includes('@redfin.com')) return null; // hard block

    if (signals.includes('buyer_consult')) {
      return `Hi ${first},\n\nGreat connecting with you. I've put together a few notes ahead of our buyer consult.\n\nLet me know if you have any questions before we meet.\n\nKyle Kleinman\nRedfin`;
    }
    return null; // default: no email unless there's a clear reason
  }

  function _formatKPI(kpi) {
    if (kpi.protected) return 'Protected ✅';
    return kpi.issues.map(i => `• ${i.label || i}`).join('\n');
  }

  function _recommendedClick(data, signals) {
    if (signals.includes('unclaimed_offer'))   return 'Click → Unclaimed Offers tab';
    if (signals.includes('unclaimed_listing')) return 'Click → Unclaimed Listings tab';
    if (signals.includes('buyer_consult'))     return 'Click → Calendar → New Appointment';
    if (signals.includes('seller_consult'))    return 'Click → Calendar → New Listing Consult';
    if (!data.followUpPlan)                    return 'Click → Follow Up Plans → Set Plan';
    return 'Click → Notes → Log contact';
  }

  // ── TEAM DASHBOARD MODE ────────────────────────────────────────────────

  function _teamDashboardMode(data, settings) {
    // data is the result from TeamDashboardReader.captureTeamDashboard()
    const packages = (data.packages || []).slice(0, 5); // show top 5 first

    return {
      mode: 'Team Dashboard Capture',
      counters: data.counters || {},
      teamNotes: data.teamNotes || [],
      packages,
      totalRows: data.totalRows || 0,
      capped: data.capped,
      sections: [
        {
          id: 'instructions',
          label: 'Instructions',
          content: 'This is a team/shared view. Each row is a separate package. Outreach requires permission.',
        },
        ...packages.map((pkg, i) => ({
          id: `capture_${i}`,
          label: `#${i + 1} — ${pkg.name || 'Unknown'} (${pkg.opportunityType || 'Unknown'})`,
          content: pkg,
          type: 'capture_package',
        })),
        data.capped && {
          id: 'more',
          label: 'More Rows Available',
          content: `Showing top 5 of ${data.totalRows} rows. Click "Analyze More" to continue.`,
        },
      ].filter(Boolean),
    };
  }

  // ── MLS LISTING MODE ───────────────────────────────────────────────────

  function _mlsListingMode(data, settings) {
    return {
      mode: 'MLS Listing',
      sections: [
        { id: 'summary',    label: 'MLS Summary',              content: data.summary || _extractPageText(500) },
        { id: 'client',     label: 'Client Take',              content: 'Review the listing details and decide if worth touring.' },
        { id: 'agent',      label: 'Agent Take',               content: 'Check DOM, price history, broker remarks, and showing instructions.' },
        { id: 'red_flags',  label: 'Red Flags',                content: _detectMLSRedFlags(data), type: 'risk' },
        { id: 'show_prep',  label: 'Showing Prep',             content: 'Confirm showing window. Review access type. Prep client.' },
        { id: 'questions',  label: 'Questions for List Agent', content: 'Motivation to sell? Any offers? Assessment status? HOA approval timeline?' },
        { id: 'missing',    label: 'Missing Info',             content: 'Open full listing — check broker remarks, attachments, showing instructions.', type: 'warning' },
      ],
    };
  }

  function _detectMLSRedFlags(data) {
    const flags = [];
    const text = JSON.stringify(data).toLowerCase();
    if (text.includes('as is'))       flags.push('As-Is listing — inspection period critical');
    if (text.includes('short sale'))  flags.push('Short sale — longer timeline, lender approval needed');
    if (text.includes('reo') || text.includes('bank owned')) flags.push('REO/Bank-owned — special addenda likely');
    if (text.includes('special assessment')) flags.push('Special assessment disclosed — verify amount and timeline');
    if (text.includes('no rental') || text.includes('rental restriction')) flags.push('Rental restrictions — verify before investor pitch');
    if (text.includes('foreign') || text.includes('sb264')) flags.push('Potential SB264 / foreign buyer flag — verify');
    return flags.length ? flags : ['No red flags detected from visible text — verify full listing'];
  }

  // ── MLS SEARCH MODE ────────────────────────────────────────────────────

  function _mlsSearchMode(data, settings) {
    return {
      mode: 'MLS Search / Comps',
      sections: [
        { id: 'search_goal',  label: 'Search Goal',        content: 'Define criteria and run comps.' },
        { id: 'comps_found',  label: 'Comps Found',        content: 'Review visible results for comp quality.' },
        { id: 'comp_notes',   label: 'Comp Notes',         content: 'Check for same building, size, bed/bath, view, condition.' },
        { id: 'value_range',  label: 'Value Range',        content: 'Pending: need full comp data to output range.' },
        { id: 'missing',      label: 'Missing Info',       content: 'Pull full sold comps — filter closed 90 days, same sub/building.', type: 'warning' },
      ],
    };
  }

  // ── ONEHOME MODE ───────────────────────────────────────────────────────

  function _oneHomeMode(data, settings) {
    return {
      mode: 'OneHome',
      sections: [
        { id: 'contact',    label: 'Contact Setup',      content: 'Review client details and confirm search criteria.' },
        { id: 'search',     label: 'Search Criteria',    content: 'Build filters based on buyer needs.' },
        { id: 'alerts',     label: 'Alerts',             content: 'Set price, neighborhood, and new listing alerts.' },
        { id: 'properties', label: 'Properties to Send', content: 'Review active listings matching criteria.' },
        { id: 'note',       label: 'Agent Note',         content: 'Add internal note to client portal.' },
        { id: 'missing',    label: 'Missing Info',       content: 'Confirm criteria with client before setting alerts.', type: 'warning' },
      ],
    };
  }

  // ── GMAIL LEAD MODE ────────────────────────────────────────────────────

  function _gmailLeadMode(data, settings) {
    return {
      mode: 'Gmail Lead Parser',
      sections: [
        { id: 'summary',   label: 'Lead Summary',       content: data.leadSummary || _extractPageText(300) },
        { id: 'fub',       label: 'FUB Contact Record', content: data.fubRecord || 'Extract contact and build CRM record.' },
        { id: 'followup',  label: 'Follow Up Task',     content: data.followUpTask || 'Log lead and set follow up.' },
        { id: 'sms',       label: 'SMS Draft',          content: data.smsDraft || null, copyable: true, actionType: 'send_sms' },
        { id: 'risks',     label: 'Risk Flags',         content: data.riskFlags || [], type: 'risk' },
        { id: 'missing',   label: 'Missing Info',       content: data.missingInfo || [], type: 'warning' },
      ].filter(s => s.content || s.type),
    };
  }

  // ── FUB CONTACT MODE ───────────────────────────────────────────────────

  function _fubContactMode(data, settings) {
    return {
      mode: 'FUB / CRM Contact',
      sections: [
        { id: 'contact',  label: 'Contact Info',  content: data.contactInfo || 'Review contact fields.' },
        { id: 'stage',    label: 'Pipeline Stage', content: data.pipelineStage || 'Verify stage.' },
        { id: 'tasks',    label: 'Open Tasks',     content: data.tasks || 'Check open tasks and follow ups.' },
        { id: 'note',     label: 'Add Note',       content: 'Log last action and set next step.' },
      ],
    };
  }

  // ── PIPELINE MODE STUB ─────────────────────────────────────────────────

  function _pipelineModeStub(data) {
    return {
      mode: 'Pipeline Mining',
      sections: [
        { id: 'info', label: 'Pipeline Mining', content: 'Scan visible pipeline rows. Use Manual Analyze for Database Capture.' },
      ],
    };
  }

  // ── UNKNOWN MODE ───────────────────────────────────────────────────────

  function _unknownMode(data) {
    return {
      mode: 'Unknown Page',
      sections: [
        { id: 'info', label: 'Page Not Recognized', content: 'Navigate to Agent Tools, MLS, OneHome, or Gmail, then click Analyze.' },
      ],
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  function _extractPageText(maxLen) {
    try {
      return document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, maxLen);
    } catch (_) {
      return '';
    }
  }

  return { analyze };
})();

if (typeof module !== 'undefined') {
  module.exports = { Brain };
}
