/**
 * KyleOS — Background Service Worker
 * Manages side panel, tab state, and message routing.
 */

'use strict';

// Open side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

// Track page info per tab
const tabState = new Map();

// Forward messages from content script → panel (and vice versa)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  // Content script reports page info
  if (msg.type === 'PAGE_INFO') {
    if (tabId) tabState.set(tabId, { pageInfo: msg.payload, timestamp: Date.now() });
    // Broadcast to any open panel
    chrome.runtime.sendMessage({ type: 'PAGE_INFO', payload: msg.payload, tabId }).catch(() => {});
    return false;
  }

  // Panel requests current page info
  if (msg.type === 'GET_PAGE_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ error: 'No active tab' }); return; }
      const tid = tabs[0].id;
      const cached = tabState.get(tid);
      if (cached) {
        sendResponse(cached.pageInfo);
      } else {
        // Ask the content script
        chrome.tabs.sendMessage(tid, { type: 'GET_PAGE_INFO' }, (res) => {
          if (chrome.runtime.lastError || !res) {
            sendResponse({ platform: 'unknown', pageType: 'unknown', url: tabs[0].url });
          } else {
            sendResponse(res);
          }
        });
      }
    });
    return true; // async
  }

  // Panel requests analysis
  if (msg.type === 'ANALYZE_PAGE') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ error: 'No active tab' }); return; }
      chrome.tabs.sendMessage(tabs[0].id, { type: 'ANALYZE_PAGE' }, (res) => {
        if (chrome.runtime.lastError || !res) {
          sendResponse({ error: 'Content script not reachable. Reload the page.' });
        } else {
          sendResponse(res);
        }
      });
    });
    return true; // async
  }

  return false;
});

// When a tab navigates, clear cached state
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabState.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});
