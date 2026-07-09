// KyleOS - Mode Router
// Maps detected page/platform to the correct operating mode

import { PLATFORM, PAGE_TYPE, MODE, AUTO_ANALYZE_PAGE_TYPES, TEAM_SOURCE_PAGE_TYPES } from './constants.js';

export function routeToMode(detection, isManualAnalyze = false) {
  const { platform, pageType } = detection;

  // Manual analyze overrides on team/list pages
  if (isManualAnalyze) {
    return routeManualAnalyze(platform, pageType);
  }

  // Auto-analyze routes
  return routeAuto(platform, pageType);
}

function routeAuto(platform, pageType) {
  switch (platform) {
    case PLATFORM.AGENT_TOOLS:
      if (pageType === PAGE_TYPE.CUSTOMER_DETAIL) return MODE.AGENT_TOOLS;
      if (pageType === PAGE_TYPE.EXPANDED_FOLLOW_UP_ROW) return MODE.AGENT_TOOLS;
      // List/team pages: idle until manual analyze
      if (TEAM_SOURCE_PAGE_TYPES.has(pageType)) return MODE.IDLE;
      if (pageType === PAGE_TYPE.FOLLOW_UPS || pageType === PAGE_TYPE.PRIORITY_FOLLOW_UPS)
        return MODE.KPI_FOLLOW_UP;
      return MODE.IDLE;

    case PLATFORM.MLS:
      return MODE.IDLE; // Wait for manual analyze on MLS

    case PLATFORM.ONEHOME:
      return MODE.IDLE;

    case PLATFORM.GMAIL:
      if (pageType === PAGE_TYPE.GMAIL_THREAD) return MODE.GMAIL_PARSER;
      return MODE.IDLE;

    default:
      return MODE.IDLE;
  }
}

function routeManualAnalyze(platform, pageType) {
  switch (platform) {
    case PLATFORM.AGENT_TOOLS:
      if (pageType === PAGE_TYPE.CUSTOMER_DETAIL) return MODE.AGENT_TOOLS;
      if (pageType === PAGE_TYPE.EXPANDED_FOLLOW_UP_ROW) return MODE.AGENT_TOOLS;
      if (pageType === PAGE_TYPE.TEAM_DASHBOARD) return MODE.TEAM_DASHBOARD_CAPTURE;
      if (pageType === PAGE_TYPE.APPOINTMENTS) return MODE.TEAM_DASHBOARD_CAPTURE;
      if (TEAM_SOURCE_PAGE_TYPES.has(pageType)) return MODE.TEAM_DASHBOARD_CAPTURE;
      if (pageType === PAGE_TYPE.FOLLOW_UPS) return MODE.KPI_FOLLOW_UP;
      if (pageType === PAGE_TYPE.PRIORITY_FOLLOW_UPS) return MODE.KPI_FOLLOW_UP;
      return MODE.AGENT_TOOLS;

    case PLATFORM.MLS:
      if (pageType === PAGE_TYPE.MLS_LISTING) return MODE.MLS_LISTING;
      if (pageType === PAGE_TYPE.MLS_SEARCH) return MODE.MLS_SEARCH;
      if (pageType === PAGE_TYPE.MLS_COMPS) return MODE.CMA;
      return MODE.MLS_LISTING;

    case PLATFORM.ONEHOME:
      return MODE.ONEHOME;

    case PLATFORM.GMAIL:
      return MODE.GMAIL_PARSER;

    default:
      return MODE.IDLE;
  }
}

export function getModeLabel(mode) {
  const labels = {
    [MODE.AGENT_TOOLS]: 'Agent Tools',
    [MODE.KPI_FOLLOW_UP]: 'KPI Follow Up',
    [MODE.TEAM_DASHBOARD_CAPTURE]: 'Database Capture',
    [MODE.MLS_LISTING]: 'MLS Listing',
    [MODE.MLS_SEARCH]: 'MLS Search',
    [MODE.CMA]: 'Pull Comps',
    [MODE.ONEHOME]: 'OneHome',
    [MODE.FUB_CRM]: 'FUB / CRM Builder',
    [MODE.GMAIL_PARSER]: 'Gmail Lead Parser',
    [MODE.CONTRACT_OFFER]: 'Contract / Offer Prep',
    [MODE.MOBILE_ASSIST]: 'Mobile Assist',
    [MODE.IDLE]: 'Ready'
  };
  return labels[mode] || mode;
}
