// KyleOS - Approval UI Components
// Generates approval-gated action blocks for the side panel

export function renderApprovalBlock(approvalRequest) {
  const { actionType, description, payload } = approvalRequest;

  return {
    type: 'APPROVAL_BLOCK',
    actionType,
    description,
    payload,
    buttons: buildApprovalButtons(actionType)
  };
}

function buildApprovalButtons(actionType) {
  const baseButtons = [
    { id: 'approve', label: 'Approve', variant: 'primary', action: 'ACTION_APPROVED' },
    { id: 'edit', label: 'Edit', variant: 'secondary', action: 'ACTION_EDIT' },
    { id: 'skip', label: 'Skip', variant: 'ghost', action: 'ACTION_REJECTED' }
  ];

  // Email-specific
  if (actionType === 'CREATE_EMAIL_DRAFT') {
    return [
      { id: 'create_draft', label: 'Create Draft in Gmail', variant: 'primary', action: 'ACTION_APPROVED' },
      { id: 'edit', label: 'Edit First', variant: 'secondary', action: 'ACTION_EDIT' },
      { id: 'skip', label: 'Skip', variant: 'ghost', action: 'ACTION_REJECTED' }
    ];
  }

  if (actionType === 'SEND_SMS') {
    return [
      { id: 'send_to_iphone', label: 'Send to iPhone', variant: 'primary', action: 'ACTION_APPROVED' },
      { id: 'copy', label: 'Copy Text', variant: 'secondary', action: 'COPY_TO_CLIPBOARD' },
      { id: 'skip', label: 'Skip', variant: 'ghost', action: 'ACTION_REJECTED' }
    ];
  }

  if (actionType === 'CREATE_ONEHOME_CONTACT' || actionType === 'CREATE_ONEHOME_SEARCH') {
    return [
      { id: 'approve', label: 'Guide Me Through It', variant: 'primary', action: 'ACTION_APPROVED' },
      { id: 'skip', label: 'Skip', variant: 'ghost', action: 'ACTION_REJECTED' }
    ];
  }

  return baseButtons;
}

// ─── Paste-ready output block ─────────────────────────────────────────────────

export function renderOutputBlock(sections) {
  // sections: array of { label, content, copyable }
  return {
    type: 'OUTPUT_BLOCK',
    sections: sections.map(s => ({
      label: s.label,
      content: s.content,
      copyable: s.copyable !== false // default true
    }))
  };
}

// ─── Missing info block ───────────────────────────────────────────────────────

export function renderMissingInfo(items) {
  if (!items || items.length === 0) return null;
  return {
    type: 'MISSING_INFO',
    items
  };
}

// ─── Risk flag block ──────────────────────────────────────────────────────────

export function renderRiskFlags(flags) {
  if (!flags || flags.length === 0) return null;
  return {
    type: 'RISK_FLAGS',
    flags
  };
}

// ─── Recommended click block ──────────────────────────────────────────────────

export function renderRecommendedClick(instruction) {
  if (!instruction) return null;
  return {
    type: 'RECOMMENDED_CLICK',
    instruction
  };
}
