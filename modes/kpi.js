// KyleOS - KPI Follow Up Mode
// Identifies follow-up KPI risks and recommends shortest clean actions

import { APPROVED_ASSIGNEE } from '../core/constants.js';

export async function analyzeKPI(data, settings) {
  if (!data) return buildEmptyResult('No follow-up data available.');

  const rows = data.rows || [];

  if (rows.length === 0) {
    return buildEmptyResult('No follow-up rows detected. Try scrolling the page or switching to the Follow Ups view.');
  }

  const issues = identifyKPIIssues(rows);
  const topActions = prioritizeActions(issues).slice(0, 10);

  const sections = [
    {
      label: 'KPI Status',
      content: buildKPISummary(issues)
    }
  ];

  topActions.forEach((issue, i) => {
    sections.push({
      label: `Action ${i + 1}: ${issue.type}`,
      content: buildActionDescription(issue),
      priority: issue.urgency
    });
  });

  return {
    sections,
    riskFlags: buildKPIRiskFlags(issues),
    missingInfo: [],
    recommendedClick: buildKPIRecommendedClick(issues),
    approvalActions: []
  };
}

// ─── KPI Issue Identification ─────────────────────────────────────────────────

function identifyKPIIssues(rows) {
  const issues = [];

  rows.forEach(row => {
    const text = (row.raw || '').toLowerCase();
    const name = row.customerName || 'Unknown';

    // Overdue / expired follow-ups
    if (row.isExpired || text.includes('overdue') || text.includes('past due')) {
      issues.push({
        type: 'Overdue Follow Up',
        customer: name,
        urgency: 'HIGH',
        detail: `Follow-up for ${name} is overdue.`,
        action: `Call or text ${name} now. Log the contact in Agent Tools.`
      });
    }

    // High priority rows
    if (row.priority === 'HIGH') {
      issues.push({
        type: 'High Priority Lead',
        customer: name,
        urgency: 'HIGH',
        detail: `${name} flagged as high priority.`,
        action: `Take action on ${name} before end of day.`
      });
    }

    // No follow-up plan
    if (text.includes('no follow-up plan') || text.includes('no plan')) {
      issues.push({
        type: 'No Follow Up Plan',
        customer: name,
        urgency: 'MEDIUM',
        detail: `${name} has no follow-up plan.`,
        action: `Open customer detail for ${name} and set a follow-up plan.`
      });
    }

    // New lead not contacted
    if (text.includes('new lead') && !text.includes('contacted')) {
      issues.push({
        type: 'New Lead Not Contacted',
        customer: name,
        urgency: 'HIGH',
        detail: `${name} is a new lead with no first contact.`,
        action: `Contact ${name} immediately. New leads convert best within 5 minutes.`
      });
    }

    // Post-tour no follow-up
    if ((text.includes('toured') || text.includes('post tour')) && !text.includes('follow')) {
      issues.push({
        type: 'Post-Tour No Follow Up',
        customer: name,
        urgency: 'HIGH',
        detail: `${name} toured recently with no follow-up logged.`,
        action: `Follow up with ${name} on the tour. Ask what they thought and discuss next steps.`
      });
    }

    // Canceled tour
    if (text.includes('canceled tour') || text.includes('cancelled tour')) {
      issues.push({
        type: 'Canceled Tour',
        customer: name,
        urgency: 'HIGH',
        detail: `${name} canceled a tour.`,
        action: `Reach out to ${name} to reschedule or understand what changed.`
      });
    }

    // Expiring follow-up (due today/soon)
    if (row.dueDate && isExpiringSoon(row.dueDate)) {
      issues.push({
        type: 'Follow Up Due Today',
        customer: name,
        urgency: 'MEDIUM',
        detail: `Follow-up for ${name} is due: ${row.dueDate}`,
        action: `Execute follow-up for ${name} before it expires.`
      });
    }

    // Assigned to another agent
    if (row.assignedAgent &&
        row.assignedAgent.toLowerCase() !== APPROVED_ASSIGNEE.toLowerCase() &&
        row.assignedAgent.toLowerCase() !== 'kyle') {
      issues.push({
        type: 'Wrong Agent Assignment',
        customer: name,
        urgency: 'MEDIUM',
        detail: `${name} is assigned to ${row.assignedAgent}, not Kyle.`,
        action: `Verify lead ownership before contacting ${name}.`
      });
    }
  });

  return issues;
}

function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  try {
    const today = new Date();
    const due = new Date(dateStr);
    const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
    return diffDays <= 1 && diffDays >= -1;
  } catch {
    return false;
  }
}

function prioritizeActions(issues) {
  const order = { HIGH: 0, MEDIUM: 1, NORMAL: 2, LOW: 3 };
  return [...issues].sort((a, b) => (order[a.urgency] || 2) - (order[b.urgency] || 2));
}

// ─── Output Builders ──────────────────────────────────────────────────────────

function buildKPISummary(issues) {
  if (issues.length === 0) return 'KPIs are clean. No immediate action items found.';

  const high = issues.filter(i => i.urgency === 'HIGH').length;
  const medium = issues.filter(i => i.urgency === 'MEDIUM').length;

  const parts = [];
  if (high > 0) parts.push(`${high} high-priority item${high > 1 ? 's' : ''}`);
  if (medium > 0) parts.push(`${medium} medium-priority item${medium > 1 ? 's' : ''}`);

  return `${issues.length} KPI issue${issues.length > 1 ? 's' : ''} found.\n${parts.join(', ')}.`;
}

function buildActionDescription(issue) {
  return `${issue.detail}\n\n→ ${issue.action}`;
}

function buildKPIRiskFlags(issues) {
  return issues
    .filter(i => i.urgency === 'HIGH')
    .map(i => `${i.type}: ${i.customer} — ${i.detail}`);
}

function buildKPIRecommendedClick(issues) {
  if (issues.length === 0) return null;
  const top = issues.find(i => i.urgency === 'HIGH');
  if (top) {
    return `Highest priority: Open customer detail for ${top.customer} and ${top.action.toLowerCase()}`;
  }
  return null;
}

function buildEmptyResult(msg) {
  return {
    sections: [{ label: 'KPI Status', content: msg }],
    riskFlags: [],
    missingInfo: [],
    recommendedClick: null,
    approvalActions: []
  };
}
