'use strict';

/**
 * Matrix360 Surgical Per-Channel Versioning & Visual Diff Engine
 *
 * Wraps `channel-copy.js` so all 10 channels store independent version trees.
 * When a natural-language revision is requested, updates and increments the version
 * of ONLY targeted channels, preserving all other channels byte-for-byte.
 */

const { CHANNELS, createDraft, trimWords } = require('./channel-copy');
const { createHash } = require('node:crypto');
const hashVersion = value => createHash('sha256').update(String(value)).digest('hex');

function finalizeDraftVersion(version, body, extra = {}) {
  if (!version || typeof version !== 'object') throw new Error('Draft version is required');
  const finalBody = String(body);
  Object.assign(version, extra, {
    body: finalBody,
    characters: finalBody.length,
    version_hash: hashVersion(finalBody)
  });
  return version;
}

const CHANNEL_PATTERNS = Object.freeze([
  { channel: 'WhatsApp', regex: /\b(whatsapp|wa)\b/i },
  { channel: 'LinkedIn', regex: /\b(linkedin)\b/i },
  { channel: 'Instagram', regex: /\b(instagram|ig|insta)\b/i },
  { channel: 'Facebook', regex: /\b(facebook|fb)\b/i },
  { channel: 'X', regex: /\b(x|twitter|tweet)\b/i },
  { channel: 'YouTube', regex: /\b(youtube|yt)\b/i },
  { channel: 'Email', regex: /\b(email|mail)\b/i },
  { channel: 'Google Business Profile', regex: /\b(google\s*business(\s*profile)?|gbp)\b/i },
  { channel: 'SMS', regex: /\b(sms|text\s*message)\b/i },
  { channel: 'Website', regex: /\b(website|landing\s*page|site)\b/i }
]);

/**
 * Initializes a new version tree for all 10 channels
 */
function initChannelVersionTree({ plan, business, strategy } = {}) {
  const tree = {};
  const bName = business || 'Matrix 360 Workspace';
  const cPlan = plan || {
    subject: strategy?.pitch_framing?.value_proposition || 'Exclusive Opportunity',
    caption: strategy?.pitch_framing?.emotional_hook || 'Explore verified solutions tailored for your business.',
    headlines: [strategy?.pitch_framing?.value_proposition || 'Growth without boundaries'],
    cta: strategy?.pitch_framing?.call_to_action || 'Learn more and schedule a consultation'
  };

  for (const ch of CHANNELS) {
    try {
      const draft = createDraft({ channel: ch, plan: cPlan, business: bName });
      tree[ch] = {
        channel: ch,
        current_version: 1,
        versions: [
          {
            version: 1,
            subject: draft.subject || '',
            body: draft.body,
            format: draft.format,
            characters: draft.characters,
            limit: draft.limit,
            status: 'draft_for_review',
            created_at: new Date().toISOString(),
            change_summary: 'Initial draft generated from creative plan',
            diff: null,
            version_hash: hashVersion(draft.body)
          }
        ]
      };
    } catch (err) {
      // Safe fallback if plan input is minimal
      const text = `${bName} — ${cPlan.subject}\n\n${cPlan.caption}\n\nNext step: ${cPlan.cta}`;
      tree[ch] = {
        channel: ch,
        current_version: 1,
        versions: [
          {
            version: 1,
            subject: cPlan.headlines?.[0] || '',
            body: trimWords(text, 1000),
            format: 'draft',
            characters: text.length,
            limit: 1000,
            status: 'draft_for_review',
            created_at: new Date().toISOString(),
            change_summary: 'Initial baseline draft',
            diff: null,
            version_hash: hashVersion(trimWords(text, 1000))
          }
        ]
      };
    }
  }

  return tree;
}

/**
 * Identifies which channels are targeted vs explicitly excluded in a revision prompt
 */
function parseRevisionTargets(prompt) {
  if (!prompt || typeof prompt !== 'string') return { targeted: [], excluded: [], instructions: {} };
  const lower = prompt.toLowerCase();
  const targeted = [];
  const excluded = [];
  const instructions = {};

  // Check for exclusions like "keep X unchanged" or "leave X as-is"
  const exclusionRegex = /(?:keep|leave)\s+([a-z0-9\s]+?)\s+(?:unchanged|as-is|alone|as\s+is)/gi;
  let match;
  while ((match = exclusionRegex.exec(lower)) !== null) {
    const raw = match[1];
    for (const cp of CHANNEL_PATTERNS) {
      if (cp.regex.test(raw) && !excluded.includes(cp.channel)) {
        excluded.push(cp.channel);
      }
    }
  }

  // Check for channel mentions
  for (const cp of CHANNEL_PATTERNS) {
    if (excluded.includes(cp.channel)) continue;
    if (cp.regex.test(lower)) {
      targeted.push(cp.channel);
      // Extract specific sub-instruction for this channel if available
      const segment = lower.split(/\s*(?:,|;|\band\b)\s*/).find(part => cp.regex.test(part)) || lower;
      let instr = segment;
      if (/short(er|en)?|concise/i.test(segment)) instr = 'Shorten and condense copy';
      else if (/formal|professional/i.test(segment)) instr = 'Make tone more professional and formal';
      else if (/casual|friendly/i.test(segment)) instr = 'Make tone more conversational and friendly';
      instructions[cp.channel] = instr;
    }
  }

  return { targeted, excluded, instructions };
}

/**
 * Computes a visual diff showing additions, deletions, and unchanged lines
 */
function computeVisualDiff(oldText, newText) {
  const oldLines = String(oldText || '').split('\n');
  const newLines = String(newText || '').split('\n');
  const diff = [];
  const max = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === undefined) {
      diff.push({ type: 'added', line: n });
    } else if (n === undefined) {
      diff.push({ type: 'removed', line: o });
    } else if (o === n) {
      diff.push({ type: 'unchanged', line: o });
    } else {
      diff.push({ type: 'removed', line: o });
      diff.push({ type: 'added', line: n });
    }
  }

  return diff;
}

/**
 * Transforms copy based on natural-language revision instruction
 */
function transformCopy(text, instruction) {
  let revised = text;
  const lowerInstr = instruction.toLowerCase();

  if (lowerInstr.includes('shorten') || lowerInstr.includes('concise')) {
    // Cut down sentences, retain core message
    const lines = text.split('\n').filter(Boolean);
    if (lines.length > 2) {
      revised = [lines[0], lines[lines.length - 1]].join('\n\n');
    } else {
      revised = text.slice(0, Math.floor(text.length * 0.7)).trim() + '…';
    }
  } else if (lowerInstr.includes('formal') || lowerInstr.includes('professional')) {
    revised = revised
      .replace(/\b(Hey|Hi|Hello there)\b/gi, 'Dear Business Partner,')
      .replace(/\b(check out|take a look)\b/gi, 'kindly review')
      .replace(/\b(don't miss)\b/gi, 'we invite you to evaluate');
    if (!revised.includes('Warm regards,')) {
      revised += '\n\nWarm regards,\nStrategic Client Engagement Team';
    }
  } else {
    throw new Error('This revision needs grounded AI editing; no deterministic wording was invented.');
  }

  return revised.trim();
}

/**
 * Applies surgical revision to targeted channels only, preserving untargeted channels
 */
function applySurgicalRevision(tree, revisionPrompt, options = {}) {
  if (!tree || typeof tree !== 'object') throw new Error('Invalid channel version tree');
  const { targeted, excluded, instructions } = parseRevisionTargets(revisionPrompt);
  if (!targeted.length) throw new Error('Name at least one channel to revise. Blanket revisions are blocked.');
  const targetList = targeted;

  const modifiedChannels = [];
  const preservedChannels = [];

  const pending = new Map();
  for (const ch of targetList) {
    const entry = tree[ch];
    if (!entry) continue;
    const prevVersion = entry.versions[entry.versions.length - 1];
    const instr = instructions[ch] || revisionPrompt;
    const newBody = transformCopy(prevVersion.body, instr);
    pending.set(ch, { entry, prevVersion, instr, newBody });
  }

  for (const ch of CHANNELS) {
    if (!tree[ch]) continue;

    if (pending.has(ch)) {
      const { entry, prevVersion, instr, newBody } = pending.get(ch);
      const nextVerNum = prevVersion.version + 1;
      const diff = computeVisualDiff(prevVersion.body, newBody);

      const newVersion = {
        version: nextVerNum,
        subject: prevVersion.subject,
        body: newBody,
        format: prevVersion.format,
        characters: newBody.length,
        limit: prevVersion.limit,
        status: 'draft_for_review',
        created_at: new Date().toISOString(),
        change_summary: instr,
        diff,
        previous_version_hash: prevVersion.version_hash,
        version_hash: hashVersion(newBody)
      };

      entry.versions.push(newVersion);
      entry.current_version = nextVerNum;
      modifiedChannels.push(ch);
    } else {
      preservedChannels.push(ch);
    }
  }

  return {
    updated_tree: tree,
    targeted_channels: modifiedChannels,
    preserved_channels: preservedChannels
  };
}

module.exports = {
  initChannelVersionTree,
  finalizeDraftVersion,
  parseRevisionTargets,
  computeVisualDiff,
  applySurgicalRevision
};
