// KyleOS - Page Content Extractor
// Scrapes visible DOM data per page type

import { PLATFORM, PAGE_TYPE } from '../core/constants.js';

// ─── Main Entry ──────────────────────────────────────────────────────────────

export function extractPageData(detection) {
  const { platform, pageType } = detection;

  switch (pageType) {
    case PAGE_TYPE.CUSTOMER_DETAIL:
      return extractCustomerDetail();
    case PAGE_TYPE.EXPANDED_FOLLOW_UP_ROW:
      return extractExpandedFollowUpRow();
    case PAGE_TYPE.TEAM_DASHBOARD:
      return extractTeamDashboard();
    case PAGE_TYPE.APPOINTMENTS:
      return extractAppointments();
    case PAGE_TYPE.FOLLOW_UPS:
    case PAGE_TYPE.PRIORITY_FOLLOW_UPS:
      return extractFollowUpList();
    case PAGE_TYPE.CUSTOMERS_LIST:
      return extractCustomerList();
    case PAGE_TYPE.MLS_LISTING:
      return extractMLSListing();
    case PAGE_TYPE.MLS_SEARCH:
    case PAGE_TYPE.MLS_COMPS:
      return extractMLSSearch();
    case PAGE_TYPE.ONEHOME_CONTACTS:
    case PAGE_TYPE.ONEHOME_SEARCH:
    case PAGE_TYPE.ONEHOME_LISTING:
    case PAGE_TYPE.ONEHOME_COLLECTION:
      return extractOneHome(pageType);
    case PAGE_TYPE.GMAIL_THREAD:
      return extractGmailThread();
    case PAGE_TYPE.GMAIL_INBOX:
      return extractGmailInbox();
    default:
      return extractGenericPage();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getText(selector, root = document) {
  const el = root.querySelector(selector);
  return el ? el.textContent.trim() : null;
}

function getAllText(selector, root = document) {
  return Array.from(root.querySelectorAll(selector))
    .map(el => el.textContent.trim())
    .filter(Boolean);
}

function getAttr(selector, attr, root = document) {
  const el = root.querySelector(selector);
  return el ? el.getAttribute(attr) : null;
}

function getBodyText() {
  // Get meaningful visible text, excluding nav/scripts
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('script, style, nav, footer, [aria-hidden="true"]').forEach(el => el.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim().substring(0, 8000);
}

// ─── Agent Tools: Customer Detail ────────────────────────────────────────────

function extractCustomerDetail() {
  const data = {
    type: 'customer_detail',
    raw: getBodyText()
  };

  // Customer name - Redfin agent tools uses various class names
  data.customerName = (
    getText('[class*="customer-name"]') ||
    getText('[class*="CustomerName"]') ||
    getText('[class*="contact-name"]') ||
    getText('h1') ||
    null
  );

  // Phone
  data.phone = (
    getText('[class*="phone"]') ||
    getText('[href^="tel:"]') ||
    extractPhoneFromText(getBodyText())
  );

  // Email
  data.email = (
    getText('[class*="email"]') ||
    getText('[href^="mailto:"]') ||
    getAttr('[href^="mailto:"]', 'href')?.replace('mailto:', '') ||
    extractEmailFromText(getBodyText())
  );

  // Status / lead type
  data.status = (
    getText('[class*="lead-status"]') ||
    getText('[class*="LeadStatus"]') ||
    getText('[class*="customer-status"]') ||
    null
  );

  // Lead source
  data.leadSource = (
    getText('[class*="lead-source"]') ||
    getText('[class*="LeadSource"]') ||
    null
  );

  // Assigned agent
  data.assignedAgent = (
    getText('[class*="assigned-agent"]') ||
    getText('[class*="AssignedAgent"]') ||
    getText('[class*="agent-name"]') ||
    null
  );

  // Owner agent
  data.ownerAgent = (
    getText('[class*="owner-agent"]') ||
    getText('[class*="OwnerAgent"]') ||
    null
  );

  // Days on Redfin
  data.daysOnRedfin = (
    getText('[class*="days-on-redfin"]') ||
    getText('[class*="DaysOnRedfin"]') ||
    extractDaysFromText(getBodyText())
  );

  // Last met / last contact
  data.lastMet = (
    getText('[class*="last-met"]') ||
    getText('[class*="LastMet"]') ||
    getText('[class*="last-contact"]') ||
    null
  );

  // Tags
  data.tags = getAllText('[class*="tag"], [class*="Tag"]');

  // Follow up plan
  data.followUpPlan = (
    getText('[class*="follow-up-plan"]') ||
    getText('[class*="FollowUpPlan"]') ||
    null
  );

  // Next follow up date/task
  data.nextFollowUp = (
    getText('[class*="next-follow-up"]') ||
    getText('[class*="NextFollowUp"]') ||
    getText('[class*="follow-up-date"]') ||
    null
  );

  // Notes
  data.notes = getAllText('[class*="note"], [class*="Note"]').slice(0, 10);

  // Milestones
  data.milestones = getAllText('[class*="milestone"], [class*="Milestone"]').slice(0, 10);

  // Tours
  data.tours = getAllText('[class*="tour"], [class*="Tour"]').slice(0, 10);

  // Emails to Kyle
  data.emailsToKyle = getAllText('[class*="email-to-kyle"], [class*="EmailToKyle"]').slice(0, 5);

  // Hot / new / stale lead indicators
  const bodyText = getBodyText().toLowerCase();
  data.isNewLead = bodyText.includes('new lead') || bodyText.includes('new customer');
  data.isHotLead = bodyText.includes('hot lead') || bodyText.includes('hot customer');
  data.isStaleLead = bodyText.includes('stale') || bodyText.includes('no response');
  data.isPostTour = bodyText.includes('post tour') || bodyText.includes('toured');
  data.isCanceledTour = bodyText.includes('canceled tour') || bodyText.includes('cancelled tour');

  // Buyer / seller intent
  data.buyerIntent = bodyText.includes('buyer') || bodyText.includes('looking to buy');
  data.sellerIntent = bodyText.includes('seller') || bodyText.includes('listing') || bodyText.includes('sell');

  // Wrong agent / unassigned risk
  data.wrongAgentRisk = bodyText.includes('wrong agent') || bodyText.includes('reassign');

  // Property interests
  data.propertyInterests = getAllText('[class*="property-interest"], [class*="saved-home"]').slice(0, 5);

  return data;
}

// ─── Agent Tools: Expanded Follow-Up Row ─────────────────────────────────────

function extractExpandedFollowUpRow() {
  // Find the expanded row element
  const expandedRow = (
    document.querySelector('.follow-up-row--expanded') ||
    document.querySelector('[data-expanded="true"]') ||
    document.querySelector('.expanded-row') ||
    document.querySelector('[class*="expanded"]')
  );

  if (!expandedRow) {
    return { type: 'expanded_follow_up_row', raw: getBodyText(), partial: true };
  }

  const data = {
    type: 'expanded_follow_up_row',
    raw: expandedRow.textContent.trim()
  };

  data.customerName = getText('[class*="name"]', expandedRow);
  data.phone = getText('[class*="phone"]', expandedRow) || extractPhoneFromText(data.raw);
  data.email = getText('[class*="email"]', expandedRow) || extractEmailFromText(data.raw);
  data.followUpDue = getText('[class*="due"], [class*="date"]', expandedRow);
  data.status = getText('[class*="status"]', expandedRow);
  data.leadSource = getText('[class*="source"]', expandedRow);
  data.lastContact = getText('[class*="last-contact"], [class*="last-met"]', expandedRow);
  data.assignedAgent = getText('[class*="agent"]', expandedRow);
  data.notes = getAllText('[class*="note"]', expandedRow);

  return data;
}

// ─── Agent Tools: Team Dashboard ─────────────────────────────────────────────

function extractTeamDashboard() {
  const data = {
    type: 'team_dashboard',
    raw: getBodyText(),
    counters: {},
    rows: []
  };

  // Extract opportunity counters (top right)
  const counterEls = document.querySelectorAll(
    '[class*="counter"], [class*="Counter"], [class*="badge"], [class*="opportunity-count"]'
  );
  counterEls.forEach(el => {
    const label = el.closest('[class*="section"], [class*="card"]')?.querySelector('[class*="title"], [class*="label"]')?.textContent?.trim();
    const count = el.textContent.trim();
    if (label && count) {
      data.counters[label] = count;
    }
  });

  // Extract team opportunity rows
  const rowEls = document.querySelectorAll(
    '[class*="dashboard-row"], [class*="DashboardRow"], [class*="team-row"], tr, [role="row"]'
  );

  rowEls.forEach((row, index) => {
    const rowText = row.textContent.trim();
    if (!rowText || rowText.length < 10) return;

    const rowData = {
      index,
      raw: rowText,
      customerName: getText('[class*="name"], td:first-child', row),
      appointmentType: detectAppointmentType(rowText),
      assignedAgent: getText('[class*="agent"]', row),
      property: getText('[class*="address"], [class*="property"]', row),
      price: extractPriceFromText(rowText),
      date: getText('[class*="date"], [class*="time"]', row),
      status: getText('[class*="status"]', row),
      mlsNumber: extractMLSNumberFromText(rowText),
      isTeamShared: true // All team dashboard items are team/shared
    };

    if (rowData.customerName || rowData.property) {
      data.rows.push(rowData);
    }
  });

  return data;
}

// ─── Agent Tools: Appointments ───────────────────────────────────────────────

function extractAppointments() {
  const data = {
    type: 'appointments',
    raw: getBodyText(),
    currentFilter: null,
    rows: []
  };

  // Detect active filter
  const activeFilter = document.querySelector(
    '[class*="filter--active"], [class*="filter-active"], [aria-selected="true"], .active [class*="filter"]'
  );
  if (activeFilter) data.currentFilter = activeFilter.textContent.trim();

  // Extract appointment rows
  const rowEls = document.querySelectorAll(
    '[class*="appointment-row"], [class*="AppointmentRow"], [class*="tour-row"], tr[class*="appointment"], [role="row"]'
  );

  rowEls.forEach((row, index) => {
    const rowText = row.textContent.trim();
    if (!rowText || rowText.length < 10) return;

    const rowData = {
      index,
      raw: rowText,
      customerName: getText('[class*="customer-name"], [class*="name"]', row),
      appointmentType: detectAppointmentType(rowText),
      assignedAgent: getText('[class*="agent"]', row),
      ownerAgent: getText('[class*="owner"]', row),
      requestedTime: getText('[class*="requested-time"], [class*="RequestedTime"]', row),
      scheduledTime: getText('[class*="scheduled-time"], [class*="ScheduledTime"]', row),
      property: getText('[class*="address"], [class*="property"]', row),
      subdivision: getText('[class*="subdivision"], [class*="building"]', row),
      mlsNumber: extractMLSNumberFromText(rowText),
      price: extractPriceFromText(rowText),
      status: getText('[class*="status"]', row),
      idVerification: getText('[class*="id-verification"], [class*="IdVerification"]', row),
      preapproval: getText('[class*="preapproval"], [class*="Preapproval"]', row),
      team: getText('[class*="team"]', row),
      isTeamShared: true // All appointment rows are team/shared sources
    };

    rowData.buyerSellerClassification = classifyOpportunity(rowData);

    if (rowData.customerName || rowData.property) {
      data.rows.push(rowData);
    }
  });

  return data;
}

// ─── Agent Tools: Follow-Up List ─────────────────────────────────────────────

function extractFollowUpList() {
  const data = {
    type: 'follow_up_list',
    raw: getBodyText(),
    rows: []
  };

  const rowEls = document.querySelectorAll(
    '[class*="follow-up-row"], [class*="FollowUpRow"], tr, [role="row"]'
  );

  rowEls.forEach((row, index) => {
    const rowText = row.textContent.trim();
    if (!rowText || rowText.length < 10) return;

    data.rows.push({
      index,
      raw: rowText,
      customerName: getText('[class*="name"]', row),
      dueDate: getText('[class*="due"], [class*="date"]', row),
      type: getText('[class*="type"]', row),
      status: getText('[class*="status"]', row),
      priority: detectPriority(rowText),
      isExpired: isFollowUpExpired(rowText)
    });
  });

  return data;
}

// ─── Agent Tools: Customer List ───────────────────────────────────────────────

function extractCustomerList() {
  return {
    type: 'customer_list',
    raw: getBodyText(),
    note: 'List page — manual analyze only. Do not auto-analyze individual customers.',
    rowCount: document.querySelectorAll('[class*="customer-row"], tr[class*="customer"], [role="row"]').length
  };
}

// ─── MLS: Listing ─────────────────────────────────────────────────────────────

function extractMLSListing() {
  const raw = getBodyText();
  const data = {
    type: 'mls_listing',
    raw
  };

  // Address
  data.address = (
    getText('[class*="address"], [class*="Address"], [id*="address"]') ||
    extractAddressFromText(raw)
  );

  // MLS Number
  data.mlsNumber = (
    getText('[class*="mls-number"], [class*="MlsNumber"], [class*="listing-id"]') ||
    extractMLSNumberFromText(raw)
  );

  // Status
  data.status = getText('[class*="listing-status"], [class*="ListingStatus"], [class*="status"]');

  // Price
  data.listPrice = (
    getText('[class*="list-price"], [class*="ListPrice"], [class*="price"]') ||
    extractPriceFromText(raw)
  );
  data.soldPrice = getText('[class*="sold-price"], [class*="SoldPrice"]');

  // Property details
  data.beds = getText('[class*="beds"], [class*="Beds"], [class*="bedrooms"]');
  data.baths = getText('[class*="baths"], [class*="Baths"], [class*="bathrooms"]');
  data.livingArea = getText('[class*="living-area"], [class*="LivingArea"], [class*="sqft"], [class*="square-feet"]');
  data.lotSize = getText('[class*="lot-size"], [class*="LotSize"]');
  data.yearBuilt = getText('[class*="year-built"], [class*="YearBuilt"]');
  data.dom = getText('[class*="dom"], [class*="days-on-market"]');
  data.cdom = getText('[class*="cdom"], [class*="cumulative-days"]');
  data.hoa = getText('[class*="hoa"], [class*="HOA"], [class*="maintenance"]');
  data.taxes = getText('[class*="tax"], [class*="Tax"]');
  data.propertyType = getText('[class*="property-type"], [class*="PropertyType"]');
  data.subdivision = getText('[class*="subdivision"], [class*="Subdivision"]');
  data.waterfront = getText('[class*="waterfront"], [class*="Waterfront"]');
  data.parking = getText('[class*="parking"], [class*="Parking"]');
  data.pets = getText('[class*="pets"], [class*="Pets"]');
  data.rentalRestrictions = getText('[class*="rental"], [class*="Rental"]');

  // Remarks
  data.remarks = getText('[class*="remarks"], [class*="Remarks"], [class*="description"]');
  data.brokerRemarks = getText('[class*="broker-remarks"], [class*="BrokerRemarks"]');
  data.showingInstructions = getText('[class*="showing-instructions"], [class*="ShowingInstructions"]');

  // Price history
  data.priceHistory = getAllText('[class*="price-history"], [class*="PriceHistory"] tr, [class*="price-change"]').slice(0, 10);

  // Agents
  data.listingAgent = getText('[class*="listing-agent"], [class*="ListingAgent"]');
  data.listingOffice = getText('[class*="listing-office"], [class*="ListingOffice"]');

  return data;
}

// ─── MLS: Search Results ──────────────────────────────────────────────────────

function extractMLSSearch() {
  const data = {
    type: 'mls_search',
    raw: getBodyText(),
    listings: []
  };

  // Extract result count
  data.resultCount = getText('[class*="result-count"], [class*="ResultCount"]');

  // Extract individual listing summaries
  const listingEls = document.querySelectorAll(
    '[class*="listing-card"], [class*="ListingCard"], [class*="property-card"], [class*="result-row"], tr[class*="listing"]'
  );

  listingEls.forEach((el, index) => {
    const rowText = el.textContent.trim();
    data.listings.push({
      index,
      address: getText('[class*="address"]', el) || extractAddressFromText(rowText),
      price: extractPriceFromText(rowText),
      beds: getText('[class*="bed"]', el),
      baths: getText('[class*="bath"]', el),
      sqft: getText('[class*="sqft"], [class*="living"]', el),
      dom: getText('[class*="dom"]', el),
      mlsNumber: extractMLSNumberFromText(rowText),
      status: getText('[class*="status"]', el),
      raw: rowText.substring(0, 300)
    });
  });

  return data;
}

// ─── OneHome ──────────────────────────────────────────────────────────────────

function extractOneHome(pageType) {
  return {
    type: 'onehome',
    pageType,
    raw: getBodyText()
  };
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

function extractGmailThread() {
  const data = {
    type: 'gmail_thread',
    raw: getBodyText(),
    messages: []
  };

  // Subject
  data.subject = getText('h2[data-thread-perm-id], .hP, [class*="subject"]');

  // Extract individual messages in thread
  const messageEls = document.querySelectorAll(
    '.adn, [class*="message-body"], [role="listitem"]'
  );

  messageEls.forEach((el, index) => {
    const msgText = el.textContent.trim();
    if (!msgText || msgText.length < 20) return;

    data.messages.push({
      index,
      from: getText('.gD, [email], [data-hovercard-id]', el),
      date: getText('.g3, .ix, [class*="date"]', el),
      body: msgText.substring(0, 2000)
    });
  });

  // If no messages extracted, use full raw
  if (data.messages.length === 0 && data.raw) {
    data.messages.push({ index: 0, body: data.raw.substring(0, 3000) });
  }

  // Extract Redfin lead fields from email content
  const fullText = data.raw;
  data.leadFields = {
    customerName: extractLeadName(fullText),
    phone: extractPhoneFromText(fullText),
    email: extractEmailFromText(fullText),
    propertyAddress: extractAddressFromText(fullText),
    mlsNumber: extractMLSNumberFromText(fullText),
    appointmentTime: extractAppointmentTime(fullText),
    leadSource: detectLeadSource(fullText),
    leadType: detectLeadType(fullText)
  };

  return data;
}

function extractGmailInbox() {
  return {
    type: 'gmail_inbox',
    raw: getBodyText().substring(0, 2000),
    note: 'Inbox view. Open a lead email thread to parse it.'
  };
}

// ─── Generic Fallback ────────────────────────────────────────────────────────

function extractGenericPage() {
  return {
    type: 'generic',
    raw: getBodyText().substring(0, 3000),
    title: document.title,
    url: window.location.href
  };
}

// ─── Extraction Utilities ─────────────────────────────────────────────────────

function extractPhoneFromText(text) {
  if (!text) return null;
  const match = text.match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  return match ? match[1].trim() : null;
}

function extractEmailFromText(text) {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractPriceFromText(text) {
  if (!text) return null;
  const match = text.match(/\$[\d,]+(?:\.\d{2})?(?:[KMk])?/);
  return match ? match[0] : null;
}

function extractMLSNumberFromText(text) {
  if (!text) return null;
  // Common MLS number formats
  const match = text.match(/(?:MLS#?:?\s*|Listing\s*#:?\s*)([A-Z0-9-]{5,15})/i);
  return match ? match[1] : null;
}

function extractAddressFromText(text) {
  if (!text) return null;
  // Basic US address pattern
  const match = text.match(/\d+\s+[A-Za-z0-9\s,.-]+(?:St|Ave|Blvd|Dr|Rd|Way|Ct|Ln|Pl|Ter|Circle|Cir)\w*\.?(?:\s+#\w+)?(?:\s*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5})?/i);
  return match ? match[0].trim() : null;
}

function extractDaysFromText(text) {
  if (!text) return null;
  const match = text.match(/(\d+)\s*days?\s*(?:on\s*redfin|since)/i);
  return match ? match[1] : null;
}

function extractLeadName(text) {
  if (!text) return null;
  const patterns = [
    /(?:Customer|Client|Lead|Name):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/,
    /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:requested|scheduled|wants|is looking)/i
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractAppointmentTime(text) {
  if (!text) return null;
  const match = text.match(/(?:scheduled|appointment|tour)\s+(?:for|on|at)?\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2}\/\d{1,2})[^.]*?\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  return match ? match[1].trim() : null;
}

function detectLeadSource(text) {
  const lower = text.toLowerCase();
  if (lower.includes('redfin')) return 'Redfin';
  if (lower.includes('zillow')) return 'Zillow';
  if (lower.includes('realtor.com')) return 'Realtor.com';
  if (lower.includes('referral')) return 'Referral';
  if (lower.includes('sphere')) return 'Sphere';
  return 'Unknown';
}

function detectLeadType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('listing consult') || lower.includes('seller')) return 'Seller';
  if (lower.includes('buyer consult') || lower.includes('buyer')) return 'Buyer';
  if (lower.includes('rental') || lower.includes('rent')) return 'Rental';
  if (lower.includes('investor')) return 'Investor';
  return 'Unknown';
}

function detectAppointmentType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('listing consult')) return 'Listing Consult';
  if (lower.includes('buyer consult') || lower.includes('video buyer') || lower.includes('phone buyer')) return 'Buyer Consult';
  if (lower.includes('on market check') || lower.includes('check-in')) return 'On Market Check In';
  if (lower.includes('attended showing')) return 'Attended Showing';
  if (lower.includes('closing')) return 'Closing';
  if (lower.includes('new tour')) return 'New Tour';
  if (lower.includes('unscheduled tour')) return 'Unscheduled Tour';
  if (lower.includes('tour')) return 'Tour';
  if (lower.includes('offer')) return 'Offer';
  return 'Unknown';
}

function classifyOpportunity(rowData) {
  const text = (rowData.raw || '').toLowerCase();
  const type = (rowData.appointmentType || '').toLowerCase();

  if (type.includes('listing') || text.includes('listing consult')) return 'Seller Listing Consult';
  if (type.includes('buyer consult')) return 'Buyer Consult';
  if (type.includes('tour') || text.includes('tour')) return 'Buyer Tour';
  if (text.includes('investor')) return 'Investor';
  if (text.includes('rental')) return 'Rental';
  if (text.includes('closing')) return 'Closing';
  return 'Unknown';
}

function detectPriority(text) {
  const lower = text.toLowerCase();
  if (lower.includes('hot') || lower.includes('urgent') || lower.includes('today')) return 'HIGH';
  if (lower.includes('overdue') || lower.includes('expired')) return 'HIGH';
  if (lower.includes('soon') || lower.includes('tomorrow')) return 'MEDIUM';
  return 'NORMAL';
}

function isFollowUpExpired(text) {
  const lower = text.toLowerCase();
  return lower.includes('overdue') || lower.includes('expired') || lower.includes('past due');
}
