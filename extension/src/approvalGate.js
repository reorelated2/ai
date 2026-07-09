/**
 * KyleOS — Approval Gate & Email Block
 * Enforces hard approval before any final action.
 * Permanently blocks any action targeting @redfin.com addresses.
 */

const ApprovalGate = (() => {

  const ACTION_TYPES = {
    SEND_EMAIL:     'send_email',
    SEND_SMS:       'send_sms',
    CREATE_DRAFT:   'create_draft',
    SAVE_CRM:       'save_crm',
    CREATE_TASK:    'create_task',
    SUBMIT_FORM:    'submit_form',
    SAVE_RECORD:    'save_record',
    OUTREACH:       'outreach',
  };

  // Actions that ALWAYS require explicit approval
  const APPROVAL_REQUIRED_ACTIONS = new Set([
    ACTION_TYPES.SEND_EMAIL,
    ACTION_TYPES.SEND_SMS,
    ACTION_TYPES.SUBMIT_FORM,
    ACTION_TYPES.OUTREACH,
  ]);

  // Actions that require approval for team/shared sources
  const TEAM_SOURCE_APPROVAL_ACTIONS = new Set([
    ACTION_TYPES.CREATE_DRAFT,
    ACTION_TYPES.SAVE_CRM,
    ACTION_TYPES.CREATE_TASK,
    ACTION_TYPES.SAVE_RECORD,
    ACTION_TYPES.OUTREACH,
  ]);

  /**
   * Check whether an action is blocked (hard block, no override).
   * @param {{ actionType, recipients, isTeamSource }} params
   * @returns {{ blocked: boolean, reason: string | null }}
   */
  function checkBlock(params) {
    const { actionType, recipients = [], isTeamSource = false } = params;

    // ── Hard block: @redfin.com email ──────────────────────────────────────
    const redfin_recipients = (recipients || []).filter(r =>
      typeof r === 'string' && r.toLowerCase().includes('@redfin.com')
    );

    if (redfin_recipients.length > 0) {
      return {
        blocked: true,
        hard: true,
        reason: `Redfin internal email detected (${redfin_recipients.join(', ')}). Do not send through this agent.`,
        type: 'redfin_internal_email',
      };
    }

    // ── Hard block: send without approval ────────────────────────────────
    if (APPROVAL_REQUIRED_ACTIONS.has(actionType)) {
      return {
        blocked: true,
        hard: false,
        reason: `This action (${actionType}) requires Kyle's explicit approval before proceeding.`,
        type: 'approval_required',
        requiresApproval: true,
      };
    }

    // ── Soft block: team source needs permission check ────────────────────
    if (isTeamSource && TEAM_SOURCE_APPROVAL_ACTIONS.has(actionType)) {
      return {
        blocked: true,
        hard: false,
        reason: 'This contact came from a team/shared Agent Tools source. Confirm permission before proceeding.',
        type: 'team_source_permission',
        requiresApproval: true,
      };
    }

    return { blocked: false, reason: null };
  }

  /**
   * Validate recipients list for @redfin.com.
   * @param {string[]} recipients
   * @returns {{ clean: boolean, blocked: string[] }}
   */
  function validateRecipients(recipients) {
    const blocked = (recipients || []).filter(r =>
      typeof r === 'string' && r.toLowerCase().includes('@redfin.com')
    );
    return { clean: blocked.length === 0, blocked };
  }

  /**
   * Create a permission gate object for team-source contacts.
   * The UI renders this as a choice block with four options.
   */
  function buildPermissionGate(contactName, source) {
    return {
      type: 'permission_gate',
      title: 'Permission Required',
      message: `This contact (${contactName || 'unknown'}) came from a team/shared Agent Tools source (${source || 'team queue'}). Confirm Kyle has permission to contact this person before any outreach.`,
      options: [
        { id: 'approve',    label: 'Approve Outreach',     action: 'approve_outreach' },
        { id: 'db_only',    label: 'Save to Database Only', action: 'db_only' },
        { id: 'review',     label: 'Needs Review',          action: 'needs_review' },
        { id: 'no_contact', label: 'Do Not Contact',        action: 'do_not_contact' },
      ],
      reviewItems: [
        'Assigned agent',
        'Owner agent',
        'Lead ownership',
        'Buyer/seller intent',
        'Contact permission',
        'Redfin policy concern',
        'Missing phone/email',
      ],
    };
  }

  /**
   * Build the approval request object.
   * This is what the panel renders before any send/submit action.
   */
  function buildApprovalRequest(actionType, payload) {
    const labels = {
      [ACTION_TYPES.SEND_EMAIL]:   'Send Email',
      [ACTION_TYPES.SEND_SMS]:     'Send SMS',
      [ACTION_TYPES.CREATE_DRAFT]: 'Create Draft',
      [ACTION_TYPES.SAVE_CRM]:     'Save to CRM',
      [ACTION_TYPES.CREATE_TASK]:  'Create Task',
      [ACTION_TYPES.SUBMIT_FORM]:  'Submit Form',
      [ACTION_TYPES.SAVE_RECORD]:  'Save Record',
      [ACTION_TYPES.OUTREACH]:     'Outreach Action',
    };

    return {
      type:        'approval_request',
      actionType,
      actionLabel: labels[actionType] || actionType,
      payload,
      message:     `Approve ${labels[actionType] || actionType}?`,
      previewText: payload.body || payload.text || payload.note || JSON.stringify(payload).slice(0, 200),
    };
  }

  return {
    checkBlock,
    validateRecipients,
    buildPermissionGate,
    buildApprovalRequest,
    ACTION_TYPES,
  };
})();

if (typeof module !== 'undefined') {
  module.exports = { ApprovalGate };
}
