'use strict';
const { randomUUID } = require('node:crypto');

const CHANNEL_ORDER = ['WhatsApp', 'Email', 'SMS', 'Instagram', 'Facebook', 'LinkedIn', 'X', 'YouTube', 'Google Business Profile', 'Website'];
const STATUSES = new Set(['draft', 'pending_approval', 'approved', 'pending_provider_connection', 'scheduled', 'published', 'completed', 'cancelled', 'failed']);
const text = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function campaignCalendarSummary(events, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const visible = (events || []).filter(event => event.status !== 'cancelled');
  return {
    total_count: visible.length,
    completed_count: visible.filter(event => ['published', 'completed'].includes(event.status)).length,
    past_count: visible.filter(event => new Date(event.scheduled_for) < today).length,
    today_count: visible.filter(event => { const date = new Date(event.scheduled_for); return date >= today && date < tomorrow; }).length,
    upcoming_count: visible.filter(event => new Date(event.scheduled_for) >= tomorrow && !['published', 'completed'].includes(event.status)).length
  };
}

function validateCalendarInput(input, existing = null) {
  const title = text(input.title ?? existing?.title, 160);
  const channel = text(input.channel ?? existing?.channel, 40);
  const scheduled = new Date(input.scheduled_for ?? existing?.scheduled_for);
  const timezone = text(input.timezone ?? existing?.timezone ?? 'Asia/Kolkata', 80);
  const status = text(input.status ?? existing?.status ?? 'pending_approval', 40);
  if (title.length < 3) throw new Error('Campaign title must contain at least 3 characters.');
  if (!CHANNEL_ORDER.includes(channel)) throw new Error('Select a supported campaign channel.');
  if (Number.isNaN(scheduled.getTime())) throw new Error('Select a valid campaign date.');
  if (!STATUSES.has(status)) throw new Error('Select a valid campaign status.');
  return { title, channel, scheduled_for: scheduled.toISOString(), timezone, status };
}

function addCalendarEvent(events, input, correlationId) {
  const now = new Date().toISOString(), fields = validateCalendarInput(input);
  const event = { schema_version: '1.0', event_id: randomUUID(), correlation_id: correlationId, ...fields, version_hash: null, dispatched: false, created_at: now, updated_at: now };
  events.push(event); return event;
}

function updateCalendarEvent(events, eventId, input) {
  const event = events.find(item => item.event_id === eventId);
  if (!event) throw new Error('Calendar campaign not found.');
  Object.assign(event, validateCalendarInput(input, event), { updated_at: new Date().toISOString() });
  return event;
}

function removeCalendarEvent(events, eventId) {
  const index = events.findIndex(item => item.event_id === eventId);
  if (index < 0) throw new Error('Calendar campaign not found.');
  return events.splice(index, 1)[0];
}

function buildCampaignCalendar(channelTree, { startDate = new Date(), timezone = 'Asia/Kolkata', correlationId = randomUUID() } = {}) {
  if (!channelTree || typeof channelTree !== 'object') return [];
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) throw new Error('A valid campaign start date is required');
  return CHANNEL_ORDER.filter(channel => channelTree[channel]).map((channel, index) => {
    const scheduled = new Date(start);
    scheduled.setUTCDate(scheduled.getUTCDate() + index);
    const draft = channelTree[channel].versions?.at(-1);
    const now = new Date().toISOString();
    return {
      schema_version: '1.0',
      event_id: randomUUID(),
      correlation_id: correlationId,
      title: `${channel} campaign`,
      channel,
      scheduled_for: scheduled.toISOString(),
      timezone,
      status: draft?.status === 'approved' ? 'pending_provider_connection' : 'pending_approval',
      version_hash: draft?.version_hash || null,
      dispatched: false,
      created_at: now,
      updated_at: now
    };
  });
}

module.exports = { buildCampaignCalendar, campaignCalendarSummary, addCalendarEvent, updateCalendarEvent, removeCalendarEvent, validateCalendarInput, CHANNEL_ORDER };
