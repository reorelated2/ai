// KyleOS - Side Panel Controller
// Orchestrates the panel UI and communicates with background/content scripts

import { routeToMode, getModeLabel } from '../core/router.js';
import { checkEmailRecipients, requiresPermission, buildPermissionGate } from '../core/guards.js';
import { MODE, PAGE_TYPE } from '../core/constants.js';
import { analyzeAgentTools } from '../modes/agenttools.js';
import { analyzeKPI } from '../modes/kpi.js';
import { analyzeDashboard } from '../modes/dashboard.js';

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  currentDetection: null,
  currentMode: MODE.IDLE,
  currentResult: null,
  pendingApproval: null,
  settings: {
    apiKey: '',
    agentName: 'Kyle Kleinman',
    autoAnalyze: true
  }
};

// ─── DOM References ───────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const modeBadge = $('mode-badge');
const contextBar = $('context-bar');
const contextPlatform = $('context-platform');
const contextPage = $('context-page');
const idleState = $('idle-state');
const loadingState = $('loading-state');
const resultState = $('result-state');
const errorState = $('error-state');
const errorMessage = $('error-message');
const approvalFooter = $('approval-footer');
const settingsPanel = $('settings-panel');

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadSettings();
  bindEvents();
  requestCurrentContext();

  // Listen for messages from service worker
  chrome.runtime.onMessage.addListener(handleMessage);
}

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['kylos_settings'], result => {
      if (result.kylos_settings) {
        state.settings = { ...state.settings, ...result.kylos_settings };
      }
      $('api-key').value = state.settings.apiKey || '';
      $('agent-name').value = state.settings.agentName || 'Kyle Kleinman';
      $('auto-analyze-toggle').checked = state.settings.autoAnalyze !== false;
      resolve();
    });
  });
}

function bindEvents() {
  $('btn-manual-analyze').addEventListener('click', handleManualAnalyze);
  $('btn-settings').addEventListener('click', () => toggleSettings(true));
  $('btn-close-settings').addEventListener('click', () => toggleSettings(false));
  $('btn-save-settings').addEventListener('click', saveSettings);
}

function toggleSettings(show) {
  settingsPanel.classList.toggle('hidden', !show);
}

async function saveSettings() {
  state.settings.apiKey = $('api-key').value.trim();
  state.settings.agentName = $('agent-name').value.trim() || 'Kyle Kleinman';
  state.settings.autoAnalyze = $('auto-analyze-toggle').checked;

  await new Promise(resolve => {
    chrome.storage.local.set({ kylos_settings: state.settings }, resolve);
  });

  toggleSettings(false);
}

// ─── Context Request ──────────────────────────────────────────────────────────

function requestCurrentContext() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;

    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_DETECTION' }, (response) => {
      if (chrome.runtime.lastError) return; // content script not loaded
      if (response?.detection) {
        handlePageDetected(response.detection);
      }
    });
  });
}

// ─── Message Handler ──────────────────────────────────────────────────────────

function handleMessage(message) {
  switch (message.type) {
    case 'PAGE_DETECTED':
      handlePageDetected(message.payload);
      break;
    case 'EXTRACT_COMPLETE':
      handleExtractComplete(message.payload);
      break;
    case 'ANALYSIS_REQUESTED':
      runAnalysis(message.payload);
      break;
  }
}

// ─── Page Detection ───────────────────────────────────────────────────────────

function handlePageDetected(detection) {
  state.currentDetection = detection;

  // Update context bar
  contextPlatform.textContent = detection.platform || '';
  contextPage.textContent = detection.pageType?.replace(/_/g, ' ') || '';
  contextBar.classList.remove('hidden');

  // Determine mode
  const mode = routeToMode(detection, false);
  updateMode(mode);

  // Auto-analyze pages
  if (detection.autoAnalyze && state.settings.autoAnalyze) {
    showLoading();
  }
}

function handleExtractComplete(payload) {
  const { detection, data } = payload;
  state.currentDetection = detection;

  if (detection.autoAnalyze && state.settings.autoAnalyze) {
    runAnalysis({ detection, data });
  }
}

// ─── Manual Analyze ───────────────────────────────────────────────────────────

function handleManualAnalyze() {
  showLoading();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;

    chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_PAGE_DATA' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        showError('Could not read page. Make sure you\'re on a supported page.');
        return;
      }

      const { detection, data } = response;
      const mode = routeToMode(detection, true); // isManualAnalyze = true
      updateMode(mode);
      runAnalysis({ detection, data, isManual: true });
    });
  });
}

// ─── Analysis Engine ──────────────────────────────────────────────────────────

async function runAnalysis({ detection, data, isManual = false }) {
  showLoading();

  try {
    const mode = routeToMode(detection, isManual);
    updateMode(mode);

    let result;

    switch (mode) {
      case MODE.AGENT_TOOLS:
        result = await analyzeAgentTools(data, state.settings);
        break;
      case MODE.KPI_FOLLOW_UP:
        result = await analyzeKPI(data, state.settings);
        break;
      case MODE.TEAM_DASHBOARD_CAPTURE:
        result = await analyzeDashboard(data, state.settings);
        break;
      default:
        result = buildIdleResult(detection, mode);
    }

    state.currentResult = result;
    renderResult(result);
  } catch (err) {
    showError(`Analysis failed: ${err.message}`);
  }
}

function buildIdleResult(detection, mode) {
  const label = getModeLabel(mode);
  return {
    sections: [
      {
        label: 'Status',
        content: `${label} mode. Use Analyze to process this page.`
      }
    ]
  };
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function updateMode(mode) {
  state.currentMode = mode;
  const label = getModeLabel(mode);
  modeBadge.textContent = label;

  // Remove all badge classes
  modeBadge.className = 'badge';
  const modeClassMap = {
    [MODE.AGENT_TOOLS]: 'badge--agent-tools',
    [MODE.KPI_FOLLOW_UP]: 'badge--kpi',
    [MODE.TEAM_DASHBOARD_CAPTURE]: 'badge--capture',
    [MODE.MLS_LISTING]: 'badge--mls',
    [MODE.MLS_SEARCH]: 'badge--mls',
    [MODE.CMA]: 'badge--mls',
    [MODE.GMAIL_PARSER]: 'badge--gmail',
    [MODE.ONEHOME]: 'badge--onehome',
    [MODE.FUB_CRM]: 'badge--fub',
    [MODE.CONTRACT_OFFER]: 'badge--contract',
    [MODE.IDLE]: 'badge--idle'
  };
  modeBadge.classList.add(modeClassMap[mode] || 'badge--idle');
}

function showLoading() {
  idleState.classList.add('hidden');
  loadingState.classList.remove('hidden');
  resultState.classList.add('hidden');
  errorState.classList.add('hidden');
  approvalFooter.classList.add('hidden');
}

function showError(msg) {
  idleState.classList.add('hidden');
  loadingState.classList.add('hidden');
  resultState.classList.add('hidden');
  errorState.classList.remove('hidden');
  errorMessage.textContent = msg;
}

function renderResult(result) {
  idleState.classList.add('hidden');
  loadingState.classList.add('hidden');
  resultState.classList.remove('hidden');
  errorState.classList.add('hidden');

  resultState.innerHTML = '';

  if (!result) {
    resultState.innerHTML = '<p style="padding:16px;color:#888">No result.</p>';
    return;
  }

  // Risk flags
  if (result.riskFlags?.length) {
    resultState.appendChild(buildRiskBlock(result.riskFlags));
  }

  // Permission gate
  if (result.permissionGate) {
    resultState.appendChild(buildPermissionBlock(result.permissionGate));
  }

  // Missing info
  if (result.missingInfo?.length) {
    resultState.appendChild(buildMissingBlock(result.missingInfo));
  }

  // Sections
  if (result.sections) {
    result.sections.forEach(section => {
      if (section.content) {
        resultState.appendChild(buildSection(section));
      }
    });
  }

  // Recommended click
  if (result.recommendedClick) {
    resultState.appendChild(buildClickBlock(result.recommendedClick));
  }

  // Approval actions
  if (result.approvalActions?.length) {
    renderApprovalFooter(result.approvalActions);
  } else {
    approvalFooter.classList.add('hidden');
  }

  // Multiple capture packages (Dashboard mode)
  if (result.packages) {
    renderCapturePackages(result.packages);
  }
}

function buildSection(section) {
  const div = document.createElement('div');
  div.className = `result-section${section.priority ? ` result-section--priority-${section.priority.toLowerCase()}` : ''}`;

  const label = document.createElement('div');
  label.className = 'result-section__label';
  label.textContent = section.label;

  const content = document.createElement('div');
  content.className = 'result-section__content';
  content.textContent = section.content;

  div.appendChild(label);
  div.appendChild(content);

  if (section.copyable !== false) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(section.content).then(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    });
    div.appendChild(copyBtn);
  }

  return div;
}

function buildRiskBlock(flags) {
  const div = document.createElement('div');
  div.className = 'block-risk';
  const title = document.createElement('div');
  title.className = 'block-risk__title';
  title.textContent = 'Risk Flags';
  div.appendChild(title);
  flags.forEach(f => {
    const p = document.createElement('p');
    p.textContent = `• ${f}`;
    p.style.fontSize = '12px';
    p.style.color = '#fca5a5';
    p.style.marginBottom = '2px';
    div.appendChild(p);
  });
  return div;
}

function buildMissingBlock(items) {
  const div = document.createElement('div');
  div.className = 'block-missing';
  const title = document.createElement('div');
  title.className = 'block-missing__title';
  title.textContent = 'Missing Info';
  div.appendChild(title);
  items.forEach(item => {
    const p = document.createElement('p');
    p.textContent = `• ${item}`;
    p.style.fontSize = '12px';
    p.style.color = '#fde68a';
    p.style.marginBottom = '2px';
    div.appendChild(p);
  });
  return div;
}

function buildPermissionBlock(gate) {
  const div = document.createElement('div');
  div.className = 'block-permission';
  const title = document.createElement('div');
  title.className = 'block-permission__title';
  title.textContent = 'Permission Required';
  const msg = document.createElement('div');
  msg.className = 'block-permission__message';
  msg.textContent = gate.message;
  div.appendChild(title);
  div.appendChild(msg);

  const opts = document.createElement('div');
  opts.className = 'permission-options';
  gate.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn--secondary btn--sm';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => handlePermissionChoice(opt.action, gate));
    opts.appendChild(btn);
  });
  div.appendChild(opts);
  return div;
}

function buildClickBlock(instruction) {
  const div = document.createElement('div');
  div.className = 'block-click';
  div.textContent = instruction;
  return div;
}

function renderApprovalFooter(actions) {
  approvalFooter.innerHTML = '';
  approvalFooter.classList.remove('hidden');

  actions.forEach(action => {
    if (action.type === 'desc') {
      const desc = document.createElement('div');
      desc.className = 'approval-footer__desc';
      desc.textContent = action.text;
      approvalFooter.appendChild(desc);
      return;
    }

    const btn = document.createElement('button');
    btn.className = `btn btn--${action.variant || 'secondary'} btn--sm`;
    btn.textContent = action.label;
    btn.addEventListener('click', () => handleApprovalAction(action));
    approvalFooter.appendChild(btn);
  });
}

function renderCapturePackages(packages) {
  packages.forEach((pkg, i) => {
    const header = document.createElement('div');
    header.className = 'result-section';
    header.style.background = '#111';
    header.innerHTML = `<div class="result-section__label" style="color:#4ade80">Contact ${i + 1} of ${packages.length}: ${pkg.customerName || 'Unknown'}</div>`;
    resultState.appendChild(header);

    if (pkg.sections) {
      pkg.sections.forEach(s => resultState.appendChild(buildSection(s)));
    }
    if (pkg.riskFlags?.length) resultState.appendChild(buildRiskBlock(pkg.riskFlags));
    if (pkg.missingInfo?.length) resultState.appendChild(buildMissingBlock(pkg.missingInfo));
    if (pkg.permissionGate) resultState.appendChild(buildPermissionBlock(pkg.permissionGate));
    if (pkg.recommendedClick) resultState.appendChild(buildClickBlock(pkg.recommendedClick));
  });
}

// ─── Permission Handling ──────────────────────────────────────────────────────

function handlePermissionChoice(action, gate) {
  chrome.runtime.sendMessage({
    type: 'ACTION_APPROVED',
    payload: { actionType: 'PERMISSION_CHOICE', choice: action, gate }
  });

  if (action === 'SAVE_TO_DB') {
    showNotice('Saved to database only. No outreach will be initiated.');
  } else if (action === 'DO_NOT_CONTACT') {
    showNotice('Marked Do Not Contact.');
  } else if (action === 'NEEDS_REVIEW') {
    showNotice('Flagged for review.');
  }
}

function handleApprovalAction(action) {
  if (action.action === 'ACTION_APPROVED') {
    chrome.runtime.sendMessage({
      type: 'ACTION_APPROVED',
      payload: { actionType: action.actionType, data: action.data }
    });
  } else if (action.action === 'COPY_TO_CLIPBOARD') {
    navigator.clipboard.writeText(action.data || '');
    showNotice('Copied to clipboard.');
  } else if (action.action === 'ACTION_REJECTED') {
    approvalFooter.classList.add('hidden');
  }
}

function showNotice(msg) {
  const notice = document.createElement('div');
  notice.style.cssText = 'position:fixed;bottom:60px;left:12px;right:12px;background:#1a2744;border:1px solid #1e40af;border-radius:6px;padding:10px 12px;color:#93c5fd;font-size:12px;z-index:200;';
  notice.textContent = msg;
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 3000);
}

// ─── Start ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
