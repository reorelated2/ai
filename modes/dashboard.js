// KyleOS - Team Dashboard / Appointments Database Capture Mode
// Parses team/shared Agent Tools pages and creates one capture package per contact
// Permission gate applied to all team source contacts

import { buildPermissionGate, buildOwnershipReview } from '../core/guards.js';
import { APPROVED_ASSIGNEE } from '../core/constants.js';

const MAX_AUTO_SHOW = 5;

export async function analyzeDashboard(data, settings) {
  if (!data) return buildEmptyResult('No dashboard data available.');

  const rows = data.rows || [];

  if (rows.length === 0) {
    return buildEmptyResult(
      'No rows detected on this page.\n\nTry:\n• Change filter to "Show All Active"\n• Change filter to "New Tours"\n• Scroll down to load more rows'
    );
  }

  // Score and rank by opportunity
  const rankedRows = rankByOpportunity(rows);
  const topRows = rankedRows.slice(0, MAX_AUTO_SHOW);
  const remaining = rankedRows.length - MAX_AUTO_SHOW;

  const packages = topRows.map(row => buildCapturePackage(row, data.type));

  const result = {
    sections: [
      {
        label: 'Database Capture',
        content: buildCaptureHeader(rankedRows, remaining),
        copyable: false
      }
    ],
    packages,
    riskFlags: [],
    missingInfo: [],
    recommendedClick: buildDashboardRecommendedClick(data),
    approvalActions: remaining > 0 ? [
      { type: 'desc', text: `Showing top ${MAX_AUTO_SHOW} of ${rankedRows.length} contacts.` },
      {
        label: `Show Next ${Math.min(remaining, MAX_AUTO_SHOW)}`,
        variant: 'secondary',
        action: 'LOAD_MORE',
        data: { offset: MAX_AUTO_SHOW }
      }
    ] : []
  };

  return result;
}

// ─── Opportunity Scorer ───────────────────────────────────────────────────────

function rankByOpportunity(rows) {
  return [...rows]
    .map(row => ({ ...row, opportunityScore: scoreOpportunity(row) }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

function scoreOpportunity(row) {
  let score = 0;
  const text = (row.raw || '').toLowerCase();
  const type = (row.appointmentType || '').toLowerCase();

  // Appointment types
  if (type.includes('listing consult')) score += 10;
  if (type.includes('buyer consult')) score += 8;
  if (type.includes('new tour') || type.includes('unscheduled tour')) score += 7;
  if (type.includes('tour')) score += 5;
  if (type.includes('offer')) score += 9;
  if (type.includes('closing')) score += 9;

  // Signals
  if (text.includes('seller') || text.includes('listing')) score += 3;
  if (text.includes('preapproved') || text.includes('pre-approved')) score += 4;
  if (text.includes('investor')) score += 3;
  if (text.includes('cash')) score += 5;
  if (text.includes('urgent') || text.includes('asap')) score += 4;

  // Recency
  if (text.includes('today') || text.includes('now')) score += 5;
  if (text.includes('tomorrow') || text.includes('this week')) score += 3;

  // Has contact info
  if (row.customerName) score += 2;
  if (row.property) score += 1;

  return score;
}

// ─── Capture Package Builder ──────────────────────────────────────────────────

function buildCapturePackage(row, sourceType) {
  const classification = row.buyerSellerClassification || classifyRow(row);
  const mainAngle = buildMainAngle(row, classification);
  const whatMatters = buildWhatMatters(row, classification);
  const consultPlan = buildConsultPlan(row, classification);
  const fubRecord = buildFUBRecord(row);
  const fubNote = buildFUBNote(row, classification);
  const followUpTask = buildFollowUpTask(row, classification);
  const tags = buildTags(row, classification);
  const smsDraft = buildSMSDraft(row);
  const emailDraft = shouldBuildEmail(row) ? buildEmailDraft(row, classification) : null;
  const permissionGate = buildPermissionGate(row.customerName || 'this contact');
  const ownershipReview = buildOwnershipReview(row);
  const riskFlags = buildPackageRiskFlags(row, ownershipReview);
  const missingInfo = buildPackageMissingInfo(row);
  const recommendedClick = buildPackageRecommendedClick(row);

  const sections = [
    { label: 'Classification', content: classification },
    { label: 'Main Angle', content: mainAngle },
    { label: 'What Matters', content: whatMatters },
    { label: 'Consultation Game Plan', content: consultPlan },
    { label: 'FUB Contact Record', content: fubRecord, copyable: true },
    { label: 'FUB Note', content: fubNote, copyable: true },
    { label: 'Follow Up Task', content: followUpTask, copyable: true },
    { label: 'Tags', content: tags.join(', ') }
  ];

  if (smsDraft) {
    sections.push({ label: 'SMS Draft', content: smsDraft, copyable: true });
  }

  if (emailDraft) {
    sections.push({ label: 'Email Draft', content: emailDraft, copyable: true });
  }

  return {
    customerName: row.customerName || 'Unknown',
    sections,
    riskFlags,
    missingInfo,
    permissionGate,
    recommendedClick,
    raw: row
  };
}

// ─── Classification ───────────────────────────────────────────────────────────

function classifyRow(row) {
  const text = (row.raw || '').toLowerCase();
  const type = (row.appointmentType || '').toLowerCase();

  if (type.includes('listing consult')) return 'Seller Listing Consult';
  if (type.includes('buyer consult')) return 'Buyer Consult';
  if (type.includes('on market check')) return 'On Market Check In';
  if (type.includes('closing')) return 'Closing';
  if (type.includes('offer')) return 'Offer';
  if (type.includes('tour') || type.includes('showing')) return 'Buyer Tour';
  if (text.includes('listing') || text.includes('seller')) return 'Potential Seller';
  if (text.includes('investor')) return 'Investor Opportunity';
  if (text.includes('rental')) return 'Rental';
  return 'Buyer Lead';
}

// ─── Content Builders ─────────────────────────────────────────────────────────

function buildMainAngle(row, classification) {
  const parts = [];

  parts.push(`${classification}.`);

  const text = (row.raw || '').toLowerCase();

  if (row.property) parts.push(`Property: ${row.property}.`);
  if (row.price) parts.push(`Price: ${row.price}.`);

  if (text.includes('seller') || classification.includes('Seller')) {
    parts.push('Seller intent detected. Lead with market positioning.');
  }
  if (text.includes('investor')) {
    parts.push('Investor buyer — focus on returns, cap rate, rental restrictions.');
  }
  if (text.includes('cash')) {
    parts.push('Cash buyer signals. High opportunity.');
  }
  if (text.includes('preapproved') || text.includes('pre-approved')) {
    parts.push('Pre-approved. Ready to move.');
  }

  return parts.join('\n');
}

function buildWhatMatters(row, classification) {
  const text = (row.raw || '').toLowerCase();
  const parts = [];

  // Motivation
  let motivation = 'Unknown. Clarify on first contact.';
  if (text.includes('relocat')) motivation = 'Relocating.';
  else if (text.includes('downsize')) motivation = 'Downsizing.';
  else if (text.includes('upsize') || text.includes('growing')) motivation = 'Upsizing / growing family.';
  else if (text.includes('invest')) motivation = 'Investment purchase.';
  else if (text.includes('first time') || text.includes('first-time')) motivation = 'First-time buyer.';

  parts.push(`Motivation: ${motivation}`);

  if (row.scheduledTime || row.requestedTime) {
    parts.push(`Appointment: ${row.scheduledTime || row.requestedTime}`);
  }
  if (row.idVerification) parts.push(`ID verification: ${row.idVerification}`);
  if (row.preapproval) parts.push(`Preapproval: ${row.preapproval}`);
  if (row.team) parts.push(`Team: ${row.team}`);

  return parts.join('\n');
}

function buildConsultPlan(row, classification) {
  const isSeller = classification.includes('Seller') || classification.includes('Listing');
  const isBuyer = classification.includes('Buyer') || classification.includes('Tour');
  const isInvestor = classification.includes('Investor');

  if (isSeller) {
    return [
      "Lead with the seller's goal first.",
      'Clarify title, decision makers, and timeline.',
      'Confirm sale strategy: as-is, renovated, or redevelopment.',
      'Discuss likely buyer pool and market positioning.',
      'Explain Redfin commission and value clearly.',
      'Ask about future purchase needs.'
    ].join('\n');
  }

  if (isInvestor) {
    return [
      'Lead with numbers: cap rate, rental yield, appreciation potential.',
      'Confirm target neighborhoods and property type.',
      'Ask about financing or cash.',
      'Clarify short-term vs long-term hold strategy.',
      'Flag HOA rental restrictions upfront.',
      'Offer to set up MLS search with investor criteria.'
    ].join('\n');
  }

  // Default buyer
  return [
    "Start with Kyle's opening: What's most important to you?",
    'Confirm pre-approval status and lender.',
    'Nail down areas, property type, and must-haves.',
    'Discuss timeline and motivation.',
    'Set up OneHome portal and MLS alerts.',
    'Schedule first tour if not already booked.'
  ].join('\n');
}

function buildFUBRecord(row) {
  const lines = [
    `Contact Name: ${row.customerName || '[MISSING]'}`,
    `Phone: ${row.phone || '[Get from appointment detail]'}`,
    `Email: ${row.email || '[Get from appointment detail]'}`,
    `Lead Type: ${classifyRow(row)}`,
    `Lead Source: ${row.leadSource || 'Redfin Agent Tools'}`,
    `Pipeline Stage: New Lead`,
    `Assigned Agent: ${APPROVED_ASSIGNEE}`,
    `Tags: ${buildTags(row, classifyRow(row)).join(', ')}`,
    `Property: ${row.property || '[See MLS]'}`,
    `MLS Number: ${row.mlsNumber || 'TBD'}`,
    `Price: ${row.price || 'TBD'}`,
    `Next Action: ${buildFollowUpTask(row, classifyRow(row))}`,
    `Last Activity: ${row.scheduledTime || row.requestedTime || new Date().toLocaleDateString()}`
  ];
  return lines.join('\n');
}

function buildFUBNote(row, classification) {
  const lines = [
    `Source: Agent Tools ${row.appointmentType || 'appointment'}.`,
    `Classification: ${classification}.`
  ];

  if (row.property) lines.push(`Property: ${row.property}.`);
  if (row.price) lines.push(`Price: ${row.price}.`);
  if (row.scheduledTime) lines.push(`Scheduled: ${row.scheduledTime}.`);
  if (row.idVerification) lines.push(`ID: ${row.idVerification}.`);
  if (row.preapproval) lines.push(`Preapproval: ${row.preapproval}.`);

  lines.push('Permission gate: confirm outreach approved before contacting.');

  return lines.join(' ');
}

function buildFollowUpTask(row, classification) {
  const isSeller = (classification || '').includes('Seller');
  const type = row.appointmentType || '';

  if (type.includes('Listing Consult')) return 'Prepare listing consult — pull comps, draft CMA, confirm title and decision makers.';
  if (type.includes('Buyer Consult')) return 'Prepare buyer consult — confirm preapproval, set up OneHome portal, have area list ready.';
  if (type.includes('Tour') || type.includes('tour')) return 'Post-tour follow-up — contact within 24 hours of tour.';
  if (isSeller) return 'Call to confirm listing consult details and prep CMA.';
  return 'First contact — call or text when permission confirmed.';
}

function buildTags(row, classification) {
  const tags = [];
  const text = (row.raw || '').toLowerCase();

  if (classification.includes('Seller') || classification.includes('Listing')) tags.push('seller-lead');
  if (classification.includes('Buyer') || classification.includes('Tour')) tags.push('buyer-lead');
  if (classification.includes('Investor')) tags.push('investor');
  if (text.includes('preapproved') || text.includes('pre-approved')) tags.push('preapproved');
  if (text.includes('cash')) tags.push('cash-buyer');
  if (text.includes('first time') || text.includes('first-time')) tags.push('first-time-buyer');
  if (text.includes('reloc')) tags.push('relocation');
  if (row.appointmentType) tags.push(row.appointmentType.toLowerCase().replace(/\s+/g, '-'));

  tags.push('agent-tools-source');
  tags.push('permission-required');

  return tags;
}

function buildSMSDraft(row) {
  if (!row.customerName || row.customerName === 'Unknown') return null;
  const firstName = row.customerName.split(' ')[0];
  return `Hey ${firstName}, this is Kyle with Redfin. Looking forward to connecting. When's a good time to chat?`;
}

function shouldBuildEmail(row) {
  const type = (row.appointmentType || '').toLowerCase();
  return type.includes('listing consult') || type.includes('buyer consult');
}

function buildEmailDraft(row, classification) {
  const firstName = (row.customerName || 'there').split(' ')[0];
  const isSeller = classification.includes('Seller');

  if (isSeller) {
    return `Hi ${firstName},\n\nLooking forward to connecting about your property. I'll be prepared with current market data and a preliminary value range for our call.\n\nLet me know if anything has changed before we speak.\n\nKyle`;
  }

  return `Hi ${firstName},\n\nExcited to work together. Before we meet, I wanted to make sure I'm fully prepped for your search.\n\nFeel free to send over any properties you've been eyeing — I'll have everything ready.\n\nKyle`;
}

function buildPackageRiskFlags(row, ownershipReview) {
  const flags = [];

  if (ownershipReview.needsReview) {
    flags.push(...ownershipReview.issues);
  }

  const text = (row.raw || '').toLowerCase();
  if (text.includes('no contact') || text.includes('do not call')) {
    flags.push('Do Not Contact flag detected. Verify before outreach.');
  }

  if (!row.customerName) flags.push('Customer name missing. Cannot build full record.');

  return flags;
}

function buildPackageMissingInfo(row) {
  const missing = [];

  if (!row.phone) missing.push('Phone/email not visible from list view. Open appointment or customer detail to capture contact info.');
  if (!row.property) missing.push('Property address not visible. Open appointment detail.');
  if (!row.mlsNumber) missing.push('MLS number not visible.');
  if (!row.assignedAgent) missing.push('Assigned agent not visible.');

  return missing;
}

function buildPackageRecommendedClick(row) {
  if (!row.phone && !row.email) return 'Open appointment row → then open customer detail to capture phone and email.';
  if (!row.property) return 'Open appointment detail to see property address and MLS number.';
  return 'Review capture package above, confirm permission, then set up FUB record.';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCaptureHeader(rows, remaining) {
  return `${rows.length} contacts found. Showing top ${Math.min(MAX_AUTO_SHOW, rows.length)}${remaining > 0 ? ` (${remaining} more available)` : ''}.\n\nAll contacts are from a team/shared source. Permission required before outreach.`;
}

function buildDashboardRecommendedClick(data) {
  if (data.type === 'appointments') {
    return 'Filter: Change to "New Tours" or "Unscheduled Tours" to see highest-opportunity leads.';
  }
  return 'Open individual appointment or customer rows for full contact detail.';
}

function buildEmptyResult(msg) {
  return {
    sections: [{ label: 'Database Capture', content: msg }],
    packages: [],
    riskFlags: [],
    missingInfo: [],
    recommendedClick: null,
    approvalActions: []
  };
}
