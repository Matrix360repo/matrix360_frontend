'use strict';
const { randomUUID } = require('node:crypto');

const TRIGGERS = new Set(['campaign_provider_accepted', 'email_delivered', 'email_clicked', 'lead_replied']);
const ACTIONS = new Set(['create_crm_followup', 'stop_campaign', 'notify_owner']);
const STATUSES = new Set(['draft', 'active', 'paused']);
const text = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function validate(input, existing = {}) {
  const name = text(input.name ?? existing.name, 120), trigger_event = text(input.trigger_event ?? existing.trigger_event, 50), action = text(input.action ?? existing.action, 50), status = text(input.status ?? existing.status ?? 'draft', 20);
  const delay_hours = Number(input.delay_hours ?? existing.delay_hours ?? 0), max_executions = Number(input.max_executions ?? existing.max_executions ?? 1);
  if (name.length < 3) throw new Error('Journey name must contain at least 3 characters.');
  if (!TRIGGERS.has(trigger_event) || !ACTIONS.has(action) || !STATUSES.has(status)) throw new Error('Select a supported journey trigger, action and status.');
  if (!Number.isInteger(delay_hours) || delay_hours < 0 || delay_hours > 720 || !Number.isInteger(max_executions) || max_executions < 1 || max_executions > 10) throw new Error('Journey delay or execution cap is invalid.');
  return { name, trigger_event, action, delay_hours, max_executions, stop_on_reply: input.stop_on_reply ?? existing.stop_on_reply ?? true, status };
}

function mutateJourney(rules, action, input = {}) {
  if (action === 'create') { const now = new Date().toISOString(), rule = { schema_version: '1.0', rule_id: randomUUID(), ...validate(input), execution_count: 0, created_at: now, updated_at: now }; rules.push(rule); return rule; }
  const index = rules.findIndex(rule => rule.rule_id === String(input.rule_id || ''));
  if (index < 0) throw new Error('Journey rule not found.');
  if (action === 'remove') return rules.splice(index, 1)[0];
  if (action === 'update') return Object.assign(rules[index], validate(input, rules[index]), { updated_at: new Date().toISOString() });
  throw new Error('Unsupported journey action.');
}

module.exports = { mutateJourney, validate, TRIGGERS, ACTIONS, STATUSES };
