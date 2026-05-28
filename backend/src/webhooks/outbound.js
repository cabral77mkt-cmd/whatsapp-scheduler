/**
 * Outbound webhook dispatcher
 * Call `dispatch(userId, event, payload)` from any route/worker.
 *
 * Events:
 *   lead.created       — new lead created
 *   stage.changed      — lead stage moved
 *   proposal.sent      — proposal created
 *   followup.due       — followup just became due
 */
const db     = require('../database');
const crypto = require('crypto');

/**
 * Dispatch an event to all active webhook endpoints for a user.
 * Fire-and-forget — errors are logged but never thrown.
 */
async function dispatch(userId, event, payload) {
  let endpoints;
  try {
    endpoints = db.prepare(`
      SELECT * FROM webhook_endpoints
      WHERE user_id = ? AND active = 1 AND (events LIKE ? OR events LIKE ? OR events LIKE ? OR events = ?)
    `).all(userId, `%${event},%`, `%,${event}%`, `${event}`, event);
  } catch (e) {
    console.error('[Webhook] DB error:', e.message);
    return;
  }

  if (!endpoints || endpoints.length === 0) return;

  const body = JSON.stringify({
    event,
    occurred_at: new Date().toISOString(),
    data: payload,
  });

  for (const ep of endpoints) {
    sendWebhook(ep, body).catch(err =>
      console.error(`[Webhook] Failed to deliver to ${ep.url}:`, err.message)
    );
  }
}

async function sendWebhook(ep, body) {
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent':   'WA-Scheduler-Webhook/1.0',
  };
  if (ep.secret) {
    const sig = crypto.createHmac('sha256', ep.secret).update(body).digest('hex');
    headers['X-WA-Signature'] = `sha256=${sig}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(ep.url, { method: 'POST', headers, body, signal: controller.signal });
    if (!res.ok) {
      console.warn(`[Webhook] ${ep.url} responded with ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { dispatch };
