'use strict';

/**
 * Matrix360 3-Gate Channel Readiness & Email-to-CTWA Opt-In Bridge
 *
 * Implements:
 * 1. 3-Gate Channel Readiness Checklist:
 *    - Gate 1: Draft Status ('draft_for_review' | 'approved')
 *    - Gate 2: Audience Eligibility (exact contact count with valid identifier & verified consent)
 *    - Gate 3: Provider Connection Status ('connected' | 'disconnected_connection_required')
 * 2. Email-to-Click-to-WhatsApp (CTWA) Opt-In Bridge:
 *    - For contacts with valid email but lacking WhatsApp opt-in, drafts a compliant opt-in email
 *      with pre-filled wa.me consent link.
 */

/**
 * Evaluates the 3 gates for a given channel and audience snapshot
 */
function policyBlocked(contact, channel, now = Date.now()) {
  if (contact?.suppressed === true || contact?.do_not_contact === true || contact?.consent_revoked_at) return true;
  const state = contact?.channel_frequency?.[providerKeyFor(channel)];
  if (state?.last_sent_at && Number(state.minimum_interval_hours) > 0) {
    const next = new Date(state.last_sent_at).getTime() + Number(state.minimum_interval_hours) * 3600000;
    if (Number.isFinite(next) && next > now) return true;
  }
  return false;
}

function evaluateChannelReadiness(channel, { draft, audience = [], connections = {}, business = 'Matrix 360 Workspace', policyVersion = 'm360-consent-v1' } = {}) {
  // Gate 1: Draft Status
  const isApproved = draft?.status === 'approved';
  const gate1 = {
    gate: 'draft_status',
    label: 'Gate 1: Editorial Draft Status',
    status: isApproved ? 'approved' : 'draft_for_review',
    passed: isApproved,
    description: isApproved ? 'Draft approved for release' : 'Draft pending editorial approval'
  };

  // Gate 2: Audience Eligibility
  const totalContacts = Array.isArray(audience) ? audience.length : 0;
  let eligibleCount = 0;
  const ineligibilityReasons = [];

  const chLower = channel.toLowerCase();

  if (chLower.includes('whatsapp')) {
    let missingPhone = 0;
    let missingOptIn = 0;
    for (const c of audience) {
      const hasPhone = Boolean(c.phone && String(c.phone).trim().length >= 8);
      const hasOptIn = c.whatsapp_opt_in_status === 'granted' && Boolean(c.consent_evidence?.whatsapp);
      if (policyBlocked(c, channel)) missingOptIn++;
      else if (!hasPhone) missingPhone++;
      else if (!hasOptIn) missingOptIn++;
      else eligibleCount++;
    }
    if (missingPhone > 0) ineligibilityReasons.push(`${missingPhone} contact(s) lack a valid phone number`);
    if (missingOptIn > 0) ineligibilityReasons.push(`${missingOptIn} contact(s) have not granted WhatsApp opt-in consent`);
  } else if (chLower.includes('email')) {
    let missingEmail = 0;
    let unsubscribed = 0;
    for (const c of audience) {
      const hasEmail = Boolean(c.email && String(c.email).includes('@'));
      const hasConsent = ['granted', 'opted_in'].includes(c.email_opt_in_status) && Boolean(c.consent_evidence?.email);
      if (policyBlocked(c, channel)) unsubscribed++;
      else if (!hasEmail) missingEmail++;
      else if (!hasConsent) unsubscribed++;
      else eligibleCount++;
    }
    if (missingEmail > 0) ineligibilityReasons.push(`${missingEmail} contact(s) lack a valid email address`);
    if (unsubscribed > 0) ineligibilityReasons.push(`${unsubscribed} contact(s) lack stored email consent evidence or are unsubscribed`);
  } else if (chLower.includes('sms')) {
    let missingPhone = 0;
    let optedOut = 0;
    for (const c of audience) {
      const hasPhone = Boolean(c.phone && String(c.phone).trim().length >= 8);
      const hasConsent = ['granted', 'opted_in'].includes(c.sms_opt_in_status) && Boolean(c.consent_evidence?.sms);
      if (policyBlocked(c, channel)) optedOut++;
      else if (!hasPhone) missingPhone++;
      else if (!hasConsent) optedOut++;
      else eligibleCount++;
    }
    if (missingPhone > 0) ineligibilityReasons.push(`${missingPhone} contact(s) lack valid phone number`);
    if (optedOut > 0) ineligibilityReasons.push(`${optedOut} contact(s) lack stored SMS consent evidence or opted out`);
  } else {
    for (const c of audience) {
      const evidence = c.consent_evidence?.[providerKeyFor(channel)];
      if (!policyBlocked(c, channel) && evidence === true) eligibleCount++;
    }
    if (totalContacts > eligibleCount) ineligibilityReasons.push(`${totalContacts - eligibleCount} contact(s) lack channel-specific eligibility evidence`);
  }

  const gate2 = {
    gate: 'audience_eligibility',
    label: 'Gate 2: Audience Eligibility & Consent',
    status: eligibleCount > 0 ? 'eligible' : 'no_eligible_contacts',
    passed: eligibleCount > 0,
    total_contacts: totalContacts,
    eligible_count: eligibleCount,
    ineligible_count: totalContacts - eligibleCount,
    reasons: ineligibilityReasons,
    description: `${eligibleCount} of ${totalContacts} contacts meet strict channel consent & format requirements`
  };

  // Gate 3: Provider Connection Status
  const providerKey = providerKeyFor(channel);

  const isConnected = Boolean(connections[providerKey]);
  const gate3 = {
    gate: 'provider_connection_status',
    label: 'Gate 3: Provider Connection & Authorization',
    status: isConnected ? 'connected' : 'disconnected_connection_required',
    passed: isConnected,
    provider_name: providerKey.toUpperCase(),
    description: isConnected
      ? `Live ${providerKey.toUpperCase()} provider gateway connected & verified`
      : `No authenticated ${providerKey.toUpperCase()} API connection configured. Live outbound dispatch blocked.`
  };

  const allPassed = gate1.passed && gate2.passed && gate3.passed;

  return {
    channel,
    policy_version: policyVersion,
    all_gates_passed: allPassed,
    readiness_state: allPassed ? 'READY_FOR_DISPATCH' : 'PREVIEW_ONLY_BLOCKED_GATES',
    gates: {
      gate1_draft: gate1,
      gate2_audience: gate2,
      gate3_provider: gate3
    }
  };
}

/**
 * Builds an Email-to-Click-to-WhatsApp (CTWA) Opt-In Bridge draft
 *
 * For contacts who have valid email addresses but have NOT yet granted WhatsApp consent,
 * creates a compliant invitation email allowing them to opt in with 1 tap.
 */
function createEmailToCTWABridgeDraft({
  audience = [],
  businessName = 'Your Business',
  projectName = 'our exclusive offerings',
  whatsappNumber = ''
} = {}) {
  const eligibleForBridge = audience.filter(c => {
    const hasEmail = Boolean(c.email && String(c.email).includes('@'));
    const emailPermitted = ['granted', 'opted_in'].includes(c.email_opt_in_status) && Boolean(c.consent_evidence?.email);
    const lacksWA = c.whatsapp_opt_in_status !== 'granted' || !c.consent_evidence?.whatsapp;
    return hasEmail && emailPermitted && lacksWA;
  });

  const cleanPhone = String(whatsappNumber).replace(/\D/g, '');
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    return {
      type: 'email_to_ctwa_bridge', status: 'blocked_verified_sender_required', target_contacts_count: 0,
      subject: '', body: '', ctwa_link: '',
      compliance_notes: ['A verified tenant WhatsApp sender is required. Email permission does not grant WhatsApp permission.']
    };
  }
  const encodedText = encodeURIComponent(`Hi ${businessName}, I would like to receive updates about ${projectName} on WhatsApp.`);
  const ctwaLink = `https://wa.me/${cleanPhone}?text=${encodedText}`;

  const subject = `Prefer WhatsApp? Stay updated on ${projectName} on your mobile`;
  const body = [
    `Dear Member,`,
    ``,
    `We are pleased to share our progress on ${projectName} with you.`,
    ``,
    `To ensure you receive project milestones, floor plans, and priority walkthroughs directly without email delays, you can now opt in to receive updates via official WhatsApp messages.`,
    ``,
    `👉 Tap to Opt-In via WhatsApp:`,
    `${ctwaLink}`,
    ``,
    `By tapping the link above and sending the pre-filled message, you authorize ${businessName} to share project-related information with you on WhatsApp. You can opt out at any time by replying STOP.`,
    ``,
    `Warm regards,`,
    `${businessName} Customer Engagement Team`
  ].join('\n');

  return {
    type: 'email_to_ctwa_bridge',
    target_contacts_count: eligibleForBridge.length,
    subject,
    body,
    ctwa_link: ctwaLink,
    compliance_notes: [
      'Complies with Meta Business Messaging Policy requiring explicit opt-in before business-initiated template sends.',
      'The click is only an invitation. Opt-in is granted only after a verified inbound WhatsApp webhook is stored.',
      'Includes mandatory opt-out instructions (reply STOP).'
    ]
  };
}

function providerKeyFor(channel) {
  const value = String(channel || '').toLowerCase();
  return value.includes('whatsapp') ? 'whatsapp' : value.includes('email') ? 'email' :
    value.includes('linkedin') ? 'linkedin' : value.includes('facebook') || value.includes('instagram') ? 'meta' :
    value.includes('sms') ? 'sms' : 'web';
}

module.exports = {
  evaluateChannelReadiness,
  createEmailToCTWABridgeDraft
};
