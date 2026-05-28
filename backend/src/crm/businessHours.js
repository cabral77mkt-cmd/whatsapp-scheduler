const db = require('../database');

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseHM(s) {
  const [h, m] = s.split(':').map(Number);
  return { h, m };
}

function setHM(date, h, m) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function loadHours(userId) {
  const row = db.prepare('SELECT business_hours_json FROM crm_settings WHERE user_id = ?').get(userId);
  if (!row || !row.business_hours_json) {
    return require('../database').DEFAULT_BUSINESS_HOURS;
  }
  try { return JSON.parse(row.business_hours_json); }
  catch { return require('../database').DEFAULT_BUSINESS_HOURS; }
}

function nextAllowedSlot(userId, fromDate) {
  const hours = loadHours(userId);
  let cur = new Date(fromDate);

  for (let i = 0; i < 14; i++) {
    const key = DAY_KEYS[cur.getDay()];
    const windows = hours[key] || [];
    for (const w of windows) {
      const a = parseHM(w.from);
      const b = parseHM(w.to);
      const start = setHM(cur, a.h, a.m);
      const end = setHM(cur, b.h, b.m);
      if (cur >= start && cur < end) return cur;
      if (cur < start) return start;
    }
    cur = setHM(cur, 0, 0);
    cur.setDate(cur.getDate() + 1);
  }
  return new Date(fromDate);
}

function isWithinBusinessHours(userId, date) {
  const slot = nextAllowedSlot(userId, date);
  return slot.getTime() === date.getTime();
}

module.exports = { nextAllowedSlot, isWithinBusinessHours, loadHours };
