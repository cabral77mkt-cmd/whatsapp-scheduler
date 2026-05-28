const express = require('express');
const router  = express.Router();
const db      = require('../database');

/* 10 snippets padrão para novos usuários */
const DEFAULT_SNIPPETS = [
  { shortcut: 'oi',         category: 'abertura',  body: 'Oi, {nome}! Tudo bem? 😊 Vi que você entrou em contato. Como posso te ajudar com o seu evento?' },
  { shortcut: 'proposta',   category: 'proposta',  body: 'Olá, {nome}! Conforme conversamos, segue em anexo a proposta comercial para o {evento}. Qualquer dúvida, pode me chamar! 🚀' },
  { shortcut: 'followup',   category: 'followup',  body: 'Oi, {nome}! Passando pra saber se você teve a chance de analisar a proposta que enviei. Estou à disposição para esclarecer qualquer ponto!' },
  { shortcut: 'reuniao',    category: 'reunião',   body: 'Oi, {nome}! Confirmando nossa reunião para hoje. Estou animado para conversar sobre o {evento}. Até logo! 📅' },
  { shortcut: 'fechamento', category: 'fechamento',body: 'Ótima notícia, {nome}! 🎉 Vou organizar tudo por aqui e te envio os próximos passos para começarmos a campanha do {evento}.' },
  { shortcut: 'semresposta',category: 'reativação',body: 'Oi, {nome}! Sei que você está ocupado. Só queria perguntar se ainda faz sentido conversarmos sobre a divulgação do seu evento. 😊' },
  { shortcut: 'urgencia',   category: 'urgência',  body: '⚠️ {nome}, o {evento} está chegando! Faltam poucos dias e ainda dá tempo de estruturar uma boa campanha. Me chama aqui!' },
  { shortcut: 'obrigado',   category: 'geral',     body: 'Muito obrigado pela confiança, {nome}! 🙏 Vamos fazer um trabalho incrível juntos.' },
  { shortcut: 'aguardo',    category: 'geral',     body: 'Fico aguardando seu retorno, {nome}. Qualquer dúvida, pode me chamar aqui! 😊' },
  { shortcut: 'reativacao', category: 'reativação',body: 'Oi, {nome}! Já faz um tempo que não conversamos. Se estiver pensando em algum evento, seria um prazer ajudar na divulgação!' },
];

function seedSnippets(userId) {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM message_snippets WHERE user_id = ?').get(userId).c;
  if (existing > 0) return;
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO message_snippets (user_id, shortcut, body, category)
    VALUES (?, ?, ?, ?)
  `);
  for (const s of DEFAULT_SNIPPETS) stmt.run(userId, s.shortcut, s.body, s.category);
}

/* GET / — lista todos os snippets */
router.get('/', (req, res) => {
  const userId = Number(req.user.sub);
  seedSnippets(userId);
  const snippets = db.prepare(`
    SELECT * FROM message_snippets WHERE user_id = ?
    ORDER BY uses_count DESC, shortcut ASC
  `).all(userId);
  res.json(snippets);
});

/* POST / — cria novo snippet */
router.post('/', (req, res) => {
  const userId = Number(req.user.sub);
  const { shortcut, body, category = 'geral' } = req.body || {};
  if (!shortcut?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'shortcut e body obrigatórios' });
  }
  try {
    const result = db.prepare(`
      INSERT INTO message_snippets (user_id, shortcut, body, category)
      VALUES (?, ?, ?, ?)
    `).run(userId, shortcut.trim().toLowerCase(), body.trim(), category.trim() || 'geral');
    res.json(db.prepare('SELECT * FROM message_snippets WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'Atalho já existe' });
  }
});

/* PUT /:id — atualiza snippet */
router.put('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  const { shortcut, body, category } = req.body || {};
  const s = db.prepare('SELECT id FROM message_snippets WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!s) return res.status(404).json({ error: 'Snippet não encontrado' });
  db.prepare(`
    UPDATE message_snippets SET shortcut = ?, body = ?, category = ? WHERE id = ?
  `).run(
    shortcut?.trim().toLowerCase() || s.shortcut,
    body?.trim() || s.body,
    category?.trim() || s.category,
    s.id
  );
  res.json(db.prepare('SELECT * FROM message_snippets WHERE id = ?').get(s.id));
});

/* DELETE /:id */
router.delete('/:id', (req, res) => {
  const userId = Number(req.user.sub);
  db.prepare('DELETE FROM message_snippets WHERE id = ? AND user_id = ?').run(req.params.id, userId);
  res.json({ ok: true });
});

/* POST /:id/use — incrementa contador de uso */
router.post('/:id/use', (req, res) => {
  const userId = Number(req.user.sub);
  db.prepare('UPDATE message_snippets SET uses_count = uses_count + 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);
  res.json({ ok: true });
});

/* POST /ai-rewrite — reescreve mensagem com Claude */
router.post('/ai-rewrite', async (req, res) => {
  const { message, tone = 'friendly', lead_name, event_name } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message obrigatória' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY não configurada' });
  }

  const TONE_MAP = {
    formal:   'mais formal e profissional',
    short:    'mais curta e direta (máximo 2 linhas)',
    urgent:   'com senso de urgência leve, sem ser agressivo',
    friendly: 'mais descontraída e amigável, mantendo profissionalismo',
  };

  const toneDesc = TONE_MAP[tone] || TONE_MAP.friendly;
  const context  = [
    lead_name  && `Nome do lead: ${lead_name}`,
    event_name && `Evento: ${event_name}`,
  ].filter(Boolean).join('\n');

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Reescreva a mensagem abaixo de forma ${toneDesc}. Mantenha a essência e os emojis se houver. Retorne APENAS o texto reescrito, sem explicações.\n\n${context ? `Contexto:\n${context}\n\n` : ''}Mensagem original:\n${message}`,
      }],
    });
    const rewritten = resp.content[0]?.text?.trim() || message;
    res.json({ rewritten });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
