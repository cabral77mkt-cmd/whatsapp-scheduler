/**
 * pushService.js — VAPID Web Push utility
 * Loads config from push_config table (generated on first startup)
 */
const db = require('../database');

let webpush = null;
let _configured = false;

function getWebPush() {
  if (!webpush) {
    try { webpush = require('web-push'); } catch { return null; }
  }
  return webpush;
}

function ensureConfigured() {
  if (_configured) return true;
  const wp = getWebPush();
  if (!wp) return false;
  const config = db.prepare('SELECT * FROM push_config WHERE id = 1').get();
  if (!config) return false;
  wp.setVapidDetails(config.subject, config.public_key, config.private_key);
  _configured = true;
  return true;
}

function getPublicKey() {
  try {
    const config = db.prepare('SELECT public_key FROM push_config WHERE id = 1').get();
    return config?.public_key || null;
  } catch { return null; }
}

/**
 * Send push notification to all subscriptions for a user.
 * payload: { title, body, url, tag, icon }
 */
async function sendToUser(userId, payload) {
  if (!ensureConfigured()) return [];
  const wp = getWebPush();
  const subs = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
  const results = [];
  for (const sub of subs) {
    try {
      await wp.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 3600 }
      );
      results.push({ ok: true });
    } catch (err) {
      // 410 Gone or 404 = expired subscription
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        console.log(`[Push] Subscription expirada removida (user ${userId})`);
      } else {
        console.warn(`[Push] Falha ao enviar push (user ${userId}):`, err.message);
      }
      results.push({ ok: false, error: err.message });
    }
  }
  return results;
}

/**
 * Send push to all subscribed users.
 */
async function sendToAll(payload) {
  if (!ensureConfigured()) return;
  const users = db.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all();
  for (const u of users) {
    await sendToUser(u.user_id, payload).catch(() => {});
  }
}

module.exports = { getPublicKey, sendToUser, sendToAll };
