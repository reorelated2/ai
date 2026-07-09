// KyleOS - Main Content Script
// Entry point injected into supported pages

import { detectPage, watchPageChanges } from './detector.js';
import { extractPageData } from './extractor.js';
import { AUTO_ANALYZE_PAGE_TYPES } from '../core/constants.js';

let currentDetection = null;
let extractionDebounce = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  const detection = detectPage();
  handlePageChange(detection);

  // Watch for SPA navigation
  watchPageChanges((newDetection) => {
    handlePageChange(newDetection);
  });

  // Listen for messages from the side panel / service worker
  chrome.runtime.onMessage.addListener(handleExtensionMessage);
}

// ─── Page Change Handler ──────────────────────────────────────────────────────

function handlePageChange(detection) {
  currentDetection = detection;

  // Notify background + panel of new page
  chrome.runtime.sendMessage({
    type: 'PAGE_DETECTED',
    payload: detection
  }).catch(() => {});

  // Auto-analyze if on a supported auto-analyze page type
  if (detection.autoAnalyze) {
    scheduleExtraction();
  }
}

// ─── Extraction ───────────────────────────────────────────────────────────────

function scheduleExtraction(delay = 1000) {
  if (extractionDebounce) clearTimeout(extractionDebounce);
  extractionDebounce = setTimeout(() => {
    runExtraction();
  }, delay);
}

function runExtraction() {
  if (!currentDetection) return;

  const data = extractPageData(currentDetection);

  chrome.runtime.sendMessage({
    type: 'EXTRACT_COMPLETE',
    payload: {
      detection: currentDetection,
      data
    }
  }).catch(() => {});
}

// ─── Message Handler ──────────────────────────────────────────────────────────

function handleExtensionMessage(message, sender, sendResponse) {
  switch (message.type) {
    case 'MANUAL_ANALYZE':
      // Panel triggered a manual analysis
      runExtraction();
      sendResponse({ ok: true });
      break;

    case 'GET_PAGE_DATA':
      // Panel is asking for current page data on demand
      if (currentDetection) {
        const data = extractPageData(currentDetection);
        sendResponse({ detection: currentDetection, data });
      } else {
        sendResponse({ error: 'No page detection available' });
      }
      break;

    case 'GET_DETECTION':
      sendResponse({ detection: currentDetection });
      break;

    default:
      break;
  }
  return true;
}

// ─── Start ────────────────────────────────────────────────────────────────────

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
