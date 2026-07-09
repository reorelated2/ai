/**
 * KyleOS Panel — Main UI Controller
 * Handles page detection display, analysis rendering, approval gates,
 * permission gates, copy actions, and settings.
 */

'use strict';

// ── Elements ───────────────────────────────────────────────────────────────
const $modeBadge     = document.getElementById('mode-badge');
const $statusBar     = document.getElementById('status-bar');
const $statusText    = document.getElementById('status-text');
const $platformLabel = document.getElementById('platform-label');
const $outputArea    = document.getElementById('output-area');
const $welcome       = document.getElementById('welcome');
const $approvalGate  = document.getElementById('approval-gate');
const $approvalMsg   = document.getElementById('approval-message');
const $btnApprove    = document.getElementById('btn-approve');
const $btnReject     = document.getElementById('btn-reject');
const $btnAnalyze    = document.getElementById('btn-analyze');
const $btnSettings   = document.getElementById('btn-settings');
const $settingsPanel = document.getElementById('settings-panel');
const $btnSaveSettings    = document.getElementById('btn-save-settings');
const $btnCloseSettings   = document.getElementById('btn-close-settings');
const $settingAgentName   = document.getElementById('setting-agent-name');
const $settingBrokerage   = document.getElementById('setting-brokerage');
const $settingMarket      = document.getElementById('setting-market');
const $settingApiKey      = document.getElementById('setting-api-key');

// ── State ──────────────────────────────────────────────────────────────────
let currentPageInfo  = null;
let pendingApproval  = null;
let settings         = {};

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  await loadSettings();
  setupEventListeners();
  requestPageInfo();

  // Listen for page changes pushed from content script via background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'PAGE_INFO') {
      currentPageInfo = msg.payload;
      updatePlatformBar(msg.payload);
    }
  });
}

// ── Settings ───────────────────────────────────────────────────────────────
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(['agentName', 'brokerage', 'market', 'apiKey'], (res) => {
      settings = {
        agentName:  res.agentName  || 'Kyle Kleinman',
        brokerage:  res.brokerage  || 'Redfin',
        market:     res.market     || 'Miami, FL',
        apiKey:     res.apiKey     || '',
      };
      $settingAgentName.value = settings.agentName;
      $settingBrokerage.value = settings.brokerage;
      $settingMarket.value    = settings.market;
      $settingApiKey.value    = settings.apiKey;
      resolve();
    });
  });
}

function saveSettings() {
  settings = {
    agentName: $settingAgentName.value.trim() || 'Kyle Kleinman',
    brokerage: $settingBrokerage.value.trim() || 'Redfin',
    market:    $settingMarket.value.trim()    || 'Miami, FL',
    apiKey:    $settingApiKey.value.trim(),
  };
  chrome.storage.sync.set(settings);
  showStatus('Settings saved.', 1800);
  $settingsPanel.classList.add('hidden');
}

// ── Event Listeners ────────────────────────────────────────────────────────
function setupEventListeners() {
  $btnAnalyze.addEventListener('click', handleAnalyze);
  $btnSettings.addEventListener('click', () => $settingsPanel.classList.remove('hidden'));
  $btnSaveSettings.addEventListener('click', saveSettings);
  $btnCloseSettings.addEventListener('click', () => $settingsPanel.classList.add('hidden'));
  $btnApprove.addEventListener('click', () => resolveApproval(true));
  $btnReject.addEventListener('click',  () => resolveApproval(false));
}

// ── Page Info ──────────────────────────────────────────────────────────────
function requestPageInfo() {
  chrome.runtime.sendMessage({ type: 'GET_PAGE_INFO' }, (res) => {
    if (chrome.runtime.lastError || !res) {
      updatePlatformBar({ platform: 'unknown', pageType: 'unknown', url: '' });
      return;
    }
    currentPageInfo = res;
    updatePlatformBar(res);
  });
}

function updatePlatformBar(pageInfo) {
  if (!pageInfo) return;

  const modeLabels = {
    at_customer_detail:   'Agent Tools',
    at_expanded_followup: 'KPI Follow Up',
    at_team_dashboard:    'Team Dashboard',
    at_appointments:      'Appointments',
    at_pipeline:          'Pipeline Mining',
    at_customers_list:    'Customers',
    at_shared_queue:      'Shared Queue',
    mls_listing:          'MLS Listing',
    mls_search:           'MLS Search',
    mls_comps:            'CMA / Comps',
    oh_contact:           'OneHome Contact',
    oh_search:            'OneHome Search',
    oh_portal:            'OneHome Portal',
    gmail_lead_email:     'Gmail Lead',
    gmail_inbox:          'Gmail',
    fub_contact:          'FUB Contact',
    fub_pipeline:         'FUB Pipeline',
    unknown:              'Unknown',
  };

  const platformNames = {
    agent_tools: 'Agent Tools',
    mls:         'MLS',
    onehome:     'OneHome',
    gmail:       'Gmail',
    fub:         'Follow Up Boss',
    unknown:     'Unknown',
  };

  const modeLabel    = modeLabels[pageInfo.pageType]   || pageInfo.pageType || 'Unknown';
  const platformName = platformNames[pageInfo.platform] || pageInfo.platform || 'Unknown';

  $modeBadge.textContent     = modeLabel;
  $platformLabel.textContent = `${platformName} · ${modeLabel}`;

  // Show auto-analyze prompt for single-record pages
  if (pageInfo.autoAnalyze) {
    showStatus('Page detected — click Analyze to start.', 0);
  } else if (pageInfo.isList) {
    showStatus('List page — click Analyze for Database Capture.', 0);
  } else {
    hideStatus();
  }
}

// ── Analysis ───────────────────────────────────────────────────────────────
async function handleAnalyze() {
  $btnAnalyze.disabled = true;
  $btnAnalyze.innerHTML = '<span class="spinner"></span>Analyzing…';
  clearOutput();

  try {
    const response = await sendMessage({ type: 'ANALYZE_PAGE' });

    if (!response || response.error) {
      renderError(response ? response.error : 'Could not reach page. Reload and try again.');
      return;
    }

    const { pageInfo, data } = response;
    currentPageInfo = pageInfo;
    updatePlatformBar(pageInfo);

    // Route to correct brain mode
    const result = runBrain(pageInfo, data);
    renderResult(result);

  } catch (err) {
    renderError('Analysis failed: ' + err.message);
  } finally {
    $btnAnalyze.disabled = false;
    $btnAnalyze.textContent = 'Analyze';
  }
}

// ── Brain (inline routing) ─────────────────────────────────────────────────
function runBrain(pageInfo, data) {
  const { pageType } = pageInfo;

  if (['at_customer_detail', 'at_expanded_followup'].includes(pageType)) {
    return analyzeAgentTools(data);
  }
  if (['at_team_dashboard', 'at_appointments', 'at_shared_queue', 'at_customers_list'].includes(pageType)) {
    return analyzeTeamDashboard(data);
  }
  if (pageType === 'mls_listing') {
    return analyzeMLSListing(data);
  }
  if (['mls_search', 'mls_comps'].includes(pageType)) {
    return analyzeMLSSearch(data);
  }
  if (['oh_contact', 'oh_search', 'oh_portal'].includes(pageType)) {
    return analyzeOneHome(data);
  }
  if (pageType === 'gmail_lead_email') {
    return analyzeGmailLead(data);
  }
  if (pageType === 'fub_contact') {
    return analyzeFUBContact(data);
  }
  return { mode: 'Unknown', sections: [{ id: 'info', label: 'Page Not Recognized', content: 'Navigate to Agent Tools, MLS, OneHome, or Gmail then click Analyze.' }] };
}

// ── Agent Tools Analysis ───────────────────────────────────────────────────
function analyzeAgentTools(data) {
  const name    = data.name    || 'Unknown';
  const first   = name.split(' ')[0];
  const signals = data.leadSignals || [];
  const kpi     = data.kpiStatus  || { protected: true, issues: [] };
  const risks   = data.riskFlags  || [];

  const priority = classifyPriority(signals, kpi, risks);

  const sections = [];

  // Lead Summary
  const summaryParts = [name];
  if (data.status)      summaryParts.push(data.status);
  if (data.leadSource)  summaryParts.push(`Source: ${data.leadSource}`);
  if (data.daysOnRedfin) summaryParts.push(`${data.daysOnRedfin}d on Redfin`);
  if (data.lastContact) summaryParts.push(`Last contact: ${data.lastContact}`);
  sections.push({ id: 'summary',     label: 'Lead Summary',      content: summaryParts.join(' · ') });
  sections.push({ id: 'priority',    label: 'Priority',          content: priority.label });
  sections.push({ id: 'why',         label: 'Why It Matters',    content: whyItMatters(signals) });
  sections.push({ id: 'next_action', label: 'Next Best Action',  content: nextBestAction(data, signals, kpi, risks) });
  sections.push({ id: 'agent_note',  label: 'Agent Tools Note',  content: buildAgentNote(data, kpi), copyable: true });
  sections.push({ id: 'followup',    label: 'Follow Up Task',    content: buildFollowUpTask(signals) });

  const sms = buildSMSDraft(first, signals);
  if (sms) sections.push({ id: 'sms', label: 'SMS Draft', content: sms, copyable: true, actionType: 'send_sms' });

  const email = buildEmailDraft(data, first, signals);
  if (email) sections.push({ id: 'email', label: 'Email Draft', content: email, copyable: true, actionType: 'send_email' });

  sections.push({ id: 'call_reason', label: 'Call Reason', content: buildCallReason(signals) });
  sections.push({ id: 'kpi',         label: 'KPI Status',  content: kpi.protected ? 'Protected ✅' : kpi.issues.map(i => `• ${i}`).join('\n') });

  if (risks.length) sections.push({ id: 'risks',   label: 'Risk Flags',  content: risks, type: 'risk' });
  sections.push({ id: 'click', label: 'Recommended Click', content: recommendedClick(signals, data) });

  return { mode: 'Agent Tools', sections };
}

function classifyPriority(signals, kpi, risks) {
  if (signals.includes('new_lead') && !signals.includes('has_tour'))
    return { level: 'critical', label: '🔴 Critical — New lead, contact now' };
  if (signals.includes('unclaimed_offer') || signals.includes('unclaimed_listing'))
    return { level: 'critical', label: '🔴 Critical — Unclaimed offer or listing' };
  if (signals.includes('hot_lead'))
    return { level: 'high',     label: '🟠 High — Hot lead' };
  if (signals.includes('post_tour'))
    return { level: 'high',     label: '🟠 High — Post-tour follow up needed' };
  if (signals.includes('buyer_consult') || signals.includes('seller_consult'))
    return { level: 'high',     label: '🟠 High — Consult scheduled or needed' };
  if (!kpi.protected)
    return { level: 'medium',   label: '🟡 Medium — KPI action needed' };
  if (signals.includes('stale_lead'))
    return { level: 'low',      label: '🔵 Low — Stale, re-engage' };
  return { level: 'normal',     label: '✅ Normal' };
}

function whyItMatters(signals) {
  if (signals.includes('new_lead'))       return 'New lead. Speed matters. Call first.';
  if (signals.includes('unclaimed_offer'))return 'Unclaimed offer — revenue at risk. Claim and respond immediately.';
  if (signals.includes('post_tour'))      return 'Post-tour. Buyer is warm. Follow up drives the deal forward.';
  if (signals.includes('buyer_consult'))  return 'Consult stage. Set it and prep. This is where the relationship locks in.';
  if (signals.includes('seller_consult')) return 'Seller lead. Listing consult is the goal. Prep CMA and strategy.';
  if (signals.includes('stale_lead'))     return 'Gone quiet. A simple check-in can re-activate without pressure.';
  if (signals.includes('has_tour'))       return 'Has toured. This person is active. Keep the momentum.';
  return 'Active customer requiring follow through.';
}

function nextBestAction(data, signals, kpi, risks) {
  if (risks.includes('redfin_internal_email_BLOCK'))
    return 'BLOCKED: Redfin internal email detected. Do not contact through this agent.';
  if (risks.includes('wrong_agent_risk'))
    return 'Verify lead ownership before outreach. Check assigned and owner agent.';
  if (signals.includes('new_lead'))
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

function buildAgentNote(data, kpi) {
  const parts = [];
  if (data.status)       parts.push(data.status);
  if (data.lastContact)  parts.push(`Last: ${data.lastContact}`);
  if (data.tours && data.tours.length) parts.push(`${data.tours.length} tour(s)`);
  if (!kpi.protected)    parts.push('KPI: ' + kpi.issues.join(', '));
  return parts.join(' · ') || 'Review and follow up.';
}

function buildFollowUpTask(signals) {
  if (signals.includes('new_lead'))      return 'Call + text within 5 min of lead receipt';
  if (signals.includes('post_tour'))     return 'Post-tour follow up — text same day';
  if (signals.includes('buyer_consult')) return 'Confirm consult — send calendar + prep docs';
  if (signals.includes('seller_consult'))return 'Schedule listing consult — pull CMA';
  if (signals.includes('stale_lead'))    return 'Re-engagement text — keep it short';
  return 'Set follow up plan and log contact';
}

function buildSMSDraft(first, signals) {
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

function buildCallReason(signals) {
  if (signals.includes('new_lead'))      return 'New lead — introduce, qualify buyer/seller intent, set next step';
  if (signals.includes('post_tour'))     return 'Post-tour debrief — get honest feedback, identify next step';
  if (signals.includes('buyer_consult')) return 'Buyer consult set-up — confirm time, send docs, answer questions';
  if (signals.includes('seller_consult'))return 'Listing consult call — understand goals, timeline, pricing expectations';
  if (signals.includes('stale_lead'))    return 'Re-engagement — quick check-in, no pressure, value add if possible';
  return 'Follow up call — log outcome and set next step';
}

function buildEmailDraft(data, first, signals) {
  if (!data.email) return null;
  if (data.email.toLowerCase().includes('@redfin.com')) return null; // hard block
  if (signals.includes('buyer_consult')) {
    return `Hi ${first},\n\nGreat connecting with you. I've put together a few notes ahead of our buyer consult.\n\nLet me know if you have any questions before we meet.\n\nKyle Kleinman\nRedfin`;
  }
  return null;
}

function recommendedClick(signals, data) {
  if (signals.includes('unclaimed_offer'))   return 'Click → Unclaimed Offers tab';
  if (signals.includes('unclaimed_listing')) return 'Click → Unclaimed Listings tab';
  if (signals.includes('buyer_consult'))     return 'Click → Calendar → New Appointment';
  if (signals.includes('seller_consult'))    return 'Click → Calendar → New Listing Consult';
  if (!data.followUpPlan)                    return 'Click → Follow Up Plans → Set Plan';
  return 'Click → Notes → Log contact';
}

// ── Team Dashboard Analysis ────────────────────────────────────────────────
function analyzeTeamDashboard(data) {
  const rows    = data.rows || [];
  const top5    = rows.slice(0, 5);
  const sections = [];

  sections.push({
    id: 'instructions', label: 'How to Use',
    content: `This is a team/shared view. ${rows.length} row(s) found. Each package is separate. Outreach requires permission gate approval.`,
  });

  if (Object.keys(data.counters || {}).length) {
    sections.push({
      id: 'counters', label: 'Opportunity Counters',
      content: Object.entries(data.counters).map(([k,v]) => `${k}: ${v}`).join('\n'),
    });
  }

  top5.forEach((row, i) => {
    sections.push({
      id: `capture_${i}`,
      label: `#${i+1} — ${row.name || 'Unknown'} (${row.appointmentType || 'Unknown'})`,
      content: row,
      type: 'capture_package',
    });
  });

  if (data.capped) {
    sections.push({
      id: 'more', label: 'More Rows Available',
      content: `Showing 5 of ${data.totalRows}. Click Analyze again to continue or scroll and click Analyze More.`,
    });
  }

  return { mode: 'Team Dashboard Capture', sections };
}

// ── MLS Listing Analysis ───────────────────────────────────────────────────
function analyzeMLSListing(data) {
  const text = data.pageText || '';
  const flags = [];
  const lower = text.toLowerCase();
  if (lower.includes('as is'))          flags.push('As-Is listing — inspection period critical');
  if (lower.includes('short sale'))     flags.push('Short sale — longer timeline, lender approval needed');
  if (lower.includes('special assessment')) flags.push('Special assessment — verify amount and timeline');
  if (lower.includes('no rental') || lower.includes('rental restriction')) flags.push('Rental restrictions — verify before investor pitch');

  return {
    mode: 'MLS Listing',
    sections: [
      { id: 'summary',    label: 'Visible Listing Text', content: text.slice(0, 600) },
      { id: 'red_flags',  label: 'Red Flags',            content: flags.length ? flags : ['No flags from visible text — check broker remarks and attachments'], type: flags.length ? 'risk' : 'info' },
      { id: 'show_prep',  label: 'Showing Prep',         content: 'Confirm showing window. Review access type. Prep client on red flags and questions.' },
      { id: 'questions',  label: 'Questions for Listing Agent', content: 'Motivation to sell? Any offers? Assessment status? HOA approval timeline? Lease in place?' },
      { id: 'missing',    label: 'Missing Info',         content: 'Check broker remarks, attachments, and showing instructions in full listing.', type: 'warning' },
    ],
  };
}

// ── MLS Search / Comps ─────────────────────────────────────────────────────
function analyzeMLSSearch(data) {
  return {
    mode: 'MLS Search / Comps',
    sections: [
      { id: 'text',     label: 'Visible Results',   content: (data.pageText || '').slice(0, 500) },
      { id: 'comp_tips',label: 'Comp Priority',     content: 'Same building first. Then subdivision. Then zip. Match size, bed/bath, year, view, parking, HOA. Weight recent closed sales highest.' },
      { id: 'missing',  label: 'Missing Info',      content: 'Filter closed 90 days, same sub/building, then pull full comp report.', type: 'warning' },
    ],
  };
}

// ── OneHome ────────────────────────────────────────────────────────────────
function analyzeOneHome(data) {
  return {
    mode: 'OneHome',
    sections: [
      { id: 'info',      label: 'OneHome Portal',    content: 'Review client activity, searches, and saved properties.' },
      { id: 'criteria',  label: 'Search Criteria',   content: 'Build filters based on buyer needs. Confirm criteria before setting alerts.' },
      { id: 'missing',   label: 'Missing Info',      content: 'Confirm budget, timeline, and must-haves with client before creating alerts.', type: 'warning' },
    ],
  };
}

// ── Gmail Lead Parser ──────────────────────────────────────────────────────
function analyzeGmailLead(data) {
  const text = data.pageText || '';
  return {
    mode: 'Gmail Lead Parser',
    sections: [
      { id: 'summary',  label: 'Email Content',   content: text.slice(0, 500) },
      { id: 'classify', label: 'Classification',  content: 'Parse name, phone, email, property, appointment time, and intent from email.' },
      { id: 'fub',      label: 'FUB Record',      content: 'Build FUB contact record from extracted data.' },
      { id: 'followup', label: 'Follow Up Task',  content: 'Log lead and set follow up task in Agent Tools.' },
      { id: 'missing',  label: 'Missing Info',    content: 'Check email body for phone, property address, and appointment time.', type: 'warning' },
    ],
  };
}

// ── FUB Contact ────────────────────────────────────────────────────────────
function analyzeFUBContact(data) {
  return {
    mode: 'FUB / CRM Contact',
    sections: [
      { id: 'info',  label: 'Contact Info',   content: (data.pageText || '').slice(0, 400) },
      { id: 'stage', label: 'Pipeline Stage', content: 'Verify stage and assigned agent.' },
      { id: 'note',  label: 'Add Note',       content: 'Log last action and set next step in FUB.' },
    ],
  };
}

// ── Rendering ──────────────────────────────────────────────────────────────
function clearOutput() {
  $outputArea.innerHTML = '';
}

function renderResult(result) {
  clearOutput();

  const wrapper = document.createElement('div');

  (result.sections || []).forEach(section => {
    if (!section) return;
    const el = buildSection(section);
    if (el) wrapper.appendChild(el);
  });

  $outputArea.appendChild(wrapper);
}

function buildSection(section) {
  const outer = document.createElement('div');
  outer.className = 'output-section';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span>${escHtml(section.label || '')}</span><span class="toggle-icon">▾</span>`;
  header.addEventListener('click', () => outer.classList.toggle('section-collapsed'));
  outer.appendChild(header);

  const body = document.createElement('div');
  body.className = 'section-body';

  if (section.type === 'risk') {
    const arr = Array.isArray(section.content) ? section.content : [section.content];
    arr.forEach(flag => {
      if (!flag) return;
      const b = document.createElement('div');
      b.className = 'risk-block';
      b.innerHTML = `<div class="risk-label">Risk</div><div>${escHtml(flag)}</div>`;
      body.appendChild(b);
    });
  } else if (section.type === 'warning') {
    const arr = Array.isArray(section.content) ? section.content : [section.content];
    arr.forEach(w => {
      if (!w) return;
      const b = document.createElement('div');
      b.className = 'warning-block';
      b.innerHTML = `<div class="warning-label">Missing Info</div><div>${escHtml(w)}</div>`;
      body.appendChild(b);
    });
  } else if (section.type === 'capture_package') {
    renderCapturePackage(body, section.content);
  } else if (section.copyable) {
    const draft = document.createElement('div');
    draft.className = 'draft-block';
    draft.textContent = section.content || '';
    body.appendChild(draft);

    const actions = document.createElement('div');
    actions.className = 'draft-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyText(section.content, copyBtn));
    actions.appendChild(copyBtn);

    if (section.actionType === 'send_sms') {
      const smsBtn = document.createElement('button');
      smsBtn.className = 'btn btn-primary';
      smsBtn.textContent = 'iOS Handoff';
      smsBtn.addEventListener('click', () => handleSMSHandoff(section.content));
      actions.appendChild(smsBtn);
    }

    if (section.actionType === 'send_email') {
      const emailBtn = document.createElement('button');
      emailBtn.className = 'btn btn-primary';
      emailBtn.textContent = 'Create Draft';
      emailBtn.addEventListener('click', () => handleEmailDraft(section.content));
      actions.appendChild(emailBtn);
    }

    body.appendChild(actions);
  } else {
    const p = document.createElement('p');
    p.textContent = Array.isArray(section.content)
      ? section.content.join('\n')
      : (section.content || '');
    body.appendChild(p);
  }

  outer.appendChild(body);
  return outer;
}

function renderCapturePackage(container, pkg) {
  if (!pkg) return;

  // Permission gate first
  if (pkg.permissionRequired) {
    const gate = document.createElement('div');
    gate.className = 'permission-gate';
    gate.innerHTML = `
      <div class="perm-title">Permission Required</div>
      <p>Source: team/shared queue. Confirm permission before outreach.</p>
      <div class="permission-options">
        <button class="btn-perm approve">Approve Outreach</button>
        <button class="btn-perm db-only">Save to Database Only</button>
        <button class="btn-perm review">Needs Review</button>
        <button class="btn-perm no-contact">Do Not Contact</button>
      </div>
    `;

    gate.querySelector('.approve').addEventListener('click', () => {
      showStatus('Outreach approved for: ' + (pkg.name || 'contact'), 2500);
    });
    gate.querySelector('.db-only').addEventListener('click', () => {
      showStatus('Saved to database only — no outreach.', 2500);
    });
    gate.querySelector('.review').addEventListener('click', () => {
      showStatus('Marked for review — verify lead ownership.', 2500);
    });
    gate.querySelector('.no-contact').addEventListener('click', () => {
      showStatus('Do not contact flag set.', 2500);
    });
    container.appendChild(gate);
  }

  const fields = [
    ['Name',              pkg.name],
    ['Appointment Type',  pkg.appointmentType],
    ['Opportunity',       pkg.opportunityType],
    ['Date',              pkg.date],
    ['Property',          pkg.address],
    ['Price',             pkg.price],
    ['Assigned Agent',    pkg.assignedAgent],
    ['Owner Agent',       pkg.ownerAgent],
    ['ID Verified',       pkg.idVerified ? 'Yes' : null],
    ['Pre-Approved',      pkg.preapproved ? 'Yes' : null],
    ['Phone',             pkg.phone || '(not visible — open record)'],
    ['Email',             pkg.email || '(not visible — open record)'],
    ['Status',            pkg.status],
  ];

  fields.forEach(([label, val]) => {
    if (!val) return;
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `<span class="field-label">${escHtml(label)}</span><span class="field-value">${escHtml(val)}</span>`;
    container.appendChild(row);
  });

  // Risk flags
  if (pkg.riskFlags && pkg.riskFlags.length) {
    pkg.riskFlags.forEach(f => {
      const b = document.createElement('div');
      b.className = 'risk-block';
      b.innerHTML = `<div class="risk-label">Risk</div><div>${escHtml(f)}</div>`;
      container.appendChild(b);
    });
  }

  // Missing info
  if (pkg.missingInfo && pkg.missingInfo.length) {
    pkg.missingInfo.forEach(m => {
      const b = document.createElement('div');
      b.className = 'warning-block';
      b.innerHTML = `<div class="warning-label">Missing</div><div>${escHtml(m)}</div>`;
      container.appendChild(b);
    });
  }

  // SMS draft
  if (pkg.smsDraft) {
    const sep = document.createElement('div');
    sep.className = 'separator';
    container.appendChild(sep);

    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = 'SMS Draft';
    container.appendChild(label);

    const draft = document.createElement('div');
    draft.className = 'draft-block';
    draft.textContent = pkg.smsDraft;
    container.appendChild(draft);

    const actions = document.createElement('div');
    actions.className = 'draft-actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => copyText(pkg.smsDraft, copyBtn));
    actions.appendChild(copyBtn);
    container.appendChild(actions);
  }

  // Recommended click
  if (pkg.recommendedNextClick) {
    const sep = document.createElement('div');
    sep.className = 'separator';
    container.appendChild(sep);
    const p = document.createElement('p');
    p.innerHTML = `<strong>Next Click:</strong> ${escHtml(pkg.recommendedNextClick)}`;
    container.appendChild(p);
  }
}

function renderError(msg) {
  clearOutput();
  const div = document.createElement('div');
  div.className = 'risk-block';
  div.innerHTML = `<div class="risk-label">Error</div><div>${escHtml(msg)}</div>`;
  $outputArea.appendChild(div);
}

// ── Approval Gate ──────────────────────────────────────────────────────────
function showApprovalGate(message, onApprove, onReject) {
  $approvalMsg.textContent = message;
  $approvalGate.classList.remove('hidden');
  pendingApproval = { onApprove, onReject };
}

function resolveApproval(approved) {
  $approvalGate.classList.add('hidden');
  if (pendingApproval) {
    if (approved) pendingApproval.onApprove();
    else pendingApproval.onReject();
    pendingApproval = null;
  }
}

// ── SMS Handoff ────────────────────────────────────────────────────────────
function handleSMSHandoff(text) {
  showApprovalGate(
    `Approve iOS SMS handoff?\n\n"${text}"`,
    () => {
      const encoded = encodeURIComponent(text || '');
      // Open iOS Messages via sms: URI (works on macOS with iPhone connected; user taps Send)
      window.open(`sms:?&body=${encoded}`, '_blank');
      showStatus('SMS draft handed off to Messages.', 2500);
    },
    () => showStatus('SMS cancelled.', 1500)
  );
}

// ── Email Draft ────────────────────────────────────────────────────────────
function handleEmailDraft(text) {
  // Hard block: check if the draft contains @redfin.com
  if (text && text.toLowerCase().includes('@redfin.com')) {
    renderError('BLOCKED: Redfin internal email detected. Do not send through this agent.');
    return;
  }

  showApprovalGate(
    `Create Gmail draft?\n\n${(text || '').slice(0, 200)}`,
    () => {
      // In a full implementation this calls Gmail API via background script.
      // For now, copy to clipboard as a fallback.
      copyText(text, null);
      showStatus('Draft copied — paste into Gmail and review before sending.', 3000);
    },
    () => showStatus('Email draft cancelled.', 1500)
  );
}

// ── Copy Helper ────────────────────────────────────────────────────────────
function copyText(text, btn) {
  navigator.clipboard.writeText(text || '').then(() => {
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }
    showStatus('Copied to clipboard.', 1500);
  }).catch(() => {
    showStatus('Copy failed — use Ctrl+C.', 1500);
  });
}

// ── Status Bar ─────────────────────────────────────────────────────────────
let statusTimer = null;
function showStatus(msg, durationMs) {
  $statusText.textContent = msg;
  $statusBar.classList.remove('hidden');
  if (statusTimer) clearTimeout(statusTimer);
  if (durationMs > 0) {
    statusTimer = setTimeout(hideStatus, durationMs);
  }
}
function hideStatus() {
  $statusBar.classList.add('hidden');
}

// ── Utils ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(res);
      }
    });
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
init();
