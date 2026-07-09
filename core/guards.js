// KyleOS - Guards
// Hard blocks: @redfin.com email, team source permission gate, approval enforcement

import { REDFIN_EMAIL_BLOCK_DOMAIN } from './constants.js';

// ─── @redfin.com Email Block ──────────────────────────────────────────────────

export function checkEmailRecipients(recipients) {
  if (!recipients) return { blocked: false };

  const recipientList = Array.isArray(recipients) ? recipients : [recipients];

  const blocked = recipientList.filter(r =>
    typeof r === 'string' && r.toLowerCase().includes(REDFIN_EMAIL_BLOCK_DOMAIN)
  );

  if (blocked.length > 0) {
    return {
      blocked: true,
      blockedAddresses: blocked,
      message: `Needs Review:\nRedfin internal email detected. Do not send through this agent.\n\nBlocked: ${blocked.join(', ')}`
    };
  }

  return { blocked: false };
}

// ─── Team Source Permission Gate ──────────────────────────────────────────────

export function requiresPermission(extractedData) {
  return !!(extractedData?.isTeamShared || extractedData?.rows?.some(r => r.isTeamShared));
}

export function buildPermissionGate(contactName) {
  return {
    requiresPermission: true,
    contactName,
    message: `Permission Required:\nThis contact came from a team/shared Agent Tools source. Confirm Kyle has permission to contact this person before any outreach.`,
    options: [
      { id: 'approve_outreach', label: 'Approve Outreach', action: 'APPROVE_OUTREACH' },
      { id: 'save_only', label: 'Save to Database Only', action: 'SAVE_TO_DB' },
      { id: 'needs_review', label: 'Needs Review', action: 'NEEDS_REVIEW' },
      { id: 'do_not_contact', label: 'Do Not Contact', action: 'DO_NOT_CONTACT' }
    ]
  };
}

export function buildOwnershipReview(rowData) {
  const issues = [];

  if (!rowData.assignedAgent) issues.push('Assigned agent unknown');
  if (!rowData.ownerAgent) issues.push('Owner agent unknown');
  if (rowData.assignedAgent && rowData.ownerAgent &&
      rowData.assignedAgent !== rowData.ownerAgent) {
    issues.push(`Assigned agent (${rowData.assignedAgent}) differs from owner agent (${rowData.ownerAgent})`);
  }
  if (!rowData.customerName) issues.push('Customer name missing');

  return {
    needsReview: issues.length > 0,
    issues,
    message: issues.length > 0
      ? `Needs Review:\nLead ownership unclear. Do not contact until Kyle confirms permission.\n\nIssues:\n${issues.map(i => `• ${i}`).join('\n')}`
      : null
  };
}

// ─── Approval Gate Enforcement ────────────────────────────────────────────────

// Action types that require explicit approval before execution
export const APPROVAL_REQUIRED_ACTIONS = new Set([
  'SEND_EMAIL',
  'CREATE_EMAIL_DRAFT',
  'SEND_SMS',
  'SUBMIT_FORM',
  'SAVE_RECORD',
  'CREATE_RECORD',
  'UPDATE_RECORD',
  'SIGN_DOCUMENT',
  'COMPLETE_TASK',
  'DISMISS_LEAD',
  'ASSIGN_LEAD',
  'CREATE_ONEHOME_CONTACT',
  'CREATE_ONEHOME_SEARCH',
  'CREATE_ONEHOME_ALERT',
  'CREATE_ONEHOME_COLLECTION'
]);

export function requiresApproval(actionType) {
  return APPROVAL_REQUIRED_ACTIONS.has(actionType);
}

export function buildApprovalRequest(actionType, description, payload) {
  return {
    type: 'PENDING_APPROVAL',
    actionType,
    description,
    payload,
    timestamp: Date.now()
  };
}
