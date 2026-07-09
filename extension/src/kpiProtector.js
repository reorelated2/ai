/**
 * KyleOS — KPI Protection Logic
 * Evaluates follow-up health and KPI exposure for Agent Tools customers.
 */

const KPIProtector = (() => {

  const KPI_RULES = [
    {
      id: 'no_followup_plan',
      label: 'No Follow Up Plan',
      check: (d) => !d.followUpPlan && !d.followUpDue,
      action: 'Set a follow up plan in Agent Tools',
      priority: 'high',
    },
    {
      id: 'no_recent_contact',
      label: 'No Recent Contact Logged',
      check: (d) => !d.lastContact,
      action: 'Log a contact attempt or set a follow up',
      priority: 'high',
    },
    {
      id: 'missing_contact_info',
      label: 'Missing Contact Info',
      check: (d) => !d.phone && !d.email,
      action: 'Add phone or email to the customer record',
      priority: 'high',
    },
    {
      id: 'stale_lead',
      label: 'Stale Lead',
      check: (d) => {
        const days = parseInt(d.daysOnRedfin);
        return !isNaN(days) && days > 60;
      },
      action: 'Re-engage — reach out with a value-add message',
      priority: 'medium',
    },
    {
      id: 'no_follow_up_due',
      label: 'No Follow Up Due Date',
      check: (d) => !d.followUpDue,
      action: 'Set a follow up due date',
      priority: 'medium',
    },
    {
      id: 'post_tour_no_followup',
      label: 'Post-Tour Without Follow Up',
      check: (d) => {
        const hasTour = d.leadSignals && d.leadSignals.includes('has_tour');
        const hasFollowup = d.followUpPlan || d.followUpDue;
        return hasTour && !hasFollowup;
      },
      action: 'Log post-tour follow up and set next step',
      priority: 'high',
    },
    {
      id: 'wrong_agent',
      label: 'Wrong Agent Assignment Risk',
      check: (d) => {
        const assigned = (d.assignedAgent || '').toLowerCase();
        const owner    = (d.ownerAgent || '').toLowerCase();
        return assigned && owner && assigned !== owner;
      },
      action: 'Verify lead ownership — confirm with team before outreach',
      priority: 'high',
    },
    {
      id: 'new_lead_not_contacted',
      label: 'New Lead Not Yet Contacted',
      check: (d) => {
        const isNew = d.leadSignals && d.leadSignals.includes('new_lead');
        return isNew && !d.lastContact;
      },
      action: 'Contact new lead within 5 minutes — call first',
      priority: 'critical',
    },
  ];

  /**
   * Evaluate KPI health for a customer data object.
   * @param {Object} customerData - from AgentToolsReader
   * @returns {{ score, issues, recommendations, protected }}
   */
  function evaluate(customerData) {
    const issues          = [];
    const recommendations = [];

    KPI_RULES.forEach(rule => {
      try {
        if (rule.check(customerData)) {
          issues.push({ id: rule.id, label: rule.label, priority: rule.priority });
          recommendations.push({ label: rule.label, action: rule.action, priority: rule.priority });
        }
      } catch (_) {}
    });

    const critical = issues.filter(i => i.priority === 'critical').length;
    const high     = issues.filter(i => i.priority === 'high').length;
    const medium   = issues.filter(i => i.priority === 'medium').length;

    // Score: 100 minus weighted deductions
    const score = Math.max(0, 100 - (critical * 30) - (high * 15) - (medium * 5));

    return {
      score,
      protected:       issues.length === 0,
      issues,
      recommendations,
      criticalCount:   critical,
      highCount:       high,
      mediumCount:     medium,
    };
  }

  /**
   * Build the shortest clean action to protect this KPI.
   * Returns a single recommended action string.
   */
  function shortestCleanAction(kpiResult, customerData) {
    if (kpiResult.protected) {
      return 'KPI protected — no immediate action required.';
    }

    // Critical first
    const critical = kpiResult.recommendations.find(r => r.priority === 'critical');
    if (critical) return critical.action;

    const high = kpiResult.recommendations.find(r => r.priority === 'high');
    if (high) return high.action;

    return kpiResult.recommendations[0]?.action || 'Review customer and set follow up.';
  }

  /**
   * Generate an Agent Tools note (short, factual, paste-ready).
   * Follows Kyle's style: short, no AI voice, broad brush.
   */
  function generateAgentNote(customerData, kpiResult) {
    const parts = [];

    if (customerData.status)       parts.push(customerData.status);
    if (customerData.lastContact)  parts.push(`Last contact: ${customerData.lastContact}`);
    if (customerData.tours && customerData.tours.length) {
      parts.push(`${customerData.tours.length} tour(s) on file`);
    }
    if (!kpiResult.protected) {
      parts.push(`KPI: ${kpiResult.issues.map(i => i.label).join(', ')}`);
    } else {
      parts.push('KPI clear');
    }

    return parts.join(' · ');
  }

  return { evaluate, shortestCleanAction, generateAgentNote, KPI_RULES };
})();

if (typeof module !== 'undefined') {
  module.exports = { KPIProtector };
}
