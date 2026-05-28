/**
 * scoreUtils.js
 * Cálculo de lead score (0–100) baseado em dados disponíveis no objeto do lead.
 *
 * Componentes do score:
 *   Temperatura         frio=10 | morno=30 | quente=50        (max 50)
 *   Valor potencial     escalonado em faixas                   (max 20)
 *   Proximidade evento  quanto mais próximo, maior o bônus     (max 20)
 *   Recência            última interação recente = bônus       (max 10)
 *   Penalidade stale    parado > 7d = -10, > 14d = -20
 *
 * Total máximo: 100
 */

const TEMP_SCORE = { quente: 50, morno: 30, frio: 10 };

function valueScore(val) {
  const v = Number(val) || 0;
  if (v <= 0)      return 0;
  if (v < 2000)    return 5;
  if (v < 5000)    return 8;
  if (v < 10000)   return 12;
  if (v < 20000)   return 16;
  return 20;
}

function eventScore(eventDate) {
  if (!eventDate) return 0;
  const days = Math.round((new Date(eventDate + 'T12:00:00').getTime() - Date.now()) / 86400000);
  if (days < 0)    return 0;   // evento já passou
  if (days <= 7)   return 20;
  if (days <= 15)  return 15;
  if (days <= 30)  return 10;
  if (days <= 60)  return 5;
  return 2;
}

function recencyScore(lastInteractionAt) {
  if (!lastInteractionAt) return 0;
  const days = (Date.now() - new Date(lastInteractionAt).getTime()) / 86400000;
  if (days < 1)    return 10;
  if (days < 3)    return 7;
  if (days < 7)    return 3;
  return 0;
}

function stalePenalty(lastInteractionAt, stage) {
  if (stage === 'fechado' || stage === 'perdido') return 0;
  if (!lastInteractionAt) return -10;
  const days = (Date.now() - new Date(lastInteractionAt).getTime()) / 86400000;
  if (days >= 14) return -20;
  if (days >= 7)  return -10;
  return 0;
}

export function calcScore(lead) {
  const temp    = TEMP_SCORE[lead.temperature] || 10;
  const value   = valueScore(lead.potential_value);
  const event   = eventScore(lead.event_date);
  const recency = recencyScore(lead.last_interaction_at);
  const penalty = stalePenalty(lead.last_interaction_at, lead.stage);
  return Math.max(0, Math.min(100, temp + value + event + recency + penalty));
}

export function scoreColor(score) {
  if (score >= 75) return { text: 'text-emerald-400', bg: 'bg-emerald-500' };
  if (score >= 50) return { text: 'text-orange-400',  bg: 'bg-orange-500'  };
  if (score >= 25) return { text: 'text-yellow-400',  bg: 'bg-yellow-500'  };
  return           { text: 'text-gray-400',   bg: 'bg-gray-500'   };
}

export function scoreLabel(score) {
  if (score >= 75) return 'Quente 🔥';
  if (score >= 50) return 'Promissor';
  if (score >= 25) return 'Morno';
  return 'Frio';
}
