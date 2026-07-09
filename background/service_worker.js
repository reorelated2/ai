// KyleOS Real Estate Operating Agent - Background Service Worker
// Message routing hub between content scripts and side panel

import { PLATFORM, PAGE_TYPE, MODE } from '../core/constants.js';

// Track current tab context
const tabContexts = new Map();

// Open side panel when action button is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Open side panel on supported pages automatically
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const supported = isSupportedPage(tab.url);
  if (supported) {
    chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel/panel.html',
      enabled: true
    });
  }
});

// Central message router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'PAGE_DETECTED':
      handlePageDetected(tabId, message.payload, sendResponse);
      break;

    case 'EXTRACT_COMPLETE':
      handleExtractComplete(tabId, message.payload, sendResponse);
      break;

    case 'REQUEST_ANALYSIS':
      handleRequestAnalysis(tabId, message.payload, sendResponse);
      break;

    case 'PANEL_READY':
      handlePanelReady(tabId, sendResponse);
      break;

    case 'GET_TAB_CONTEXT':
      handleGetTabContext(tabId, sendResponse);
      break;

    case 'ACTION_APPROVED':
      handleActionApproved(tabId, message.payload, sendResponse);
      break;

    case 'ACTION_REJECTED':
      handleActionRejected(tabId, message.payload, sendResponse);
      break;

    case 'STORE_DATA':
      handleStoreData(message.payload, sendResponse);
      break;

    case 'GET_DATA':
      handleGetData(message.payload, sendResponse);
      break;

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }

  // Keep message channel open for async responses
  return true;
});

function isSupportedPage(url) {
  const supported = [
    'redfin.com',
    'mail.google.com',
    'onehome.com',
    'mlsgrid.com',
    'matrix.realtors.com',
    'flexmls.com',
    'miamirealtors.com',
    'miamireb.com'
  ];
  return supported.some(domain => url.includes(domain));
}

function handlePageDetected(tabId, payload, sendResponse) {
  tabContexts.set(tabId, {
    ...payload,
    timestamp: Date.now()
  });

  // Forward detection to side panel
  broadcastToPanel(tabId, {
    type: 'PAGE_DETECTED',
    payload
  });

  sendResponse({ ok: true });
}

function handleExtractComplete(tabId, payload, sendResponse) {
  const context = tabContexts.get(tabId) || {};
  tabContexts.set(tabId, {
    ...context,
    extractedData: payload,
    extractTimestamp: Date.now()
  });

  // Forward to side panel
  broadcastToPanel(tabId, {
    type: 'EXTRACT_COMPLETE',
    payload
  });

  sendResponse({ ok: true });
}

function handleRequestAnalysis(tabId, payload, sendResponse) {
  const context = tabContexts.get(tabId);
  if (!context) {
    sendResponse({ error: 'No context available for this tab' });
    return;
  }

  broadcastToPanel(tabId, {
    type: 'ANALYSIS_REQUESTED',
    payload: { ...context, ...payload }
  });

  sendResponse({ ok: true });
}

function handlePanelReady(tabId, sendResponse) {
  // Send current context to freshly opened panel
  const context = tabContexts.get(tabId);
  if (context) {
    broadcastToPanel(tabId, {
      type: 'PAGE_DETECTED',
      payload: context
    });
  }
  sendResponse({ ok: true, context: context || null });
}

function handleGetTabContext(tabId, sendResponse) {
  const context = tabContexts.get(tabId);
  sendResponse({ context: context || null });
}

function handleActionApproved(tabId, payload, sendResponse) {
  // Log approved action
  logAction(tabId, 'APPROVED', payload);

  // If it's an email draft action, handle via Gmail API
  if (payload.actionType === 'EMAIL_DRAFT') {
    broadcastToPanel(tabId, {
      type: 'CREATE_GMAIL_DRAFT',
      payload
    });
  }

  sendResponse({ ok: true });
}

function handleActionRejected(tabId, payload, sendResponse) {
  logAction(tabId, 'REJECTED', payload);
  sendResponse({ ok: true });
}

function handleStoreData(payload, sendResponse) {
  const { key, value } = payload;
  chrome.storage.local.set({ [key]: value }, () => {
    sendResponse({ ok: true });
  });
}

function handleGetData(payload, sendResponse) {
  const { key } = payload;
  chrome.storage.local.get([key], (result) => {
    sendResponse({ value: result[key] || null });
  });
}

function logAction(tabId, status, payload) {
  const logKey = `action_log_${Date.now()}`;
  const entry = {
    tabId,
    status,
    payload,
    timestamp: new Date().toISOString()
  };
  chrome.storage.local.set({ [logKey]: entry });
}

// Broadcast message to the side panel in a given tab
function broadcastToPanel(tabId, message) {
  chrome.runtime.sendMessage({
    ...message,
    _targetTabId: tabId
  }).catch(() => {
    // Panel may not be open — that's fine
  });
}

// Clean up tab contexts when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabContexts.delete(tabId);
});
