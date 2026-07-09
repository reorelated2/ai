// KyleOS - Agent Tools Mode
// Analyzes customer detail pages and expanded follow-up rows
// Produces Lead Summary, Priority, Next Best Action, Agent Note, SMS Draft, etc.

import { buildPermissionGate } from '../core/guards.js';
import { APPROVED_ASSIGNEE } from '../core/constants.js';

export async function analyzeAgentTools(data, settings) {
  if (!data) return buildEmptyResult('No page data available.');

  const context = buildContext(data);
  const priority = scorePriority(context);
  const whyItMatters = buildWhyItMatters(context);
  const nextBestAction = buildNextBestAction(context);
  const agentNote = buildAgentNote(context);
  const followUpTask = buildFollowUpTask(context);
  const smsDraft = buildSMSDraft(context);
  const emailDraft = context.needsEmail ? buildEmailDraft(context) : null;
  const callReason = buildCallReason(context);
  const kpiStatus = buildKPIStatus(context);
  const riskFlags = buildRiskFlags(context);
  const missingInfo = buildMissingInfo(context);
  const recommendedClick = buildRecommendedClick(context);

  const sections = [
    {
      label: 'Lead Summary',
      content: buildLeadSummary(context),
      priority: priority.level
    },
    {
      label: 'Priority',
      content: `${priority.level} — ${priority.reason}`,
      priority: priority.level
    },
    {
      label: 'Why It Matters',
      content: whyItMatters
    },
    {
      label: 'Next Best Action',
      content: nextBestAction
    },
    {
      label: 'Agent Tools Note',
      content: agentNote,
      copyable: true
    },
    {
      label: 'Follow Up Task',
      content: followUpTask,
      copyable: true
    },
    {
      label: 'Call Reason',
      content: callReason
    },
    {
      label: 'Disposition / Reminder',
      content: buildDisposition(context)
    },
    {
      label: 'KPI Protected',
      content: kpiStatus
    }
  ];

  if (smsDraft) {
    sections.push({
      label: 'SMS Draft',
      content: smsDraft,
      copyable: true
    });
  }

  if (emailDraft) {
    sections.push({
      label: 'Email Draft',
      content: emailDraft,
      copyable: true
    });
  }

  const approvalActions = [];

  if (smsDraft) {
    approvalActions.push(
      { type: 'desc', text: 'Ready to send text:' },
      {
        label: 'Send to iPhone',
        variant: 'primary',
        action: 'ACTION_APPROVED',
        actionType: 'SEND_SMS',
        data: smsDraft
      },
      {
        label: 'Copy SMS',
        variant: 'secondary',
        action: 'COPY_TO_CLIPBOARD',
        data: smsDraft
      }
    );
  }

  return {
    sections,
    riskFlags,
    missingInfo,
    recommendedClick,
    approvalActions
  };
}

// ─── Context Builder ──────────────────────────────────────────────────────────

function buildContext(data) {
  return {
    customerName: data.customerName || 'Unknown',
    phone: data.phone,
    email: data.email,
    status: data.status,
    leadSource: data.leadSource,
    assignedAgent: data.assignedAgent,
    ownerAgent: data.ownerAgent,
    daysOnRedfin: data.daysOnRedfin ? parseInt(data.daysOnRedfin) : null,
    lastMet: data.lastMet,
    followUpPlan: data.followUpPlan,
    nextFollowUp: data.nextFollowUp,
    tags: data.tags || [],
    notes: data.notes || [],
    milestones: data.milestones || [],
    tours: data.tours || [],
    isNewLead: data.isNewLead,
    isHotLead: data.isHotLead,
    isStaleLead: data.isStaleLead,
    isPostTour: data.isPostTour,
    isCanceledTour: data.isCanceledTour,
    buyerIntent: data.buyerIntent,
    sellerIntent: data.sellerIntent,
    wrongAgentRisk: data.wrongAgentRisk,
    propertyInterests: data.propertyInterests || [],
    raw: data.raw || ''
  };
}

// ─── Priority Scorer ──────────────────────────────────────────────────────────

function scorePriority(ctx) {
  if (ctx.isHotLead) return { level: 'HIGH', reason: 'Hot lead flagged in Agent Tools.' };
  if (ctx.isNewLead && !ctx.lastMet) return { level: 'HIGH', reason: 'New lead, no first contact yet.' };
  if (ctx.isCanceledTour) return { level: 'HIGH', reason: 'Canceled tour — re-engage quickly.' };
  if (ctx.wrongAgentRisk) return { level: 'HIGH', reason: 'Possible wrong agent assignment.' };
  if (ctx.isPostTour && !ctx.followUpPlan) return { level: 'HIGH', reason: 'Post-tour, no follow-up plan set.' };
  if (ctx.isStaleLead) return { level: 'MEDIUM', reason: 'Stale lead, needs reactivation.' };
  if (ctx.daysOnRedfin && ctx.daysOnRedfin > 90) return { level: 'MEDIUM', reason: `${ctx.daysOnRedfin} days on Redfin without close.` };
  if (!ctx.phone && !ctx.email) return { level: 'MEDIUM', reason: 'No contact info — cannot reach.' };
  return { level: 'LOW', reason: 'Standard follow-up.' };
}

// ─── Content Builders ─────────────────────────────────────────────────────────

function buildLeadSummary(ctx) {
  const parts = [];

  const intent = ctx.sellerIntent && ctx.buyerIntent ? 'Buyer + seller'
    : ctx.sellerIntent ? 'Seller'
    : ctx.buyerIntent ? 'Buyer'
    : 'Intent unknown';

  parts.push(`${ctx.customerName} — ${intent}`);
  if (ctx.leadSource) parts.push(`Source: ${ctx.leadSource}`);
  if (ctx.status) parts.push(`Status: ${ctx.status}`);
  if (ctx.daysOnRedfin) parts.push(`${ctx.daysOnRedfin} days on Redfin`);
  if (ctx.lastMet) parts.push(`Last contact: ${ctx.lastMet}`);
  if (ctx.assignedAgent) parts.push(`Assigned: ${ctx.assignedAgent}`);

  return parts.join('\n');
}

function buildWhyItMatters(ctx) {
  if (ctx.isHotLead) return 'Hot lead. High intent. Move now.';
  if (ctx.isNewLead) return 'New lead. First contact sets the tone. Don\'t let this sit.';
  if (ctx.isCanceledTour) return 'Canceled tour. Still active. Reschedule or clarify needs before they go elsewhere.';
  if (ctx.isPostTour) return 'Toured recently. This is the highest conversion window. Follow up now.';
  if (ctx.isStaleLead) return 'Gone quiet. Needs a touchpoint to stay alive in your pipeline.';
  if (ctx.daysOnRedfin > 90) return `${ctx.daysOnRedfin} days without movement. Needs a decision.`;
  if (ctx.sellerIntent) return 'Seller lead. Get the consult on the books.';
  return 'Active lead. Keep the follow-up current.';
}

function buildNextBestAction(ctx) {
  if (!ctx.phone && !ctx.email) return 'Get contact info first. Cannot progress without phone or email.';
  if (ctx.isHotLead || ctx.isNewLead) {
    if (ctx.phone) return `Call ${ctx.customerName} now. ${ctx.phone}`;
    return `Text ${ctx.customerName} to open the conversation.`;
  }
  if (ctx.isCanceledTour) return `Reach out to reschedule or find out why they canceled.`;
  if (ctx.isPostTour) return `Follow up on the tour. Ask what they thought. Get the next step.`;
  if (!ctx.followUpPlan) return `Set a follow-up plan in Agent Tools. Choose the right cadence.`;
  if (ctx.nextFollowUp) return `Execute the scheduled follow-up due: ${ctx.nextFollowUp}`;
  if (ctx.isStaleLead) return `Send a low-pressure check-in. Keep it short.`;
  if (ctx.sellerIntent) return `Book the listing consult. Come prepared with a comp summary.`;
  return `Standard follow-up. Check in on their search or timeline.`;
}

function buildAgentNote(ctx) {
  // Short, factual, broad brush — paste ready for Agent Tools
  const parts = [];

  if (ctx.isNewLead) parts.push('New lead. First contact pending.');
  if (ctx.isHotLead) parts.push('Hot lead. High priority.');
  if (ctx.isCanceledTour) parts.push('Canceled tour. Following up to reschedule.');
  if (ctx.isPostTour) parts.push('Post-tour follow-up.');
  if (ctx.isStaleLead) parts.push('Reactivation outreach.');
  if (ctx.sellerIntent) parts.push('Seller lead. Consult TBD.');
  if (ctx.buyerIntent && !ctx.sellerIntent) parts.push('Buyer lead.');

  if (parts.length === 0) parts.push('Follow-up in progress.');

  if (ctx.nextFollowUp) parts.push(`Next step: ${ctx.nextFollowUp}`);

  return parts.join(' ');
}

function buildFollowUpTask(ctx) {
  if (!ctx.nextFollowUp && !ctx.followUpPlan) {
    return `Set follow-up task for ${ctx.customerName} — choose cadence in Agent Tools.`;
  }
  if (ctx.nextFollowUp) return `Follow up due: ${ctx.nextFollowUp}`;
  return `Follow-up plan: ${ctx.followUpPlan}`;
}

function buildSMSDraft(ctx) {
  if (!ctx.customerName || ctx.customerName === 'Unknown') return null;

  const firstName = ctx.customerName.split(' ')[0];

  if (ctx.isNewLead) {
    return `Hey ${firstName}, this is Kyle with Redfin. Wanted to reach out and see what you're looking for. What area and price range are you focused on?`;
  }
  if (ctx.isCanceledTour) {
    return `Hey ${firstName}, saw the tour got canceled. No worries — still here whenever you're ready. Want to find a new time that works?`;
  }
  if (ctx.isPostTour) {
    return `Hey ${firstName}, just wanted to follow up after the tour. What did you think? Any questions on the place?`;
  }
  if (ctx.isStaleLead) {
    return `Hey ${firstName}, just checking in. Still looking or has your timeline changed?`;
  }
  if (ctx.sellerIntent) {
    return `Hey ${firstName}, Kyle with Redfin. Would love to connect about the property. When's a good time to talk through the market?`;
  }

  return `Hey ${firstName}, Kyle here. Just checking in — anything I can help with on your search?`;
}

function buildEmailDraft(ctx) {
  const firstName = ctx.customerName.split(' ')[0];
  return `Hi ${firstName},\n\nJust wanted to check in and see where you're at. Let me know if anything has changed or if you have any questions.\n\nHappy to help.\n\nKyle`;
}

function buildCallReason(ctx) {
  if (ctx.isNewLead) return `First contact. Introduce yourself, ask what they're looking for.`;
  if (ctx.isCanceledTour) return `Find out why the tour was canceled. Offer to reschedule.`;
  if (ctx.isPostTour) return `Get feedback on the tour. Discuss next properties or offer.`;
  if (ctx.isStaleLead) return `Re-engagement call. Light touch. Keep it short.`;
  if (ctx.sellerIntent) return `Discuss listing timeline, pricing, and consult availability.`;
  return `Routine follow-up. Check search status and timeline.`;
}

function buildDisposition(ctx) {
  if (ctx.isHotLead) return `Follow up within 1 hour.`;
  if (ctx.isNewLead) return `Follow up same day.`;
  if (ctx.isCanceledTour || ctx.isPostTour) return `Follow up within 24 hours.`;
  if (ctx.isStaleLead) return `Set a 7-day follow-up reminder.`;
  return `Set next follow-up based on their timeline.`;
}

function buildKPIStatus(ctx) {
  const issues = [];

  if (!ctx.followUpPlan) issues.push('No follow-up plan set');
  if (!ctx.phone && !ctx.email) issues.push('No contact info');
  if (ctx.wrongAgentRisk) issues.push('Agent assignment may be wrong');
  if (ctx.daysOnRedfin > 90) issues.push(`${ctx.daysOnRedfin} days without close`);

  if (issues.length === 0) return 'KPIs look clean for this lead.';
  return `KPI issues:\n${issues.map(i => `• ${i}`).join('\n')}`;
}

function buildRiskFlags(ctx) {
  const flags = [];

  if (ctx.wrongAgentRisk) flags.push('Agent assignment risk — verify ownership before outreach.');
  if (!ctx.phone && !ctx.email) flags.push('No contact info visible. Cannot reach this lead.');
  if (ctx.isCanceledTour) flags.push('Canceled tour — re-engage before they go cold.');
  if (ctx.daysOnRedfin > 120) flags.push(`${ctx.daysOnRedfin} days on Redfin — escalate or close.`);
  if (ctx.assignedAgent && ctx.ownerAgent && ctx.assignedAgent !== ctx.ownerAgent) {
    flags.push(`Assigned agent (${ctx.assignedAgent}) differs from owner agent (${ctx.ownerAgent}) — confirm permission.`);
  }

  return flags;
}

function buildMissingInfo(ctx) {
  const missing = [];

  if (!ctx.phone) missing.push('Phone number not visible.');
  if (!ctx.email) missing.push('Email not visible.');
  if (!ctx.leadSource) missing.push('Lead source unknown.');
  if (!ctx.status) missing.push('Lead status not detected.');
  if (!ctx.followUpPlan) missing.push('No follow-up plan set in Agent Tools.');
  if (!ctx.assignedAgent) missing.push('Assigned agent not identified.');

  return missing;
}

function buildRecommendedClick(ctx) {
  if (!ctx.followUpPlan) return 'Set a follow-up plan: open the Follow Up Plans section and assign a cadence.';
  if (ctx.isHotLead || ctx.isNewLead) return 'Open the customer\'s contact info and place the call now.';
  if (ctx.isPostTour) return 'Open Tours section to review tour history before calling.';
  return null;
}

function buildEmptyResult(msg) {
  return {
    sections: [{ label: 'Status', content: msg }],
    riskFlags: [],
    missingInfo: [],
    recommendedClick: null,
    approvalActions: []
  };
}
